const { Events } = require('discord.js');
const cfg = require('../utils/halloweenShopConfig');
const {
  INFECTED_MESSAGE_COOLDOWN_MS,
  SHOP_CHANNEL_ID,
  isInfected,
  sweepExpiredInfections,
} = require('../utils/halloweenInfection');

const lastMessageAt = new Map();

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
      if (!(await isInfected(message.guild.id, message.author.id))) {
        lastMessageAt.delete(`${message.guild.id}-${message.author.id}`);
        return;
      }

      const key = `${message.guild.id}-${message.author.id}`;
      const now = Date.now();
      const last = lastMessageAt.get(key) || 0;
      if (now - last < INFECTED_MESSAGE_COOLDOWN_MS) {
        await message.delete().catch(() => {});
        return;
      }
      lastMessageAt.set(key, now);
    } catch (err) {
      console.error('[halloweenInfection] message cooldown failed:', err.message);
    }
  });

  setTimeout(() => sweepExpiredInfections(client), 20 * 1000);
  setInterval(() => sweepExpiredInfections(client), 60 * 1000);

  if (!SHOP_CHANNEL_ID) {
    console.warn('[halloweenInfection] HALLOWEEN_SHOP_CHANNEL_ID is not set; message-history restriction is disabled.');
  } else {
    console.log(`[halloweenInfection] Shop channel exception: ${SHOP_CHANNEL_ID}`);
  }
  console.log(`[halloweenInfection] Ready – infected users get ${INFECTED_MESSAGE_COOLDOWN_MS / 1000}s message cooldowns`);
};
