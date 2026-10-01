const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,  // Added for ephemeral deprecation fix
} = require('discord.js');
const mongoose = require('mongoose');
const RULES_CHANNEL_ID = '716736324459167775';
const LOGS_CHANNEL_ID = '1366682681886244864';
const AutomodConfig = require('../models/AutomodConfig'); // Use models path

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage automod features')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sub => sub
      .setName('badwords-toggle')
      .setDescription('Enable or disable the bad words filter')
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Turn bad words filter on or off')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('spam-toggle')
      .setDescription('Enable or disable spam detection')
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Turn spam detection on or off')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('link-toggle')
      .setDescription('Enable or disable link blocking for non-whitelisted domains')
      .addBooleanOption(opt => opt
        .setName('enabled')
        .setDescription('Turn link blocking on or off')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('set-spam-threshold')
      .setDescription('Set how many messages count as spam')
      .addIntegerOption(opt => opt
        .setName('threshold')
        .setDescription('Number of messages (1–20)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)))
    .addSubcommand(sub => sub
      .setName('add-badword')
      .setDescription('Add a word to the bad words list')
      .addStringOption(opt => opt
        .setName('word')
        .setDescription('The word to block')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove-badword')
      .setDescription('Remove a word from the bad words list')
      .addStringOption(opt => opt
        .setName('word')
        .setDescription('The exact word to remove')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('add-whitelist')
      .setDescription('Allow a domain (e.g. youtube.com)')
      .addStringOption(opt => opt
        .setName('domain')
        .setDescription('Domain like youtube.com')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove-whitelist')
      .setDescription('Remove a domain from the whitelist')
      .addStringOption(opt => opt
        .setName('domain')
        .setDescription('Exact domain to remove')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('View current automod configuration')),
  async execute(interaction) {
    // Defer reply immediately to prevent 3s timeout
    await interaction.deferReply();

    let config = await AutomodConfig.findOne({ guildId: interaction.guild.id });
    if (!config) {
      config = new AutomodConfig({ guildId: interaction.guild.id });
      await config.save();
    }

    // Get logs channel
    const logChannel = interaction.client.channels.cache.get(LOGS_CHANNEL_ID);

    const embed = new EmbedBuilder().setColor('#FFA500'); // Default success color
    const subcommand = interaction.options.getSubcommand();
    const staffTag = interaction.user.tag;
    const oldValue = {}; // For logging before/after

    try {
      switch (subcommand) {
        case 'badwords-toggle':
          oldValue.enabled = config.badWordsEnabled;
          config.badWordsEnabled = interaction.options.getBoolean('enabled');
          await config.save();
          embed.setTitle('Bad Words Filter Updated')
            .setDescription(`Bad words filter is now **${config.badWordsEnabled ? 'Enabled' : 'Disabled'}**.`);
          if (logChannel) {
            await logChannel.send({ embeds: [createLogEmbed('Bad Words Toggle', `${staffTag} toggled bad words filter to **${config.badWordsEnabled ? 'Enabled' : 'Disabled'}** (was ${oldValue.enabled ? 'Enabled' : 'Disabled'}).`, '#FFA500')] });
          }
          break;
        case 'spam-toggle':
          oldValue.enabled = config.spamEnabled;
          config.spamEnabled = interaction.options.getBoolean('enabled');
          await config.save();
          embed.setTitle('Spam Detection Updated')
            .setDescription(`Spam detection is now **${config.spamEnabled ? 'Enabled' : 'Disabled'}**.`);
          if (logChannel) {
            await logChannel.send({ embeds: [createLogEmbed('Spam Toggle', `${staffTag} toggled spam detection to **${config.spamEnabled ? 'Enabled' : 'Disabled'}** (was ${oldValue.enabled ? 'Enabled' : 'Disabled'}).`, '#FFA500')] });
          }
          break;
        case 'link-toggle':
          oldValue.enabled = config.linkEnabled;
          config.linkEnabled = interaction.options.getBoolean('enabled');
          await config.save();
          embed.setTitle('Link Blocking Updated')
            .setDescription(`Link blocking is now **${config.linkEnabled ? 'Enabled' : 'Disabled'}** (non-whitelisted domains).`);
          if (logChannel) {
            await logChannel.send({ embeds: [createLogEmbed('Link Toggle', `${staffTag} toggled link blocking to **${config.linkEnabled ? 'Enabled' : 'Disabled'}** (was ${oldValue.enabled ? 'Enabled' : 'Disabled'}).`, '#FFA500')] });
          }
          break;
        case 'set-spam-threshold':
          oldValue.threshold = config.spamThreshold;
          const threshold = interaction.options.getInteger('threshold');
          config.spamThreshold = threshold;
          await config.save();
          embed.setTitle('Spam Threshold Updated')
            .setDescription(`Users can now send **${threshold} messages** in ${config.spamWindow} seconds before spam detection.`);
          if (logChannel) {
            await logChannel.send({ embeds: [createLogEmbed('Spam Threshold Set', `${staffTag} set spam threshold to **${threshold}** (was ${oldValue.threshold}).`, '#FFA500')] });
          }
          break;
        case 'add-badword':
          const word = interaction.options.getString('word').toLowerCase().trim();
          if (!word) {
            const errEmbed = new EmbedBuilder().setColor('#FF5555').setTitle('Invalid Input').setDescription('Word cannot be empty.');
            return interaction.editReply({ embeds: [errEmbed] });
          }
          oldValue.exists = config.badWords.includes(word);
          if (oldValue.exists) {
            embed.setColor('#FF5555').setTitle('Already Exists').setDescription(`"${word}" is already in the bad words list.`);
          } else {
            config.badWords.push(word);
            await config.save();
            embed.setTitle('Bad Word Added').setDescription(`**${word}** has been added to the filter.`);
            if (logChannel) {
              await logChannel.send({ embeds: [createLogEmbed('Bad Word Added', `${staffTag} added bad word: **${word}**.`, '#FFA500')] });
            }
          }
          break;
        case 'remove-badword':
          const rmWord = interaction.options.getString('word').toLowerCase().trim();
          if (!rmWord) {
            const errEmbed = new EmbedBuilder().setColor('#FF5555').setTitle('Invalid Input').setDescription('Word cannot be empty.');
            return interaction.editReply({ embeds: [errEmbed] });
          }
          oldValue.exists = config.badWords.includes(rmWord);
          if (!oldValue.exists) {
            embed.setColor('#FF5555').setTitle('Not Found').setDescription(`"${rmWord}" is not in the bad words list.`);
          } else {
            config.badWords = config.badWords.filter(w => w !== rmWord);
            await config.save();
            embed.setTitle('Bad Word Removed').setDescription(`**${rmWord}** has been removed from the filter.`);
            if (logChannel) {
              await logChannel.send({ embeds: [createLogEmbed('Bad Word Removed', `${staffTag} removed bad word: **${rmWord}**.`, '#FFA500')] });
            }
          }
          break;
        case 'add-whitelist':
          const domain = interaction.options.getString('domain').toLowerCase().trim();
          if (!domain) {
            const errEmbed = new EmbedBuilder().setColor('#FF5555').setTitle('Invalid Input').setDescription('Domain cannot be empty.');
            return interaction.editReply({ embeds: [errEmbed] });
          }
          oldValue.exists = config.linkWhitelist.includes(domain);
          if (oldValue.exists) {
            embed.setColor('#FF5555').setTitle('Already Whitelisted').setDescription(`**${domain}** is already allowed.`);
          } else {
            config.linkWhitelist.push(domain);
            await config.save();
            embed.setTitle('Domain Whitelisted').setDescription(`**${domain}** is now allowed in messages.`);
            if (logChannel) {
              await logChannel.send({ embeds: [createLogEmbed('Domain Whitelisted', `${staffTag} whitelisted domain: **${domain}**.`, '#FFA500')] });
            }
          }
          break;
        case 'remove-whitelist':
          const rmDomain = interaction.options.getString('domain').toLowerCase().trim();
          if (!rmDomain) {
            const errEmbed = new EmbedBuilder().setColor('#FF5555').setTitle('Invalid Input').setDescription('Domain cannot be empty.');
            return interaction.editReply({ embeds: [errEmbed] });
          }
          oldValue.exists = config.linkWhitelist.includes(rmDomain);
          if (!oldValue.exists) {
            embed.setColor('#FF5555').setTitle('Not Whitelisted').setDescription(`**${rmDomain}** is not in the whitelist.`);
          } else {
            config.linkWhitelist = config.linkWhitelist.filter(d => d !== rmDomain);
            await config.save();
            embed.setTitle('Domain Removed').setDescription(`**${rmDomain}** is no longer whitelisted.`);
            if (logChannel) {
              await logChannel.send({ embeds: [createLogEmbed('Domain Removed', `${staffTag} removed whitelisted domain: **${rmDomain}**.`, '#FFA500')] });
            }
          }
          break;
        case 'list':
          const sampleBadWords = config.badWords.length > 0 ? config.badWords.slice(0, 5).join(', ') + (config.badWords.length > 5 ? '...' : '') : 'None';
          const whitelistText = config.linkWhitelist.length > 0 ? config.linkWhitelist.slice(0, 10).join(', ') + (config.linkWhitelist.length > 10 ? '...' : '') : 'None';
          embed.setTitle('Current Automod Configuration')
            .setColor('#0099FF')
            .addFields(
              { name: 'Bad Words Filter', value: config.badWordsEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
              { name: 'Sample Bad Words', value: sampleBadWords, inline: false },
              { name: 'Spam Detection', value: config.spamEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
              { name: 'Spam Threshold', value: `${config.spamThreshold} msgs / ${config.spamWindow}s`, inline: true },
              { name: 'Link Blocking', value: config.linkEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
              { name: 'Whitelisted Domains', value: whitelistText, inline: false }
            );
          break;
      }
      // Edit the deferred reply (public for transparency)
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in automod execute:', error);
      const errEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('Command Error').setDescription('An error occurred while processing. Check logs.');
      await interaction.editReply({ embeds: [errEmbed] });
    }
  },
};

// Helper: Create clean log embed (unchanged)
function createLogEmbed(title, description, color) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`AutoMod Config Change: ${title}`)
    .setDescription(description)
    .setTimestamp();
}