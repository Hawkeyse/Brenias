const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { RankCardBuilder, Font } = require('canvacord');
const path = require('path');
const User = require('../models/User');
const ShopRole = require('../models/HalloweenShopRole');
const { getActiveInfection } = require('../utils/halloweenInfection');
const { HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');

Font.loadDefault();
const SEASON_GOAL = 10000;
const SEASON_BACKGROUNDS = [
  'halloween-1.png',
  'halloween-2.png',
  'halloween-3.png',
].map((file) => path.join(__dirname, '../banners', file));

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
        { name: 'Inventory', value: roleText },
      )
      .setFooter({ text: 'October Season • Points, roles, and infection status' });

    const rankCard = new RankCardBuilder()
      .setAvatar(target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }))
      .setDisplayName(target.username)
      .setCurrentXP(Math.min(points, SEASON_GOAL))
      .setRequiredXP(SEASON_GOAL)
      .setLevel(1)
      .setRank(rank + 1)
      .setStatus(infection ? 'Infected' : 'Healthy')
      .setBackground(SEASON_BACKGROUNDS[Math.floor(Math.random() * SEASON_BACKGROUNDS.length)])
      .setOverlay(65);

    rankCard.setStyles({
      progressbar: {
        thumb: { style: { backgroundColor: '#FF7518', borderRadius: '9999px' } },
        track: { style: { backgroundColor: '#ffffff', opacity: 0.15 } },
      },
      username: { style: { color: '#ffffff', fontSize: 32, textShadow: '0 2px 4px rgba(0,0,0,0.6)' } },
      level: { style: { color: '#ffffff' } },
      rank: { style: { color: '#ffffff' } },
      xp: { style: { color: '#dddddd' } },
    });

    const imageBuffer = await rankCard.build({ format: 'png' });
    const attachment = new AttachmentBuilder(imageBuffer, { name: `halloween-rank-${target.id}.png` });
    return interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};
