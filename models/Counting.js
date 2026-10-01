// models/Counting.js (Updated: Add lastUserId for Consecutive User Prevention)
const mongoose = require('mongoose');

const CountingSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  expectedCount: { type: Number, default: 1 },
  lastUserId: { type: String, default: null }, // Tracks last successful user to prevent consecutive
  userChances: { type: Map, of: Number, default: {} }, // userId -> chances used (0-3)
});

module.exports = mongoose.models.Counting || mongoose.model('Counting', CountingSchema);