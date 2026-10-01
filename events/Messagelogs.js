// events/messageLogs.js
// Logs message edits and deletions to the staff logs channel.
// Clean, professional embed formatting. Edit logs include the message ID
// and a jump link to the message.

const { Events, EmbedBuilder } = require('discord.js');

const LOGS_CHANNEL_ID = '1366682681886244864';

const MAX_FIELD_LENGTH = 1024; // Discord embed field value limit

function truncate(text, max = MAX_FIELD_LENGTH) {
  if (!text) return '*(empty)*';
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

module.exports = (client) => {
  // ── Message Edited ───────────────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      if (!newMessage.guild) return;

      // Ignore if content didn't actually change (e.g. embed link unfurl edits)
      if (oldMessage.content === newMessage.content) return;

      const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
      if (!logsChannel) return;

      // If the old message isn't cached, we can't show "before" content
      const oldContent = oldMessage.partial ? null : oldMessage.content;

      const jumpLink = `https://discord.com/channels/${newMessage.guild.id}/${newMessage.channel.id}/${newMessage.id}`;

      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setAuthor({
          name: newMessage.author?.tag || 'Unknown User',
          iconURL: newMessage.author?.displayAvatarURL?.({ dynamic: true }) || undefined
        })
        .setTitle('📝 Message Edited')
        .addFields(
          { name: 'Author', value: `${newMessage.author ?? 'Unknown'} (${newMessage.author?.id ?? 'N/A'})`, inline: true },
          { name: 'Channel', value: `${newMessage.channel}`, inline: true },
          { name: 'Message ID', value: `\`${newMessage.id}\``, inline: true },
          { name: 'Before', value: truncate(oldContent ?? '*(not cached / unavailable)*') },
          { name: 'After', value: truncate(newMessage.content) },
          { name: 'Jump to Message', value: `[Click here](${jumpLink})` }
        )
        .setTimestamp();

      await logsChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[messageLogs] Failed to log edit:', err);
    }
  });

  // ── Message Deleted ──────────────────────────────────────────────────
  client.on(Events.MessageDelete, async (message) => {
    try {
      if (!message.guild) return;

      const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
      if (!logsChannel) return;

      const content = message.partial ? null : message.content;
      const attachmentURLs = message.partial ? [] : message.attachments.map(a => a.url);

      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setAuthor({
          name: message.author?.tag || 'Unknown User',
          iconURL: message.author?.displayAvatarURL?.({ dynamic: true }) || undefined
        })
        .setTitle('🗑️ Message Deleted')
        .addFields(
          { name: 'Author', value: `${message.author ?? 'Unknown'} (${message.author?.id ?? 'N/A'})`, inline: true },
          { name: 'Channel', value: `${message.channel}`, inline: true },
          { name: 'Message ID', value: `\`${message.id}\``, inline: true },
          { name: 'Content', value: truncate(content ?? '*(not cached / unavailable)*') }
        )
        .setTimestamp();

      if (attachmentURLs.length > 0) {
        embed.addFields({
          name: `Attachments (${attachmentURLs.length})`,
          value: attachmentURLs.map((url, i) => `[Attachment ${i + 1}](${url})`).join('\n')
        });
        // If first attachment is an image, show it inline
        const imageUrl = attachmentURLs.find(u => /\.(png|jpe?g|gif|webp)$/i.test(u));
        if (imageUrl) embed.setImage(imageUrl);
      }

      await logsChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[messageLogs] Failed to log deletion:', err);
    }
  });

  // ── Bulk Delete (e.g. /clean command) ────────────────────────────────
  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    try {
      if (!channel.guild) return;

      const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
      if (!logsChannel) return;

      const count = messages.size;
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🗑️ Bulk Message Delete')
        .setDescription(`**${count}** message${count === 1 ? '' : 's'} were bulk-deleted in ${channel}.`)
        .setTimestamp();

      await logsChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[messageLogs] Failed to log bulk deletion:', err);
    }
  });

  console.log('[messageLogs] Ready – logging message edits and deletions');
};