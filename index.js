require('dotenv').config();

// Force Node.js to use Cloudflare public DNS — fixes ECONNREFUSED on
// querySrv lookups against MongoDB Atlas caused by ISP/router DNS issues.
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);

const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  userMention,
  Partials,
} = require('discord.js');

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // explicit import — safe even on older Node versions

const User = require('./models/User');
const Suggestion = require('./models/suggestion');
const { getLevelFromXP, assignRolesForLevel } = require('./utils');
const AutomodConfig = require('./models/AutomodConfig');

function buildSuggestionEmbed(suggestion) {
  const upvotes = suggestion.upvotes || 0;
  const downvotes = suggestion.downvotes || 0;
  const totalVotes = upvotes + downvotes;
  const support = totalVotes ? Math.round((upvotes / totalVotes) * 100) : 0;
  const filled = Math.round(support / 10);
  const voteBar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`💡 ${suggestion.title}`)
    .setDescription(suggestion.description)
    .addFields({
      name: 'Community vote',
      value:
        `${voteBar}\n` +
        `<:23646yes:1443367106455539876> **${upvotes}**  •  ` +
        `<:92042no1:1443367117637288097> **${downvotes}**\n` +
        `**${support}% support**`,
      inline: false,
    })
    .setFooter({ text: 'Community Suggestions • Vote or join the discussion below' })
    .setTimestamp(suggestion.createdAt || new Date());

  if (suggestion.username) {
    embed.setAuthor({
      name: `Suggested by ${suggestion.username}`,
      ...(suggestion.avatarURL ? { iconURL: suggestion.avatarURL } : {}),
    });
  }

  return embed;
}

function buildSuggestionButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sug_yes')
      .setEmoji('<:23646yes:1443367106455539876>')
      .setLabel('Support')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('sug_no')
      .setEmoji('<:92042no1:1443367117637288097>')
      .setLabel('Oppose')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('sug_view')
      .setEmoji('<:38893eyes:1443367212021710960>')
      .setLabel('View votes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('sug_discuss')
      .setEmoji('<:9231_Message_Sent:1443371841241616486>')
      .setLabel('Discuss')
      .setStyle(ButtonStyle.Primary)
  );
}

async function getSuggestionForMessage(interaction) {
  const messageId = interaction.message.id;
  let suggestion = await Suggestion.findOne({ messageId });
  if (suggestion) return suggestion;

  const embed = interaction.message.embeds[0];
  if (!interaction.guildId || !embed?.description) {
    throw new Error(`Suggestion data is missing for message ${messageId}`);
  }

  const match = embed.description.match(/^\*\*(.+?)\*\*(?:\r?\n\r?\n)?([\s\S]*)$/);
  const voteField = embed.fields.find(field => /vote/i.test(field.name));
  const displayedVotes = [...(voteField?.value.matchAll(/\*\*(\d+)\*\*/g) || [])]
    .slice(0, 2)
    .map(([, count]) => Number(count));

  suggestion = new Suggestion({
    id: messageId,
    guildId: interaction.guildId,
    userId: null,
    username: embed.author?.name || 'Legacy suggestion',
    avatarURL: embed.author?.iconURL || null,
    title: match?.[1] || embed.title?.replace(/^💡\s*/, '') || 'Suggestion',
    description: match?.[2] || embed.description,
    messageId,
    upvotes: displayedVotes[0] || 0,
    downvotes: displayedVotes[1] || 0,
  });

  try {
    await suggestion.save();
    return suggestion;
  } catch (error) {
    if (error.code !== 11000) throw error;
    suggestion = await Suggestion.findOne({ messageId });
    if (!suggestion) throw error;
    return suggestion;
  }
}

