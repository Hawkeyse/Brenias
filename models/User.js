// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  halloweenPoints: { type: Number, default: 0 },
  candy: { type: Number, default: 0 },
  inventory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  starterBonusClaimed: { type: Boolean, default: false },
  lastHeistAwardId: { type: String, default: null },
});

// Make sure one user document per person per server
userSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);