// models/EmoteHunt.js
const mongoose = require('mongoose');

const emoteHuntSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  announcementChannelId: { type: String, default: null },
  announcementMessageId: { type: String, default: null },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  targetEmojiId: { type: String, required: true },
  targetEmojiName: { type: String, required: true },
  targetAnimated: { type: Boolean, default: false },
  reward: { type: Number, default: 500 },
  active: { type: Boolean, default: true },
  winnerId: { type: String, default: null },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
});

// Only one active hunt per guild at a time (enforced in command logic).
emoteHuntSchema.index({ guildId: 1, active: 1 });

module.exports = mongoose.model('EmoteHunt', emoteHuntSchema);