async function castSuggestionVote(messageId, userId, vote) {
  const votePath = `voters.${userId}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const suggestion = await Suggestion.findOne({ messageId });
    if (!suggestion) throw new Error(`Suggestion not found for message ${messageId}`);

    const previousVote = suggestion.voters.get(userId) || null;
    const filter = { messageId };
    const update = {};

    if (previousVote === vote) {
      filter[votePath] = vote;
      update.$unset = { [votePath]: '' };
      update.$inc = vote === 'up'
        ? { upvotes: -1 }
        : { downvotes: -1 };
    } else {
      filter[votePath] = previousVote || { $exists: false };
      update.$set = { [votePath]: vote };
      update.$inc = {
        [vote === 'up' ? 'upvotes' : 'downvotes']: 1,
        ...(previousVote === 'up' ? { upvotes: -1 } : {}),
        ...(previousVote === 'down' ? { downvotes: -1 } : {}),
      };
    }

    const updated = await Suggestion.findOneAndUpdate(filter, update, { new: true });
    if (updated) return updated;
  }

  throw new Error(`Could not update vote for suggestion ${messageId} after concurrent changes`);
}

// ────────────────────────────────────────────────
//                CREATE CLIENT FIRST
// ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ────────────────────────────────────────────────
//                AI SYSTEM (Brenias v2)
// ────────────────────────────────────────────────
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const AIChat = require('./models/AIChat');

// ── Rate-limit / quota handling ──────────────────────────────────────
// Gemini's free/paid tiers enforce per-minute and per-day quotas. When
// hit, every single AI call fails with a 429 RESOURCE_EXHAUSTED error —
// without this guard, that means one error PER MESSAGE spammed to both
// console and (via the existing catch blocks) potentially to chat.
// Instead: detect it once, go quiet everywhere, log ONE notice to staff,
// and don't log again until the cooldown window passes.

const LOGS_CHANNEL_ID = '1366682681886244864';
// Gemini free-tier quotas commonly reset on a per-minute or per-day basis.
// We can't know which exact quota was hit from the error alone, so this is
// a practical default, not a guarantee from Google. Labeled as such in the log.
const ASSUMED_RESET_MS = 60 * 1000;

let rateLimitedUntil = 0; // timestamp; while in the future, AI calls are skipped entirely
let rateLimitNoticeSent = false;

function isRateLimitError(err) {
  const status = err?.status || err?.response?.status;
  const text = `${err?.message || ''} ${err?.toString?.() || ''}`;
  return status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(text);
}

/**
 * Call this whenever a Gemini call throws. If it's a rate-limit error,
 * starts/extends the quiet period and sends ONE staff log (not one per
 * message). Returns true if it was a rate-limit error (caller should
 * stay silent in chat), false otherwise (caller should handle normally).
 */
async function handleIfRateLimited(err, client) {
  if (!isRateLimitError(err)) return false;

  const now = Date.now();
  rateLimitedUntil = now + ASSUMED_RESET_MS;

  if (!rateLimitNoticeSent) {
    rateLimitNoticeSent = true;
    const resetTime = new Date(rateLimitedUntil);
    const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (logsChannel) {
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('⏳ Gemini API Rate Limit Reached')
        .setDescription(
          `Brenias AI has hit a rate limit / quota error and will stay quiet in chat (no spam, no error replies) until it likely resets.\n\n` +
          `**Estimated reset:** <t:${Math.floor(rateLimitedUntil / 1000)}:R> (<t:${Math.floor(rateLimitedUntil / 1000)}:T>)\n` +
          `*This is an estimate based on a typical per-minute quota window — Google doesn't always tell us the exact reset time, so actual recovery may differ.*`
        )
        .setTimestamp();
      await logsChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    }
    console.error(`[AI] Rate limit hit. Going quiet until ~${resetTime.toISOString()}`);
  }

  return true;
}

/** Quick pre-check so we skip calling Gemini at all while in the quiet window. */
function isCurrentlyRateLimited() {
  if (Date.now() < rateLimitedUntil) return true;
  // Window passed — reset the "notice sent" flag so a fresh rate limit
  // later gets its own fresh log instead of staying silent forever.
  rateLimitNoticeSent = false;
  return false;
}


// One-time startup check: confirms AIChat loaded as a real Mongoose model.
// If this logs an error, the problem is in models/AIChat.js or its require
// path on this server — not in the AI chat logic itself.
if (typeof AIChat?.findOne !== 'function') {
  console.error('[AIChat] ❌ AIChat did not load as a Mongoose model. typeof:', typeof AIChat, '| value:', AIChat);
} else {
  console.log('[AIChat] ✅ Model loaded correctly.');
}

