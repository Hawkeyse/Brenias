// utils/halloweenScare.js
// Halloween jump-scares: the bot grabs a scary GIF from GIPHY, posts it, then
// deletes it 5 seconds later. Everything you'd want to tweak is at the top.
//
// Setup: add your GIPHY API key to .env  →  GIPHY_API_KEY=xxxxxxxx
// (get one free at developers.giphy.com → Create an App → API).
//
// Only real GIFs are ever sent — GIPHY results are checked to be .gif links.
// Backup sources if GIPHY is down / no key: .gif files in
// Assets/halloween/scares/ and direct .gif links in GIF_URLS below.
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');

const HalloweenConfig = require('../models/HalloweenConfig');
const shopCfg = require('./halloweenShopConfig');

// ─── tweak me ────────────────────────────────────────────────────────────
const SCARE_CHANCE = 0.02;                   // 2% of messages roll a scare (only after cooldowns pass)
const GUILD_COOLDOWN_MS = 30 * 60 * 1000;    // at most 1 scare per server every 30 min
const CHANNEL_COOLDOWN_MS = 60 * 60 * 1000;  // and at most 1 per channel every hour
const DELETE_AFTER_MS = 5 * 1000;            // scare disappears after 5 seconds
const MAX_FILE_BYTES = 8 * 1024 * 1024;      // bigger GIFs may fail to upload — skipped

// Channels scares may appear in. Empty = every normal text channel.
const ALLOWED_CHANNEL_IDS = [];
// Never scare in these (rules, announcements, staff, shop, etc).
const IGNORED_CHANNEL_IDS = [];

// Cinematic horror searches — one is picked at random for each scare.
const GIPHY_SEARCH_TERMS = [
  'pennywise scary close up teeth',
  'pennywise jumpscare face',
  'it clown terrifying face',
  'horror monster face close up',
  'scary creature teeth jumpscare',
  'demon face sudden jumpscare',
  'the nun terrifying close up',
  'insidious red demon jumpscare',
  'ghostface scary close up',
  'horror clown evil smile',
  'scary face scream reaction',
  'horror movie monster jumpscare',
];
// GIPHY content rating: 'g' | 'pg' | 'pg-13' | 'r'.  pg-13 keeps it spooky, not gory.
const GIPHY_RATING = 'pg-13';
const GIPHY_RESULTS_PER_SEARCH = 25;
const GIPHY_MAX_OFFSET = 50;                 // random page into the results so it isn't always the top ones
const GIPHY_TIMEOUT_MS = 4000;

// Backup: direct GIF links (must end in .gif), used only if GIPHY isn't available.
const GIF_URLS = [
  // 'https://media.giphy.com/media/XXXX/giphy.gif',
];

const SCARE_DIR_NAME = 'scares';
// ─────────────────────────────────────────────────────────────────────────

const giphyReady = () => !!process.env.GIPHY_API_KEY;

function isGifUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' && u.pathname.toLowerCase().endsWith('.gif');
  } catch {
    return false;
  }
}

// ─── GIPHY ───────────────────────────────────────────────────────────────
const recentGiphyIds = []; // don't repeat the last 30 GIFs

// Pick a GIF rendition that is really a .gif and small enough to load fast.
function pickRendition(images) {
  for (const key of ['downsized_medium', 'downsized', 'original', 'fixed_height']) {
    const img = images?.[key];
    if (!img?.url || !isGifUrl(img.url)) continue;
    if (img.size && Number(img.size) > MAX_FILE_BYTES) continue;
    return img.url;
  }
  return null;
}

