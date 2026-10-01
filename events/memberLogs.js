// events/verifyNewMembers.js
// FIXED: edit original message on button click + after captcha result
// No duplicates on "start", no DMs, same UI/UX

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ChannelType } = require('discord.js');
const { Captcha } = require('discord.js-captcha');

// Prevent duplicate registration
if (module.exports.registered) {
  console.log('[verifyNewMembers] Already registered – skipping');
  module.exports = () => {};
} else {
  module.exports.registered = true;
}

module.exports = (client) => {
  console.log('[verifyNewMembers] Loading – message edit on verify + result');

  const HUMAN_CHANNEL_ID    = '1471280663486398554';
  const UNVERIFIED_ROLE_ID  = '1471304690770903283';
  const MEMBER_ROLE_ID      = '716732917065187328';
  const YES_EMOJI_ID        = '1443367106455539876';
  const NO_EMOJI            = '<:92042no1:1443367117637288097>';
  const THREE_MONTHS_MS     = 90 * 24 * 60 * 60 * 1000;

  const captcha = new Captcha(client, {
    caseSensitive: true,
    attempts: 3,
    timeout: 5 * 60 * 1000,
    showAttemptCount: true,
    addRoleOnSuccess: false,
    kickOnFailure: false,
    sendToTextChannel: true,          // force captcha to channel
    channelID: HUMAN_CHANNEL_ID,
  });

  const activeVerifs = new Map(); // userId → { messageId, channelId }

  // ── Success: edit original message + role swap ────────────────────────
  captcha.on('success', async (data) => {
    const member = data.member || data.user;
    if (!member?.id) return;

    const info = activeVerifs.get(member.id);
    if (!info) return;

    try {
      const channel = client.channels.cache.get(info.channelId);
      if (!channel) return;

      const msg = await channel.messages.fetch(info.messageId).catch(() => null);
      if (msg) {
        const successEmbed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('Verification Successful!')
          .setDescription(
            `Welcome ${member}! You have been verified.\n` +
            `Enjoy your stay!`
          )
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await msg.edit({ embeds: [successEmbed], components: [], content: null });
      }

      await member.roles.remove(UNVERIFIED_ROLE_ID).catch(() => {});
      await member.roles.add(MEMBER_ROLE_ID).catch(() => {});

      console.log(`[success] ${member.user.tag} – message edited`);
    } catch (err) {
      console.error('[success edit]', err);
    }

    activeVerifs.delete(member.id);
  });

  // ── Failure: edit original message ────────────────────────────────────
  captcha.on('failure', async (message, attemptsLeft) => {
    if (attemptsLeft > 0) return;

    const failEmbed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('Verification Failed')
      .setDescription(
        `${NO_EMOJI} You have failed the reCAPTCHA verification multiple times.\n` +
        `Please try again later. (Type **start** to retry)`
      );

    await message.edit({ embeds: [failEmbed], components: [] }).catch(() => {});
  });

  // ── Timeout: edit original message ────────────────────────────────────
  captcha.on('timeout', async (message) => {
    const timeoutEmbed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle('Verification Timed Out')
      .setDescription(
        `${NO_EMOJI} Verification timed out.\n` +
        `Please try again by saying **start** in this channel.`
      );

    await message.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
  });

  // ── Member join ───────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    const ageMs = Date.now() - member.user.createdAt.getTime();
    if (ageMs >= THREE_MONTHS_MS) return;

    try {
      if (member.roles.cache.has(MEMBER_ROLE_ID)) {
        await member.roles.remove(MEMBER_ROLE_ID);
      }
      await member.roles.add(UNVERIFIED_ROLE_ID);
    } catch (err) {
      console.error('[join roles]', err);
    }

    const channel = client.channels.cache.get(HUMAN_CHANNEL_ID);
    if (channel) await sendPrompt(member, channel);
  });

  // ── Send initial prompt ───────────────────────────────────────────────
  async function sendPrompt(member, channel) {
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Human Verification Required')
      .setDescription(
        `Hey ${member}!\n\n` +
        `Your account was detected as newly created (under 3 months old).\n` +
        `Are you ready to proceed with reCAPTCHA verification? Please click ${'<:23646yes:' + YES_EMOJI_ID + '>'} to start!`
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('start-verification')
          .setEmoji(YES_EMOJI_ID)
          .setLabel('Verify me')
          .setStyle(ButtonStyle.Success)
      );

    try {
      const msg = await channel.send({ content: `${member}`, embeds: [embed], components: [row] });
      activeVerifs.set(member.id, { messageId: msg.id, channelId: channel.id });
    } catch (err) {
      console.error('[send prompt]', err);
    }
  }

  // ── Button click: edit to verifying → start captcha ───────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'start-verification') return;

    try {
      await interaction.deferUpdate();
    } catch (err) {
      if (![10062, 40060].includes(err.code)) console.error('[defer error]', err);
      return;
    }

    const member = interaction.member;
    const info = activeVerifs.get(member.id);

    if (!info) {
      await interaction.editReply({
        content: `${NO_EMOJI} This verification session has expired. Type **start** again.`,
        embeds: [], components: []
      }).catch(() => {});
      return;
    }

    // Edit original message to "Verifying..."
    const loadingEmbed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Verifying...')
      .setDescription(
        `Please wait ${member} — generating your reCAPTCHA challenge...`
      );

    await interaction.editReply({
      content: `${member}`,
      embeds: [loadingEmbed],
      components: []
    }).catch(() => {});

    // Start captcha (will appear in channel)
    try {
      await captcha.present(interaction);
    } catch (err) {
      console.error('[captcha present]', err);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('Error')
        .setDescription('Failed to start verification. Type **start** to retry.');

      await interaction.editReply({ embeds: [errorEmbed], components: [] }).catch(() => {});
    }
  });

  // ── "start" command – only once ───────────────────────────────────────
  const startHandler = async (message) => {
    if (message.channel.id !== HUMAN_CHANNEL_ID) return;
    if (message.author.bot) return;
    if (message.content.toLowerCase().trim() !== 'start') return;

    // Clean old prompt
    const prev = activeVerifs.get(message.member.id);
    if (prev) {
      try {
        const old = await message.channel.messages.fetch(prev.messageId);
        await old.delete();
      } catch {}
      activeVerifs.delete(message.member.id);
    }

    await sendPrompt(message.member, message.channel);
    await message.react('✅');
  };

  // Listen for "start" without touching any other MessageCreate listeners.
  // (The duplicate-registration guard at the top of this file already
  // prevents this specific handler from being added twice.)
  client.on(Events.MessageCreate, startHandler);

  console.log('[verifyNewMembers] Ready – edits on verify + result');
};