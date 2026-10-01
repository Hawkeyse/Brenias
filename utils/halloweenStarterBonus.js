const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const User = require('../models/User');
const { HALLOWEEN_POINTS_EMOJI } = require('./halloweenPoints');

const STARTER_BONUS_POINTS = 900;
const STARTER_BONUS_BUTTON_ID = 'halloween-starter-bonus:claim';
const PUMPKIN_EMOJI = { name: '687657pumpkin', id: '1549044780863070258' };
const GHOST_EMOJI = '<:623778ghost:1549040963886915624>';

function buildStarterBonusComponents(claimedCount) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(STARTER_BONUS_BUTTON_ID)
      .setLabel(`FREE 900 POINTS · ${claimedCount.toLocaleString()} CLAIMED`)
      .setEmoji(PUMPKIN_EMOJI)
      .setStyle(ButtonStyle.Success)
  )];
}

function buildStarterBonusPanel(claimedCount) {
  const embed = new EmbedBuilder()
    .setColor('#FF7518')
    .setTitle('🎁 HALLOWEEN STARTER BONUS!')
    .setDescription(
      'To celebrate the launch of our **first-ever Halloween event**, everyone gets **900 FREE Halloween Points!** ' +
      `${HALLOWEEN_POINTS_EMOJI}\n\n` +
      'No tasks, no puzzles, no tricks — the points are yours to spend in the **Halloween Shop**. ' +
      `${GHOST_EMOJI}`
    )
    .setFooter({ text: 'One claim per member for this server.' });

  return { embeds: [embed], components: buildStarterBonusComponents(claimedCount) };
}

async function claimStarterBonus(guildId, userId) {
  try {
    const user = await User.findOneAndUpdate(
      { guildId, userId, starterBonusClaimed: { $ne: true } },
      {
        $set: { starterBonusClaimed: true },
        $inc: { halloweenPoints: STARTER_BONUS_POINTS },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return user
      ? { claimed: true, balance: user.halloweenPoints }
      : { claimed: false };
  } catch (error) {
    if (error.code === 11000) return { claimed: false };
    throw error;
  }
}

function getStarterBonusClaimCount(guildId) {
  return User.countDocuments({ guildId, starterBonusClaimed: true });
}

module.exports = {
  STARTER_BONUS_POINTS,
  STARTER_BONUS_BUTTON_ID,
  buildStarterBonusComponents,
  buildStarterBonusPanel,
  claimStarterBonus,
  getStarterBonusClaimCount,
};