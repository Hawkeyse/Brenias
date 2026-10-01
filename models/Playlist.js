// models/Playlist.js - Mongoose model for user playlists (adapted from music bot)
const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  name: { type: String, required: true },
  tracks: [{ type: Object, default: [] }], // Array of track objects { title, author, url, duration }
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Playlist', playlistSchema);