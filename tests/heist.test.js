const assert = require('node:assert');
const { buildResultEmbed } = require('../utils/halloweenHeist');

const embed = buildResultEmbed({
  userId: '1234567890',
  story: 'I slipped through the vault and grabbed the glowing coin before the ghost guards noticed.',
  outcome: 'escape',
  points: 180,
});

assert.ok(embed && Array.isArray(embed.embeds) && embed.embeds.length === 1);
assert.ok(embed.embeds[0].data.description.includes('glowing coin'));
assert.ok(!/\b(Heist Success|Heist Failed|Win|Loss)\b/i.test(embed.embeds[0].data.description || ''));
console.log('heist embed test passed');
