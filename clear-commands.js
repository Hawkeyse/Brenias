// clear-commands.js
// One-time cleanup: wipes Discord slash commands from BOTH the global scope
// and the specific guild scope. Run this if the same command is showing up
// twice in Discord's "/" picker — that almost always means the same command
// name got registered both globally AND to your guild at different points
// (deploy-commands.js only ever clears one scope per run, whichever
// GLOBAL_DEPLOY/GUILD_ID pointed it at that time).
//
// After running this, wait a moment, then run deploy-commands.js ONCE with
// a consistent GLOBAL_DEPLOY/GUILD_ID setting going forward.

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !TOKEN) {
  console.error('❌ Missing CLIENT_ID or DISCORD_TOKEN in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🗑️  Clearing GLOBAL commands...');
    const globalExisting = await rest.get(Routes.applicationCommands(CLIENT_ID));
    console.log(`   Found ${globalExisting.length} global command(s)`);
    for (const cmd of globalExisting) {
      await rest.delete(Routes.applicationCommand(CLIENT_ID, cmd.id));
      console.log(`   Deleted global: /${cmd.name}`);
    }
    // Belt-and-suspenders: an empty PUT wipes everything in one call too,
    // in case anything above got missed (e.g. a command added mid-loop).
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    if (GUILD_ID) {
      console.log(`\n🗑️  Clearing GUILD commands for ${GUILD_ID}...`);
      const guildExisting = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
      console.log(`   Found ${guildExisting.length} guild command(s)`);
      for (const cmd of guildExisting) {
        await rest.delete(Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id));
        console.log(`   Deleted guild: /${cmd.name}`);
      }
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    } else {
      console.log('\nℹ️  No GUILD_ID set in .env — skipped guild-scope clearing.');
    }

    console.log('\n✅ All commands cleared from every scope.');
    console.log('   Global deletions can take up to ~1 hour to disappear from Discord\'s UI everywhere.');
    console.log('   Guild deletions are instant.');
    console.log('\n👉 Next: run `node deploy-commands.js` once with a consistent GLOBAL_DEPLOY/GUILD_ID setting to repopulate cleanly.');
  } catch (error) {
    console.error('\n❌ CLEAR FAILED:', error.message);
    if (error.code === 50001) console.error('→ Missing `applications.commands` scope in bot invite.');
    if (error.code === 429) console.error('→ Rate limited. Wait a few minutes.');
    process.exit(1);
  }
})();