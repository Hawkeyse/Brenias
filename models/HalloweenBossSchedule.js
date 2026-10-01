// models/HalloweenBossSchedule.js
// One doc per guild, configuring the automatic daily Boss post.
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  hour: { type: Number, default: 18 },   // UTC hour, 0-23
  minute: { type: Number, default: 0 },  // 0-59
  hp: { type: Number, default: 50000 },
  channelId: { type: String, default: null }, // null = fall back to the default boss channel
  // 'YYYY-MM-DD' (UTC) of the last auto-post, so the scheduler doesn't
  // double-post if it checks again within the same minute/day.
  lastPostedDate: { type: String, default: null },
});

module.exports = mongoose.model('HalloweenBossSchedule', scheduleSchema);
