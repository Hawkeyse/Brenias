// commands/tweet.js
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Tweet } = require('canvafy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tweet')
    .setDescription('Generate a fake tweet image')
    .addStringOption(option =>
      option.setName('comment')
        .setDescription('What should the tweet say?')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Twitter username (without @)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('displayname')
        .setDescription('Display name')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('verified')
        .setDescription('Show verified badge?')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const comment = interaction.options.getString('comment');
    const username = interaction.options.getString('username') || interaction.user.username;
    const displayName = interaction.options.getString('displayname') || interaction.user.displayName;
    const verified = interaction.options.getBoolean('verified') ?? true;

    try {
      const tweet = await new Tweet()
        .setTheme("dim")                    // "dim", "light", or "dark"
        .setUser({
          displayName: displayName,
          username: username,
        })
        .setVerified(verified)
        .setComment(comment)
        .setAvatar(interaction.user.displayAvatarURL({ extension: 'png', size: 512 }))
        .build();

      const attachment = new AttachmentBuilder(tweet, { 
        name: `tweet-${interaction.user.id}.png` 
      });

      await interaction.editReply({ 
        files: [attachment] 
      });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ 
        content: '❌ Failed to generate tweet image.', 
        ephemeral: true 
      });
    }
  },
};