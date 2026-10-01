// models/Favorite.js - Mongoose model for user favorites (adapted from music bot)
const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  tracks: [{ type: Object, default: [] }], // Array of track objects
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Favorite', favoriteSchema);