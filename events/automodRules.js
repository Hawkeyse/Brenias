// events/automodRules.js
// Real-time rule enforcement for the server rules in #rules.
//
// Two tiers, by design:
//   1. CODE-BASED rules (reliable, no AI guessing): mass mentions/@everyone
//      spam, ads outside the designated channel, bad words. These get
//      DELETE + WARN USER + LOG TO STAFF, using the existing Violation
//      model to track repeat offenses.
//   2. AI-JUDGED rules (harassment, discrimination, impersonation, art
//      theft, off-topic trolling): NEVER auto-acted on. Only flagged to
//      staff in the logs channel for a human to review and decide.
//
// IMPORTANT: every message this file sends uses `allowedMentions: { parse: [] }`
// so the bot can quote/describe a violation (including the word "@everyone")
// without actually re-pinging everyone/here/roles itself.

const { Events, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const AutomodConfig = require('../models/AutomodConfig');
const Violation = require('../models/Violation');

const LOGS_CHANNEL_ID = '1366682681886244864';
const ADVERTISING_CHANNEL_ID = '717749000299741356';

// Mass-mention threshold — a message pinging this many users/roles at once
// counts as mention spam even without @everyone/@here.
const MASS_MENTION_THRESHOLD = 5;

const NO_PING = { parse: [] }; // belt-and-suspenders: never actually ping anyone/everyone/roles

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Cheap judgment model for the rules that need human-style reading
// (harassment, discrimination, impersonation, art theft, off-topic
// trolling). This NEVER triggers an action — only a flag for staff.
const rulesJudgeModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  systemInstruction:
    "You are a moderation assistant for a Discord server. You will be shown a single message and asked whether it likely breaks one of these rules: " +
    "harassment/insults/bullying/trying to start fights, discrimination or offensive jokes/slurs based on race/religion/gender/sexuality, impersonating staff/admins, claiming someone else's art as your own, or spamming/trolling/off-topic flooding. " +
    "Be conservative — normal banter, friendly trash talk between people who clearly know each other, and jokes with no real target are NOT violations. Only flag things a reasonable moderator would actually want to look at. " +
    "Respond in EXACTLY this format and nothing else: " +
    "First line: YES or NO. " +
    "If YES, second line: a short category label (Harassment, Discrimination, Impersonation, ArtTheft, Spam/Trolling). " +
    "If YES, third line: a one-sentence reason."
});

async function judgeMessageForRules(message) {
  const prompt = `Message from ${message.author.tag}: ${message.content || '(no text content)'}`;
  const result = await rulesJudgeModel.generateContent(prompt);
  const lines = result.response.text().trim().split('\n').map(l => l.trim());
  if (lines[0]?.toUpperCase() !== 'YES') return null;
  return {
    category: lines[1] || 'Unclear',
    reason: lines[2] || 'No reason given.'
  };
}

async function getViolation(guildId, userId) {
  let v = await Violation.findOne({ guildId, userId });
  if (!v) v = new Violation({ guildId, userId });
  return v;
}

async function logToStaff(client, embed) {
  const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
  if (!logsChannel) return;
  await logsChannel.send({ embeds: [embed], allowedMentions: NO_PING }).catch(() => {});
}

/**
 * Deletes the message, DMs/replies a warning to the user, bumps their
 * violation count, and logs the action to staff. Shared by all
 * code-based (auto-enforced) rule violations.
 */
async function enforceViolation(message, ruleName, details) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  // Delete first — if this fails (e.g. already deleted), still continue
  // so the user still gets warned and staff still gets logged.
  await message.delete().catch(() => {});

  const violation = await getViolation(guildId, userId);
  violation.violations += 1;
  violation.lastViolation = new Date();
  await violation.save();

  const warnText =
    `⚠️ Your message in ${message.channel} was removed for breaking a server rule: **${ruleName}**.\n` +
    `${details}\n\n` +
    `This is violation #${violation.violations} on record. Repeated violations may lead to mutes, kicks, or bans.`;

  // Try DM first, fall back to a channel mention-free reply-style notice
  // if DMs are closed.
  const dmFailed = await message.author.send({ content: warnText, allowedMentions: NO_PING }).catch(() => true);
  if (dmFailed === true) {
    await message.channel.send({
      content: `${message.author.username}, ${warnText}`,
      allowedMentions: NO_PING
    }).catch(() => {});
  }

  const logEmbed = new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`🚨 Auto-Enforced: ${ruleName}`)
    .setDescription(
      `**User:** ${message.author.tag} (${userId})\n` +
      `**Channel:** ${message.channel}\n` +
      `**Violation Count:** ${violation.violations}\n` +
      `**Details:** ${details}\n\n` +
      `**Original Content:**\n${(message.content || '*(no text content)*').slice(0, 1000)}`
    )
    .setTimestamp();

  await logToStaff(message.client, logEmbed);
}

