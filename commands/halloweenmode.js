// commands/halloweenmode.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const HalloweenConfig = require('../models/HalloweenConfig');

const HALLOWEEN_AVATAR_PATH = path.join(__dirname, '../assets/halloween/pfp-halloween.png');
const ORIGINAL_AVATAR_PATH = path.join(__dirname, '../assets/halloween/pfp-original.png');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-mode')
    .setDescription('Turn Halloween mode on or off (swaps the bot\'s avatar).')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addBooleanOption(opt => opt
      .setName('enabled')
      .setDescription('true = spooky pfp, false = revert to normal')
      .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const wantEnabled = interaction.options.getBoolean('enabled');
    let config = await HalloweenConfig.findOne({ key: 'global' });
    if (!config) config = new HalloweenConfig({ key: 'global' });

    if (wantEnabled === config.enabled) {
      return interaction.editReply(
        wantEnabled
          ? '🎃 Halloween mode is already on.'
          : '✅ Halloween mode is already off.'
      );
    }

    try {
      if (wantEnabled) {
        if (!fs.existsSync(HALLOWEEN_AVATAR_PATH)) {
          return interaction.editReply('❌ Missing `assets/halloween/pfp-halloween.png` — can\'t enable.');
        }

        // Remember the current avatar the first time this is ever turned on,
        // as a fallback in case the local original file ever goes missing.
        if (!config.originalAvatarURL) {
          config.originalAvatarURL = interaction.client.user.displayAvatarURL({ extension: 'png', size: 1024 });
        }

        await interaction.client.user.setAvatar(fs.readFileSync(HALLOWEEN_AVATAR_PATH));
        config.enabled = true;
        await config.save();

        const embed = new EmbedBuilder()
          .setColor('#FF7518')
          .setDescription('🎃👻 **Halloween mode enabled!** The bot pfp is spooky now.');
        return interaction.editReply({ embeds: [embed] });

      } else {
        const revertSource = fs.existsSync(ORIGINAL_AVATAR_PATH)
          ? fs.readFileSync(ORIGINAL_AVATAR_PATH)
          : config.originalAvatarURL;

        if (!revertSource) {
          return interaction.editReply('❌ No original avatar on file to revert to — set `assets/halloween/pfp-original.png` first.');
        }

        await interaction.client.user.setAvatar(revertSource);
        config.enabled = false;
        await config.save();

        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setDescription('✅ **Halloween mode disabled.** Bot pfp reverted to normal.');
        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[halloween-mode] avatar change failed:', error);
      const rateLimited = error?.code === 50035 || /rate.?limit/i.test(error?.message || '');
      return interaction.editReply(
        rateLimited
          ? '⏳ Discord is rate-limiting avatar changes right now — Discord only allows a couple of pfp changes per hour or so. Try again a bit later.'
          : `❌ Failed to change avatar: ${error.message}`
      );
    }
  },
};