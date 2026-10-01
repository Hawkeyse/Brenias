const mongoose = require('mongoose');

const trickOrTreatSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  day: { type: String, required: true },
  uses: { type: Number, default: 0 },
  lastOutcome: { type: String, default: null },
  lastAmount: { type: Number, default: 0 },
}, { timestamps: true });

trickOrTreatSchema.index({ guildId: 1, userId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('HalloweenTrickOrTreat', trickOrTreatSchema);