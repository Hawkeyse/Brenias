const { Events } = require('discord.js');
const {
  STARTER_BONUS_POINTS,
  STARTER_BONUS_BUTTON_ID,
  buildStarterBonusComponents,
  claimStarterBonus,
  getStarterBonusClaimCount,
} = require('../utils/halloweenStarterBonus');

const countRefreshes = new Map();

async function refreshClaimCount(message, guildId) {
  const previous = countRefreshes.get(message.id) || Promise.resolve();
  const refresh = previous
    .catch(() => {})
    .then(async () => {
      const count = await getStarterBonusClaimCount(guildId);
      await message.edit({ components: buildStarterBonusComponents(count) });
    });
  countRefreshes.set(message.id, refresh);
  try {
    await refresh;
  } finally {
    if (countRefreshes.get(message.id) === refresh) countRefreshes.delete(message.id);
  }
}

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== STARTER_BONUS_BUTTON_ID) return;
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: 'This bonus can only be claimed in a server.', ephemeral: true });
    }
    if (interaction.user.bot) {
      return interaction.reply({ content: 'Bots cannot claim the starter bonus.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await claimStarterBonus(interaction.guild.id, interaction.user.id);
      await refreshClaimCount(interaction.message, interaction.guild.id).catch((error) => {
        console.error('[halloweenStarterBonus] count refresh failed:', error.message);
      });

      if (!result.claimed) {
        return interaction.editReply('You have already claimed the Halloween starter bonus.');
      }

      return interaction.editReply(
        `🎁 You claimed **${STARTER_BONUS_POINTS} Halloween Points**! Your new balance is **${result.balance.toLocaleString()}**.`
      );
    } catch (error) {
      console.error('[halloweenStarterBonus] claim failed:', error);
      return interaction.editReply('❌ I could not process your bonus claim. Please try again.');
    }
  });
};