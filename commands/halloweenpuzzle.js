// commands/halloweenpuzzle.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const HalloweenPuzzle = require('../models/HalloweenPuzzle');
const User = require('../models/User');
const { isInfected } = require('../utils/halloweenInfection');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-puzzle')
    .setDescription('Manage the Daily Halloween Puzzle 🧩')
    .addSubcommand(sub => sub
      .setName('post')
      .setDescription('Post today\'s puzzle (staff only)')
      .addStringOption(opt => opt
        .setName('riddle')
        .setDescription('The riddle text (include the question, e.g. "...What am I? 👻")')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('answer')
        .setDescription('Correct answer (case-insensitive, exact match)')
        .setRequired(true))
      .addIntegerOption(opt => opt
        .setName('reward')
        .setDescription('Halloween Points reward for solving first (default 500)')
        .setMinValue(1)
        .setRequired(false))
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to post in (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)))
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

    if (!staffGate() && await isInfected(guildId, interaction.user.id)) {
      return interaction.reply({
        content: '🧟 You are infected and cannot participate in Halloween games. Visit the Halloween Shop to buy a cure.',
        ephemeral: true,
      });
    }

    if (sub === 'post') {
      if (!staffGate()) {
        return interaction.reply({ content: 'You need Manage Server permission to post a puzzle.', ephemeral: true });
      }

      const riddle = interaction.options.getString('riddle');
      const answer = interaction.options.getString('answer').trim();
      const reward = interaction.options.getInteger('reward') ?? 500;
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      const existingUnsolved = await HalloweenPuzzle.findOne({ guildId, channelId: channel.id, solved: false });
      if (existingUnsolved) {
        return interaction.reply({
          content: `⚠️ Puzzle #${existingUnsolved.number} in ${channel} hasn't been solved yet. Use \`/halloween-puzzle reveal\` first, or pick a different channel.`,
          ephemeral: true
        });
      }

      const count = await HalloweenPuzzle.countDocuments({ guildId });
      const number = count + 1;

      const embed = new EmbedBuilder()
        .setColor('#FF7518')
        .setTitle(`🧩 Halloween Puzzle #${number}`)
        .setDescription(riddle)
        .addFields({ name: '\u200b', value: 'Submit your answer below!' })
        .setFooter({ text: `First correct answer wins ${reward} Halloween Points` });

      const sent = await channel.send({ embeds: [embed] });

      await HalloweenPuzzle.create({
        guildId,
        number,
        question: riddle,
        answer,
        channelId: channel.id,
        messageId: sent.id,
        reward,
      });

      return interaction.reply({ content: `✅ Puzzle #${number} posted in ${channel}.`, ephemeral: true });
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