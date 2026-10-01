// events/emoteHuntGuess.js
// Listens for reactions on an active Emote Hunt message and checks them
// against the secretly-chosen target emote.
//
// NOTE: this requires the GuildMessageReactions intent and Message/Channel/
// Reaction partials enabled on the client — see the note in index.js.
const { Events, EmbedBuilder } = require('discord.js');
const EmoteHunt = require('../models/EmoteHunt');
const { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI } = require('../utils/halloweenPoints');
const { logEmoteHuntFound } = require('../utils/halloweenLog');
const { formatEmote } = require('../utils/halloweenEmotes');
const { isInfected } = require('../utils/halloweenInfection');

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
      if (!guildId) return;
      if (await isInfected(guildId, user.id)) return;

      const hunt = await EmoteHunt.findOne({
        guildId,
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
          `🎁 Reward: \`+${claimed.reward.toLocaleString()} Halloween Points\` ${HALLOWEEN_POINTS_EMOJI}\n\n` +
          `⚡ That was fast! Think you can beat them next round?\n` +
          `👻 Another hunt is coming soon...\n\n` +
          `🔗 [Jump to the hunt](${reaction.message.url})`
        );

      await reaction.message.reply({ embeds: [revealEmbed] }).catch(() => {});
    } catch (err) {
      console.error('[emoteHuntGuess] error:', err);
    }
  });

  console.log('[emoteHuntGuess] Ready – watching for correct Emote Hunt reactions');
};
