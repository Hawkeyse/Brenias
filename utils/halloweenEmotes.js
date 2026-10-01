// utils/halloweenEmotes.js
// Pool of custom Halloween emotes Emote Hunt picks a random target from.
// Add more entries here any time — nothing else needs to change.
const EMOTE_POOL = [
  { name: '623778ghost', id: '1549040963886915624', animated: false },
  { name: '31339bat', id: '1549040935134953642', animated: true },
  { name: '2495frankeinstein', id: '1549040889337348236', animated: false },
  { name: '97026spiderweb', id: '1549040953346621531', animated: true },
  { name: '980162tongue', id: '1549044812651565150', animated: false },
  { name: '78793vampirebunny', id: '1554600378287259688', animated: false },
];

function formatEmote(emote) {
  return `<${emote.animated ? 'a' : ''}:${emote.name}:${emote.id}>`;
}

module.exports = { EMOTE_POOL, formatEmote };
