// utils/halloweenPoints.js
// Single shared helper for awarding Halloween Points, so every game
// (Puzzle, Boss, Emote Hunt, and anything added later) goes through one
// place instead of each reimplementing the same $inc query.
const User = require('../models/User');
const HALLOWEEN_POINTS_EMOJI = '<:687657pumpkin:1549044780863070258>';

async function addHalloweenPoints(guildId, userId, amount) {
  if (!amount) return null;
  return User.findOneAndUpdate(
    { guildId, userId },
    { $inc: { halloweenPoints: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI };
