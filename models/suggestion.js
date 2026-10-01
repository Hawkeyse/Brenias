// models/suggestion.js (Minor: Added status field for future-proofing)
const mongoose = require('mongoose');

module.exports = mongoose.model('Suggestion', new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g., timestamp or UUID
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  messageId: { type: String, required: true }, // ID of the suggestion message in channel
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  voters: { type: Map, of: String, default: {} }, // userId -> 'up' or 'down'
  threadId: { type: String, default: null }, // ID of the discussion thread
  status: { type: String, default: 'open' }, // Optional: 'open', 'considering', 'implemented', 'denied'
  createdAt: { type: Date, default: Date.now },
}));