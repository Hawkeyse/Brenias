const { PermissionsBitField } = require('discord.js');
const HalloweenInfection = require('../models/HalloweenInfection');
const cfg = require('./halloweenShopConfig');

const INFECTION_DURATION_MS = 60 * 60 * 1000;
const INFECTED_MESSAGE_COOLDOWN_MS = 50 * 1000;
const SHOP_CHANNEL_ID = process.env.HALLOWEEN_SHOP_CHANNEL_ID || '';

async function getActiveInfection(guildId, userId) {
  const infection = await HalloweenInfection.findOne({
    guildId,
    userId,
    expiresAt: { $gt: new Date() },
  });
  return infection;
}

async function isInfected(guildId, userId) {
  return !!(await getActiveInfection(guildId, userId));
}

async function updateHistoryPermissions(guild, roleId, infected) {
  if (!SHOP_CHANNEL_ID) return;

  const channels = guild.channels.cache.filter((channel) =>
    channel.isTextBased() && channel.permissionOverwrites
  );

  for (const channel of channels.values()) {
    const canReadHistory = infected && channel.id === SHOP_CHANNEL_ID;
    await channel.permissionOverwrites.edit(roleId, {
      [PermissionsBitField.Flags.ReadMessageHistory]: canReadHistory ? null : false,
    }, {
      reason: infected ? 'Halloween infection: limit message history' : 'Halloween infection ended',
    }).catch((err) => {
      console.error(`[halloweenInfection] permission update failed in ${channel.id}:`, err.message);
    });
  }
}

async function infectMember(guild, member, infectedBy) {
  const role = await guild.roles.fetch(cfg.INFECTION_ROLE_ID).catch(() => null);
  if (!role) return { ok: false, reason: 'The infected role does not exist.' };

  try {
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Halloween infection');
    }
  } catch (err) {
    console.error('[halloweenInfection] role add failed:', err.message);
    return { ok: false, reason: 'I could not add the infected role. Check Manage Roles and role order.' };
  }

  const expiresAt = new Date(Date.now() + INFECTION_DURATION_MS);
  await HalloweenInfection.findOneAndUpdate(
    { guildId: guild.id, userId: member.id },
    { $set: { infectedBy, expiresAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await updateHistoryPermissions(guild, role.id, true);

  return { ok: true, expiresAt };
}

async function cureMember(guild, member) {
  const infection = await HalloweenInfection.findOneAndDelete({
    guildId: guild.id,
    userId: member.id,
  });
  if (!infection) return { ok: false, reason: 'You are not currently infected.' };

  try {
    if (member.roles.cache.has(cfg.INFECTION_ROLE_ID)) {
      await member.roles.remove(cfg.INFECTION_ROLE_ID, 'Halloween infection cured');
    }
  } catch (err) {
    await HalloweenInfection.create(infection.toObject()).catch(() => {});
    console.error('[halloweenInfection] role remove failed:', err.message);
    return { ok: false, reason: 'I could not remove the infected role. Tell a staff member.' };
  }

  const role = await guild.roles.fetch(cfg.INFECTION_ROLE_ID).catch(() => null);
  if (role) await updateHistoryPermissions(guild, role.id, false);
  return { ok: true };
}

async function sweepExpiredInfections(client) {
  const expired = await HalloweenInfection.find({ expiresAt: { $lte: new Date() } }).limit(200);

  for (const infection of expired) {
    try {
      const guild = client.guilds.cache.get(infection.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(infection.userId).catch(() => null);
      if (member?.roles.cache.has(cfg.INFECTION_ROLE_ID)) {
        await member.roles.remove(cfg.INFECTION_ROLE_ID, 'Halloween infection expired');
      }
      const role = await guild.roles.fetch(cfg.INFECTION_ROLE_ID).catch(() => null);
      if (role) await updateHistoryPermissions(guild, role.id, false);
      await HalloweenInfection.deleteOne({ _id: infection._id, expiresAt: { $lte: new Date() } });
    } catch (err) {
      console.error(`[halloweenInfection] expiry failed for ${infection.userId}:`, err.message);
    }
  }
}

module.exports = {
  INFECTION_DURATION_MS,
  INFECTED_MESSAGE_COOLDOWN_MS,
  SHOP_CHANNEL_ID,
  getActiveInfection,
  isInfected,
  infectMember,
  cureMember,
  sweepExpiredInfections,
  updateHistoryPermissions,
};
