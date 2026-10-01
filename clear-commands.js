// clear-commands.js
// One-time cleanup: wipes Discord slash commands from the global scope and
// every guild the bot is currently in. Run this if commands are duplicated
// in Discord's "/" picker because they were registered in multiple scopes.
//
// After running this, run deploy-commands.js once with a consistent
// GLOBAL_DEPLOY/GUILD_ID setting going forward.

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
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
      console.log('   Cleared global commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    const guilds = GUILD_ID
      ? [{ id: GUILD_ID }]
      : await rest.get(Routes.userGuilds());

    for (const guild of guilds) {
      console.log(`\n🗑️  Clearing GUILD commands for ${guild.id}...`);
      const guildExisting = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, guild.id));
      console.log(`   Found ${guildExisting.length} guild command(s)`);
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] });
        console.log('   Cleared guild commands.');
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] });
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