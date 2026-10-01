// utils/halloweenLog.js
// Central audit log for all Halloween events. Every game posts a short,
// consistently-styled embed here (channel 1549069002687385683) so staff
// have one place to see everything that happened, in order.
const { EmbedBuilder } = require('discord.js');

const LOG_CHANNEL_ID = '1549069002687385683';

// One entry per game/category. Adding a new game later (Pumpkin Hunt,
// Zombie Infection, Escape Race, Shop, Points, Admin) just means calling
// log(client, 'THAT_KEY', {...}) below — the category is already defined,
// no other scaffolding needed.
const CATEGORIES = {
  EMOTE_HUNT: { emoji: '👻', label: 'Emote Hunt', color: '#9B59B6' },
  PUMPKIN_HUNT: { emoji: '🎃', label: 'Pumpkin Hunt', color: '#FF7518' },
  ZOMBIE_INFECTION: { emoji: '🧟', label: 'Zombie Infection', color: '#57F287' },
  BOSS: { emoji: '👑', label: 'Halloween Boss', color: '#ED4245' },
  ESCAPE_RACE: { emoji: '🏃', label: 'Escape Race', color: '#5865F2' },
  SHOP: { emoji: '🛒', label: 'Halloween Shop', color: '#F1C40F' },
  POINTS: { emoji: '💰', label: 'Points', color: '#F1C40F' },
  ADMIN: { emoji: '⚠️', label: 'Admin Action', color: '#ED4245' },
  // Not one of the originally-listed 8 categories, but Puzzle is an
  // existing game — logged the same way for consistency.
  PUZZLE: { emoji: '🧩', label: 'Halloween Puzzle', color: '#FF7518' },
};

/**
 * Low-level logger. Every wrapper below (and any future one) calls this.
 * `fields` follows EmbedBuilder's addFields shape: [{ name, value, inline? }]
 */
async function log(client, categoryKey, { description, fields, url } = {}) {
  const category = CATEGORIES[categoryKey];
  if (!category) {
    console.error(`[halloweenLog] Unknown category: ${categoryKey}`);
    return;
  }

  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(category.color)
      .setTitle(`${category.emoji} ${category.label}`);

    if (description) embed.setDescription(description);
    if (fields?.length) embed.addFields(fields);
    // Makes the embed title itself a "jump to message" link when given.
    if (url) embed.setURL(url);

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(`[halloweenLog] Failed to post ${categoryKey} log:`, err.message);
  }
}

// ── Emote Hunt ────────────────────────────────────────────────────────
function logEmoteHuntStarted(client, { channelId, emoteName, url }) {
  return log(client, 'EMOTE_HUNT', {
    description: `A hunt started in <#${channelId}>.`,
    fields: [{ name: 'Target Emote', value: `\`${emoteName}\``, inline: true }],
    url,
  });
}

function logEmoteHuntFound(client, { userId, emoteName, points, url }) {
  return log(client, 'EMOTE_HUNT', {
    description: `<@${userId}> found the hidden emote!`,
    fields: [
      { name: 'Emote', value: `\`${emoteName}\``, inline: true },
      { name: 'Points Earned', value: `+${points.toLocaleString()} 🎃`, inline: true },
    ],
    url,
  });
}

// ── Halloween Boss ───────────────────────────────────────────────────
function logBossSpawned(client, { bossName, maxHP, channelId }) {
  return log(client, 'BOSS', {
    description: `**${bossName}** spawned in <#${channelId}> with **${maxHP.toLocaleString()}** HP.`,
  });
}

function logBossAttack(client, { userId, bossName, damage, isCrit, hpRemaining, maxHP }) {
  return log(client, 'BOSS', {
    description: `<@${userId}> attacked **${bossName}**.`,
    fields: [
      { name: 'Damage Dealt', value: `${damage.toLocaleString()}${isCrit ? ' 💥 (crit)' : ''}`, inline: true },
      { name: 'Boss HP', value: `${Math.max(0, hpRemaining).toLocaleString()} / ${maxHP.toLocaleString()}`, inline: true },
    ],
  });
}

function logBossDefeated(client, { bossName, topAttackers }) {
  const lines = topAttackers.map((p, i) => `${i + 1}. <@${p.userId}> — ${p.damage.toLocaleString()} dmg`);
  return log(client, 'BOSS', {
    description: `**${bossName}** was defeated!`,
    fields: lines.length ? [{ name: 'Top Attackers', value: lines.join('\n') }] : [],
  });
}

// ── Halloween Puzzle ─────────────────────────────────────────────────
function logPuzzlePosted(client, { number, reward, channelId }) {
  return log(client, 'PUZZLE', {
    description: `Puzzle #${number} posted in <#${channelId}>.`,
    fields: [{ name: 'Reward', value: `${reward.toLocaleString()} 🎃`, inline: true }],
  });
}

function logPuzzleSolved(client, { number, userId, reward }) {
  return log(client, 'PUZZLE', {
    description: `<@${userId}> solved Puzzle #${number}.`,
    fields: [{ name: 'Reward', value: `+${reward.toLocaleString()} 🎃`, inline: true }],
  });
}

function logPuzzleRevealed(client, { number, answer }) {
  return log(client, 'PUZZLE', {
    description: `Puzzle #${number} went unsolved and was revealed.`,
    fields: [{ name: 'Answer', value: answer, inline: true }],
  });
}

module.exports = {
  LOG_CHANNEL_ID,
  CATEGORIES,
  log, // use directly for Pumpkin Hunt / Zombie Infection / Escape Race / Shop / Points / Admin once those exist
  logEmoteHuntStarted,
  logEmoteHuntFound,
  logBossSpawned,
  logBossAttack,
  logBossDefeated,
  logPuzzlePosted,
  logPuzzleSolved,
  logPuzzleRevealed,
};
