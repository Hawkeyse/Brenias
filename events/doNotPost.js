// events/doNotPost.js
// "Do Not Post" trap channel system.
//
// On startup: posts a red warning embed in the trap channel (no auto-delete).
// If a REGULAR user posts there:
//   1. Render a screenshot of the message, send it to logs
//   2. Delete the offending message
//   3. DM the user the security notice (must happen BEFORE the ban, since
//      Discord blocks DMs to banned users)
//   4. Ban the user, purging their messages from the last 2 hours server-wide
// If a MOD/STAFF (ManageGuild or ManageMessages perms) posts there instead:
//   - Message is left alone, no delete/ban/screenshot
//   - They just get trolled with a random joke DM

const { Events, EmbedBuilder, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { renderMessageScreenshot } = require('../utils/renderMessageScreenshot');

const DO_NOT_POST_CHANNEL_ID = '1518027024550199386';
const LOGS_CHANNEL_ID = '1366682681886244864';

const ALERT_EMOJI = '<a:943832alertastaff2000:1518032355573371040>';
const REDALERT_EMOJI = '<:13748redalert:1518032154528059462>';
const BANHAMMER_EMOJI = '<:3899banhammer:1518032351270146128>';

const TWO_HOURS_SECONDS = 2 * 60 * 60;

const SECURITY_DM = [
  '🔒 **Security Action Triggered**',
  "Your account posted a message in #do-not-post, a restricted security channel monitored for compromised accounts and unauthorized activity.",
  'As a result, your account has been permanently banned from the server.',
  'If you believe your account may have been compromised, secure your account immediately by changing your password, reviewing connected applications, and enabling two-factor authentication.',
  'If you believe this action was taken in error, contact the moderation team through the designated appeal process.'
].join('\n\n');

const MOD_TROLL_LINES = [
  'We hope your Wi-Fi disconnects during the final round.',
  'We hope your headphones catch on every doorknob.',
  'We hope your phone battery jumps from 20% to 1%.',
  'We hope your toast always lands butter-side down.',
  "We hope your game starts updating the moment you're ready to play.",
  'We hope your streaming service buffers during the best scene.',
  'We hope your alarm goes off on your day off.',
  'We hope your keyboard randomly double-types letters.',
  'We hope you pick the slowest checkout line every time.',
  'We hope your shopping cart has a squeaky wheel.',
  'We hope your sleeves slide down right after you wash your hands.',
  'We hope your fitted sheet comes off the mattress every night.',
  'We hope you forget your password right after changing it.',
  'We hope your autocorrect changes the one word you needed.',
  'We hope your favorite song gets interrupted by an ad.',
  'We hope your USB only plugs in on the third try.',
  'We hope your cereal runs out before the milk.',
  "We hope your milk runs out after you've poured the cereal.",
  'We hope every traffic light turns yellow just before you reach it.',
  'We hope your shoelaces come untied at the worst possible moment.',
  'We hope your ice cream melts faster than expected.',
  'We hope you step in a puddle while wearing fresh socks.',
  'We hope your blanket is always just a little too short.',
  'We hope your elevator stops on every floor.',
  "We hope your video freezes when it's your turn to speak.",
  'We hope your favorite item is always out of stock.',
  'We hope your package arrives one day later than expected.',
  'We hope you get a popcorn kernel stuck in your teeth.',
  'We hope your pen works only after aggressive scribbling.',
  'We hope your browser crashes before you hit save.'
];

function buildWarningEmbed() {
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`${ALERT_EMOJI} Do Not Post in This Channel`)
    .setDescription(
      `Do not post anything in this channel, including text, images, videos, links, or other media.\n\n` +
      `${REDALERT_EMOJI} This channel is used to identify compromised accounts and unauthorized activity.`
    );
}

function buildModTrollEmbed() {
  const line = MOD_TROLL_LINES[Math.floor(Math.random() * MOD_TROLL_LINES.length)];
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setDescription(
      `${line}\n\n${BANHAMMER_EMOJI} Any account that posts here will automatically receive a 1-week ban.`
    );
}

