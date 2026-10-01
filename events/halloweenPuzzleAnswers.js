// events/halloweenPuzzleAnswers.js
// Listens for messages in a channel that currently has an unsolved
// Halloween puzzle, and checks them against the stored answer.
const { Events, EmbedBuilder } = require('discord.js');
const HalloweenPuzzle = require('../models/HalloweenPuzzle');
const { addHalloweenPoints } = require('../utils/halloweenPoints');
const { logPuzzleSolved } = require('../utils/halloweenLog');
const { scheduleNextPuzzle } = require('../utils/halloweenPuzzle');

const PUMPKIN_EMOJI = '<:687657pumpkin:1549044780863070258>';

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
      if (!message.content || message.content.trim().length === 0) return;

      const puzzle = await HalloweenPuzzle.findOne({
        guildId: message.guild.id,
        channelId: message.channel.id,
        solved: false,
      }).sort({ number: -1 });

      if (!puzzle) return;

      const guess = message.content.trim().toLowerCase();
      if (guess !== puzzle.answer.trim().toLowerCase()) return;

      // Atomically claim the puzzle so two people answering at nearly the
      // same moment can't both be awarded the "first" prize.
      const claimed = await HalloweenPuzzle.findOneAndUpdate(
        { _id: puzzle._id, solved: false },
        { solved: true, solvedBy: message.author.id },
        { new: true }
      );
      if (!claimed) return; // someone else's answer landed first

      await addHalloweenPoints(message.guild.id, message.author.id, claimed.reward);
      await logPuzzleSolved(client, { number: claimed.number, userId: message.author.id, reward: claimed.reward });
      await scheduleNextPuzzle(message.guild.id);

      const embed = new EmbedBuilder()
        .setColor('#FF7518')
        .setDescription(
          `${message.author} solved today's puzzle first!\n${PUMPKIN_EMOJI} **+${claimed.reward} Halloween Points**`
        );

      await message.reply({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.error('[halloweenPuzzleAnswers] error:', err);
    }
  });

  console.log('[halloweenPuzzleAnswers] Ready – watching for correct puzzle answers');
};