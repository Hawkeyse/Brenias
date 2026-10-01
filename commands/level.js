// commands/level.js
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { RankCardBuilder, Font } = require('canvacord');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { getXPForLevel, getLevelFromXP, assignRolesForLevel } = require('../utils');

Font.loadDefault();

const banners = [
  { file: '001.jpg', color: '#EF9909' },
  { file: '002.jpg', color: '#A3FEFF' },
  { file: '003.jpg', color: '#EAB075' },
  { file: '004.jpg', color: '#013264' },
  { file: '005.jpg', color: '#4E0807' },
  { file: '006.jpg', color: '#FEC1FB' },
];

const bannersPath = path.join(__dirname, '../banners');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Displays your current level and rank as a rank card.'),

  async execute(interaction) {
    await interaction.reply({ 
      content: 'Generating your Rank Card <a:2908loading:1449795399220072448>', 
      fetchReply: true 
    });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const member = await interaction.guild.members.fetch(userId);

    let user = await User.findOne({ guildId, userId });
    if (!user) {
      user = new User({ guildId, userId, xp: 0, level: 1 });
      await user.save();
    }

    const currentXP = user.xp || 0;
    const currentLevel = getLevelFromXP(currentXP);

    const allUsers = await User.find({ guildId }).sort({ xp: -1 }).limit(1000);
    let rank = allUsers.findIndex(u => u.userId === userId) + 1;
    if (rank === 0) rank = '>1000';

    const xpForCurrent = getXPForLevel(currentLevel);
    const xpForNext = getXPForLevel(currentLevel + 1);
    const progressXp = Math.max(0, currentXP - xpForCurrent);
    const xpNeeded = xpForNext - xpForCurrent;

    assignRolesForLevel(member).catch(console.warn);

    const randomBanner = banners[Math.floor(Math.random() * banners.length)];
    const bannerPath = path.join(bannersPath, randomBanner.file);
    const accentColor = randomBanner.color;

    let background = 'https://i.imgur.com/af2w7vF.png';
    if (fs.existsSync(bannerPath)) background = bannerPath;

    const avatarURL = interaction.user.displayAvatarURL({ 
      extension: 'png', size: 256, forceStatic: true 
    });

    try {
      const card = new RankCardBuilder()
        .setAvatar(avatarURL)
        .setDisplayName(interaction.user.username)
        .setCurrentXP(progressXp)
        .setRequiredXP(xpNeeded)
        .setLevel(currentLevel)
        .setRank(rank)
        .setStatus(null)
        .setBackground(background)
        .setOverlay(65); // Stronger glass overlay

      card.setStyles({
        progressbar: {
          thumb: { 
            style: { 
              backgroundColor: accentColor,
              borderRadius: '9999px'
            } 
          },
          track: { 
            style: { 
              backgroundColor: '#ffffff', 
              opacity: 0.15 
            } 
          }
        },
        username: { 
          style: { 
            color: '#ffffff', 
            fontSize: 32,
            textShadow: '0 2px 4px rgba(0,0,0,0.6)'
          } 
        },
        level: { style: { color: '#ffffff' } },
        rank: { style: { color: '#ffffff' } },
        xp: { style: { color: '#dddddd' } }
      });

      const imageBuffer = await card.build({ format: 'png' });

      const attachment = new AttachmentBuilder(imageBuffer, { 
        name: `rank-${userId}.png` 
      });

      await interaction.editReply({ content: null, files: [attachment] });

    } catch (error) {
      console.error('Rank card error:', error);
      await interaction.editReply({ 
        content: '❌ Failed to generate rank card.', 
        ephemeral: true 
      });
    }
  },
};