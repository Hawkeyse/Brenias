const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const HalloweenHeist = require('../models/HalloweenHeist');
const User = require('../models/User');

const JOIN_WINDOW_MS = 60 * 1000;
const JOIN_BUTTON_EMOJI = { name: '502736pumpkin', id: '1550187604811710544', animated: true };
const POINTS_EMOJI = '<:687657pumpkin:1549044780863070258>';
const SKULL_EMOJI = '<:623778ghost:1549040963886915624>';
const ACTIVE_STATUSES = ['joining', 'processing'];

const MAPS = [
  'Bloodmoon Bank',
  'Graveyard Gold Vault',
  'Witchlight Casino',
  'The Haunted Mint',
  'Midnight Museum',
];
const TITLES = [
  'The Midnight Heist',
  'The Cursed Coin Job',
  'Operation Pumpkin Vault',
  'The Ghostlight Getaway',
  'One Last Treat',
];
const WIN_STORIES = [
  'I slipped through a cursed vent, grabbed the glowing loot, and vanished before the guards even noticed.',
  'I tricked the vampire guards with a squeaky bat and escaped with the pumpkin gold in hand.',
  'I dodged the moonbeam lasers, scooped up the treasure, and left the vault while the ghosts were still arguing.',
  'I found the secret door, took the prize, and slipped away while the old portrait watched me go.',
];
const LOSS_STORIES = [
  'I reached for the loot, tripped the alarm, and got chased out of the vault by a laughing ghost.',
  'I grabbed the cursed pumpkin and woke every guard in the room before I could escape.',
  'I hit a glitter trap, got tangled in a net, and watched the vampire guards clap me out of the job.',
  'I opened the wrong door and stumbled into the monster break room during karaoke night.',
];

const timers = new Map();
const processingSessions = new Set();
const lobbyRefreshes = new Map();

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function rollHeistOutcome() {
  const escapes = Math.random() < 0.5;
  return {
    outcome: escapes ? 'escape' : 'caught',
    points: escapes
      ? Math.floor(Math.random() * 201) + 100
      : -(Math.floor(Math.random() * 141) + 50),
  };
}

function buildLobbyPayload(heist) {
  const timeLeft = Math.max(0, Math.ceil((heist.joinEndsAt.getTime() - Date.now()) / 1000));
  const joining = heist.status === 'joining';
  const embed = new EmbedBuilder()
    .setColor('#FF7518')
    .setTitle('🎃 HALLOWEEN HEIST')
    .setDescription(
      `🗺️ **MAP:** ${heist.map}\n` +
      `🎭 **${heist.title}**\n\n` +
      `The vault opens in ${joining ? `${timeLeft} seconds` : 'one minute'}...\n\n` +
      '💰 Join the heist to take your chance at the loot!\n' +
      '🎃 Possible reward: **+100 to +300 Points**\n' +
      '💀 Possible loss: **-50 to -190 Points**\n\n' +
      `👥 **Participants:** ${heist.participants.length}\n\n` +
      (joining ? `⏳ Joining closes in ${timeLeft} seconds...` : '⏳ Joining is closed. The crew is taking turns...')
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`heist:join:${heist.sessionId}`)
      .setLabel('Join Heist')
      .setEmoji(JOIN_BUTTON_EMOJI)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!joining)
  );
  return { embeds: [embed], components: [row] };
}

