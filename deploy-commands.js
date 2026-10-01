// deploy-commands.js
// Updated: April 20, 2026 - Better duplicate handling + manual command support

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const seen = new Set(); // Prevent duplicate command names

function loadCommandFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      loadCommandFiles(fullPath); // Recursive support for subfolders
    } 
    else if (file.name.endsWith('.js')) {
      try {
        delete require.cache[require.resolve(fullPath)]; // Clear cache to avoid stale requires
        const command = require(fullPath);

        if (command?.data?.name) {
          const name = command.data.name;

          if (seen.has(name)) {
            console.warn(`⚠️  Duplicate command skipped: /${name} (from ${file.name})`);
            continue;
          }

          seen.add(name);
          commands.push(command.data.toJSON());
          console.log(`✅ Loaded: /${name}`);
        } else {
          console.warn(`⚠️  Invalid command file (missing data.name): ${file.name}`);
        }
      } catch (err) {
        console.error(`❌ Failed to load ${file.name}:`, err.message);
      }
    }
  }
}

// ────────────────────────────────────────────────
//                  LOAD COMMANDS
// ────────────────────────────────────────────────
if (fs.existsSync(commandsPath)) {
  loadCommandFiles(commandsPath);
} else {
  console.error('❌ Commands folder not found!');
  process.exit(1);
}

if (commands.length === 0) {
  console.error('❌ No valid commands found!');
  process.exit(1);
}

console.log(`\n📊 Found ${commands.length} unique commands to deploy`);

// ────────────────────────────────────────────────
//                  DEPLOY CONFIG
// ────────────────────────────────────────────────
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

const isGlobal = process.env.GLOBAL_DEPLOY === 'true' || !GUILD_ID;

const rest = new REST({ version: '10' }).setToken(TOKEN);

const route = isGlobal
  ? Routes.applicationCommands(CLIENT_ID)
  : Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);

// ────────────────────────────────────────────────
//                  DEPLOY
// ────────────────────────────────────────────────
(async () => {
  try {
    console.log(`\n🚀 Deploying to: ${isGlobal ? 'GLOBAL' : `GUILD ${GUILD_ID}`}`);

    // 1. Delete old commands
    console.log('🗑️  Fetching & deleting old commands...');
    const existing = await rest.get(route);
    console.log(`Found ${existing.length} existing commands`);

    for (const cmd of existing) {
      const deleteRoute = isGlobal
        ? Routes.applicationCommand(CLIENT_ID, cmd.id)
        : Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, cmd.id);

      await rest.delete(deleteRoute);
      console.log(`   Deleted: /${cmd.name}`);
    }

    // 2. Register new commands
    console.log('\n📝 Registering new commands...');
    const registered = await rest.put(route, { body: commands });

    console.log(`\n🎉 Successfully deployed ${registered.length} commands!`);
    console.log(registered.map(c => `   /${c.name}`).join('\n'));

    console.log('\n✅ Done! Commands should appear shortly (refresh Discord).');

  } catch (error) {
    console.error('\n❌ DEPLOY FAILED:', error.message);

    if (error.code === 50001) console.error('→ Missing `applications.commands` scope in bot invite.');
    if (error.code === 50013) console.error('→ Bot needs Manage Guild permission.');
    if (error.code === 429) console.error('→ Rate limited. Wait a few minutes.');

    process.exit(1);
  }
})();