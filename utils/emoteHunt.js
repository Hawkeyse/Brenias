const { ChannelType, EmbedBuilder } = require('discord.js');
const EmoteHunt = require('../models/EmoteHunt');
const { EMOTE_POOL, formatEmote } = require('./halloweenEmotes');
const { logEmoteHuntStarted } = require('./halloweenLog');

const EMOTE_HUNT_CHANNEL_ID = '1549068824194584616';
const HUNT_INTERVAL_MS = 2 * 60 * 60 * 1000;
const HUNT_REWARD = 500;

async function startEmoteHunt(client, { force = false } = {}) {
  const channel = await client.channels.fetch(EMOTE_HUNT_CHANNEL_ID);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error(`Emote hunt channel ${EMOTE_HUNT_CHANNEL_ID} is missing or is not a text channel.`);
  }

  const guildId = channel.guild.id;
  const activeHunt = await EmoteHunt.findOne({ guildId, active: true }).sort({ startedAt: -1 });
  const latestHunt = await EmoteHunt.findOne({ guildId }).sort({ startedAt: -1 });
  const now = Date.now();

  if (!force && activeHunt) return { started: false, reason: 'active' };

  const nextAt = latestHunt?.winnerId && latestHunt.endedAt
    ? latestHunt.endedAt.getTime() + HUNT_INTERVAL_MS
    : null;
  if (!force && nextAt && now < nextAt) {
    return { started: false, reason: 'interval', nextAt };
  }

  await EmoteHunt.updateMany(
    { guildId, active: true },
    { $set: { active: false, endedAt: new Date(now) } }
  );

  const choices = EMOTE_POOL.filter((emote) => emote.id !== latestHunt?.targetEmojiId);
  if (!choices.length) throw new Error('Emote hunt pool must contain at least two different emotes.');
  const target = choices[Math.floor(Math.random() * choices.length)];
  const previousReward = latestHunt?.reward ?? HUNT_REWARD;
  const hunt = await EmoteHunt.create({
    guildId,
    channelId: channel.id,
    targetEmojiId: target.id,
    targetEmojiName: target.name,
    targetAnimated: target.animated,
    reward: previousReward,
    active: false,
    startedAt: new Date(now),
  });

  const announcement = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('👻 Halloween Emote Hunt')
    .setDescription(
      `React to THIS message with ${formatEmote(target)} to win **${hunt.reward.toLocaleString()} Halloween Points**!\n` +
      'The first correct reaction wins. The next round starts 2 hours after the winner.'
    );

  try {
    const message = await channel.send({ embeds: [announcement] });
    hunt.messageId = message.id;
    hunt.active = true;
    await hunt.save();
    await message.react(target.id).catch((err) => {
      console.error('[emoteHunt] Could not seed target reaction:', err.message);
    });
    await logEmoteHuntStarted(client, {
      channelId: channel.id,
      emoteName: target.name,
      url: message.url,
    });
    return { started: true, channel, hunt, message };
  } catch (error) {
    hunt.active = false;
    hunt.endedAt = new Date();
    await hunt.save().catch(() => {});
    throw error;
  }
}

module.exports = {
  EMOTE_HUNT_CHANNEL_ID,
  HUNT_INTERVAL_MS,
  HUNT_REWARD,
  startEmoteHunt,
};