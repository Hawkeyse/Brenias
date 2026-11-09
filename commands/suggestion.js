// commands/suggestion.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Post the suggestion panel in the designated channel.'),

  async execute(interaction) {
    const panelChannel = await interaction.client.channels.fetch('1443369483657019524').catch((error) => {
      console.error('[suggestion] Failed to fetch panel channel:', error);
      return null;
    });
    
    if (!panelChannel) {
      return interaction.reply({ 
        content: 'I could not find the suggestion panel channel. Please check the configured channel ID and my access.',
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: 'CULZMAC COMMUNITY  •  SUGGESTIONS' })
      .setTitle('Help shape our community')
      .setDescription(
        'Have an idea that could make the server better? Share it with the community and let members discuss and vote.'
      );
    embed.addFields(
      { name: 'How it works', value: 'Submit an idea, then use the buttons on your post to vote or join the discussion.', inline: false },
      { name: 'Keep it constructive', value: 'Suggestions must follow the server rules and Discord Terms of Service. Inappropriate posts may be removed.', inline: false }
    );
    embed.setFooter({ text: 'Community Suggestions' });

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create-suggestion')
          .setEmoji('<:9231_Message_Sent:1443371841241616486>')
          .setLabel('Share a suggestion')
          .setStyle(ButtonStyle.Primary)
      );

    // Send the panel message
    await panelChannel.send({ 
      embeds: [embed], 
      components: [row] 
    });

    // Acknowledge command privately
    await interaction.reply({ 
      content: '✅ Suggestion panel has been posted!', 
      ephemeral: true 
    });
  },
};