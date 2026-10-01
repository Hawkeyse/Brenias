// utils/halloweenBoss.js
// Shared constants + helpers for the Halloween Boss Battle feature.
// Used by commands/halloweenboss.js and events/halloweenBossAttack.js.
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { addHalloweenPoints } = require('./halloweenPoints');
const { logBossDefeated, logBossSpawned } = require('./halloweenLog');
const HalloweenBoss = require('../models/HalloweenBoss');

const LEADERBOARD_CHANNEL_ID = '1549040166964957265';
const ASSETS_DIR = path.join(__dirname, '../assets/halloween');

// Each boss "skin" is a pair of portraits (alive/defeated) plus a default
// name to use when staff don't set one. Add more here any time — staff
// pick one with the `skin` option on /halloween-boss start.
const BOSS_SKINS = {
  golem: {
    label: 'Stone Golem',
    defaultName: 'The Stone Golem',
    aliveImage: 'golem.png',
    deadImage: 'golemdead.png',
  },
  superhogs: {
    label: 'Super Hogs',
    defaultName: 'The Super Hogs',
    aliveImage: 'superhogs.png',
    deadImage: 'superhogsdead.png',
  },
};
const DEFAULT_SKIN = 'golem';

// Which skins auto-rotate daily, and in what order. Editing this list is
// all that's needed to add a skin to the rotation later — it's separate
// from BOSS_SKINS so a skin can exist (manually startable) without being
// part of the daily rotation.
const BOSS_ROTATION = ['golem', 'superhogs'];

function getSkin(skinKey) {
  return BOSS_SKINS[skinKey] || BOSS_SKINS[DEFAULT_SKIN];
}

// Deterministic day-based rotation — no stored state needed. Every UTC day
// index into a fixed length-2 rotation, so it also self-corrects if the
// bot was offline and missed a day (today is always computed fresh from
// the real date rather than "the next one after last time").
function getTodaysRotationSkin(date = new Date()) {
  const dayIndex = Math.floor(date.getTime() / 86400000);
  return BOSS_ROTATION[dayIndex % BOSS_ROTATION.length];
}

const ATTACK_COOLDOWN_MS = 30 * 60 * 1000; // 1 attack per 30 min per user

// Damage roll tuning — adjust freely, everything else derives from these.
const MIN_DAMAGE = 150;
const MAX_DAMAGE = 450;
const CRIT_CHANCE = 0.15;
const CRIT_MULTIPLIER = 2;

const PARTICIPATION_REWARD = 400; // paid once, on a user's first attack

// All thresholds a user crosses stack (e.g. 6,000 total damage pays out
// 100 + 250 + 500 = 850, not just the 5,000 tier).
const DAMAGE_TIERS = [
  { min: 1000, bonus: 100 },
  { min: 2500, bonus: 250 },
  { min: 5000, bonus: 500 },
  { min: 10000, bonus: 1000 },
];

const RANK_REWARDS = { 1: 5000, 2: 3000, 3: 2000 }; // ranks 4-10 use TOP10_REWARD
const TOP10_REWARD = 1000;

function rollDamage() {
  const base = Math.floor(Math.random() * (MAX_DAMAGE - MIN_DAMAGE + 1)) + MIN_DAMAGE;
  const isCrit = Math.random() < CRIT_CHANCE;
  return { damage: isCrit ? base * CRIT_MULTIPLIER : base, isCrit };
}

function renderHpBar(current, max, size = 20) {
  const clamped = Math.max(0, Math.min(current, max));
  const filled = max > 0 ? Math.round((clamped / max) * size) : 0;
  return '🟧'.repeat(filled) + '⬛'.repeat(size - filled);
}

function buildBossEmbed(boss) {
  const alive = boss.active && boss.currentHP > 0;
  const skin = getSkin(boss.skin);
  const imageFilename = alive ? skin.aliveImage : skin.deadImage;
  const sorted = [...boss.participants].sort((a, b) => b.damage - a.damage);
  const topLines = sorted.slice(0, 5).map((p, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
    return `${medal} <@${p.userId}> — **${p.damage.toLocaleString()}** dmg`;
  });

  const embed = new EmbedBuilder()
    .setColor(alive ? '#FF7518' : '#95A5A6')
    .setTitle(alive ? `👹 ${boss.name}` : `💀 ${boss.name} — Defeated!`)
    .setImage(`attachment://${imageFilename}`)
    .setDescription(
      `${renderHpBar(boss.currentHP, boss.maxHP)}\n` +
      `**HP:** ${Math.max(0, boss.currentHP).toLocaleString()} / ${boss.maxHP.toLocaleString()}\n\n` +
      (alive
        ? 'Hit **Attack** below to deal damage! One attack every 30 minutes.'
        : 'The fight is over — check the leaderboard channel for rewards!')
    );

  if (topLines.length > 0) {
    embed.addFields({ name: 'Top Attackers So Far', value: topLines.join('\n') });
  }

  embed.setFooter({ text: `${boss.participants.length} member(s) have joined the fight` });
  return embed;
}

function buildAttackRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('halloween-boss-attack')
      .setLabel('Attack')
      .setEmoji({ id: '1549040940407197876', name: '44722scratch', animated: true })
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

