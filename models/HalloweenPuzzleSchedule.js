const mongoose = require('mongoose');

const halloweenPuzzleScheduleSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  nextPostAt: { type: Date, default: null },
  lastPostedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('HalloweenPuzzleSchedule', halloweenPuzzleScheduleSchema);