async function createHeistSession({ guildId, channelId }) {
  const now = new Date();
  const sessionId = randomUUID();
  const fields = {
    sessionId,
    status: 'joining',
    channelId,
    messageId: null,
    map: randomItem(MAPS),
    title: randomItem(TITLES),
    joinEndsAt: new Date(now.getTime() + JOIN_WINDOW_MS),
    participants: [],
    nextParticipantIndex: 0,
    startedAt: now,
    finishedAt: null,
  };

  const previous = await HalloweenHeist.findOne({ guildId });
  if (previous && ACTIVE_STATUSES.includes(previous.status)) return null;

  if (previous) {
    return HalloweenHeist.findOneAndUpdate(
      { _id: previous._id, status: previous.status },
      { $set: fields },
      { new: true }
    );
  }

  try {
    return await HalloweenHeist.create({ guildId, ...fields });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}

function fallbackStory(outcome, map) {
  const stories = outcome === 'escape' ? WIN_STORIES : LOSS_STORIES;
  return `${randomItem(stories)} It happened at ${map}.`;
}

async function generateStory({ userId, map, title, outcome, points }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackStory(outcome, map);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        instructions:
          'Write one short sentence in plain English. Keep it simple and human, around 12 to 20 words. ' +
          'Describe the heist clearly using the supplied map and title, and make the outcome easy to understand. ' +
          'Do not include point totals, labels, headings, or extra explanation. Return only the story.',
        input: JSON.stringify({ participantMention: `<@${userId}>`, map, title, outcome, exactPoints: points }),
        max_output_tokens: 60,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}`);
    const payload = await response.json();
    const rawStory = payload.output_text || payload.output
      ?.flatMap((block) => block.content || [])
      .find((item) => item.type === 'output_text')?.text;
    if (!rawStory) throw new Error('OpenAI returned no story text.');

    const cleaned = rawStory
      .replace(/<@!?\d+>/g, '')
      .replace(/@everyone|@here/g, 'everyone')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^['"“]|['"”]$/g, '');
    const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    return sentences.slice(0, 1).join(' ').trim() || fallbackStory(outcome, map);
  } catch (error) {
    console.error('[halloweenHeist] story generation failed:', error.message);
    return fallbackStory(outcome, map);
  }
}

async function applyHeistPoints(heist, participant) {
  try {
    await User.findOneAndUpdate(
      {
        guildId: heist.guildId,
        userId: participant.userId,
        lastHeistAwardId: { $ne: heist.sessionId },
      },
      {
        $inc: { halloweenPoints: participant.points },
        $set: { lastHeistAwardId: heist.sessionId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const account = await User.findOne({ guildId: heist.guildId, userId: participant.userId })
      .select('lastHeistAwardId')
      .lean();
    if (account?.lastHeistAwardId !== heist.sessionId) throw error;
  }
}

function buildResultEmbed(participant) {
  const points = `${participant.points > 0 ? '+' : ''}${participant.points}`;
  const outcomeText = participant.outcome === 'escape' ? 'Escaped with the loot.' : 'Got caught in the chaos.';
  const story = participant.story || 'The crew ran into a mess and tried to make a clean getaway.';

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(participant.outcome === 'escape' ? '#FFB703' : '#D62828')
        .setTitle(participant.outcome === 'escape' ? '🎃 Heist Result' : '💀 Heist Result')
        .setDescription(
          `${story}\n\n` +
          `**Outcome:** ${outcomeText}\n` +
          `**Points:** ${points}`
        )
        .setFooter({ text: participant.outcome === 'escape' ? 'The vault is empty and the crew is gone.' : 'The guards won this round.' }),
    ],
    allowedMentions: { users: [participant.userId] },
  };
}

function resultLine(participant) {
  const emoji = participant.outcome === 'escape' ? POINTS_EMOJI : SKULL_EMOJI;
  const points = `${participant.points > 0 ? '+' : ''}${participant.points}`;
  return `<@${participant.userId}> ${participant.story} ${emoji} ${points} Points`;
}

async function startHeist(client, guildId, channel) {
  const heist = await createHeistSession({ guildId, channelId: channel.id });
  if (!heist) return { started: false };

  try {
    const message = await channel.send(buildLobbyPayload(heist));
    heist.messageId = message.id;
    await heist.save();
    scheduleJoinClose(client, heist);
    return { started: true, heist, message };
  } catch (error) {
    heist.status = 'cancelled';
    heist.finishedAt = new Date();
    await heist.save().catch(() => {});
    throw error;
  }
}

function scheduleJoinClose(client, heist) {
  const existing = timers.get(heist.sessionId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, heist.joinEndsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    timers.delete(heist.sessionId);
    closeJoining(client, heist.sessionId).catch((error) => {
      console.error('[halloweenHeist] failed to close joining:', error);
    });
  }, delay);
  timers.set(heist.sessionId, timer);
}

async function updateLobbyMessage(client, heist, payload) {
  if (!heist.messageId) return;
  const channel = await client.channels.fetch(heist.channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(heist.messageId).catch(() => null);
  if (message) await message.edit(payload).catch((error) => {
    console.error('[halloweenHeist] lobby update failed:', error.message);
  });
}

async function refreshJoiningLobby(client, sessionId) {
  const previous = lobbyRefreshes.get(sessionId) || Promise.resolve();
  const refresh = previous.catch(() => {}).then(async () => {
    const latest = await HalloweenHeist.findOne({ sessionId });
    if (!latest) return;
    await updateLobbyMessage(client, latest, buildLobbyPayload(latest));
  });
  lobbyRefreshes.set(sessionId, refresh);
  try {
    await refresh;
  } finally {
    if (lobbyRefreshes.get(sessionId) === refresh) lobbyRefreshes.delete(sessionId);
  }
}

async function closeJoining(client, sessionId) {
  const heist = await HalloweenHeist.findOne({ sessionId, status: 'joining' });
  if (!heist) return;

  if (heist.participants.length === 0) {
    heist.status = 'cancelled';
    heist.finishedAt = new Date();
    await heist.save();
    await updateLobbyMessage(client, heist, {
      embeds: [new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('🎃 Heist Cancelled')
        .setDescription(`Nobody dared to enter **${heist.map}**. The vault stays closed.`)],
      components: [],
    });
    return;
  }

  heist.status = 'processing';
  await heist.save();
  await updateLobbyMessage(client, heist, buildLobbyPayload(heist));
  await processHeist(client, sessionId);
}

async function processHeist(client, sessionId) {
  if (processingSessions.has(sessionId)) return;
  processingSessions.add(sessionId);

  try {
    while (true) {
      const heist = await HalloweenHeist.findOne({ sessionId, status: 'processing' });
      if (!heist) return;

      const participant = heist.participants.find((entry) => !entry.processed);
      if (!participant) {
        heist.status = 'finished';
        heist.finishedAt = new Date();
        await heist.save();
        return;
      }

      if (!participant.story) {
        const roll = rollHeistOutcome();
        participant.outcome = roll.outcome;
        participant.points = roll.points;
        participant.story = await generateStory({
          userId: participant.userId,
          map: heist.map,
          title: heist.title,
          outcome: participant.outcome,
          points: participant.points,
        });
        await heist.save();
      }

      if (!participant.rewardApplied) {
        await applyHeistPoints(heist, participant);
        participant.rewardApplied = true;
        await heist.save();
      }

      if (!participant.resultSent) {
        const channel = await client.channels.fetch(heist.channelId);
        await channel.send(buildResultEmbed(participant));
        participant.resultSent = true;
        await heist.save();
      }

      participant.processed = true;
      heist.nextParticipantIndex += 1;
      await heist.save();
    }
  } finally {
    processingSessions.delete(sessionId);
  }
}

async function joinHeist(client, interaction, sessionId) {
  const now = new Date();
  const userId = interaction.user.id;
  const current = await HalloweenHeist.findOne({ sessionId });
  if (!current || current.status !== 'joining' || current.joinEndsAt <= now) {
    return { joined: false, reason: 'closed' };
  }
  if (current.participants.some((participant) => participant.userId === userId)) {
    return { joined: false, reason: 'duplicate' };
  }

  const heist = await HalloweenHeist.findOneAndUpdate(
    {
      sessionId,
      status: 'joining',
      joinEndsAt: { $gt: now },
      'participants.userId': { $ne: userId },
    },
    { $push: { participants: { userId } } },
    { new: true }
  );
  if (!heist) {
    const latest = await HalloweenHeist.findOne({ sessionId });
    if (latest?.participants.some((participant) => participant.userId === userId)) {
      return { joined: false, reason: 'duplicate' };
    }
    return { joined: false, reason: 'closed' };
  }

  await refreshJoiningLobby(client, sessionId).catch((error) => {
    console.error('[halloweenHeist] participant count update failed:', error.message);
  });
  return { joined: true };
}

async function recoverHeists(client) {
  const active = await HalloweenHeist.find({ status: { $in: ACTIVE_STATUSES } });
  for (const heist of active) {
    if (heist.status === 'joining') scheduleJoinClose(client, heist);
    else processHeist(client, heist.sessionId).catch((error) => {
      console.error('[halloweenHeist] participant processing failed:', error);
    });
  }
}

module.exports = {
  JOIN_WINDOW_MS,
  buildLobbyPayload,
  rollHeistOutcome,
  createHeistSession,
  startHeist,
  joinHeist,
  closeJoining,
  processHeist,
  recoverHeists,
  generateStory,
  applyHeistPoints,
  buildResultEmbed,
  resultLine,
  timers,
  processingSessions,
};