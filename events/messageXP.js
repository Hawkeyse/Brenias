// events/messageXP.js
// Awards XP for chat messages. This was missing entirely, which is why
// levels were frozen — utils.js had all the math (getLevelFromXP, role
// assignment) but nothing was ever incrementing User.xp.
//
// Rules:
//   - 15-25 XP per eligible message (random)
//   - 60 second cooldown per user (per guild) to prevent spam-leveling
//   - On level-up: send an announcement + sync level roles

const { Events, EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { getLevelFromXP, assignRolesForLevel } = require('../utils');

const COOLDOWN_MS = 60 * 1000;
const MIN_XP = 15;
const MAX_XP = 25;

// In-memory cooldown tracker: `${guildId}-${userId}` -> last award timestamp
const cooldowns = new Map();

function randomXP() {
  return Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
}

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      // Ignore empty messages (e.g. pure attachment/embed-only edge cases)
      if (!message.content || message.content.trim().length === 0) return;

      const guildId = message.guild.id;
      const userId = message.author.id;
      const cooldownKey = `${guildId}-${userId}`;

      const now = Date.now();
      const lastAward = cooldowns.get(cooldownKey) || 0;
      if (now - lastAward < COOLDOWN_MS) return;
      cooldowns.set(cooldownKey, now);

      let user = await User.findOne({ guildId, userId });
      if (!user) {
        user = new User({ guildId, userId, xp: 0, level: 1 });
      }

      const oldLevel = getLevelFromXP(user.xp);
      user.xp += randomXP();
      const newLevel = getLevelFromXP(user.xp);
      user.level = newLevel;

      await user.save();

      if (newLevel > oldLevel) {
        // Sync level roles
        const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
        if (member) {
          assignRolesForLevel(member).catch(err =>
            console.error('[messageXP] role assignment failed:', err)
          );
        }

        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setDescription(`🎉 ${message.author} just leveled up to **Level ${newLevel}**!`);

        message.channel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      console.error('[messageXP] error:', err);
    }
  });

  console.log('[messageXP] Ready – awarding 15-25 XP per message (60s cooldown)');
};