// events/emoteHuntGuess.js
// Listens for reactions on an active Emote Hunt message and checks them
// against the secretly-chosen target emote.
//
// NOTE: this requires the GuildMessageReactions intent and Message/Channel/
// Reaction partials enabled on the client — see the note in index.js.
const { Events, EmbedBuilder } = require('discord.js');
const EmoteHunt = require('../models/EmoteHunt');
const { addHalloweenPoints } = require('../utils/halloweenPoints');
const { logEmoteHuntFound } = require('../utils/halloweenLog');
const { formatEmote } = require('../utils/halloweenEmotes');
const { EMOTE_HUNT_CHANNEL_ID } = require('../utils/emoteHunt');

module.exports = (client) => {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user.bot) return;

      // Reactions on messages not in the cache arrive as partials.
      if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
      }
      if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
      }

      const guildId = reaction.message.guild?.id;
      const channel = reaction.message.channel;
      if (!guildId || channel.id !== EMOTE_HUNT_CHANNEL_ID) return;

      const hunt = await EmoteHunt.findOne({
        guildId,
        channelId: channel.id,
        messageId: reaction.message.id,
        active: true,
      });
      if (!hunt) return;

      if (reaction.emoji.id !== hunt.targetEmojiId) return; // wrong guess, ignore

      // Atomically claim it so two simultaneous correct reactions can't
      // both win.
      const claimed = await EmoteHunt.findOneAndUpdate(
        { _id: hunt._id, active: true },
        { active: false, winnerId: user.id, endedAt: new Date() },
        { new: true }
      );
      if (!claimed) return; // someone else's reaction landed first

      await addHalloweenPoints(claimed.guildId, user.id, claimed.reward);
      await logEmoteHuntFound(client, {
        userId: user.id,
        emoteName: claimed.targetEmojiName,
        points: claimed.reward,
        url: reaction.message.url,
      });

      const foundEmote = formatEmote({
        name: claimed.targetEmojiName,
        id: claimed.targetEmojiId,
        animated: claimed.targetAnimated,
      });

      const revealEmbed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🎃 EMOTE HUNT COMPLETE! 👻')
        .setDescription(
          `We have a winner!\n\n` +
          `🏆 ${user} was the first person to find the hidden ${foundEmote} emote!\n` +
          `🎁 Reward: \`+${claimed.reward.toLocaleString()} Halloween Points\` 🎃\n\n` +
          `⏰ The next emote hunt starts in 2 hours.\n\n` +
          `🔗 [Jump to the hunt](${reaction.message.url})`
        );

      await channel.send({
        embeds: [revealEmbed],
        allowedMentions: { users: [user.id] },
      }).catch(() => {});
    } catch (err) {
      console.error('[emoteHuntGuess] error:', err);
    }
  });

  console.log('[emoteHuntGuess] Ready – watching for correct Emote Hunt reactions');
};
