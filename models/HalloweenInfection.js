const mongoose = require('mongoose');

const halloweenInfectionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  infectedBy: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

halloweenInfectionSchema.index({ guildId: 1, userId: 1 }, { unique: true });
halloweenInfectionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('HalloweenInfection', halloweenInfectionSchema);
