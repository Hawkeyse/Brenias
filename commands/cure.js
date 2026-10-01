const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');
const { getActiveInfection, cureMember } = require('../utils/halloweenInfection');
const { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');
const cfg = require('../utils/halloweenShopConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cure')
    .setDescription('Cure an infected member using Halloween Points.')
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The infected member to cure')
      .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user');
    if (targetUser.bot) {
      return interaction.editReply({ embeds: [simpleEmbed('❌ Bots cannot be infected.', COLORS.error)] });
    }

    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) {
      return interaction.editReply({ embeds: [simpleEmbed('❌ I could not find that member.', COLORS.error)] });
    }

    const infection = await getActiveInfection(interaction.guild.id, target.id);
    if (!infection) {
      return interaction.editReply({ embeds: [simpleEmbed(`${target} is not currently infected.`, COLORS.info)] });
    }

    const charged = await User.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: interaction.user.id, halloweenPoints: { $gte: cfg.CURE_PRICE } },
      { $inc: { halloweenPoints: -cfg.CURE_PRICE } },
      { new: true }
    );
    if (!charged) {
      const payer = await User.findOne({ guildId: interaction.guild.id, userId: interaction.user.id }).lean();
      return interaction.editReply({
        embeds: [simpleEmbed(
          `❌ The cure costs **${cfg.CURE_PRICE.toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI} and you have **${(payer?.halloweenPoints ?? 0).toLocaleString()}**.`,
          COLORS.error
        )],
      });
    }

    const result = await cureMember(interaction.guild, target);
    if (!result.ok) {
      await addHalloweenPoints(interaction.guild.id, interaction.user.id, cfg.CURE_PRICE);
      return interaction.editReply({ embeds: [simpleEmbed(`${result.reason} Your points were refunded.`, COLORS.error)] });
    }

    return interaction.editReply({
      embeds: [simpleEmbed(
        `${cfg.CURE_ITEM.emoji} ${target} has been cured by ${interaction.user}!\n` +
        `💰 Your balance: **${charged.halloweenPoints.toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI}`,
        COLORS.success
      )],
    });
  },
};
