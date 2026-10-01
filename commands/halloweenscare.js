// commands/halloweenscare.js
// /halloween-scare test    — staff: fire a scare GIF right now in this channel
// /halloween-scare status  — staff: see what's set up (GIPHY, chance, cooldowns)
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const {
  SCARE_CHANCE,
  GUILD_COOLDOWN_MS,
  CHANNEL_COOLDOWN_MS,
  DELETE_AFTER_MS,
  GIPHY_RATING,
  GIPHY_SEARCH_TERMS,
  giphyReady,
  listBackupSources,
  isHalloweenOn,
  sendScare,
} = require('../utils/halloweenScare');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-scare')
    .setDescription('Halloween jump-scare GIFs (staff only).')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('test')
      .setDescription('Send a scare GIF in this channel right now (ignores cooldowns).'))
    .addSubcommand((sub) => sub
      .setName('status')
      .setDescription('Show how the scares are set up.')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.editReply({
        embeds: [simpleEmbed('❌ Only staff (Manage Server) can use this.', COLORS.error)],
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const backups = listBackupSources().length;
      const on = await isHalloweenOn();
      return interaction.editReply({
        embeds: [simpleEmbed(
          `**Scares:** ${on ? '🟢 on' : '🔴 off'} (follows \`/halloween-mode\`)\n` +
          `**GIPHY:** ${giphyReady() ? '✅ key set' : '❌ no `GIPHY_API_KEY` in .env'} ` +
          `· rating ${GIPHY_RATING} · ${GIPHY_SEARCH_TERMS.length} search terms\n` +
          `**Backup GIFs:** ${backups}\n` +
          `**Chance:** ${(SCARE_CHANCE * 100).toFixed(1)}% per message\n` +
          `**Cooldowns:** 1 per server every ${Math.round(GUILD_COOLDOWN_MS / 60000)} min, ` +
          `1 per channel every ${Math.round(CHANNEL_COOLDOWN_MS / 60000)} min\n` +
          `**Deletes after:** ${DELETE_AFTER_MS / 1000}s`
        )],
      });
    }

    // sub === 'test'
    const result = await sendScare(interaction.channel, { force: true });
    return interaction.editReply({
      embeds: [simpleEmbed(
        result.ok
          ? `👻 Scare sent — it'll vanish in ${DELETE_AFTER_MS / 1000}s.`
          : `❌ ${result.reason}`,
        result.ok ? COLORS.success : COLORS.error
      )],
    });
  },
};
