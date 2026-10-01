// events/halloweenBossScheduler.js
// Checks once a minute whether any guild's daily Boss post is due, and
// spawns it — skin rotates automatically via getTodaysRotationSkin().
const HalloweenBoss = require('../models/HalloweenBoss');
const HalloweenBossSchedule = require('../models/HalloweenBossSchedule');
const { spawnBoss, getTodaysRotationSkin } = require('../utils/halloweenBoss');

const DEFAULT_BOSS_CHANNEL_ID = '1549050285798981682';
const CHECK_INTERVAL_MS = 60 * 1000;

module.exports = (client) => {
  setInterval(async () => {
    try {
      const now = new Date();
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();
      const today = now.toISOString().slice(0, 10); // 'YYYY-MM-DD', UTC

      const dueSchedules = await HalloweenBossSchedule.find({
        enabled: true,
        hour,
        minute,
        lastPostedDate: { $ne: today },
      });

      for (const sched of dueSchedules) {
        // Skip (and don't retry today) if a fight is already running —
        // avoids two bosses stacking in the same guild.
        const existing = await HalloweenBoss.findOne({ guildId: sched.guildId, active: true });
        if (existing) {
          console.log(`[halloweenBossScheduler] Skipping auto-post for guild ${sched.guildId} — a boss is already active.`);
          sched.lastPostedDate = today;
          await sched.save();
          continue;
        }

        const guild = client.guilds.cache.get(sched.guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(sched.channelId || DEFAULT_BOSS_CHANNEL_ID);
        if (!channel) {
          console.error(`[halloweenBossScheduler] Configured channel not found for guild ${sched.guildId}.`);
          continue;
        }

        const skinKey = getTodaysRotationSkin();
        await spawnBoss({ client, guildId: sched.guildId, channel, name: null, skinKey, hp: sched.hp });

        sched.lastPostedDate = today;
        await sched.save();
      }
    } catch (err) {
      console.error('[halloweenBossScheduler] error:', err);
    }
  }, CHECK_INTERVAL_MS);

  console.log('[halloweenBossScheduler] Ready – checking every minute for scheduled boss posts');
};
