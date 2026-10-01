// commands/halloweenshop.js
// /halloween-shop open  — anyone: see your points and shop roles (private)
// /halloween-shop post  — staff: posts the public shop panel (banner + one button per role)
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { buildPanel, buildShopView, arrangeRoleHierarchy } = require('../utils/halloweenShop');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('halloween-shop')
    .setDescription('Halloween Shop — spend your Halloween Points on temporary roles.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub
      .setName('open')
      .setDescription('See your points and shop roles (only you can see it).'))
    .addSubcommand((sub) => sub
      .setName('post')
      .setDescription('Post the shop panel in this channel (staff only).')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'post') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.editReply({
          embeds: [simpleEmbed('❌ Only staff (Manage Server) can post the shop panel.', COLORS.error)],
        });
      }
      await arrangeRoleHierarchy(interaction.guild);
      const { bannerMissing, ...panel } = buildPanel();
      await interaction.channel.send(panel);
      return interaction.editReply({
        embeds: [simpleEmbed(
          bannerMissing
            ? '⚠️ Panel posted, but **shop.png** wasn\'t found — put it in `Assets/halloween/shop.png` and post again.'
            : '✅ Shop panel posted in this channel.',
          bannerMissing ? COLORS.warning : COLORS.success
        )],
      });
    }

    // sub === 'open'
    return interaction.editReply(await buildShopView(interaction.guild.id, interaction.user.id));
  },
};
