const { Events } = require('discord.js');
const { joinHeist, recoverHeists } = require('../utils/halloweenHeist');

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('heist:join:')) return;
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({ content: 'Heists can only be joined in a server.', ephemeral: true });
    }
    if (interaction.user.bot) {
      return interaction.reply({ content: 'Bots cannot join the heist.', ephemeral: true });
    }

    const sessionId = interaction.customId.slice('heist:join:'.length);
    try {
      const result = await joinHeist(interaction.client, interaction, sessionId);
      if (result.joined) {
        return interaction.reply({ content: "🎃 You're in! Your heist begins when the timer ends.", ephemeral: true });
      }
      return interaction.reply({
        content: result.reason === 'duplicate'
          ? "🎃 You're already part of this heist!"
          : '⏳ Joining for this heist is closed.',
        ephemeral: true,
      });
    } catch (error) {
      console.error('[halloweenHeist] join failed:', error);
      const response = { content: '❌ I could not add you to the heist. Please try again.', ephemeral: true };
      if (interaction.deferred || interaction.replied) return interaction.followUp(response).catch(() => {});
      return interaction.reply(response).catch(() => {});
    }
  });

  const recover = () => recoverHeists(client).catch((error) => {
    console.error('[halloweenHeist] recovery failed:', error);
  });
  if (client.isReady()) recover();
  else client.once(Events.ClientReady, recover);
};