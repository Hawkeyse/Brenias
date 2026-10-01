const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  history: [
    {
      role: String, // "user" or "assistant"
      content: String
    }
  ]
});

module.exports = mongoose.models.AIChat || mongoose.model('AIChat', chatSchema);