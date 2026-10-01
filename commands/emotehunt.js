const {
  SlashCommandBuilder,
  PermissionsBitField,
} = require('discord.js');
const { EMOTE_HUNT_CHANNEL_ID, startEmoteHunt } = require('../utils/emoteHunt');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emote-hunt')
    .setDescription('Start or reset the public Halloween emote hunt.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Start a hunt in the configured emote-hunt channel.'))
    .addSubcommand((sub) => sub
      .setName('reset')
      .setDescription('End the active hunt and start a fresh one in the hunt channel.')),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to manage the emote hunt.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const subcommand = interaction.options.getSubcommand();
    try {
      const result = await startEmoteHunt(interaction.client, { force: subcommand === 'reset' });
      if (!result.started) {
        if (result.reason === 'active') {
          return interaction.editReply(`A hunt is already active in <#${EMOTE_HUNT_CHANNEL_ID}>.`);
        }
        return interaction.editReply(`The next hunt is scheduled <t:${Math.ceil(result.nextAt / 1000)}:R> in <#${EMOTE_HUNT_CHANNEL_ID}>.`);
      }
      return interaction.editReply(`✅ Emote Hunt ${subcommand === 'reset' ? 'reset' : 'started'} in <#${EMOTE_HUNT_CHANNEL_ID}>.`);
    } catch (error) {
      console.error('[emote-hunt] failed to post hunt:', error);
      return interaction.editReply('❌ I could not post the hunt. Check the configured channel and bot permissions.');
    }
  },
};