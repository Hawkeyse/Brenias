const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const User = require('../models/User');
const ShopRole = require('../models/HalloweenShopRole');
const { getActiveInfection } = require('../utils/halloweenInfection');
const { renderHalloweenProfile } = require('../utils/renderHalloweenProfile');

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
    const inventory = ownedRoles.map((role) => ({
      ...role,
      name: interaction.guild.roles.cache.get(role.roleId)?.name || 'Seasonal Role',
    }));
    const imageBuffer = await renderHalloweenProfile({
      target,
      points,
      rank,
      ownedRoles: inventory,
      infection,
    });
    const attachment = new AttachmentBuilder(imageBuffer, { name: `halloween-profile-${target.id}.png` });
    return interaction.editReply({ files: [attachment] });
  },
};
