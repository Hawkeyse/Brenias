// events/halloweenShop.js
// Handles every button + dropdown in the Halloween Shop and runs the timer
// that removes expired roles. Auto-loaded by loadEvents() in index.js.
//
// Flow (all replies are private — only the person who clicked sees them):
//   tap a role button  → confirm screen → [✅ Confirm] → bought
//   tap a lantern      → picked instantly (free, swap any time)
//   tap 💰 My Shop      → points + your roles and when they expire
//   tap 🎨 Roles        → dropdown to choose which owned roles you wear
//                         (wear just one to control your name color)
const { Events } = require('discord.js');
const cfg = require('../utils/halloweenShopConfig');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');
const {
  shopItems,
  buildShopView,
  buildRolesView,
  buildConfirmView,
  buildCureConfirmView,
  purchaseRole,
  purchaseCure,
  setWornRoles,
  claimFreeRole,
  sweepExpired,
} = require('../utils/halloweenShop');

// Stops a double-click from being processed twice at the same time.
const processing = new Set();

// Result message on top of the "My Shop" summary (keeps the 🎨 Roles button).
async function resultPayload(interaction, result) {
  const view = await buildShopView(interaction.guild.id, interaction.user.id);
  return {
    embeds: [simpleEmbed(result.text, result.ok ? COLORS.success : COLORS.error), ...view.embeds],
    components: view.components,
  };
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const id = interaction.customId;
    if (!id.startsWith('halloween-shop-')) return;
    if (!interaction.inGuild() || !interaction.guild) return;

    const guild = interaction.guild;
    const userId = interaction.user.id;
    const lockKey = `${guild.id}-${userId}`;

    if (processing.has(lockKey)) {
      return interaction
        .reply({ embeds: [simpleEmbed('⏳ Still processing your last click, hang on!', COLORS.warning)], ephemeral: true })
        .catch(() => {});
    }
    processing.add(lockKey);

    try {
      // ── dropdown on the PRIVATE roles screen → wear the chosen roles ──
      if (interaction.isStringSelectMenu()) {
        if (id === 'halloween-shop-wear') {
          await interaction.deferUpdate();
          const member = await guild.members.fetch(userId);
          const result = await setWornRoles(guild, member, interaction.values);
          return await interaction.editReply(await resultPayload(interaction, result));
        }
        return;
      }

      // ── buttons on the PUBLIC panel → each opens a private reply ──────
      if (id === 'halloween-shop-me') {
        await interaction.deferReply({ ephemeral: true });
        return await interaction.editReply(await buildShopView(guild.id, userId));
      }

      if (id === 'halloween-shop-cure') {
        await interaction.deferReply({ ephemeral: true });
        return await interaction.editReply(await buildCureConfirmView(guild.id, userId));
      }

      if (id === 'halloween-shop-infect') {
        await interaction.deferReply({ ephemeral: true });
        return await interaction.editReply({
          embeds: [simpleEmbed(
            `🧟 Infect another member for **${cfg.INFECTION_PRICE.toLocaleString()}** Halloween Points.\n\n` +
            'Use `/infect user:@member` to choose who gets infected. The infection lasts one hour.',
            COLORS.info
          )],
        });
      }

      if (id.startsWith('halloween-shop-item:')) {
        await interaction.deferReply({ ephemeral: true });
        const item = shopItems().find((i) => i.key === id.split(':')[1]);
        if (!item) {
          return await interaction.editReply({
            embeds: [simpleEmbed("That role isn't in the shop anymore.", COLORS.error)],
          });
        }
        return await interaction.editReply(await buildConfirmView(guild.id, userId, item));
      }

      if (id.startsWith('halloween-shop-free:')) {
        await interaction.deferReply({ ephemeral: true });
        const member = await guild.members.fetch(userId);
        const result = await claimFreeRole(guild, member, id.split(':')[1]);
        return await interaction.editReply(await resultPayload(interaction, result));
      }

      // ── buttons on PRIVATE screens → edit that screen in place ────────
      if (id === 'halloween-shop-roles') {
        await interaction.deferUpdate();
        const member = await guild.members.fetch(userId);
        return await interaction.editReply(await buildRolesView(guild, member));
      }

      if (id.startsWith('halloween-shop-confirm:')) {
        await interaction.deferUpdate();
        const member = await guild.members.fetch(userId);
        const result = await purchaseRole(guild, member, id.split(':')[1]);
        return await interaction.editReply(await resultPayload(interaction, result));
      }

      if (id === 'halloween-shop-cure-confirm') {
        await interaction.deferUpdate();
        const member = await guild.members.fetch(userId);
        const result = await purchaseCure(guild, member);
        return await interaction.editReply(await resultPayload(interaction, result));
      }

      if (id === 'halloween-shop-cancel') {
        await interaction.deferUpdate();
        return await interaction.editReply({
          embeds: [simpleEmbed('Cancelled — no points were spent.', COLORS.info)],
          components: [],
        });
      }
    } catch (err) {
      console.error('[halloweenShop] interaction error:', err);
      const payload = {
        embeds: [simpleEmbed('❌ Something went wrong. Try again in a moment.', COLORS.error)],
        components: [],
      };
      if (interaction.deferred || interaction.replied) interaction.editReply(payload).catch(() => {});
      else interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
    } finally {
      processing.delete(lockKey);
    }
  });

  // Remove expired roles: once shortly after startup, then on a timer.
  setTimeout(() => sweepExpired(client), 20 * 1000);
  setInterval(() => sweepExpired(client), cfg.SWEEP_INTERVAL_MS);
};