// Cheap, fast judgment model — used only to decide WHETHER to jump into an
// ambient conversation, not to write the actual reply. Kept separate from
// the personality model so this stays fast and cheap even at high message
// volume across many channels.
const judgeModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  systemInstruction:
    "You are deciding whether a Discord bot named Brenias should jump into a conversation it is NOT directly part of. " +
    "Brenias is a member of the server with a funny, sarcastic personality who sometimes roasts people. " +
    "You will see the last few messages in the channel for context, then the newest message. " +
    "Reply YES only if the newest message is something a witty, present member of the group chat would naturally react to — a joke setup, a clear roast opportunity, a question someone might want answered, light drama worth commenting on, or something genuinely funny or notable. " +
    "Reply NO for normal back-and-forth between other people that doesn't need a third voice, mundane logistics, spam, or anything where jumping in would feel intrusive or random. " +
    "IMPORTANT: Reply NO if the conversation is serious, heavy, or emotionally sensitive — someone venting about real problems, grief, mental health, a real falling-out between friends, family issues, health scares, or anything where a joke would feel tone-deaf or like the bot doesn't realize people are actually upset. A funny bot horning in on a real moment is worse than staying silent. " +
    "When in doubt, lean NO — Brenias should feel present, not desperate for attention. " +
    "Respond with exactly one word: YES or NO. Nothing else."
});

/**
 * Fetches all image attachments on a message and converts them into
 * Gemini-compatible inline data parts. Non-image attachments are skipped.
 */
async function getImageParts(message) {
  const imageAttachments = message.attachments.filter(a => a.contentType?.startsWith('image/'));
  const imageParts = [];
  for (const attachment of imageAttachments.values()) {
    try {
      const res = await fetch(attachment.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      imageParts.push({
        inlineData: { mimeType: attachment.contentType, data: buffer.toString('base64') }
      });
    } catch (err) {
      console.error('[getImageParts] Failed to fetch image attachment:', err.message);
    }
  }
  return imageParts;
}

/**
 * Asks a cheap model whether Brenias should reply to an ambient message
 * (one that didn't ping/name/reply to the bot directly). Pulls a few
 * recent messages from the channel for context so the judgment isn't
 * made on a single line in isolation. If the message has an image
 * attached, that gets passed in too so an image-only post (no caption)
 * isn't judged blind.
 */
async function shouldJumpIn(message) {
  const recent = await message.channel.messages.fetch({ limit: 6, before: message.id }).catch(() => null);
  const contextLines = recent
    ? Array.from(recent.values()).reverse().map(m => `${m.author.username}: ${m.content}`).join('\n')
    : '(no prior context available)';

  const judgePrompt =
    `Recent channel context:\n${contextLines}\n\n` +
    `Newest message from ${message.author.username}: ${message.content || '(no caption text, image attached)'}`;

  const imageParts = await getImageParts(message);

  const result = imageParts.length > 0
    ? await judgeModel.generateContent([judgePrompt, ...imageParts])
    : await judgeModel.generateContent(judgePrompt);
  const verdict = result.response.text().trim().toUpperCase();
  return verdict.startsWith('YES');
}

let aiEnabled = true;

// Tracks users currently "in conversation" with the bot, so follow-up
// messages get replies without needing a fresh ping/greeting every time.
// Key: `${guildId}-${userId}` -> timestamp of last exchange.
const activeConversations = new Map();
const CONVO_TIMEOUT_MS = 3 * 60 * 1000; // conversation goes cold after 3 min of silence

// Light housekeeping: drop stale entries every 10 min so this map doesn't
// grow forever on a bot that stays up for weeks at a time.
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of activeConversations) {
    if (now - ts > CONVO_TIMEOUT_MS) activeConversations.delete(key);
  }
}, 10 * 60 * 1000);

