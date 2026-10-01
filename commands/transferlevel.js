// commands/transferlevel.js (Fixed: Imported getLevelFromXP)
const { SlashCommandBuilder } = require('discord.js');
const { getXPForLevel, getLevelFromXP } = require('../utils');
const User = require('../models/User'); // Import here

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transferlevel')
    .setDescription('Transfer levels from yourself to another user (staff only).')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to transfer levels to')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('level')
        .setDescription('The number of levels to transfer')
        .setRequired(true)
        .setMinValue(1)),
  async execute(interaction) {
    const staffRole = '716731375411134555';
    const headAdminRole = '716804233441312841';
    const ownerRole = '813911857924276294';

    if (!interaction.member.roles.cache.has(staffRole) && 
        !interaction.member.roles.cache.has(headAdminRole) && 
        !interaction.member.roles.cache.has(ownerRole)) {
      return await interaction.reply({ content: 'You do not have permission to use this command! (Staff/Head Admin/Owner only)', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const levelsToTransfer = interaction.options.getInteger('level');
    const guildId = interaction.guild.id;
    const staffId = interaction.user.id;
    const targetId = target.id;

    // Fetch staff and target user data
    let staffUser = await User.findOne({ guildId, userId: staffId });
    let targetUser = await User.findOne({ guildId, userId: targetId });

    if (!staffUser) {
      return await interaction.reply({ content: 'You have no levels to transfer!', ephemeral: true });
    }
    if (staffUser.level <= levelsToTransfer) {
      return await interaction.reply({ content: `You do not have enough levels to transfer ${levelsToTransfer}!`, ephemeral: true });
    }

    if (!targetUser) {
      targetUser = new User({ guildId, userId: targetId, xp: 0, level: 1 });
      await targetUser.save();
    }

    // Calculate exact XP to transfer to drop exactly 'levelsToTransfer' levels
    const newStaffLevel = staffUser.level - levelsToTransfer;
    const xpToKeep = getXPForLevel(newStaffLevel);
    const xpToTransfer = staffUser.xp - xpToKeep;

    // Update XP
    staffUser.xp = xpToKeep;
    staffUser.level = newStaffLevel;  // Exact, no recalc needed for staff
    targetUser.xp += xpToTransfer;

    // Recalculate target's level
    targetUser.level = getLevelFromXP(targetUser.xp);

    await staffUser.save();
    await targetUser.save();

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    const targetTag = targetMember ? targetMember.user.tag : target.tag;

    await interaction.reply({ content: `Transferred ${levelsToTransfer} levels (${xpToTransfer} XP) from ${interaction.user.tag} to ${targetTag}.`, ephemeral: true });
  },
};