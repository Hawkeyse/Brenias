const mongoose = require('mongoose');

module.exports = mongoose.model('AutomodConfig', new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  badWords: { type: [String], default: [] },
  badWordsEnabled: { type: Boolean, default: false },
  spamEnabled: { type: Boolean, default: true },
  spamThreshold: { type: Number, default: 5 },
  spamWindow: { type: Number, default: 10 }, // Seconds
  linkEnabled: { type: Boolean, default: true },
  linkWhitelist: { type: [String], default: ['discord.com', 'youtube.com', 'imgur.com', 'twitch.tv'] },
}));