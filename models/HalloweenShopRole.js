// models/HalloweenShopRole.js
// One document per (guild, user, role) that was bought/claimed from the
// Halloween Shop. The expiry sweep in events/halloweenShop.js uses
// `expiresAt` to remove the Discord role when time runs out — so roles
// still expire correctly even if the bot restarts.
const mongoose = require('mongoose');

const halloweenShopRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  roleId: { type: String, required: true },
  itemKey: { type: String, required: true },
  free: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

halloweenShopRoleSchema.index({ guildId: 1, userId: 1, roleId: 1 }, { unique: true });
halloweenShopRoleSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('HalloweenShopRole', halloweenShopRoleSchema);
