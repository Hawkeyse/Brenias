// utils/halloweenShop.js
// All Halloween Shop logic in one place: the UI builders (public panel with
// one button per role, the private confirm/summary/roles screens), buying a
// role, wearing/removing owned roles (name color), claiming the free lantern,
// and the expiry sweep. The command and the event file just call into this.
const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');

const User = require('../models/User');
const ShopRole = require('../models/HalloweenShopRole');
const cfg = require('./halloweenShopConfig');
const { addHalloweenPoints, HALLOWEEN_POINTS_EMOJI } = require('./halloweenPoints');
const { log } = require('./halloweenLog');
const { COLORS } = require('./halloweenReply');
const { getActiveInfection, cureMember } = require('./halloweenInfection');

// ─── small helpers ───────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString('en-US');
const unix = (date) => Math.floor(date.getTime() / 1000);
const DAY_MS = 24 * 60 * 60 * 1000;

const shopItems = () => cfg.SHOP_ITEMS.filter((i) => i.enabled !== false);
const itemPrice = (item) => item.price ?? cfg.DEFAULT_PRICE;
const fail = (text) => ({ ok: false, text });
const success = (text) => ({ ok: true, text });

// Config emoji can be unicode ("🦇") or a pasted custom emoji ("<:bat:123>").
// Buttons need custom emoji as an object, so convert here.
function toEmoji(str) {
  const m = /^<(a?):([^:>]+):(\d+)>$/.exec(str || '');
  return m ? { animated: m[1] === 'a', name: m[2], id: m[3] } : str;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// "5d 3h", "7h 20m", "12m" — used in the roles dropdown (no timestamps there).
function timeLeft(date) {
  const ms = Math.max(0, date.getTime() - Date.now());
  const d = Math.floor(ms / DAY_MS);
  const h = Math.floor((ms % DAY_MS) / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

// The repo folder is "Assets" but some code uses "assets" — check both so
// the banner works on Windows and Linux hosts alike.
function getBannerAttachment() {
  for (const dir of ['Assets', 'assets']) {
    const file = path.join(__dirname, '..', dir, 'halloween', cfg.BANNER_FILE);
    if (fs.existsSync(file)) return new AttachmentBuilder(file, { name: cfg.BANNER_FILE });
  }
  return null;
}

// Paid roles a user currently owns (not expired). Owned ≠ worn: a role they
// took off in 🎨 Roles is still owned until it expires.
const activePaid = (guildId, userId) =>
  ShopRole.find({ guildId, userId, free: false, expiresAt: { $gt: new Date() } });

// Everything they own right now — paid roles AND their free lantern. This is
// what the 🎨 Roles screen works with.
const activeOwned = (guildId, userId) =>
  ShopRole.find({ guildId, userId, expiresAt: { $gt: new Date() } });

const findItem = (roleId) =>
  cfg.SHOP_ITEMS.find((i) => i.roleId === roleId) || cfg.FREE_ITEMS.find((i) => i.roleId === roleId);

// Keep free lantern roles below all paid shop roles in Discord's role list so
// members wearing a bought role can visibly show that role's name color.
async function arrangeRoleHierarchy(guild) {
  const paidRoles = cfg.SHOP_ITEMS
    .map((item) => guild.roles.cache.get(item.roleId))
    .filter(Boolean);
  const freeRoles = cfg.FREE_ITEMS
    .map((item) => guild.roles.cache.get(item.roleId))
    .filter(Boolean);

  if (!paidRoles.length || !freeRoles.length) return;

  const lowestPaidPosition = Math.min(...paidRoles.map((role) => role.position));
  const firstFreePosition = Math.max(1, lowestPaidPosition - freeRoles.length);

  try {
    await guild.roles.setPositions(
      freeRoles.map((role, index) => ({ role: role.id, position: firstFreePosition + index })),
      'Halloween Shop: place free roles below paid roles'
    );
  } catch (err) {
    console.error('[halloweenShop] failed to arrange role hierarchy:', err.message);
  }
}

// ─── the public panel (staff posts this once in the shop channel) ────────
// Banner on top, then one button per role (5 per row), then a row with the
// two free lanterns and a "My Shop" button.
function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor('#FF7518')
    .setTitle('🛒 Halloween Shop')
    .setDescription(
      `Spend your ${HALLOWEEN_POINTS_EMOJI} **Halloween Points** on temporary roles. ` +
      'Earn points from the Boss fights, Puzzles and Emote Hunts.\n\n' +
      `**Price:** ${fmt(cfg.DEFAULT_PRICE)} ${HALLOWEEN_POINTS_EMOJI} per role\n` +
      `**Lasts:** ${cfg.DEFAULT_DURATION_DAYS} days — each role can be bought once\n` +
      '**Collect:** buy as many different roles as you like\n' +
      `**Everything ends:** <t:${unix(cfg.EVENT_END)}:D>\n\n` +
      '🎨 **Change your name color:** tap 💰 **My Shop** → **Roles** and pick the role you want to wear.\n' +
      '🎁 **Free:** tap a lantern below to pick one — you can swap any time.'
    )
    .setFooter({ text: 'Tap a role to buy it — only you will see the confirmation.' });

  const files = [];
  const banner = getBannerAttachment();
  if (banner) {
    embed.setImage(`attachment://${cfg.BANNER_FILE}`);
    files.push(banner);
  }

  // Discord allows 5 rows x 5 buttons. Row 5 is reserved for the free row.
  let items = shopItems();
  if (items.length > 20) {
    console.warn('[halloweenShop] more than 20 shop roles — only the first 20 fit as buttons.');
    items = items.slice(0, 20);
  }

  const roleRows = chunk(
    items.map((i) => {
      const priceTag = i.price && i.price !== cfg.DEFAULT_PRICE ? ` · ${fmt(i.price)}` : '';
      return new ButtonBuilder()
        .setCustomId(`halloween-shop-item:${i.key}`)
        .setLabel(`${i.name}${priceTag}`)
        .setEmoji(toEmoji(i.emoji))
        .setStyle(ButtonStyle.Secondary);
    }),
    5
  ).map((buttons) => new ActionRowBuilder().addComponents(buttons));

  const freeRow = new ActionRowBuilder().addComponents(
    ...cfg.FREE_ITEMS.map((i) =>
      new ButtonBuilder()
        .setCustomId(`halloween-shop-free:${i.key}`)
        .setLabel(i.name)
        .setEmoji(toEmoji(i.emoji))
        .setStyle(ButtonStyle.Success)
    ),
    new ButtonBuilder()
      .setCustomId('halloween-shop-me')
      .setLabel('My Shop')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('halloween-shop-cure')
      .setLabel('Cure Infection')
      .setEmoji(toEmoji(cfg.CURE_ITEM.emoji))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('halloween-shop-infect')
      .setLabel('Infect Someone')
      .setEmoji('🧟')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [...roleRows, freeRow],
    files,
    bannerMissing: !banner,
  };
}

// ─── "My Shop" summary (private): points, owned roles, expiry ────────────
// Has a 🎨 Roles button (once you own at least one role) to change which
// roles you're wearing — that's how you change your name color.
async function buildShopView(guildId, userId) {
  const now = new Date();
  const [user, owned, infection] = await Promise.all([
    User.findOne({ guildId, userId }).lean(),
    ShopRole.find({ guildId, userId, expiresAt: { $gt: now } }).lean(),
    getActiveInfection(guildId, userId),
  ]);

  const points = user?.halloweenPoints ?? 0;
  const paid = owned.filter((o) => !o.free);
  const freeOwned = owned.find((o) => o.free);

  const paidLines = paid.length
    ? paid.map((p) => `• <@&${p.roleId}> — expires <t:${unix(p.expiresAt)}:R>`).join('\n')
    : "*You don't own any shop roles yet.*";

  const embed = new EmbedBuilder()
    .setColor('#FF7518')
    .setTitle('💰 My Shop')
    .setDescription(
      `**${fmt(points)}** ${HALLOWEEN_POINTS_EMOJI} Halloween Points\n` +
      (infection
        ? `🧟 **You are infected!** Your infection expires <t:${unix(infection.expiresAt)}:R>.\n` +
          `Buy the ${cfg.CURE_ITEM.emoji} **Cure Infection** item below to remove it.\n`
        : '') +
      `Shop roles owned: **${paid.length}**\n\n` +
      paidLines +
      (freeOwned ? `\n\n🎁 Free role: <@&${freeOwned.roleId}>` : '') +
      (owned.length ? '\n\n🎨 Want a different name color? Tap **Roles** below.' : '')
    );

  const buttons = [];
  if (owned.length) {
    buttons.push(new ButtonBuilder()
      .setCustomId('halloween-shop-roles')
      .setLabel('Roles')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary));
  }
  if (infection) {
    buttons.push(new ButtonBuilder()
      .setCustomId('halloween-shop-cure')
      .setLabel('Cure Infection')
      .setEmoji(toEmoji(cfg.CURE_ITEM.emoji))
      .setStyle(ButtonStyle.Danger));
  }
  const components = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];

  return { embeds: [embed], components };
}

// ─── "Roles" screen (private): choose which owned roles to wear ──────────
// Discord shows the name color of the HIGHEST role in the server's role list.
// A bot can't override that per person, so the way to change your color is to
// wear only the role you want. Roles you take off stay yours until they
// expire — wear them again any time.
async function buildRolesView(guild, member) {
  // paid roles first (soonest-expiring first), free lantern last
  const owned = await activeOwned(guild.id, member.id).then((docs) =>
    docs.sort((a, b) => (a.free - b.free) || (a.expiresAt - b.expiresAt))
  );

  if (!owned.length) {
    return {
      embeds: [new EmbedBuilder()
        .setColor(COLORS.error)
        .setDescription("You don't own any shop roles yet — buy one (or pick a free lantern) first.")],
      components: [],
    };
  }

  const options = owned.slice(0, 25).map((o) => {
    const item = findItem(o.roleId);
    const name = item?.name || guild.roles.cache.get(o.roleId)?.name || 'Shop role';
    const opt = {
      label: name.slice(0, 100),
      value: o.roleId,
      description: o.free ? 'Free · yours until the event ends' : `Expires in ${timeLeft(o.expiresAt)}`,
      default: member.roles.cache.has(o.roleId),
    };
    if (item?.emoji) opt.emoji = toEmoji(item.emoji);
    return opt;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('halloween-shop-wear')
    .setPlaceholder('Pick the roles you want to wear')
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor('#FF7518')
    .setTitle('🎨 Your Roles')
    .setDescription(
      'Pick the roles you want to **wear** right now.\n\n' +
      'Discord shows the name color of the **highest** role in the server list, so if you own several ' +
      'and the colors clash, wear **just the one** whose color you want.\n\n' +
      'This includes your free lantern. Roles you take off are still yours until they expire — ' +
      'you can wear them again any time.'
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// Apply the dropdown choice: wear exactly the selected roles (only ones the
// person actually owns, free lantern included — anything else is ignored).
async function setWornRoles(guild, member, selectedIds) {
  const owned = await activeOwned(guild.id, member.id);
  const ownedIds = owned.map((o) => o.roleId);
  const wanted = new Set(selectedIds.filter((id) => ownedIds.includes(id)));

  const toAdd = [...wanted].filter((id) => !member.roles.cache.has(id));
  const toRemove = ownedIds.filter((id) => !wanted.has(id) && member.roles.cache.has(id));

  try {
    if (toAdd.length) await member.roles.add(toAdd, 'Halloween Shop: wear role');
    if (toRemove.length) await member.roles.remove(toRemove, 'Halloween Shop: take off role');
  } catch (err) {
    console.error('[halloweenShop] wear roles failed:', err.message);
    return fail(
      "I couldn't change your roles (my role must be **above** them and I need Manage Roles). Tell a staff member."
    );
  }

  if (!wanted.size) {
    return success("🎨 You're not wearing any shop roles now. They're still yours until they expire.");
  }
  return success(`🎨 Now wearing: ${[...wanted].map((id) => `<@&${id}>`).join(' ')}`);
}

// "Are you sure?" screen (private) shown after tapping a role button.
async function buildConfirmView(guildId, userId, item) {
  const [user, active] = await Promise.all([
    User.findOne({ guildId, userId }).lean(),
    activePaid(guildId, userId).then((docs) => docs.map((d) => d.toObject())),
  ]);

  const points = user?.halloweenPoints ?? 0;
  const price = itemPrice(item);
  const existing = active.find((a) => a.roleId === item.roleId);
  const canAfford = points >= price;
  const canBuy = canAfford && !existing;

  let status;
  if (existing) status = `❌ You already own this role — it expires <t:${unix(existing.expiresAt)}:R>. You can buy it again after it expires.`;
  else if (!canAfford) status = `❌ You have **${fmt(points)}** ${HALLOWEEN_POINTS_EMOJI} — you need **${fmt(price - points)}** more.`;
  else status = `**Your points:** ${fmt(points)} → **${fmt(points - price)}** after buying`;

  const embed = new EmbedBuilder()
    .setColor(canBuy ? '#FF7518' : COLORS.error)
    .setTitle(`Buy ${item.name}?`)
    .setDescription(
      `${item.emoji} <@&${item.roleId}>\n\n` +
      `**Cost:** ${fmt(price)} ${HALLOWEEN_POINTS_EMOJI}\n` +
      `**Lasts:** ${cfg.DEFAULT_DURATION_DAYS} days\n\n` +
      status
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`halloween-shop-confirm:${item.key}`)
      .setLabel('Confirm')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canBuy),
    new ButtonBuilder()
      .setCustomId('halloween-shop-cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

async function buildCureConfirmView(guildId, userId) {
  const [user, infection] = await Promise.all([
    User.findOne({ guildId, userId }).lean(),
    getActiveInfection(guildId, userId),
  ]);
  const points = user?.halloweenPoints ?? 0;
  const price = cfg.CURE_PRICE;
  const canBuy = !!infection && points >= price;

  let status;
  if (!infection) status = '✅ You are not infected.';
  else if (points < price) status = `❌ You have **${fmt(points)}** ${HALLOWEEN_POINTS_EMOJI} — you need **${fmt(price - points)}** more.`;
  else status = `**Your points:** ${fmt(points)} → **${fmt(points - price)}** after buying`;

  return {
    embeds: [new EmbedBuilder()
      .setColor(canBuy ? '#FF7518' : COLORS.error)
      .setTitle(`${cfg.CURE_ITEM.emoji} Buy Cure Infection?`)
      .setDescription(
        `Remove your infected role and restore access to the games.\n\n` +
        `**Cost:** ${fmt(price)} ${HALLOWEEN_POINTS_EMOJI}\n\n${status}`
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('halloween-shop-cure-confirm')
        .setLabel('Use Cure')
        .setEmoji(toEmoji(cfg.CURE_ITEM.emoji))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canBuy),
      new ButtonBuilder()
        .setCustomId('halloween-shop-cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )],
  };
}

// ─── buying a role ───────────────────────────────────────────────────────
// A role can only be bought once while you still own it (no extending, no
// stacking). You can own as many DIFFERENT roles as you like.
// Order matters: charge first (atomic, can't go negative), then give the
// role, then save the expiry. If a later step fails, everything earlier is
// rolled back and the points are refunded.
async function purchaseRole(guild, member, itemKey) {
  const item = shopItems().find((i) => i.key === itemKey);
  if (!item) return fail("That role isn't in the shop anymore.");

  const guildId = guild.id;
  const userId = member.id;
  const price = itemPrice(item);
  const now = new Date();

  if (now >= cfg.EVENT_END) return fail('The Halloween event is over — the shop is closed.');

  const role = guild.roles.cache.get(item.roleId) || (await guild.roles.fetch(item.roleId).catch(() => null));
  if (!role) return fail(`The **${item.name}** role doesn't exist on this server — tell a staff member.`);

  const active = await activePaid(guildId, userId);
  const existing = active.find((a) => a.roleId === item.roleId);

  if (existing) {
    return fail(
      `You already own <@&${item.roleId}> — it expires <t:${unix(existing.expiresAt)}:R>. ` +
      'You can buy it again after it expires.'
    );
  }

  // 1) charge (only succeeds if they can afford it)
  const charged = await User.findOneAndUpdate(
    { guildId, userId, halloweenPoints: { $gte: price } },
    { $inc: { halloweenPoints: -price } },
    { new: true }
  );
  if (!charged) {
    const u = await User.findOne({ guildId, userId }).lean();
    return fail(`Not enough points — it costs **${fmt(price)}** ${HALLOWEEN_POINTS_EMOJI} and you have **${fmt(u?.halloweenPoints ?? 0)}**.`);
  }

  const refund = () =>
    addHalloweenPoints(guildId, userId, price).catch((e) =>
      console.error('[halloweenShop] REFUND FAILED for', userId, price, e.message)
    );

  // 2) give the Discord role
  const hadRole = member.roles.cache.has(item.roleId);
  try {
    if (!hadRole) await member.roles.add(item.roleId, 'Halloween Shop purchase');
  } catch (err) {
    console.error('[halloweenShop] role add failed:', err.message);
    await refund();
    return fail(
      "I couldn't give you that role (my role must be **above** it and I need Manage Roles). " +
      'Your points were refunded — tell a staff member.'
    );
  }

  // 3) save the expiry (never past the event end)
  let expiresAt = new Date(now.getTime() + cfg.DEFAULT_DURATION_DAYS * DAY_MS);
  if (expiresAt > cfg.EVENT_END) expiresAt = cfg.EVENT_END;

  try {
    await ShopRole.findOneAndUpdate(
      { guildId, userId, roleId: item.roleId },
      { $set: { itemKey: item.key, free: false, expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error('[halloweenShop] saving purchase failed:', err.message);
    if (!hadRole) await member.roles.remove(item.roleId).catch(() => {});
    await refund();
    return fail('Something went wrong saving your purchase. Your points were refunded — try again.');
  }

  log(guild.client, 'SHOP', {
    description: `<@${userId}> bought <@&${item.roleId}>`,
    fields: [
      { name: 'Cost', value: `${fmt(price)} ${HALLOWEEN_POINTS_EMOJI}`, inline: true },
      { name: 'Expires', value: `<t:${unix(expiresAt)}:R>`, inline: true },
      { name: 'Balance', value: `${fmt(charged.halloweenPoints)} ${HALLOWEEN_POINTS_EMOJI}`, inline: true },
    ],
  }).catch(() => {});

  const ownedCount = active.length + (await ShopRole.countDocuments({ guildId, userId, free: true, expiresAt: { $gt: now } }).catch(() => 0));
  const colorHint = ownedCount >= 1
    ? '\n🎨 Want a different name color? Tap **Roles** below to choose which role you wear.'
    : '';

  return success(
    `${item.emoji} You bought <@&${item.roleId}>! It expires <t:${unix(expiresAt)}:R>.\n` +
    `💰 Balance: **${fmt(charged.halloweenPoints)}** ${HALLOWEEN_POINTS_EMOJI}${colorHint}`
  );
}

async function purchaseCure(guild, member) {
  const infection = await getActiveInfection(guild.id, member.id);
  if (!infection) return fail('You are not currently infected.');

  const charged = await User.findOneAndUpdate(
    { guildId: guild.id, userId: member.id, halloweenPoints: { $gte: cfg.CURE_PRICE } },
    { $inc: { halloweenPoints: -cfg.CURE_PRICE } },
    { new: true }
  );
  if (!charged) {
    const user = await User.findOne({ guildId: guild.id, userId: member.id }).lean();
    return fail(`Not enough points — the cure costs **${fmt(cfg.CURE_PRICE)}** ${HALLOWEEN_POINTS_EMOJI} and you have **${fmt(user?.halloweenPoints ?? 0)}**.`);
  }

  const cured = await cureMember(guild, member);
  if (!cured.ok) {
    await addHalloweenPoints(guild.id, member.id, cfg.CURE_PRICE);
    return fail(`${cured.reason} Your points were refunded.`);
  }

  return success(
    `${cfg.CURE_ITEM.emoji} **You have been cured!** The infected role has been removed.\n` +
    `💰 Balance: **${fmt(charged.halloweenPoints)}** ${HALLOWEEN_POINTS_EMOJI}`
  );
}

// ─── free lantern (pick one, swap any time) ──────────────────────────────
async function claimFreeRole(guild, member, itemKey) {
  const item = cfg.FREE_ITEMS.find((i) => i.key === itemKey);
  if (!item) return fail("That free role doesn't exist.");
  if (new Date() >= cfg.EVENT_END) return fail('The Halloween event is over.');

  const guildId = guild.id;
  const userId = member.id;

  const role = guild.roles.cache.get(item.roleId) || (await guild.roles.fetch(item.roleId).catch(() => null));
  if (!role) return fail(`The **${item.name}** role doesn't exist on this server — tell a staff member.`);

  const otherIds = cfg.FREE_ITEMS.filter((i) => i.key !== itemKey).map((i) => i.roleId);

  try {
    if (!member.roles.cache.has(item.roleId)) await member.roles.add(item.roleId, 'Halloween Shop free role');
    const toRemove = otherIds.filter((id) => member.roles.cache.has(id));
    if (toRemove.length) await member.roles.remove(toRemove, 'Halloween Shop free role swap');
  } catch (err) {
    console.error('[halloweenShop] free role change failed:', err.message);
    return fail("I couldn't give you that role (my role must be **above** it and I need Manage Roles). Tell a staff member.");
  }

  await ShopRole.deleteMany({ guildId, userId, free: true, roleId: { $ne: item.roleId } });
  await ShopRole.findOneAndUpdate(
    { guildId, userId, roleId: item.roleId },
    { $set: { itemKey: item.key, free: true, expiresAt: cfg.EVENT_END } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return success(
    `🎁 You picked ${item.emoji} <@&${item.roleId}> — it's yours for free until the event ends.\n` +
    '🎨 Tap **Roles** below to choose what you wear.'
  );
}

// ─── expiry sweep ────────────────────────────────────────────────────────
let sweeping = false;

async function sweepExpired(client) {
  if (sweeping) return;
  sweeping = true;
  try {
    const expired = await ShopRole.find({ expiresAt: { $lte: new Date() } }).limit(500);

    for (const rec of expired) {
      try {
        const guild = client.guilds.cache.get(rec.guildId);
        if (!guild) continue; // bot isn't in that server right now — try again next sweep

        // Skip if the record changed between the query above and now.
        const fresh = await ShopRole.findById(rec._id);
        if (!fresh || fresh.expiresAt > new Date()) continue;

        let member = null;
        try {
          member = await guild.members.fetch(rec.userId);
        } catch (err) {
          if (err.code !== 10007) throw err; // 10007 = they left the server, nothing to remove
        }

        // If they took the role off in 🎨 Roles, there's nothing to remove.
        if (member && member.roles.cache.has(rec.roleId)) {
          await member.roles.remove(rec.roleId, 'Halloween Shop role expired');
        }
        await ShopRole.deleteOne({ _id: rec._id, expiresAt: { $lte: new Date() } });
      } catch (err) {
        console.error(`[halloweenShop] failed to expire ${rec.roleId} for ${rec.userId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[halloweenShop] sweep failed:', err.message);
  } finally {
    sweeping = false;
  }
}

module.exports = {
  shopItems,
  arrangeRoleHierarchy,
  buildPanel,
  buildShopView,
  buildRolesView,
  buildConfirmView,
  buildCureConfirmView,
  purchaseRole,
  purchaseCure,
  setWornRoles,
  claimFreeRole,
  sweepExpired,
};
