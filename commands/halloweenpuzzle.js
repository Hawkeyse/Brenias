// commands/halloweenpuzzle.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const HalloweenPuzzle = require('../models/HalloweenPuzzle');
const HalloweenPuzzleSchedule = require('../models/HalloweenPuzzleSchedule');
const User = require('../models/User');
const { postNextPuzzle, scheduleNextPuzzle } = require('../utils/halloweenPuzzle');
const { logPuzzleRevealed } = require('../utils/halloweenLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-puzzle')
    .setDescription('Manage the AI-generated Halloween Puzzle 🧩')
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Start automatic AI puzzles in a channel (staff only).')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel for the AI-generated puzzles.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Show the automatic puzzle schedule.'))
    .addSubcommand(sub => sub
      .setName('stop')
      .setDescription('Stop automatic puzzle posts (staff only).'))
    .addSubcommand(sub => sub
      .setName('reveal')
      .setDescription('Reveal today\'s answer if nobody solved it (staff only)'))
    .addSubcommand(sub => sub
      .setName('leaderboard')
      .setDescription('Show the Halloween Points leaderboard')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const staffGate = () => interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (sub === 'setup') {
      if (!staffGate()) {
        return interaction.reply({ content: 'You need Manage Server permission to set up automatic puzzles.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      const active = await HalloweenPuzzle.findOne({ guildId, channelId: channel.id, solved: false });
      if (active) return interaction.editReply(`There is already an unsolved puzzle in ${channel}.`);
      await HalloweenPuzzleSchedule.findOneAndUpdate(
        { guildId },
        { $set: { channelId: channel.id, enabled: true, nextPostAt: null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const result = await postNextPuzzle(interaction.client, guildId, { force: true });
      return interaction.editReply(result.posted
        ? `✅ AI puzzle posted in ${channel}. The next one follows 10 minutes after a correct answer.`
        : 'Puzzle automation is already active.');
    }

    if (sub === 'status') {
      const [schedule, active] = await Promise.all([
        HalloweenPuzzleSchedule.findOne({ guildId }),
        HalloweenPuzzle.findOne({ guildId, solved: false }).sort({ number: -1 }),
      ]);
      if (!schedule?.enabled) return interaction.reply('Automatic Halloween puzzles are not set up.');
      const timing = schedule.nextPostAt
        ? `Next puzzle: <t:${Math.floor(schedule.nextPostAt.getTime() / 1000)}:R>.`
        : active ? 'Waiting for someone to solve the current puzzle.' : 'No puzzle is queued right now.';
      return interaction.reply(`AI puzzles are on in <#${schedule.channelId}>. ${timing}`);
    }

    if (sub === 'stop') {
      if (!staffGate()) return interaction.reply({ content: 'You need Manage Server permission to stop automatic puzzles.', ephemeral: true });
      await HalloweenPuzzleSchedule.updateOne({ guildId }, { $set: { enabled: false, nextPostAt: null } });
      return interaction.reply({ content: 'Automatic Halloween puzzles are stopped.', ephemeral: true });
    }

    if (sub === 'reveal') {
      if (!staffGate()) {
        return interaction.reply({ content: 'You need Manage Server permission to reveal a puzzle.', ephemeral: true });
      }

      const puzzle = await HalloweenPuzzle.findOne({ guildId, solved: false }).sort({ number: -1 });
      if (!puzzle) {
        return interaction.reply({ content: 'No unsolved puzzle to reveal.', ephemeral: true });
      }

      puzzle.solved = true;
      await puzzle.save();

      const channel = interaction.client.channels.cache.get(puzzle.channelId);
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setDescription(`⏰ Nobody solved **Puzzle #${puzzle.number}**!\nThe answer was: **${puzzle.answer}**`);

      if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
      await logPuzzleRevealed(interaction.client, { number: puzzle.number, answer: puzzle.answer });
      await scheduleNextPuzzle(guildId);
      return interaction.reply({ content: `✅ Puzzle #${puzzle.number} revealed.`, ephemeral: true });
    }

    if (sub === 'leaderboard') {
      const topUsers = await User.find({ guildId, halloweenPoints: { $gt: 0 } })
        .sort({ halloweenPoints: -1 })
        .limit(10);

      if (topUsers.length === 0) {
        return interaction.reply('No Halloween Points earned yet — solve today\'s puzzle first! 🧩');
      }

      const lines = topUsers.map((u, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
        return `${medal} <@${u.userId}> — **${u.halloweenPoints}** pts`;
      });

      const embed = new EmbedBuilder()
        .setColor('#FF7518')
        .setTitle('🎃 Halloween Points Leaderboard')
        .setDescription(lines.join('\n'));

      return interaction.reply({ embeds: [embed] });
    }
  },
};