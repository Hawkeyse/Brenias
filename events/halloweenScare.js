// events/halloweenScare.js
// Randomly drops a scary GIF in chat (deleted after 5 seconds). Auto-loaded by
// loadEvents() in index.js. Anti-spam: small chance per message, plus a
// server-wide cooldown AND a per-channel cooldown (see utils/halloweenScare.js).
// Only runs while Halloween mode is ON and before the event ends.
const { Events, ChannelType } = require('discord.js');
const {
  SCARE_CHANCE,
  isHalloweenOn,
  onCooldown,
  channelAllowed,
  sendScare,
} = require('../utils/halloweenScare');

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
      if (message.channel.type !== ChannelType.GuildText) return;

      // Cheapest checks first — most messages stop right here.
      if (Math.random() >= SCARE_CHANCE) return;
      if (!channelAllowed(message.channel)) return;
      if (onCooldown(message.guild.id, message.channel.id)) return;
      if (!(await isHalloweenOn())) return;

      await sendScare(message.channel);
    } catch (err) {
      console.error('[halloweenScare] error:', err);
    }
  });
};
