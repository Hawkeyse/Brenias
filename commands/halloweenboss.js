const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const HalloweenBoss = require('../models/HalloweenBoss');
const HalloweenBossSchedule = require('../models/HalloweenBossSchedule');
const { BOSS_SKINS, spawnBoss, finishBoss } = require('../utils/halloweenBoss');

const DEFAULT_BOSS_CHANNEL_ID = '1549050285798981682';
const BOSS_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const DEFAULT_HP = 50000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-boss')
    .setDescription('Start and schedule Halloween Boss fights.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a Boss fight now.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post the Boss (defaults to the Boss channel).')
        .addChannelTypes(...BOSS_CHANNEL_TYPES)
        .setRequired(false))
      .addStringOption((option) => option
        .setName('skin')
        .setDescription('Choose the Boss.')
        .addChoices(...Object.entries(BOSS_SKINS).map(([value, skin]) => ({ name: skin.label, value })))
        .setRequired(false))
      .addIntegerOption((option) => option
        .setName('hp')
        .setDescription(`Boss health (default ${DEFAULT_HP.toLocaleString()}).`)
        .setMinValue(1000)
        .setMaxValue(1000000)
        .setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('schedule')
      .setDescription('Schedule a daily Boss fight (UTC).')
      .addIntegerOption((option) => option
        .setName('hour')
        .setDescription('Hour in UTC (0-23).')
        .setMinValue(0)
        .setMaxValue(23)
        .setRequired(true))
      .addIntegerOption((option) => option
        .setName('minute')
        .setDescription('Minute (0-59).')
        .setMinValue(0)
        .setMaxValue(59)
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Where to post the Boss (defaults to the Boss channel).')
        .addChannelTypes(...BOSS_CHANNEL_TYPES)
        .setRequired(false))
      .addIntegerOption((option) => option
        .setName('hp')
        .setDescription(`Boss health (default ${DEFAULT_HP.toLocaleString()}).`)
        .setMinValue(1000)
        .setMaxValue(1000000)
        .setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('unschedule')
      .setDescription('Turn off the daily Boss schedule.'))
    .addSubcommand((sub) => sub
      .setName('end')
      .setDescription('End the active Boss fight and post final rankings.'))
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('Show the active Boss and daily schedule.')),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to manage the Halloween Boss.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'start') {
      const active = await HalloweenBoss.findOne({ guildId, active: true });
      if (active) {
        return interaction.editReply(`A Boss fight is already active in <#${active.channelId}>.`);
      }

      const channelId = interaction.options.getChannel('channel')?.id || DEFAULT_BOSS_CHANNEL_ID;
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !BOSS_CHANNEL_TYPES.includes(channel.type)) {
        return interaction.editReply('I could not find a usable Boss text channel. Select one with `/halloween-boss start` or check the default Boss channel.');
      }

      const skin = interaction.options.getString('skin') || 'golem';
      const hp = interaction.options.getInteger('hp') ?? DEFAULT_HP;
      const { boss } = await spawnBoss({ client: interaction.client, guildId, channel, name: null, skinKey: skin, hp });
      return interaction.editReply(`✅ **${boss.name}** has spawned in ${channel}! Use the Attack button to fight.`);
    }

    if (subcommand === 'schedule') {
      const channelId = interaction.options.getChannel('channel')?.id || DEFAULT_BOSS_CHANNEL_ID;
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !BOSS_CHANNEL_TYPES.includes(channel.type)) {
        return interaction.editReply('I could not find a usable Boss text channel. Select one or check the default Boss channel.');
      }

      const schedule = await HalloweenBossSchedule.findOneAndUpdate(
        { guildId },
        {
          $set: {
            enabled: true,
            hour: interaction.options.getInteger('hour'),
            minute: interaction.options.getInteger('minute'),
            channelId: channel.id,
            hp: interaction.options.getInteger('hp') ?? DEFAULT_HP,
            lastPostedDate: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} UTC`;
      return interaction.editReply(`✅ Daily Boss scheduled for **${time}** in ${channel}.`);
    }

    if (subcommand === 'unschedule') {
      await HalloweenBossSchedule.findOneAndUpdate(
        { guildId },
        { $set: { enabled: false } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return interaction.editReply('✅ The daily Boss schedule is off.');
    }

    if (subcommand === 'end') {
      const active = await HalloweenBoss.findOne({ guildId, active: true });
      if (!active) return interaction.editReply('There is no active Boss fight to end.');
      await finishBoss(interaction.client, active, { endedByStaff: true });
      return interaction.editReply(`✅ **${active.name}** has been ended. Final rankings were posted.`);
    }

    const [active, schedule] = await Promise.all([
      HalloweenBoss.findOne({ guildId, active: true }),
      HalloweenBossSchedule.findOne({ guildId }),
    ]);
    const activeText = active
      ? `Active: **${active.name}** in <#${active.channelId}> (${active.currentHP.toLocaleString()} / ${active.maxHP.toLocaleString()} HP)`
      : 'No Boss fight is active.';
    const scheduleText = schedule?.enabled
      ? `Daily: **${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} UTC** in <#${schedule.channelId || DEFAULT_BOSS_CHANNEL_ID}>`
      : 'Daily schedule: off.';
    return interaction.editReply(`${activeText}\n${scheduleText}`);
  },
};