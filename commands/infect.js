const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { infectMember, INFECTION_DURATION_MS } = require('../utils/halloweenInfection');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infect')
    .setDescription('Infect a member for the Halloween infection game.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member to infect')
      .setRequired(true)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        embeds: [simpleEmbed('❌ Only staff (Manage Server) can infect members.', COLORS.error)],
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');
    if (user.bot) {
      return interaction.reply({
        embeds: [simpleEmbed('❌ Bots cannot be infected.', COLORS.error)],
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.editReply({
        embeds: [simpleEmbed('❌ I could not find that member in this server.', COLORS.error)],
      });
    }

    const result = await infectMember(interaction.guild, member, interaction.user.id);
    if (!result.ok) {
      return interaction.editReply({ embeds: [simpleEmbed(`❌ ${result.reason}`, COLORS.error)] });
    }

    return interaction.editReply({
      embeds: [simpleEmbed(
        `🧟 ${member} has been infected by ${interaction.user}!\n` +
        `The infection lasts **${INFECTION_DURATION_MS / 60000} minutes**. ` +
        'Buy the blood-potion cure in the Halloween Shop to recover early.',
        COLORS.warning
      )],
    });
  },
};
