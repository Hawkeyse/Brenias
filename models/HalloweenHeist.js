const mongoose = require('mongoose');

const heistParticipantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  outcome: { type: String, enum: ['escape', 'caught'], default: null },
  points: { type: Number, default: 0 },
  story: { type: String, default: null },
  rewardApplied: { type: Boolean, default: false },
  resultSent: { type: Boolean, default: false },
  processed: { type: Boolean, default: false },
}, { _id: false });

const halloweenHeistSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  sessionId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['joining', 'processing', 'finished', 'cancelled'], required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  map: { type: String, required: true },
  title: { type: String, required: true },
  joinEndsAt: { type: Date, required: true },
  participants: { type: [heistParticipantSchema], default: [] },
  nextParticipantIndex: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
});

halloweenHeistSchema.index({ status: 1, joinEndsAt: 1 });

module.exports = mongoose.model('HalloweenHeist', halloweenHeistSchema);