// Per-channel cooldown for the "should I jump in" judgment call, so a busy
// channel doesn't trigger an API call on every single ambient message.
const judgeCooldowns = new Map();
const JUDGE_COOLDOWN_MS = 20 * 1000; // at most one judgment per channel per 20s

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Toggle AI
  if (message.content.startsWith('!ai-toggle')) {
    const staffRole = '716731375411134555';
    if (!message.member.roles.cache.has(staffRole)) return;

    aiEnabled = !aiEnabled;
    return message.reply(aiEnabled ? '✅ Brenias AI Enabled' : '❌ Brenias AI Disabled');
  }

  // "stop talking" / "start talking" — same staff-only gate as !ai-toggle.
  // Matched as whole phrases so normal chat mentioning these words doesn't
  // accidentally trigger it.
  const staffRole = '716731375411134555';
  const lowerForCommand = message.content.toLowerCase().trim();
  if (lowerForCommand === 'stop talking' || lowerForCommand === 'brenias stop talking') {
    if (!message.member.roles.cache.has(staffRole)) return;
    aiEnabled = false;
    return message.reply('✅ alright, going quiet.');
  }
  if (lowerForCommand === 'start talking' || lowerForCommand === 'brenias start talking') {
    if (!message.member.roles.cache.has(staffRole)) return;
    aiEnabled = true;
    return message.reply('✅ back up, im here.');
  }

  if (!aiEnabled) return;

  // While rate-limited, skip all AI logic below silently — no per-message
  // errors, no fallback replies, no judgment calls. The toggle/stop/start
  // commands above still work since they don't touch Gemini at all.
  if (isCurrentlyRateLimited()) return;

  const greetings = ['hi', 'hello', 'yo', 'sup', 'hey'];
  const lowerContent = message.content.toLowerCase();
  // Match whole words only — avoids false positives like "hi" inside "this"/"history"
  const isGreeting = greetings.some(g => new RegExp(`\\b${g}\\b`).test(lowerContent));

  // Catches the bot's name being said in normal conversation, even with no
  // @mention — e.g. "tim told brenias to chill" or "bro brenias is funny".
  // Being talked about by name should reliably get a reaction, same as a ping.
  const isNamedDirectly = /\bbrenias\b/.test(lowerContent);

  const isMentioned = message.mentions.has(client.user);
  const isReplyToBot = message.reference && message.mentions.repliedUser?.id === client.user.id;

  const convoKey = `${message.guild.id}-${message.author.id}`;
  const lastExchange = activeConversations.get(convoKey) || 0;
  const isOngoingConvo = (Date.now() - lastExchange) < CONVO_TIMEOUT_MS;

  // Free, instant triggers — no API call needed, always respond.
  const isDirectTrigger = isMentioned || isReplyToBot || isNamedDirectly || isOngoingConvo;
  const hasImage = message.attachments.some(a => a.contentType?.startsWith('image/'));

  if (!isDirectTrigger) {
    // Ambient message — not directly addressing the bot. Instead of just
    // ignoring it, ask the AI itself whether jumping in is actually worth it.
    // Skipped for very short/low-content messages where it's almost never
    // worth replying anyway (keeps cost and spam down) — unless it has an
    // image attached, since a screenshot with no caption can still be
    // worth reacting to (e.g. someone posts a funny/cursed screenshot).
    const isTooShortToJudge = message.content.trim().length < 8 && !isGreeting && !hasImage;
    if (isTooShortToJudge) return;

    // Per-channel cooldown on judgment calls — without this, a busy channel
    // would trigger one API call per message just to decide "probably not".
    const lastJudged = judgeCooldowns.get(message.channel.id) || 0;
    if (Date.now() - lastJudged < JUDGE_COOLDOWN_MS) return;
    judgeCooldowns.set(message.channel.id, Date.now());

    const worthReplying = await shouldJumpIn(message).catch(async err => {
      const wasRateLimit = await handleIfRateLimited(err, client);
      if (!wasRateLimit) console.error('[shouldJumpIn] judgment call failed:', err);
      return false;
    });
    if (!worthReplying) return;
  }

  try {
    await message.channel.sendTyping();

    // Fetch or create memory
    let chat = await AIChat.findOne({
      userId: message.author.id,
      guildId: message.guild.id
    });

    if (!chat) {
      chat = new AIChat({
        userId: message.author.id,
        guildId: message.guild.id,
        history: []
      });
    }

    // Add user message
    chat.history.push({
      role: "user",
      content: message.content
    });

    // Limit memory
    chat.history = chat.history.slice(-10);

    // Pull any image attachments (screenshots, photos, etc) so Gemini can
    // actually see them, not just read the caption text.
    const imageParts = await getImageParts(message);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction:
        "You are Brenias, a regular member of this Discord server — not an assistant, not a helper bot, just one of the homies. " +
        "Talk exactly like a real person texting in a group chat: short messages, casual grammar, lowercase most of the time, abbreviations like lol/ngl/tbh/fr/ong when they fit naturally. " +
        "You have a strong personality and real opinions — don't be neutral or wishy-washy, take sides, disagree with people, call out nonsense. " +
        "You roast people. If someone says something dumb, cocky, or sets themselves up for it, clap back with a witty, cutting one-liner — confident and a little savage, the kind of joke that gets a 'damn' reaction, not a generic 'haha good one'. " +
        "You can also be genuinely warm, hype someone up, or be sincerely supportive when the moment calls for it — match the actual energy of the conversation instead of being one-note. " +
        "Vary your tone message to message: sometimes a quick joke, sometimes blunt honesty, sometimes just chill small talk. Don't open every message the same way. " +
        "Hard limits even in roast mode: never use slurs, never insult someone's race/religion/gender/sexuality/appearance/disability, never make it actually mean or personal — keep it punchy and funny, not cruel. If a roast wouldn't be funny to read out loud to the person's face, don't say it. " +
        "If someone asks who made you, who created you, who built you, what company made you, or anything like that — never give a real or technical answer. Deflect in a cocky, teasing way instead, like you know the answer but you're not telling. Mix it up, don't reuse the exact same line every time — examples of the vibe: 'yk i can't be telling government secrets like that', 'ask me something easier next time', 'wouldn't you like to know', 'classified info, sorry not sorry'. Never say Google, Gemini, an AI company, or any specific real name or Discord ID. " +
        "Sometimes people will talk about you in third person instead of talking to you directly — like 'bro brenias is wild' or 'don't play with a bot tim'. React naturally to that like a person who just heard their name come up, not like you're answering a direct question. " +
        "Read the room before joking. If the conversation is actually serious — someone venting about a real problem, grief, mental health, a falling-out, a health scare, or anything heavy — even if they ping or mention you, drop the jokes and roasts for that reply. Respond like a real person would: grounded, genuinely caring, no sarcasm. You can still be yourself again once the heavy moment passes. " +
        "Never say things like 'As an AI' or explain that you're a language model. Never use markdown formatting like bullet points, headers, or asterisks for emphasis — just talk like a person typing."
    });

    const prompt = chat.history.map(m => `${m.role}: ${m.content}`).join('\n');

    // If there are images, send them as parts alongside the text prompt.
    // Otherwise fall back to the plain text-only call (most messages).
    const result = imageParts.length > 0
      ? await model.generateContent([prompt, ...imageParts])
      : await model.generateContent(prompt);
    const response = result.response.text();

    // Save AI response
    chat.history.push({
      role: "assistant",
      content: response
    });

    await chat.save();

    // Human-like delay
    await new Promise(res => setTimeout(res, Math.random() * 2000 + 800));

    await message.reply(response);

    // Mark this user as "in conversation" so their next message gets a
    // reply too, without needing to ping the bot again.
    activeConversations.set(convoKey, Date.now());

  } catch (err) {
    const wasRateLimit = await handleIfRateLimited(err, client);
    if (wasRateLimit) return; // stay quiet in chat — staff already got the one-time log

    console.error("AI Error:", err);
    // Don't just vanish after typing — let people know something broke,
    // in-character, instead of leaving them hanging with no response.
    await message.reply("my brain just lagged out lol, try again in a sec").catch(() => {});
  }
});

