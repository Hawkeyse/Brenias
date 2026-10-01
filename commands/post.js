// commands/post.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('Post a message as the bot (embed or plain text, optional role ping)')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('The text/content to post')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName('embed')
        .setDescription('Use embed? (default: yes)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('color')
        .setDescription('Embed color (hex like #FF0000 or name like red/blue/green) – only if embed enabled')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('image')
        .setDescription('Optional image/file to attach')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Optional role to ping before the message/embed')
        .setRequired(false)
    ),

  async execute(interaction) {
    const messageText = interaction.options.getString('message');
    const useEmbed = interaction.options.getBoolean('embed') ?? true; // default true
    const colorInput = interaction.options.getString('color')?.trim().toLowerCase();
    const attachment = interaction.options.getAttachment('image');
    const role = interaction.options.getRole('role');

    // Prepare role ping (always in content)
    let content = role ? `${role.toString()} ` : '';

    // Helper to parse color
    let embedColor = 0x57F287; // default green
    if (colorInput) {
      // Handle common color names
      const colorMap = {
        red: 0xFF0000,
        blue: 0x0000FF,
        green: 0x00FF00,
        yellow: 0xFFFF00,
        purple: 0x9B59B6,
        orange: 0xFFA500,
        pink: 0xFFC1CC,
        white: 0xFFFFFF,
        black: 0x000000,
      };

      if (colorMap[colorInput]) {
        embedColor = colorMap[colorInput];
      }
      // Try hex (#rrggbb or rrggbb)
      else if (/^#?[0-9a-f]{6}$/i.test(colorInput)) {
        const hex = colorInput.startsWith('#') ? colorInput.slice(1) : colorInput;
        embedColor = parseInt(hex, 16);
      }
      // Fallback to default if invalid
    }

    try {
      if (useEmbed) {
        const embed = new EmbedBuilder()
          .setDescription(messageText)
          .setColor(embedColor);

        if (attachment && attachment.contentType?.startsWith('image/')) {
          embed.setImage(attachment.url);
        }

        await interaction.channel.send({
          content: content || null, // only role ping if present
          embeds: [embed],
          files: attachment && !attachment.contentType?.startsWith('image/') ? [attachment] : undefined,
          allowedMentions: role ? { roles: [role.id] } : undefined,
        });
      } else {
        // Plain text mode
        await interaction.channel.send({
          content: content + messageText,
          files: attachment ? [attachment] : undefined,
          allowedMentions: role ? { roles: [role.id] } : undefined,
        });
      }

      await interaction.reply({
        content: 'Posted successfully.',
        ephemeral: true
      });
    } catch (err) {
      console.error('Post command failed:', err);
      await interaction.reply({
        content: `Failed to post: ${err.message}`,
        ephemeral: true
      });
    }
  },
};