const EmoteHunt = require('../models/EmoteHunt');
const { HUNT_INTERVAL_MS, startEmoteHunt } = require('../utils/emoteHunt');

const CHECK_INTERVAL_MS = 60 * 1000;

module.exports = (client) => {
  let checking = false;

  const checkSchedule = async () => {
    if (checking) return;
    checking = true;

    try {
      await startEmoteHunt(client);
    } catch (err) {
      console.error('[emoteHuntScheduler] error:', err);
    } finally {
      checking = false;
    }
  };

  checkSchedule();
  setInterval(checkSchedule, CHECK_INTERVAL_MS);
  console.log(`[emoteHuntScheduler] Ready – checking for a new round every ${HUNT_INTERVAL_MS / 3600000} hours`);
};