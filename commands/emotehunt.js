const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const EmoteHunt = require('../models/EmoteHunt');
const { EMOTE_POOL, formatEmote } = require('../utils/halloweenEmotes');
const { logEmoteHuntStarted } = require('../utils/halloweenLog');

const PUBLIC_POST_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function canEveryoneView(channel, guild) {
  return PUBLIC_POST_CHANNEL_TYPES.includes(channel.type)
    && channel.permissionsFor(guild.roles.everyone)?.has(PermissionsBitField.Flags.ViewChannel);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emote-hunt')
    .setDescription('Start or reset the public Halloween emote hunt.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a hunt in a public text channel.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Public text channel where the hunt is announced.')
        .addChannelTypes(...PUBLIC_POST_CHANNEL_TYPES)
        .setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('reset')
      .setDescription('End the active hunt and start a fresh one.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Public text channel where the fresh hunt is announced.')
        .addChannelTypes(...PUBLIC_POST_CHANNEL_TYPES)
        .setRequired(true))),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to manage the emote hunt.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    if (!canEveryoneView(channel, interaction.guild)) {
      return interaction.reply({ content: 'Choose a text channel visible to @everyone. Staff-only, hidden, and voice channels are not allowed.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    const activeHunt = await EmoteHunt.findOne({ guildId: interaction.guild.id, active: true }).sort({ startedAt: -1 });
    const previousHunt = await EmoteHunt.findOne({ guildId: interaction.guild.id }).sort({ startedAt: -1 });
    if (subcommand === 'start' && activeHunt) {
      return interaction.editReply('A hunt is already active. Use `/emote-hunt reset` to start a fresh one.');
    }

    if (subcommand === 'reset') {
      await EmoteHunt.updateMany(
        { guildId: interaction.guild.id, active: true },
        { $set: { active: false, endedAt: new Date() } }
      );
    }

    const previousTargetId = activeHunt?.targetEmojiId ?? previousHunt?.targetEmojiId;
    const choices = EMOTE_POOL.filter((emote) => emote.id !== previousTargetId);
    const target = choices[Math.floor(Math.random() * choices.length)];
    const hunt = await EmoteHunt.create({
      guildId: interaction.guild.id,
      channelId: channel.id,
      targetEmojiId: target.id,
      targetEmojiName: target.name,
      targetAnimated: target.animated,
      reward: activeHunt?.reward ?? 500,
      active: true,
    });

    const announcement = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('👻 Halloween Emote Hunt')
      .setDescription(
        `Find this emote: ${formatEmote(target)}\n` +
        `React with it to any message in a public text channel to earn **${hunt.reward.toLocaleString()} points**. ` +
        'Staff-only, hidden, and voice channels do not count. The first correct reaction wins!'
      )
      .setFooter({ text: `First correct reaction wins ${hunt.reward.toLocaleString()} Halloween Points` });

    try {
      const message = await channel.send({ embeds: [announcement] });
      hunt.messageId = message.id;
      await hunt.save();
      await logEmoteHuntStarted(interaction.client, {
        channelId: channel.id,
        emoteName: target.name,
        url: message.url,
      });
      return interaction.editReply(`✅ Emote Hunt ${subcommand === 'reset' ? 'reset' : 'started'} in ${channel}. Guesses count in every public text channel.`);
    } catch (error) {
      hunt.active = false;
      hunt.endedAt = new Date();
      await hunt.save().catch(() => {});
      console.error('[emote-hunt] failed to post hunt:', error);
      return interaction.editReply('❌ I could not post the hunt in that channel. Check my channel permissions and try again.');
    }
  },
};