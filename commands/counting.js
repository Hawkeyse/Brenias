// commands/counting.js (Minor Update: Status Shows Last User)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// Import model
const Counting = require('../models/Counting');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Manage the counting game.')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start or reset counting from a specific number (staff only).')
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('The number to start from (bot posts this, next user says +1)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reset')
        .setDescription('Reset the count to 1 (staff only).')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show current expected number and user chances.')
    ),
  async execute(interaction) {
    const staffRole = '716731375411134555';
    const headAdminRole = '716804233441312841';
    const ownerRole = '813911857924276294';
    const COUNTING_CHANNEL_ID = '1364738225800745040';

    const hasPermission = interaction.member.roles.cache.has(staffRole) || 
                         interaction.member.roles.cache.has(headAdminRole) || 
                         interaction.member.roles.cache.has(ownerRole);

    const guildId = interaction.guild.id;
    let countingState = await Counting.findOne({ guildId }) || new Counting({ guildId });
    await countingState.save(); // Ensure doc exists

    if (interaction.options.getSubcommand() === 'start') {
      if (!hasPermission) {
        return interaction.reply({ content: 'You do not have permission! (Staff/Head Admin/Owner only)', ephemeral: true });
      }

      const startNum = interaction.options.getInteger('number');
      if (startNum < 1) {
        return interaction.reply({ content: 'Number must be 1 or higher!', ephemeral: true });
      }

      const channel = interaction.client.channels.cache.get(COUNTING_CHANNEL_ID);
      if (!channel) {
        return interaction.reply({ content: 'Counting channel not found!', ephemeral: true });
      }

      // Clear state and set precisely: expected = startNum + 1, reset lastUser and chances
      countingState.userChances.clear();
      countingState.lastUserId = null;
      countingState.expectedCount = startNum + 1; // Exact: If start 199, expected 200
      await countingState.save();

      // Bot posts exactly the start number (199)
      await channel.send(`${startNum}`);

      await interaction.reply({ content: `Counting started precisely! Bot posted "${startNum}". **Next expected: ${startNum + 1}** (Wait for another user to say it.)`, ephemeral: true });
    } else if (interaction.options.getSubcommand() === 'reset') {
      if (!hasPermission) {
        return interaction.reply({ content: 'You do not have permission! (Staff/Head Admin/Owner only)', ephemeral: true });
      }

      countingState.expectedCount = 1;
      countingState.lastUserId = null;
      countingState.userChances.clear();
      await countingState.save();

      const channel = interaction.client.channels.cache.get(COUNTING_CHANNEL_ID);
      if (channel) await channel.send('1'); // Bot posts reset

      await interaction.reply({ content: 'Counting reset to 1! All chances and last user cleared.', ephemeral: true });
    } else if (interaction.options.getSubcommand() === 'status') {
      const lastUser = countingState.lastUserId ? `<@${countingState.lastUserId}>` : 'None (open to anyone)';
      const chanceList = Array.from(countingState.userChances.entries())
        .filter(([_, c]) => c > 0)
        .map(([uid, c]) => `<@${uid}>: ${c}/3 chances used`)
        .join('\n') || 'None';

      const statusEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('🧮 Counting Status')
        .addFields(
          { name: 'Next Expected Number', value: `**${countingState.expectedCount}**`, inline: true },
          { name: 'Last Successful User', value: lastUser, inline: true },
          { name: 'Users with Active Chances', value: chanceList || 'All clear! No mistakes yet.', inline: false }
        )
        .setFooter({ text: `No consecutive counts allowed—wait for another user.` });

      await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }
  },
};