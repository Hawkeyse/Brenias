const { SlashCommandBuilder } = require('discord.js');
const HalloweenTrickOrTreat = require('../models/HalloweenTrickOrTreat');
const User = require('../models/User');
const { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');
const { infectMember, isInfected, INFECTION_DURATION_MS } = require('../utils/halloweenInfection');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trick-or-treat')
    .setDescription('Choose a Halloween trick or treat once per day.')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('choice')
      .setDescription('Choose your fate.')
      .setRequired(true)
      .addChoices(
        { name: 'Treat', value: 'treat' },
        { name: 'Trick', value: 'trick' }
      )),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const day = new Date().toISOString().slice(0, 10);
    const choice = interaction.options.getString('choice');

    try {
      const entry = await HalloweenTrickOrTreat.create({ guildId, userId, day, choice });
      let response;

      if (choice === 'treat') {
        const amount = randomInt(100, 300);
        const account = await addHalloweenPoints(guildId, userId, amount);
        entry.outcome = 'points';
        entry.amount = amount;
        await entry.save();
        response = `🍬 Treat! You won **${amount}** ${HALLOWEEN_POINTS_EMOJI} Halloween Points. Your balance is **${account.halloweenPoints.toLocaleString()}**.`;
      } else {
        const alreadyInfected = await isInfected(guildId, userId);
        if (!alreadyInfected && Math.random() < 0.3) {
          const result = await infectMember(interaction.guild, interaction.member, userId);
          if (result.ok) {
            entry.outcome = 'infected';
            entry.amount = INFECTION_DURATION_MS;
            await entry.save();
            response = '🧟 Trick! You got infected for **one hour**. Use the Halloween Shop cure to recover early.';
          }
        }

        if (!response) {
          const requestedLoss = randomInt(50, 150);
          const account = await User.findOne({ guildId, userId }).lean();
          const loss = Math.min(requestedLoss, account?.halloweenPoints ?? 0);
          if (loss > 0) {
            const debit = await User.updateOne(
              { guildId, userId, halloweenPoints: { $gte: loss } },
              { $inc: { halloweenPoints: -loss } }
            );
            if (debit.modifiedCount > 0) {
              entry.outcome = 'lost-points';
              entry.amount = loss;
              await entry.save();
              response = `🕸️ Trick! You lost **${loss}** Halloween Points.`;
            }
          }

          if (!response) {
            entry.outcome = 'empty-pockets';
            entry.amount = 0;
            await entry.save();
            response = '🕸️ Trick! Your pockets were empty, so the ghost had nothing to take.';
          }
        }
      }

      const balance = await User.findOne({ guildId, userId }).lean();
      return interaction.editReply(`${response}\nCurrent balance: **${(balance?.halloweenPoints ?? 0).toLocaleString()}** ${HALLOWEEN_POINTS_EMOJI}.`);
    } catch (error) {
      if (error.code === 11000) {
        return interaction.editReply('You already played Trick-or-Treat today. Come back after the UTC day resets!');
      }
      console.error('[trick-or-treat] error:', error);
      return interaction.editReply('❌ I could not finish your Trick-or-Treat. Please try again later.');
    }
  },
};