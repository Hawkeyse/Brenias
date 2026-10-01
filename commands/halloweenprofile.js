// commands/halloweenprofile.js
// /halloween-profile [user] — Halloween profile card drawn on one of the three
// framed templates (banners/halloween-1.png, -2.png, -3.png), picked at random
// each time. Shows points, candy, infection status, houses visited, tricks
// survived, rare items found, rank and inventory.
// While the card renders, custom-emoji loading messages cycle instead of
// Discord's default "thinking" indicator.
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const User = require('../models/User');
const ShopRole = require('../models/HalloweenShopRole');
const { SHOP_ITEMS, FREE_ITEMS, INFECTION_ROLE_ID } = require('../utils/halloweenShopConfig');
const { EMOTE_POOL, formatEmote } = require('../utils/halloweenEmotes');
const { simpleEmbed, COLORS } = require('../utils/halloweenReply');

// ─── Fonts ──────────────────────────────────────────────────────────────
for (const [file, name] of [
  ['manrope/manrope.regular.otf', 'Manrope'],
  ['manrope/manrope.bold.otf', 'ManropeBold'],
  ['display/rubik-dirt.woff', 'RubikDirt'],
]) {
  try { GlobalFonts.registerFromPath(path.join(__dirname, '../fonts', file), name); } catch (_) { /* falls back to sans-serif */ }
}

// ─── Rank tiers (by Halloween Points) — edit freely ─────────────────────
const RANKS = [
  { min: 0, name: 'Candy Newbie' },
  { min: 500, name: 'Trick Taker' },
  { min: 1500, name: 'Pumpkin Hunter' },
  { min: 3500, name: 'Ghost Chaser' },
  { min: 7500, name: 'Night Stalker' },
  { min: 15000, name: 'Halloween Legend' },
];
const rankFor = (pts) => [...RANKS].reverse().find((r) => pts >= r.min) || RANKS[0];

// ─── Slot layouts, measured on each template ────────────────────────────
// boxes = the 6 small frames (2 rows x 3). rank / inventory = the bottom bars.
// halloween-2 has a single wide bar, so rank + inventory share it (divider).
const LAYOUTS = {
  'halloween-1.png': {
    avatar: { cx: 2011, cy: 148, r: 82 },
    header: { x: 1140, y: 105, w: 720, h: 130 },
    boxes: [
      { x: 1098, y: 275, w: 357, h: 85 }, { x: 1488, y: 275, w: 318, h: 85 }, { x: 1826, y: 275, w: 296, h: 85 },
      { x: 1098, y: 378, w: 356, h: 88 }, { x: 1488, y: 378, w: 318, h: 88 }, { x: 1828, y: 378, w: 292, h: 88 },
    ],
    rank: { x: 1360, y: 485, w: 515, h: 83 },
    inventory: { x: 1140, y: 578, w: 955, h: 82 },
  },
  'halloween-2.png': {
    avatar: { cx: 1267, cy: 178, r: 92 },
    header: { x: 160, y: 110, w: 940, h: 170 },
    boxes: [
      { x: 130, y: 312, w: 448, h: 108 }, { x: 600, y: 312, w: 408, h: 108 }, { x: 1026, y: 312, w: 386, h: 108 },
      { x: 130, y: 436, w: 448, h: 106 }, { x: 600, y: 436, w: 408, h: 106 }, { x: 1026, y: 436, w: 386, h: 106 },
    ],
    rank: { x: 485, y: 558, w: 315, h: 124 },
    inventory: { x: 800, y: 558, w: 340, h: 124 },
    divider: true,
  },
  'halloween-3.png': {
    avatar: { cx: 1980, cy: 135, r: 80 },
    header: { x: 1100, y: 70, w: 700, h: 160 },
    boxes: [
      { x: 1060, y: 265, w: 312, h: 90 }, { x: 1390, y: 265, w: 325, h: 90 }, { x: 1735, y: 265, w: 373, h: 90 },
      { x: 1062, y: 375, w: 303, h: 87 }, { x: 1390, y: 375, w: 332, h: 87 }, { x: 1747, y: 375, w: 351, h: 87 },
    ],
    rank: { x: 1320, y: 480, w: 480, h: 88 },
    inventory: { x: 1105, y: 598, w: 990, h: 84 },
  },
};

