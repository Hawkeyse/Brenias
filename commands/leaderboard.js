// commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const canvafy = require('canvafy');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show paginated Top Leaderboard with Next/Previous buttons'),

  async execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guild.id;
    const perPage = 10;

    const allUsers = await User.find({ guildId }).sort({ xp: -1 });

    if (allUsers.length === 0) {
      return interaction.editReply({ content: 'No users have earned XP yet. Start chatting!' });
    }

    let currentPage = 0;
    const totalPages = Math.ceil(allUsers.length / perPage);

    const generateLeaderboard = async (page) => {
      const start = page * perPage;
      const pageUsers = allUsers.slice(start, start + perPage);

      const usersData = pageUsers.map((userData, index) => {
        const member = interaction.guild.members.cache.get(userData.userId);
        return {
          top: start + index + 1,
          avatar: member?.user.displayAvatarURL({ extension: 'png', size: 512 }) || "https://cdn.discordapp.com/embed/avatars/0.png",
          tag: member?.user.tag || `User ${userData.userId.slice(-4)}`,
          score: userData.xp
        };
      });

      const image = await new canvafy.Top()
        .setOpacity(0.6)
        .setScoreMessage("XP:")
        .setabbreviateNumber(false)
        // ────── Fixed Background (Working Public URL) ──────
        .setBackground("image", "https://i.imgur.com/8Zc5tYk.jpg")   // Dark elegant background
        .setColors({ 
          box: '#212121', 
          username: '#ffffff', 
          score: '#ffffff', 
          firstRank: '#f7c716', 
          secondRank: '#9e9e9e', 
          thirdRank: '#94610f' 
        })
        .setUsersData(usersData)
        .build();

      const embed = new EmbedBuilder()
        .setColor('#00FFAA')
        .setTitle(`🏆 Server Leaderboard - Page ${page + 1}/${totalPages}`)
        .setDescription(`Top ${start + 1} - ${Math.min(start + perPage, allUsers.length)}`)
        .setFooter({ text: 'Use buttons to navigate • Updates in real-time' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lb_prev')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('lb_next')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1)
      );

      return { image, embed, row };
    };

    const { image, embed, row } = await generateLeaderboard(currentPage);
    const attachment = new AttachmentBuilder(image, { name: 'leaderboard.png' });

    const message = await interaction.editReply({
      embeds: [embed],
      files: [attachment],
      components: [row]
    });

    const collector = message.createMessageComponentCollector({
      time: 120000,
      filter: i => i.user.id === interaction.user.id
    });

    collector.on('collect', async i => {
      if (i.customId === 'lb_prev') currentPage--;
      if (i.customId === 'lb_next') currentPage++;

      const { image, embed, row } = await generateLeaderboard(currentPage);
      const newAttachment = new AttachmentBuilder(image, { name: 'leaderboard.png' });

      await i.update({
        embeds: [embed],
        files: [newAttachment],
        components: [row]
      }).catch(() => {});
    });

    collector.on('end', () => {
      message.edit({ components: [] }).catch(() => {});
    });
  },
};