// models/HalloweenBoss.js
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  damage: { type: Number, default: 0 },
  attackCount: { type: Number, default: 0 },
  lastAttackAt: { type: Date, default: null },
  // Damage tier thresholds (see DAMAGE_TIERS in utils/halloweenBoss.js) this
  // user has already been paid out for, so re-crossing them on a later
  // attack doesn't double-pay.
  tiersClaimed: { type: [Number], default: [] },
}, { _id: false });

const halloweenBossSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  name: { type: String, default: 'The Stone Golem' },
  // Which portrait pair to use — key into BOSS_SKINS in utils/halloweenBoss.js.
  skin: { type: String, default: 'golem' },
  maxHP: { type: Number, required: true },
  currentHP: { type: Number, required: true },
  active: { type: Boolean, default: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  participants: { type: [participantSchema], default: [] },
});

// Guards against more than one active boss per guild at a time (enforced in
// command logic, not a unique index, since "active" needs to go back to
// false rather than the doc being deleted when a fight ends).
halloweenBossSchema.index({ guildId: 1, active: 1 });

module.exports = mongoose.model('HalloweenBoss', halloweenBossSchema);
