// commands/removelevel.js (Updated with Role Checks)
const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User'); // Import here for consistency

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removelevel')
    .setDescription('Remove all levels from a user (staff only).')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to remove levels from')
        .setRequired(true)),
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
    const guildId = interaction.guild.id;
    const targetId = target.id;

    let targetUser = await User.findOne({ guildId, userId: targetId });

    if (!targetUser) {
      targetUser = new User({ guildId, userId: targetId, xp: 0, level: 1 });
    } else {
      targetUser.xp = 0;
      targetUser.level = 1;
      await targetUser.save();
    }

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    const targetTag = targetMember ? targetMember.user.tag : target.tag;

    await interaction.reply({ content: `Removed all levels from ${targetTag}.`, ephemeral: true });
  },
};