/**
 * Returns the AttachmentBuilder for whichever boss image (alive/defeated,
 * for this boss's skin) matches its current state, or null if that file
 * hasn't been added to assets/halloween/ yet. Anywhere a message is sent
 * or edited with buildBossEmbed(boss), pass this in `files` too — the
 * embed's attachment:// reference only resolves if the file is actually
 * attached to that specific send/edit call (or was already attached
 * earlier and isn't being replaced).
 */
function getBossImageAttachment(boss) {
  const alive = boss.active && boss.currentHP > 0;
  const skin = getSkin(boss.skin);
  const filename = alive ? skin.aliveImage : skin.deadImage;
  const filePath = path.join(ASSETS_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return new AttachmentBuilder(filePath, { name: filename });
}

/**
 * Creates a boss doc, posts it (with its portrait, if the file exists),
 * and logs the spawn. Shared by /halloween-boss start and the daily
 * scheduler so both paths spawn a boss identically — one place to change,
 * not two copies that can drift apart.
 */
async function spawnBoss({ client, guildId, channel, name, skinKey, hp }) {
  const skin = getSkin(skinKey);
  const bossName = name || skin.defaultName;

  const boss = await HalloweenBoss.create({
    guildId,
    channelId: channel.id,
    name: bossName,
    skin: skinKey,
    maxHP: hp,
    currentHP: hp,
    active: true,
    participants: [],
  });

  const attachment = getBossImageAttachment(boss);
  const sent = await channel.send({
    embeds: [buildBossEmbed(boss)],
    components: [buildAttackRow(false)],
    files: attachment ? [attachment] : [],
  });
  boss.messageId = sent.id;
  await boss.save();

  await logBossSpawned(client, { bossName, maxHP: hp, channelId: channel.id });

  return { boss, attachment };
}

/**
 * Ends a boss fight: pays out rank rewards, marks it inactive, updates the
 * original boss message to its "defeated" state, and posts results to the
 * leaderboard channel. Safe to call whether the boss died naturally
 * (HP <= 0) or was force-ended by staff early — rank rewards are based on
 * whatever damage was actually dealt.
 */
async function finishBoss(client, boss) {
  boss.currentHP = Math.max(0, boss.currentHP);
  boss.active = false;
  boss.endedAt = new Date();

  const sorted = [...boss.participants].sort((a, b) => b.damage - a.damage);

  for (let i = 0; i < sorted.length; i++) {
    const rank = i + 1;
    const bonus = RANK_REWARDS[rank] ?? (rank <= 10 ? TOP10_REWARD : 0);
    if (bonus > 0) {
      await addHalloweenPoints(boss.guildId, sorted[i].userId, bonus);
    }
  }

  await boss.save();

  try {
    const channel = await client.channels.fetch(boss.channelId);
    const message = boss.messageId ? await channel.messages.fetch(boss.messageId) : null;
    if (message) {
      const attachment = getBossImageAttachment(boss); // boss.active is false here, so this resolves the "dead" image
      await message.edit({
        embeds: [buildBossEmbed(boss)],
        components: [buildAttackRow(true)],
        files: attachment ? [attachment] : [],
      });
    }
  } catch (err) {
    console.error('[halloweenBoss] Failed to update boss message on finish:', err.message);
  }

  try {
    const leaderboardChannel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
    if (leaderboardChannel) {
      const totalDamage = sorted.reduce((sum, p) => sum + p.damage, 0);
      const lines = sorted.slice(0, 10).map((p, i) => {
        const rank = i + 1;
        const bonus = RANK_REWARDS[rank] ?? (rank <= 10 ? TOP10_REWARD : 0);
        const medal = ['🥇', '🥈', '🥉'][i] || `**${rank}.**`;
        return `${medal} <@${p.userId}> — **${p.damage.toLocaleString()}** dmg (+${bonus.toLocaleString()} 🎃)`;
      });

      const resultsEmbed = new EmbedBuilder()
        .setColor('#FF7518')
        .setTitle(`💀 ${boss.name} has been defeated!`)
        .setDescription(
          `**${sorted.length}** member(s) joined the fight and dealt **${totalDamage.toLocaleString()}** total damage.\n\n` +
          (lines.length > 0 ? lines.join('\n') : 'Nobody attacked this boss.')
        )
        .setFooter({ text: 'Participation and damage-tier points were already awarded during the fight — these are the final rank bonuses.' });

      await leaderboardChannel.send({ embeds: [resultsEmbed] });
    }
  } catch (err) {
    console.error('[halloweenBoss] Failed to post results to leaderboard channel:', err.message);
  }

  await logBossDefeated(client, { bossName: boss.name, topAttackers: sorted.slice(0, 10) });
}

module.exports = {
  LEADERBOARD_CHANNEL_ID,
  BOSS_SKINS,
  DEFAULT_SKIN,
  BOSS_ROTATION,
  getSkin,
  getTodaysRotationSkin,
  ATTACK_COOLDOWN_MS,
  PARTICIPATION_REWARD,
  DAMAGE_TIERS,
  rollDamage,
  renderHpBar,
  buildBossEmbed,
  buildAttackRow,
  getBossImageAttachment,
  spawnBoss,
  finishBoss,
};
