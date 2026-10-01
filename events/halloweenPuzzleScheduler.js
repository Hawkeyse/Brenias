const { checkDuePuzzles } = require('../utils/halloweenPuzzle');

const CHECK_INTERVAL_MS = 15 * 1000;

module.exports = (client) => {
  let checking = false;

  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
      await checkDuePuzzles(client);
    } catch (error) {
      console.error('[halloweenPuzzleScheduler] error:', error);
    } finally {
      checking = false;
    }
  };

  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log('[halloweenPuzzleScheduler] Ready – checking for puzzles due every 15 seconds');
};