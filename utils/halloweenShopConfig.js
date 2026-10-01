// utils/halloweenShopConfig.js
// Everything you'd want to tweak about the Halloween Shop lives here —
// prices, durations, limits, and the role list. No other file needs editing
// to add/remove/reprice a role.

const DEFAULT_PRICE = 1000;        // Halloween Points, used when an item has no `price`
const DEFAULT_DURATION_DAYS = 7;   // how long one purchase lasts. Each role can only be bought once while you still own it.
const CURE_PRICE = 500;             // Halloween Points for the one-use infection cure
const INFECTION_PRICE = 600;         // Halloween Points to infect another member

// Everything expires at this moment no matter when it was bought.
// 2026-11-01 00:00 UTC = the end of Halloween night in Ghana (UTC+0).
const EVENT_END = new Date('2026-11-01T00:00:00Z');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // how often expired roles get removed

// Banner image file name — looked up in Assets/halloween/ (or assets/halloween/)
const BANNER_FILE = 'shop.png';

// ─── Paid roles ──────────────────────────────────────────────────────────
// key       – short unique id (never change it once people have bought it)
// price     – optional override of DEFAULT_PRICE
// enabled   – set false to hide a role from the shop without deleting it
// emoji     – a unicode emoji OR a custom one pasted as <:name:id>
const SHOP_ITEMS = [
  { key: 'little_monster',     name: 'Little Monster',     emoji: '<:101342frankenstein:1554600243977261076>', roleId: '1553876622745272511' },
  { key: 'witchling',          name: 'Witchling',          emoji: '<:525350halloween:1554600249475997716>', roleId: '1553877129136181368' },
  { key: 'demon',              name: 'Demon',              emoji: '<:74475halloweendemon:1550187587342303244>', roleId: '1553878543119810602' },
  { key: 'zombie',             name: 'Zombie',             emoji: '<:80912zombiey:1549398746020708352>', roleId: '1553878551814737990' },
  { key: 'ghost',              name: 'Ghost',              emoji: '<:623778ghost:1549040963886915624>', roleId: '1553877430861828276' },
  { key: 'reaper',             name: 'Reaper',             emoji: '<:809376reaper:1554600551851753563>', roleId: '1553891150572818622' },
  { key: 'bat',                name: 'Bat',                emoji: '<:78019graybat:1549398741063307294>', roleId: '1553860064056574033' },
  { key: 'pouty_frankenstein', name: 'Pouty Frankenstein', emoji: '<:9900poutyfrankenstein:1550187573215887390>', roleId: '1553878552632361031' },
  { key: 'bloodlust',          name: 'Bloodlust',          emoji: '<:980162tongue:1549044812651565150>', roleId: '1554584593712291891' },
  { key: 'little_vampy',       name: 'Little Vampy',       emoji: '<:38746vampy:1549398712659345579>', roleId: '1554589617469268120' },
  { key: 'witchs_cat',         name: "Witch's Cat",        emoji: '<:535999mysteriousblackcat:1554600383093936249>', roleId: '1554590125764120606' },
  { key: 'vampire_bunny',      name: 'Vampire Bunny',      emoji: '<:78793vampirebunny:1554600378287259688>', roleId: '1554590122543030342' },
  { key: 'midnight_lantern',   name: 'Midnight Lantern',   emoji: '<:7252blobskeleton:1554600360436301864>', roleId: '1554590524114075748' },
];

// ─── Free roles (pick ONE, can swap any time, lasts until EVENT_END) ─────
const FREE_ITEMS = [
  { key: 'orange_lantern', name: 'Orange Lantern', emoji: '<:694928orangelantern:1554600433585233930>', roleId: '1553877998891962500' },
  { key: 'gothic_lantern', name: 'Gothic Lantern', emoji: '<:547722gothiclantern:1554600427926855710>', roleId: '1553877831845679195' },
];

const INFECTION_ROLE_ID = '1554595332321583114';
const CURE_ITEM = {
  key: 'cure_infection',
  name: 'Cure Infection',
  emoji: '<:1214bloodpotion:1549398601438859314>',
  price: CURE_PRICE,
};

module.exports = {
  DEFAULT_PRICE,
  DEFAULT_DURATION_DAYS,
  CURE_PRICE,
  INFECTION_PRICE,
  EVENT_END,
  SWEEP_INTERVAL_MS,
  BANNER_FILE,
  SHOP_ITEMS,
  FREE_ITEMS,
  INFECTION_ROLE_ID,
  CURE_ITEM,
};