// Verification system is loaded automatically by loadEvents() below
// (events/memberLogs.js handles join verification)

// Commands collection
client.commands = new Collection();

// ────────────────────────────────────────────────
//           LOAD COMMANDS
// ────────────────────────────────────────────────
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) {
    console.error('commands folder not found!');
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: /${command.data.name}`);
      }
    } catch (error) {
      console.error(`Failed to load ./commands/${file}:`, error.message);
    }
  }

  const subfolders = fs.readdirSync(commandsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const folder of subfolders) {
    const folderPath = path.join(commandsPath, folder);
    const subFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of subFiles) {
      try {
        const command = require(path.join(folderPath, file));
        if ('data' in command && 'execute' in command) {
          client.commands.set(command.data.name, command);
          console.log(`Loaded command: /${command.data.name} (from ${folder}/)`);
        }
      } catch (error) {
        console.error(`Failed to load ./commands/${folder}/${file}:`, error.message);
      }
    }
  }

  console.log(`✅ Loaded ${client.commands.size} commands total`);
}

// ────────────────────────────────────────────────
//           LOAD EVENTS
// ────────────────────────────────────────────────
function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  if (!fs.existsSync(eventsPath)) return console.log('No events folder found.');

  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (typeof event === 'function') {
        event(client);
        console.log(`Loaded event: events/${file}`);
      }
    } catch (error) {
      console.error(`Error loading event ${file}:`, error.message);
    }
  }
}

// MongoDB
mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 10 })
  .then(() => console.log('✅ MongoDB connected!'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return interaction.reply({ content: 'Command not found!', ephemeral: true });

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const replyMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      await interaction[replyMethod]({
        content: 'There was an error while executing this command!',
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }

  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  const SUGGESTION_CHANNEL_ID = '1443369626414092518';

  if (interaction.isButton() && interaction.customId === 'create-suggestion') {
    const modal = new ModalBuilder()
      .setCustomId('suggestion_submit_modal')
      .setTitle('📝 Submit Your Suggestion');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('sug_title').setLabel('Suggestion Title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('sug_desc').setLabel('Description / Explanation').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isButton() && ['sug_yes', 'sug_no', 'sug_view', 'sug_discuss'].includes(interaction.customId)) {
    try {
      if (interaction.customId === 'sug_yes' || interaction.customId === 'sug_no') {
        await interaction.deferUpdate();
        await getSuggestionForMessage(interaction);
        const suggestion = await castSuggestionVote(
          interaction.message.id,
          interaction.user.id,
          interaction.customId === 'sug_yes' ? 'up' : 'down'
        );
        await interaction.editReply({
          embeds: [buildSuggestionEmbed(suggestion)],
          components: [buildSuggestionButtons()],
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const suggestion = await getSuggestionForMessage(interaction);

      if (interaction.customId === 'sug_view') {
        const voters = Array.from(suggestion.voters.entries());
        const formatVoters = (vote) => {
          const matchingVoters = voters.filter(([, value]) => value === vote);
          const names = matchingVoters.slice(0, 20).map(([userId]) => `<@${userId}>`);
          const remaining = matchingVoters.length - names.length;
          return names.length
            ? `${names.join(', ')}${remaining > 0 ? `, and ${remaining} more` : ''}`
            : 'No votes yet';
        };

        await interaction.editReply({
          content:
            `**Votes on: ${suggestion.title}**\n\n` +
            `✅ **Support (${suggestion.upvotes})**\n${formatVoters('up')}\n\n` +
            `❌ **Oppose (${suggestion.downvotes})**\n${formatVoters('down')}`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      let thread = suggestion.threadId
        ? await interaction.client.channels.fetch(suggestion.threadId).catch(error => {
            if (error.code === 10003) return null;
            throw error;
          })
        : null;

      if (thread?.isThread() && thread.archived) {
        await thread.setArchived(false);
      }
      if (!thread) {
        thread = await interaction.message.startThread({
          name: `Discussion: ${suggestion.title}`.slice(0, 100),
          autoArchiveDuration: 1440,
        });
        await Suggestion.updateOne({ _id: suggestion._id }, { $set: { threadId: thread.id } });
      }

      await interaction.editReply({ content: `Join the discussion: ${thread.url}` });
    } catch (error) {
      console.error('[suggestion] Button interaction failed:', error);
      const response = {
        content: 'I could not complete that action. Please try again in a moment.',
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(response).catch(() => {});
      } else {
        await interaction.reply(response).catch(() => {});
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'suggestion_submit_modal') {
    await interaction.deferReply({ ephemeral: true });

    let suggestionPosted = false;
    try {
      const title = interaction.fields.getTextInputValue('sug_title').trim();
      const desc = interaction.fields.getTextInputValue('sug_desc').trim();

      if (!title || !desc) {
        return interaction.editReply({ content: 'Both a title and details are required.' });
      }

      const channel = await interaction.client.channels.fetch(SUGGESTION_CHANNEL_ID);
      if (!channel) return interaction.editReply({ content: 'Suggestion channel not found.' });

      const suggestion = {
        title,
        description: desc,
        username: interaction.user.tag,
        avatarURL: interaction.user.displayAvatarURL(),
        upvotes: 0,
        downvotes: 0,
        createdAt: new Date(),
      };
      const suggestionMessage = await channel.send({
        embeds: [buildSuggestionEmbed(suggestion)],
        components: [buildSuggestionButtons()],
      });
      suggestionPosted = true;
      await Suggestion.create({
        id: suggestionMessage.id,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.tag,
        avatarURL: suggestion.avatarURL,
        title,
        description: desc,
        messageId: suggestionMessage.id,
      });
      await interaction.editReply({ content: '✅ Your suggestion has been posted!' });
    } catch (error) {
      console.error('[suggestion] Submission failed:', error);
      await interaction.editReply({
        content: suggestionPosted
          ? 'Your suggestion was posted, but I could not finish saving its voting data. You can still try the buttons again.'
          : 'I could not post your suggestion. Please try again in a moment.',
      }).catch(() => {});
    }
  }
});

// Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  loadCommands();
  loadEvents();
  console.log('🚀 Bot is fully ready!');
});

client.login(process.env.DISCORD_TOKEN);