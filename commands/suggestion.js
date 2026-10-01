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
    // Replace with your actual suggestion panel channel ID
    const panelChannel = interaction.client.channels.cache.get('1443369483657019524');
    
    if (!panelChannel) {
      return interaction.reply({ 
        content: 'Suggestion panel channel not found!', 
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6) // or your preferred color, e.g. purple-ish
      .setTitle('💡 Have a suggestion for the Culzmac Community?')
      .setDescription(
        'Click <:9231_Message_Sent:1443371841241616486> to share it!\n\n' +
        '<:6417_ModMute:1465990613269872720> Please note: Any suggestions that violate server rules ' +
        'or the Terms of Service, including threads, will be removed.'
      );

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create-suggestion')
          .setEmoji('<:9231_Message_Sent:1443371841241616486>')
          .setLabel('create a suggestion')
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