const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const User = require('../models/User');
const { HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');

const DEFAULT_GRANT = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-grant')
    .setDescription('Give every non-bot member Halloween Points.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription(`Points to give each member (default ${DEFAULT_GRANT.toLocaleString()})`)
      .setMinValue(1)
      .setMaxValue(10000)
      .setRequired(false)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'Only staff can grant Halloween Points.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const amount = interaction.options.getInteger('amount') ?? DEFAULT_GRANT;
    const members = await interaction.guild.members.fetch();
    const eligible = [...members.values()].filter((member) => !member.user.bot);

    if (!eligible.length) {
      return interaction.editReply('No eligible members were found.');
    }

    const operations = eligible.map((member) => ({
      updateOne: {
        filter: { guildId: interaction.guild.id, userId: member.id },
        update: { $inc: { halloweenPoints: amount } },
        upsert: true,
      },
    }));
    const result = await User.bulkWrite(operations, { ordered: false });

    return interaction.editReply(
      `✅ Granted **${amount.toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI} to **${eligible.length}** members. ` +
      `Their balances were increased, not overwritten.`
    );
  },
};