// ─── Icons ──────────────────────────────────────────────────────────────
const ICON_DIR = path.join(__dirname, '../Assets/halloween/icons');
const iconCache = new Map();
async function icon(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const p = path.join(ICON_DIR, `${name}.png`);
  let img = null;
  if (fs.existsSync(p)) { try { img = await loadImage(p); } catch (_) { img = null; } }
  iconCache.set(name, img);
  return img;
}
function drawIcon(ctx, img, cx, cy, size) {
  if (!img) return;
  const s = Math.min(size / img.width, size / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function findTemplates() {
  const dirs = [path.join(__dirname, '../banners'), path.join(__dirname, '../Assets/halloween'), path.join(__dirname, '../assets/halloween')];
  return Object.keys(LAYOUTS)
    .map((file) => {
      const dir = dirs.find((d) => fs.existsSync(path.join(d, file)));
      return dir ? { file, path: path.join(dir, file), layout: LAYOUTS[file] } : null;
    })
    .filter(Boolean);
}

// ─── Text helpers ───────────────────────────────────────────────────────
const TAN = '#e8cf9f';

function setFont(ctx, family, size) { ctx.font = `${Math.round(size)}px ${family}, sans-serif`; }

function spacedWidth(ctx, text, sp) {
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width + sp, -sp);
}
function drawSpaced(ctx, text, x, y, sp) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
}

