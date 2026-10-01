const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const {
  buildStarterBonusPanel,
  getStarterBonusClaimCount,
} = require('../utils/halloweenStarterBonus');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-bonus')
    .setDescription('Post the one-time Halloween starter bonus panel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('post')
      .setDescription('Post the 900-point starter bonus button in this channel.')),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Only staff with Manage Server can post the starter bonus.', ephemeral: true });
    }
    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({ content: 'Post the bonus panel in a text channel.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const claimedCount = await getStarterBonusClaimCount(interaction.guild.id);
    await interaction.channel.send(buildStarterBonusPanel(claimedCount));
    return interaction.editReply('✅ Halloween starter bonus panel posted.');
  },
};