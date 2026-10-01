const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-reset')
    .setDescription('Reset all Halloween Points for this server.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addBooleanOption((option) => option
      .setName('confirm')
      .setDescription('Confirm that every Halloween Points balance should become zero.')
      .setRequired(true)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Only staff can reset Halloween Points.', ephemeral: true });
    }
    if (!interaction.options.getBoolean('confirm')) {
      return interaction.reply({ content: 'Reset cancelled. Set `confirm` to `True` to continue.', ephemeral: true });
    }

    const result = await User.updateMany(
      { guildId: interaction.guild.id, halloweenPoints: { $ne: 0 } },
      { $set: { halloweenPoints: 0 } }
    );
    return interaction.reply({
      content: `✅ Reset Halloween Points for **${result.modifiedCount}** member record(s).`,
      ephemeral: true,
    });
  },
};
