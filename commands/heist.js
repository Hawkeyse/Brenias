const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { startHeist } = require('../utils/halloweenHeist');

const HEIST_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Start a Halloween Heist for the server.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Open a 60-second Halloween Heist lobby.')),

  async execute(interaction) {
    if (!interaction.guild || !HEIST_CHANNEL_TYPES.includes(interaction.channel?.type)) {
      return interaction.reply({ content: 'Start the heist in a server text channel.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await startHeist(interaction.client, interaction.guild.id, interaction.channel);
      if (!result.started) {
        return interaction.editReply('🎃 A Halloween Heist is already in progress! ⏳ Please wait until the current heist ends before starting another one.');
      }
      return interaction.editReply(`🎃 The lobby is open in ${interaction.channel} for 60 seconds. [Jump to it](${result.message.url})`);
    } catch (error) {
      console.error('[heist] could not start:', error);
      return interaction.editReply('❌ I could not start the heist. Check that I can send and edit messages in this channel.');
    }
  },
};