module.exports = (client) => {
  // ── Startup warning post ────────────────────────────────────────────
  // NOTE: This file is loaded from inside index.js's ClientReady handler,
  // which means the 'ready' event has already fired by the time we get
  // here — client.once(Events.ClientReady, ...) would never trigger.
  // Since client.isReady() is true at this point, post immediately instead.
  const postStartupWarning = async () => {
    try {
      const channel = await client.channels.fetch(DO_NOT_POST_CHANNEL_ID).catch(() => null);
      if (!channel) {
        console.error('[doNotPost] Channel not found, skipping startup post.');
        return;
      }
      await channel.send({ embeds: [buildWarningEmbed()] });
      console.log('[doNotPost] Startup warning posted.');
    } catch (err) {
      console.error('[doNotPost] Failed to post startup warning:', err);
    }
  };

  if (client.isReady()) {
    postStartupWarning();
  } else {
    client.once(Events.ClientReady, postStartupWarning);
  }

  // ── Message watcher ──────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    if (message.channel.id !== DO_NOT_POST_CHANNEL_ID) return;
    if (message.author.bot) return;

    const member = message.member;
    const isMod = member?.permissions?.has(PermissionsBitField.Flags.ManageGuild) ||
                  member?.permissions?.has(PermissionsBitField.Flags.ManageMessages);

    // ── Mod/staff path: troll DM only, leave message alone ──────────
    if (isMod) {
      try {
        await message.author.send({ embeds: [buildModTrollEmbed()] });
      } catch (err) {
        console.warn(`[doNotPost] Could not DM mod ${message.author.tag} (DMs likely closed).`);
      }
      return;
    }

    // ── Regular user path: screenshot, delete, DM, ban ───────────────
    const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);

    try {
      const attachmentURLs = message.attachments.map(a => a.url);

      const screenshotBuffer = await renderMessageScreenshot({
        username: message.author.tag,
        avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
        content: message.content || '(no text content)',
        timestamp: message.createdAt,
        attachmentURLs
      });

      if (logsChannel) {
        const screenshotAttachment = new AttachmentBuilder(screenshotBuffer, { name: 'evidence.png' });

        const logEmbed = new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🔒 Do Not Post Violation')
          .setDescription(
            `**User:** ${message.author} (${message.author.tag})\n` +
            `**User ID:** ${message.author.id}\n` +
            `**Channel:** ${message.channel}\n` +
            `**Action:** Permanent ban issued, message deleted, last 2hrs of messages purged`
          )
          .setImage('attachment://evidence.png')
          .setTimestamp();

        const files = [screenshotAttachment];
        // Attach original attachments too if any (best-effort, may fail if expired/huge)
        for (const url of attachmentURLs.slice(0, 9)) {
          files.push(url);
        }

        await logsChannel.send({ embeds: [logEmbed], files }).catch(async (err) => {
          console.error('[doNotPost] Failed to send full log with attachments, retrying without them:', err);
          await logsChannel.send({ embeds: [logEmbed], files: [screenshotAttachment] }).catch(() => {});
        });
      }
    } catch (err) {
      console.error('[doNotPost] Screenshot/log step failed:', err);
    }

    // Delete the offending message
    await message.delete().catch(err => console.error('[doNotPost] Failed to delete message:', err));

    // DM the user BEFORE banning (Discord blocks DMs after ban takes effect)
    try {
      await message.author.send(SECURITY_DM);
    } catch (err) {
      console.warn(`[doNotPost] Could not DM ${message.author.tag} before ban (DMs likely closed).`);
    }

    // Ban the user, purging their messages from the last 2 hours across the server
    try {
      await message.guild.members.ban(message.author.id, {
        deleteMessageSeconds: TWO_HOURS_SECONDS,
        reason: 'Posted in restricted #do-not-post security channel'
      });
      console.log(`[doNotPost] Banned ${message.author.tag} (${message.author.id}) for posting in trap channel.`);
    } catch (err) {
      console.error('[doNotPost] Failed to ban user:', err);
    }
  });

  console.log('[doNotPost] Ready – monitoring trap channel');
};