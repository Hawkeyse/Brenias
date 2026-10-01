const { ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const EmoteHunt = require('../models/EmoteHunt');
const { EMOTE_POOL, formatEmote } = require('./halloweenEmotes');
const { logEmoteHuntStarted } = require('./halloweenLog');

const EMOTE_HUNT_CHANNEL_ID = '1549068824194584616';
const HUNT_INTERVAL_MS = 2 * 60 * 60 * 1000;
const HUNT_REWARD = 500;

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

async function findTargetMessage(guild, excludedChannelId) {
  const botMember = guild.members.me || await guild.members.fetchMe();
  const publicTextTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
  const channels = [...(await guild.channels.fetch()).values()].filter((candidate) => {
    if (!candidate || candidate.id === excludedChannelId || !publicTextTypes.includes(candidate.type)) return false;
    const everyonePermissions = candidate.permissionsFor(guild.roles.everyone);
    const botPermissions = candidate.permissionsFor(botMember);
    return everyonePermissions?.has(PermissionsBitField.Flags.ViewChannel)
      && botPermissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
      ]);
  });

  for (const targetChannel of shuffle(channels)) {
    const recentMessages = await targetChannel.messages.fetch({ limit: 50 }).catch(() => null);
    const candidates = recentMessages
      ? [...recentMessages.values()].filter((message) => !message.system)
      : [];
    if (candidates.length) {
      const targetMessage = candidates[Math.floor(Math.random() * candidates.length)];
      return { targetChannel, targetMessage };
    }
  }

  throw new Error('No accessible public text-channel messages are available for the hunt.');
}

async function startEmoteHunt(client, { force = false } = {}) {
  const channel = await client.channels.fetch(EMOTE_HUNT_CHANNEL_ID);
  if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    throw new Error(`Emote hunt channel ${EMOTE_HUNT_CHANNEL_ID} is missing or is not a text channel.`);
  }

  const guildId = channel.guild.id;
  const activeHunt = await EmoteHunt.findOne({
    guildId,
    active: true,
    announcementChannelId: channel.id,
    announcementMessageId: { $ne: null },
  }).sort({ startedAt: -1 });
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
  const { targetChannel, targetMessage } = await findTargetMessage(channel.guild, channel.id);
  const previousReward = latestHunt?.reward ?? HUNT_REWARD;
  const hunt = await EmoteHunt.create({
    guildId,
    announcementChannelId: channel.id,
    channelId: targetChannel.id,
    messageId: targetMessage.id,
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
      `Find a message in another public text channel with this reaction: ${formatEmote(target)}\n` +
      `React to that same message to win **${hunt.reward.toLocaleString()} Halloween Points**.\n` +
      'The first correct reaction wins. The next round starts 2 hours after the winner.'
    );

  try {
    await targetMessage.react(target.id);
    const message = await channel.send({ embeds: [announcement] });
    hunt.announcementMessageId = message.id;
    hunt.active = true;
    await hunt.save();
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