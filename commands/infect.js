const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const { infectMember, INFECTION_DURATION_MS } = require('../utils/halloweenInfection');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');
const { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');
const cfg = require('../utils/halloweenShopConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infect')
    .setDescription('Spend Halloween Points to infect another member.')
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member to infect')
      .setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    if (user.bot) {
      return interaction.reply({
        embeds: [simpleEmbed('❌ Bots cannot be infected.', COLORS.error)],
        ephemeral: true,
      });
    }
    if (user.id === interaction.user.id) {
      return interaction.reply({
        embeds: [simpleEmbed('❌ You cannot infect yourself.', COLORS.error)],
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

    const charged = await User.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id, halloweenPoints: { $gte: cfg.INFECTION_PRICE } },
      { $inc: { halloweenPoints: -cfg.INFECTION_PRICE } },
      { new: true }
    );
    if (!charged) {
      const payer = await User.findOne({ guildId: interaction.guild.id, userId: interaction.user.id }).lean();
      return interaction.editReply({
        embeds: [simpleEmbed(
          `❌ Infection costs **${cfg.INFECTION_PRICE.toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI} and you have **${(payer?.halloweenPoints ?? 0).toLocaleString()}**.`,
          COLORS.error
        )],
      });
    }

    const result = await infectMember(interaction.guild, member, interaction.user.id);
    if (!result.ok) {
      await addHalloweenPoints(interaction.guild.id, interaction.user.id, cfg.INFECTION_PRICE);
      return interaction.editReply({ embeds: [simpleEmbed(`❌ ${result.reason}`, COLORS.error)] });
    }

    return interaction.editReply({
      embeds: [simpleEmbed(
        `🧟 ${member} has been infected by ${interaction.user}!\n` +
        `The infection lasts **${INFECTION_DURATION_MS / 60000} minutes**. ` +
        `Cost: **${cfg.INFECTION_PRICE.toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI}. ` +
        'Buy the blood-potion cure in the Halloween Shop to recover early.',
        COLORS.warning
      )],
    });
  },
};
