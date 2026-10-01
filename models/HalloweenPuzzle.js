// models/HalloweenPuzzle.js
const mongoose = require('mongoose');

const halloweenPuzzleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  number: { type: Number, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true }, // stored as typed; compared lowercase/trimmed
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  reward: { type: Number, default: 500 },
  solved: { type: Boolean, default: false },
  solvedBy: { type: String, default: null },
  postedAt: { type: Date, default: Date.now },
});

halloweenPuzzleSchema.index({ guildId: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('HalloweenPuzzle', halloweenPuzzleSchema);