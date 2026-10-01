// models/HalloweenConfig.js
// Singleton config doc (bot avatar is application-wide, not per-guild,
// so there's only ever one of these — key stays fixed at 'global').
const mongoose = require('mongoose');

const halloweenConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  enabled: { type: Boolean, default: false },
  // Backup of the pre-halloween avatar URL, saved the first time mode is
  // enabled. The local assets/halloween/pfp-original.png file is the
  // primary source of truth for reverting — this is just a fallback record.
  originalAvatarURL: { type: String, default: null },
});

module.exports = mongoose.model('HalloweenConfig', halloweenConfigSchema);