async function searchGiphy(term, offset) {
  const params = new URLSearchParams({
    api_key: process.env.GIPHY_API_KEY,
    q: term,
    limit: String(GIPHY_RESULTS_PER_SEARCH),
    offset: String(offset),
    rating: GIPHY_RATING,
    lang: 'en',
  });
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`, {
    signal: AbortSignal.timeout(GIPHY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GIPHY responded ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

async function pickFromGiphy() {
  const term = GIPHY_SEARCH_TERMS[Math.floor(Math.random() * GIPHY_SEARCH_TERMS.length)];
  let results = await searchGiphy(term, Math.floor(Math.random() * GIPHY_MAX_OFFSET));
  if (!results.length) results = await searchGiphy(term, 0); // random page was past the end

  const candidates = results
    .filter((g) => g.type === 'gif' && !recentGiphyIds.includes(g.id))
    .map((g) => ({ id: g.id, url: pickRendition(g.images) }))
    .filter((g) => g.url);

  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  recentGiphyIds.push(pick.id);
  if (recentGiphyIds.length > 30) recentGiphyIds.shift();
  return { type: 'url', id: `giphy:${pick.id}`, url: pick.url };
}

// ─── backup sources: local files + fixed links ───────────────────────────
function isRealGif(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(6);
    fs.readSync(fd, buf, 0, 6, 0);
    fs.closeSync(fd);
    const head = buf.toString('ascii');
    return head === 'GIF87a' || head === 'GIF89a';
  } catch {
    return false;
  }
}

// Reads the scares folder fresh each time. Works with "Assets" and "assets".
function listBackupSources() {
  const out = [];
  const seen = new Set();

  for (const dir of ['Assets', 'assets']) {
    const folder = path.join(__dirname, '..', dir, 'halloween', SCARE_DIR_NAME);
    if (!fs.existsSync(folder)) continue;
    for (const name of fs.readdirSync(folder)) {
      if (!name.toLowerCase().endsWith('.gif')) continue;
      const file = path.join(folder, name);
      const real = fs.realpathSync(file);
      if (seen.has(real)) continue;
      seen.add(real);
      try {
        if (fs.statSync(file).size > MAX_FILE_BYTES) continue;
      } catch { continue; }
      if (!isRealGif(file)) continue; // renamed mp4/png etc — skipped
      out.push({ type: 'file', id: `file:${name}`, path: file });
    }
  }

  for (const url of GIF_URLS) {
    if (isGifUrl(url)) out.push({ type: 'url', id: `url:${url}`, url });
  }
  return out;
}

let lastBackupId = null;
function pickBackup() {
  const all = listBackupSources();
  if (!all.length) return null;
  const pool = all.length > 1 ? all.filter((s) => s.id !== lastBackupId) : all;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  lastBackupId = pick.id;
  return pick;
}

// GIPHY first, backups if GIPHY has no key / fails / returns nothing.
async function pickSource() {
  if (giphyReady()) {
    try {
      const g = await pickFromGiphy();
      if (g) return g;
    } catch (err) {
      console.error('[halloweenScare] GIPHY failed:', err.message);
    }
  }
  return pickBackup();
}

// ─── Halloween mode check (cached so we don't hit the DB on every message) ─
let modeCache = { value: false, at: 0 };
async function isHalloweenOn() {
  if (new Date() >= shopCfg.EVENT_END) return false; // event over
  if (Date.now() - modeCache.at < 60 * 1000) return modeCache.value;
  try {
    const cfg = await HalloweenConfig.findOne({ key: 'global' }).lean();
    modeCache = { value: !!cfg?.enabled, at: Date.now() };
  } catch (err) {
    console.error('[halloweenScare] mode check failed:', err.message);
    modeCache = { value: false, at: Date.now() };
  }
  return modeCache.value;
}

// ─── cooldowns ───────────────────────────────────────────────────────────
const lastGuildScare = new Map();   // guildId   -> timestamp
const lastChannelScare = new Map(); // channelId -> timestamp

function onCooldown(guildId, channelId) {
  const now = Date.now();
  return (
    now - (lastGuildScare.get(guildId) || 0) < GUILD_COOLDOWN_MS ||
    now - (lastChannelScare.get(channelId) || 0) < CHANNEL_COOLDOWN_MS
  );
}

function channelAllowed(channel) {
  if (IGNORED_CHANNEL_IDS.includes(channel.id)) return false;
  if (ALLOWED_CHANNEL_IDS.length && !ALLOWED_CHANNEL_IDS.includes(channel.id)) return false;
  return true;
}

// ─── send one scare ──────────────────────────────────────────────────────
// force = true skips cooldowns (used by /halloween-scare test).
// Returns { ok, reason? } so the caller can tell staff what happened.
async function sendScare(channel, { force = false } = {}) {
  const guild = channel.guild;
  if (!guild) return { ok: false, reason: 'Not a server channel.' };

  const me = guild.members.me;
  const perms = me && channel.permissionsFor(me);
  if (!perms?.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.EmbedLinks,
  ])) {
    return { ok: false, reason: 'I need View Channel, Send Messages, Attach Files and Embed Links in that channel.' };
  }

  // Claim the cooldown BEFORE the GIPHY lookup so two messages arriving at the
  // same moment can't trigger two scares (also stops hammering GIPHY if it's down).
  if (!force) {
    lastGuildScare.set(guild.id, Date.now());
    lastChannelScare.set(channel.id, Date.now());
  }

  const source = await pickSource();
  if (!source) {
    return {
      ok: false,
      reason: giphyReady()
        ? "GIPHY didn't return a usable GIF this time — try again."
        : 'No `GIPHY_API_KEY` in `.env`, and no backup GIFs found.',
    };
  }

  const payload = source.type === 'file'
    ? { files: [new AttachmentBuilder(source.path, { name: 'scare.gif' })] }
    : { embeds: [new EmbedBuilder().setColor('#8B0000').setImage(source.url)] };

  let sent;
  try {
    sent = await channel.send({ ...payload, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error('[halloweenScare] send failed:', err.message);
    return { ok: false, reason: `Couldn't send the GIF: ${err.message}` };
  }

  setTimeout(() => sent.delete().catch(() => {}), DELETE_AFTER_MS);
  return { ok: true, source };
}

module.exports = {
  SCARE_CHANCE,
  GUILD_COOLDOWN_MS,
  CHANNEL_COOLDOWN_MS,
  DELETE_AFTER_MS,
  GIPHY_RATING,
  GIPHY_SEARCH_TERMS,
  giphyReady,
  listBackupSources,
  isHalloweenOn,
  onCooldown,
  channelAllowed,
  sendScare,
};
