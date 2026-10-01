const mongoose = require('mongoose');

const trickOrTreatSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  day: { type: String, required: true },
  choice: { type: String, enum: ['trick', 'treat'], required: true },
  outcome: { type: String, default: 'pending' },
  amount: { type: Number, default: 0 },
}, { timestamps: true });

trickOrTreatSchema.index({ guildId: 1, userId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('HalloweenTrickOrTreat', trickOrTreatSchema);