// left-aligned, middle-baseline text that shrinks / ellipsizes to maxW
function fitLeft(ctx, text, x, y, maxW, { family = 'ManropeBold', size, min = 10, color = '#fff', sp = 0 }) {
  let s = size;
  setFont(ctx, family, s);
  while (spacedWidth(ctx, text, sp) > maxW && s > min) { s -= 1; setFont(ctx, family, s); }
  let out = text;
  while (spacedWidth(ctx, out, sp) > maxW && out.length > 1) out = out.slice(0, -2) + '…';
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (sp) drawSpaced(ctx, out, x, y, sp); else ctx.fillText(out, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ─── Pieces ─────────────────────────────────────────────────────────────
async function statBox(ctx, box, { iconName, drawn, label, value, valueColor = '#fff' }) {
  const k = box.h / 108;                       // everything scales with box height
  const iconCx = box.x + 66 * k + 8, iconCy = box.y + box.h * 0.36;
  const textX = iconCx + 28 * k;
  const maxW = box.x + box.w - textX - 30 * k;

  if (drawn === 'check' || drawn === 'cross') {
    const r = 15 * k;
    ctx.fillStyle = drawn === 'check' ? '#2fcf6e' : '#e0453a';
    ctx.beginPath(); ctx.arc(iconCx, iconCy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.4 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (drawn === 'check') { ctx.moveTo(iconCx - 7 * k, iconCy); ctx.lineTo(iconCx - 2 * k, iconCy + 6 * k); ctx.lineTo(iconCx + 8 * k, iconCy - 6 * k); }
    else { ctx.moveTo(iconCx - 6 * k, iconCy - 6 * k); ctx.lineTo(iconCx + 6 * k, iconCy + 6 * k); ctx.moveTo(iconCx + 6 * k, iconCy - 6 * k); ctx.lineTo(iconCx - 6 * k, iconCy + 6 * k); }
    ctx.stroke();
  } else {
    drawIcon(ctx, await icon(iconName), iconCx, iconCy, 34 * k);
  }

  fitLeft(ctx, label.toUpperCase(), textX, iconCy, maxW, { family: 'ManropeBold', size: 18 * k, min: 10, color: TAN, sp: 1 });
  fitLeft(ctx, value, box.x + 48 * k + 8, box.y + box.h * 0.72, box.w - 90 * k, { family: 'ManropeBold', size: 31 * k, min: 14, color: valueColor });
}

async function drawRank(ctx, r, rank, hk) {
  const padX = 56 * hk, padR = 20 * hk;
  fitLeft(ctx, 'RANK', r.x + padX, r.y + r.h * 0.26, r.w - padX - padR, { size: 17 * hk, color: TAN, sp: 1 });
  const cy = r.y + r.h * 0.62;
  drawIcon(ctx, await icon('trophy'), r.x + padX + 18 * hk, cy, 36 * hk);
  fitLeft(ctx, rank, r.x + padX + 46 * hk, cy, r.w - padX - padR - 46 * hk, { size: 24 * hk, min: 12 });
}

async function drawInventory(ctx, r, items, hk, pad) {
  const x0 = r.x + pad, maxX = r.x + r.w - pad;
  fitLeft(ctx, 'INVENTORY', x0, r.y + r.h * 0.22, maxX - x0, { size: 17 * hk, color: TAN, sp: 1 });
  if (!items.length) {
    fitLeft(ctx, 'Empty', x0, r.y + r.h * 0.55, maxX - x0, { family: 'Manrope', size: 18 * hk, color: '#c9b79a' });
    return;
  }
  const lineH = 36 * hk, top = r.y + r.h * 0.40;
  const maxLines = Math.max(1, Math.floor((r.y + r.h - 14 * hk - top) / lineH) + 1);
  let x = x0, line = 0, shown = 0;
  for (const it of items) {
    setFont(ctx, 'ManropeBold', 17 * hk);
    const label = it.qty > 1 ? `${it.name} ×${it.qty}` : it.name;
    const w = (it.img ? 28 * hk : 0) + ctx.measureText(label).width + 26 * hk;
    if (x + w > maxX) { line++; x = x0; }
    if (line >= maxLines) break;
    const cy = top + line * lineH + 10 * hk;
    if (cy + 15 * hk > r.y + r.h - 24 * hk) break;
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(ctx, x, cy - 15 * hk, w, 30 * hk, 15 * hk); ctx.fill();
    let tx = x + 12 * hk;
    if (it.img) { drawIcon(ctx, it.img, x + 12 * hk + 11 * hk, cy, 24 * hk); tx += 28 * hk; }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, tx, cy + 1);
    x += w + 8 * hk; shown++;
  }
  const rest = items.length - shown;
  if (rest > 0) {
    setFont(ctx, 'ManropeBold', 16 * hk);
    ctx.fillStyle = TAN; ctx.textBaseline = 'middle';
    const tag = `+${rest} more`;
    const tw = ctx.measureText(tag).width;
    ctx.textAlign = 'right'; ctx.fillText(tag, maxX, r.y + r.h * 0.22); ctx.textAlign = 'left';
    void tw;
  }
}

// ─── Card ───────────────────────────────────────────────────────────────
async function renderCard(tpl, d) {
  const bg = await loadImage(tpl.path);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bg, 0, 0);
  const L = tpl.layout;

  // avatar
  const a = L.avatar;
  ctx.save();
  ctx.beginPath(); ctx.arc(a.cx, a.cy, a.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  try { ctx.drawImage(await loadImage(d.avatarURL), a.cx - a.r, a.cy - a.r, a.r * 2, a.r * 2); }
  catch (_) { ctx.fillStyle = '#222'; ctx.fillRect(a.cx - a.r, a.cy - a.r, a.r * 2, a.r * 2); }
  ctx.restore();

  // header: glowing name
  const H = L.header, nx = H.x + H.w * 0.13, ny = H.y + H.h * 0.52, nameW = H.w * 0.84;
  let fs = H.h * 0.40;
  setFont(ctx, 'RubikDirt', fs);
  const name = d.name.toUpperCase();
  while (ctx.measureText(name).width > nameW && fs > 20) { fs -= 2; setFont(ctx, 'RubikDirt', fs); }
  const grad = ctx.createLinearGradient(0, ny - fs / 2, 0, ny + fs / 2);
  grad.addColorStop(0, '#ffd04a'); grad.addColorStop(1, '#ff9a1f');
  ctx.save();
  ctx.shadowColor = 'rgba(255,120,0,0.75)'; ctx.shadowBlur = 14;
  ctx.fillStyle = grad; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(name, nx, ny);
  ctx.restore();
  // six stat boxes
  const status = d.infected
    ? { iconName: 'skull', label: 'Status', value: 'Infected', valueColor: '#ff5a4d' }
    : { drawn: 'check', label: 'Status', value: 'Not infected', valueColor: '#3dff8a' };
  const boxes = [
    { iconName: 'points', label: 'Points', value: d.points.toLocaleString('en-US') },
    { iconName: 'candy', label: 'Candy', value: d.candy.toLocaleString('en-US') },
    status,
    { iconName: 'house', label: 'Houses Visited', value: d.houses.toLocaleString('en-US') },
    { iconName: 'ghost', label: 'Tricks Survived', value: d.tricks.toLocaleString('en-US') },
    { iconName: 'rare', label: 'Rare Items Found', value: d.rare.toLocaleString('en-US') },
  ];
  for (let i = 0; i < 6; i++) await statBox(ctx, L.boxes[i], boxes[i]);

  // rank + inventory
  const hk = L.rank.h / 100;
  await drawRank(ctx, L.rank, d.rank, hk);
  if (L.divider) {
    ctx.strokeStyle = 'rgba(190,130,70,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L.inventory.x, L.inventory.y + L.inventory.h * 0.16); ctx.lineTo(L.inventory.x, L.inventory.y + L.inventory.h * 0.84); ctx.stroke();
  }
  await drawInventory(ctx, L.inventory, d.items, hk, L.divider ? 30 * hk : 62 * hk);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderCard, findTemplates, LAYOUTS, rankFor, // exported for testing
  data: new SlashCommandBuilder()
    .setName('halloween-profile')
    .setDescription('Show a Halloween profile card.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Whose profile to show (optional)').setRequired(false)),

  async execute(interaction) {
    const emotes = EMOTE_POOL.map(formatEmote);
    const frames = ['Summoning your card', 'Stirring the cauldron', 'Carving the pumpkin', 'Waking the ghosts'];
    let i = 0;
    const frame = () => `${emotes[i % emotes.length]} ${frames[i % frames.length]}...`;
    await interaction.reply({ embeds: [simpleEmbed(frame(), COLORS.info)] });
    const timer = setInterval(() => {
      i++;
      interaction.editReply({ embeds: [simpleEmbed(frame(), COLORS.info)] }).catch(() => {});
    }, 1200);

    try {
      const templates = findTemplates();
      if (!templates.length) throw new Error('No halloween-*.png templates found in banners/');
      const tpl = templates[Math.floor(Math.random() * templates.length)];

      const target = interaction.options.getUser('user') || interaction.user;
      const guildId = interaction.guild.id;
      const [user, owned, member] = await Promise.all([
        User.findOne({ guildId, userId: target.id }).lean(),
        ShopRole.find({ guildId, userId: target.id, expiresAt: { $gt: new Date() } }).lean(),
        interaction.guild.members.fetch(target.id).catch(() => null),
      ]);

      const points = user?.halloweenPoints ?? 0;

      // Inventory = owned shop roles (with their icon when we have one) + any items stored on the user doc.
      const nameByKey = new Map([...SHOP_ITEMS, ...FREE_ITEMS].map((s) => [s.key, s.name]));
      const items = [];
      for (const o of owned) {
        const nm = nameByKey.get(o.itemKey);
        if (nm) items.push({ name: nm, qty: 1, img: await icon(o.itemKey) });
      }
      for (const it of user?.inventory || []) {
        const nm = typeof it === 'string' ? it : (it.name || it.item || it.key);
        if (nm && !items.some((x) => x.name === nm)) items.push({ name: nm, qty: typeof it === 'object' ? (it.qty ?? it.amount ?? 1) : 1, img: null });
      }

      const png = await renderCard(tpl, {
        name: member?.displayName || target.username,
        avatarURL: target.displayAvatarURL({ extension: 'png', size: 256 }),
        points,
        candy: user?.candy ?? 0,
        houses: user?.housesVisited ?? 0,
        tricks: user?.tricksSurvived ?? 0,
        rare: user?.rareItemsFound ?? 0,
        infected: !!(INFECTION_ROLE_ID && member?.roles?.cache?.has(INFECTION_ROLE_ID)),
        rank: rankFor(points).name,
        items,
      });

      clearInterval(timer);
      await interaction.editReply({
        embeds: [],
        files: [new AttachmentBuilder(png, { name: `halloween-profile-${target.id}.png` })],
      });
    } catch (err) {
      clearInterval(timer);
      console.error('halloween-profile failed:', err);
      await interaction.editReply({ embeds: [simpleEmbed("❌ Couldn't generate the profile card.", COLORS.error)] }).catch(() => {});
    }
  },
};
