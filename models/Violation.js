const mongoose = require('mongoose');

module.exports = mongoose.model('Violation', new mongoose.Schema({
  userId: String,
  guildId: String,
  violations: { type: Number, default: 0 },
  punishmentLevel: { type: Number, default: 0 },
  lastViolation: { type: Date, default: Date.now }
}));