/**
 * Flags a message to staff for human review only. No action taken on
 * the message or user. Used for AI-judged, harder-to-call rules.
 */
async function flagForReview(message, category, reason) {
  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle(`🔎 Flagged for Review: ${category}`)
    .setDescription(
      `**User:** ${message.author.tag} (${message.author.id})\n` +
      `**Channel:** ${message.channel}\n` +
      `**Why flagged:** ${reason}\n\n` +
      `**Message:**\n${(message.content || '*(no text content)*').slice(0, 1000)}\n\n` +
      `[Jump to message](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id})`
    )
    .setFooter({ text: 'AI-flagged — no action taken automatically. Staff review required.' })
    .setTimestamp();

  await logToStaff(message.client, embed);
}

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const member = message.member;
      // Staff are exempt from auto-enforcement (they post announcements,
      // handle pings, etc. — same logic as the existing doNotPost system).
      const isStaff = member?.permissions?.has('ManageGuild') || member?.permissions?.has('ManageMessages');
      if (isStaff) return;

      let config = await AutomodConfig.findOne({ guildId: message.guild.id });
      if (!config) {
        config = new AutomodConfig({ guildId: message.guild.id });
        await config.save();
      }

      // ── Rule: Don't @everyone / @here / mass mentions ──────────────
      const pingsEveryoneOrHere = message.mentions.everyone;
      const totalMentions = message.mentions.users.size + message.mentions.roles.size;
      if (pingsEveryoneOrHere || totalMentions >= MASS_MENTION_THRESHOLD) {
        await enforceViolation(
          message,
          "Don't @everyone / mass mentions",
          pingsEveryoneOrHere
            ? 'Used @everyone or @here, which is reserved for staff announcements.'
            : `Mentioned ${totalMentions} users/roles in a single message, which counts as mention spam.`
        );
        return; // one violation per message — don't double-flag the same message
      }

      // ── Rule: No advertisements outside the designated channel ─────
      if (config.linkEnabled && message.channel.id !== ADVERTISING_CHANNEL_ID) {
        const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/i;
        const urlRegex = /https?:\/\/[^\s]+/gi;
        const urls = message.content.match(urlRegex) || [];
        const hasInvite = inviteRegex.test(message.content);
        const hasNonWhitelistedLink = urls.some(url => {
          try {
            const hostname = new URL(url).hostname.replace(/^www\./, '');
            return !config.linkWhitelist.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
          } catch {
            return false;
          }
        });

        if (hasInvite || hasNonWhitelistedLink) {
          await enforceViolation(
            message,
            'No advertisements outside designated channel',
            `Posted a link/invite outside <#${ADVERTISING_CHANNEL_ID}>, the designated advertising channel.`
          );
          return;
        }
      }

      // ── Rule: No excessive swearing / bad words ─────────────────────
      if (config.badWordsEnabled && config.badWords.length > 0) {
        const lower = message.content.toLowerCase();
        const matchedWord = config.badWords.find(w => new RegExp(`\\b${w}\\b`, 'i').test(lower));
        if (matchedWord) {
          await enforceViolation(
            message,
            'No excessive swearing / banned words',
            'Your message contained language that is not allowed in this server.'
          );
          return;
        }
      }

      // ── AI-judged rules: harassment, discrimination, impersonation, ──
      // ── art theft, off-topic spam/trolling. Flag only, never auto-act.
      // Skipped for very short messages (not enough signal to judge).
      if (message.content && message.content.trim().length >= 12) {
        const verdict = await judgeMessageForRules(message).catch(err => {
          console.error('[automodRules] AI judgment failed:', err.message);
          return null;
        });
        if (verdict) {
          await flagForReview(message, verdict.category, verdict.reason);
        }
      }

    } catch (err) {
      console.error('[automodRules] Unexpected error:', err);
    }
  });

  console.log('[automodRules] Ready – enforcing code-based rules, flagging AI-judged ones for staff review');
};