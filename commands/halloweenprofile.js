const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const ShopRole = require('../models/HalloweenShopRole');
const { getActiveInfection } = require('../utils/halloweenInfection');
const { HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-profile')
    .setDescription('Show your Halloween Points, roles, and event status.')
    .setDMPermission(false)
    .addUserOption((option) => option
      .setName('user')
      .setDescription('The member whose Halloween profile to view')
      .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guild.id;
    const now = new Date();

    const [user, ownedRoles, infection] = await Promise.all([
      User.findOne({ guildId, userId: target.id }).lean(),
      ShopRole.find({ guildId, userId: target.id, expiresAt: { $gt: now } }).lean(),
      getActiveInfection(guildId, target.id),
    ]);

    const points = user?.halloweenPoints ?? 0;
    const rank = await User.countDocuments({ guildId, halloweenPoints: { $gt: points } });
    const roleText = ownedRoles.length
      ? ownedRoles.map((role) => `<@&${role.roleId}>`).join(' ')
      : 'None yet';
    const infectionText = infection
      ? `🧟 Infected until <t:${Math.floor(infection.expiresAt.getTime() / 1000)}:R>`
      : '✅ Healthy';

    const embed = new EmbedBuilder()
      .setColor(infection ? '#7F1D1D' : '#FF7518')
      .setAuthor({ name: `${target.globalName || target.username}'s Halloween Profile`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: 'Halloween Points', value: `${HALLOWEEN_POINTS_EMOJI} **${points.toLocaleString()}**`, inline: true },
        { name: 'Leaderboard Rank', value: `**#${rank + 1}**`, inline: true },
        { name: 'Status', value: infectionText, inline: true },
        { name: 'Seasonal Roles', value: roleText },
      )
      .setFooter({ text: 'October Season • Points, roles, and infection status' });

    return interaction.editReply({ embeds: [embed] });
  },
};
