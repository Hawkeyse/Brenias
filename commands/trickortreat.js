const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const HalloweenTrickOrTreat = require('../models/HalloweenTrickOrTreat');
const User = require('../models/User');

const DAILY_LIMIT = 10;
const ICON_DIR = path.join(__dirname, '../Assets/halloween/icons');
const HOUSES = [
  { name: "Witch's House", emoji: '🏚️' },
  { name: 'Pumpkin House', emoji: '🎃' },
  { name: 'Haunted Mansion', emoji: '👻' },
  { name: 'Abandoned House', emoji: '🏚️' },
];
const FINDS = ['Lollipop', 'Mystery Potion', 'Pumpkin', 'Candy Corn', 'Chocolate Bar'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function reserveDailyUse(guildId, userId, day) {
  const filter = { guildId, userId, day, uses: { $lt: DAILY_LIMIT } };
  await HalloweenTrickOrTreat.updateOne(
    { guildId, userId, day, uses: { $exists: false } },
    { $set: { uses: 1 } }
  );

  try {
    return await HalloweenTrickOrTreat.findOneAndUpdate(
      filter,
      { $inc: { uses: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return HalloweenTrickOrTreat.findOneAndUpdate(filter, { $inc: { uses: 1 } }, { new: true });
  }
}

async function addCandy(guildId, userId, amount) {
  return User.findOneAndUpdate(
    { guildId, userId },
    { $inc: { candy: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function takeCandy(guildId, userId, amount) {
  const current = await User.findOne({ guildId, userId }).select('candy').lean();
  const lost = Math.min(amount, current?.candy ?? 0);
  if (!lost) return 0;
  const updated = await User.findOneAndUpdate(
    { guildId, userId, candy: { $gte: lost } },
    { $inc: { candy: -lost } },
    { new: true }
  );
  return updated ? lost : 0;
}

function iconAttachment(name) {
  const filePath = path.join(ICON_DIR, `${name}.png`);
  if (!fs.existsSync(filePath)) return null;
  const fileName = `trick-or-treat-${name}.png`;
  return { attachment: new AttachmentBuilder(filePath, { name: fileName }), fileName };
}

function nextUtcDayTimestamp(day) {
  const nextDay = new Date(`${day}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return Math.floor(nextDay.getTime() / 1000);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trick-or-treat')
    .setDescription('Go trick-or-treating up to 10 times today.')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const day = new Date().toISOString().slice(0, 10);

    try {
      const daily = await reserveDailyUse(guildId, userId, day);
      if (!daily) {
        return interaction.editReply(`🎃 You used all **${DAILY_LIMIT}** visits today. Come back <t:${nextUtcDayTimestamp(day)}:R>!`);
      }

      const house = HOUSES[Math.floor(Math.random() * HOUSES.length)];
      const roll = Math.random();
      let title;
      let description;
      let color;
      let outcome;
      let amount = 0;
      let iconName;

      if (roll < 0.5) {
        title = '🍬 TRICK OR TREAT!';
        amount = randomInt(20, 50);
        await addCandy(guildId, userId, amount);
        outcome = 'candy';
        iconName = 'candy';
        color = '#2ECC71';
        description = `The owner gives you **${amount}** 🍬!`;
      } else if (roll < 0.7) {
        title = '✨ LUCKY!';
        const item = FINDS[Math.floor(Math.random() * FINDS.length)];
        await User.findOneAndUpdate(
          { guildId, userId },
          { $addToSet: { inventory: item } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        outcome = 'found-item';
        iconName = 'rare';
        color = '#9B59B6';
        description = `You found a **${item}**!`;
      } else if (roll < 0.85) {
        title = '💀 CURSED!';
        amount = await takeCandy(guildId, userId, randomInt(10, 30));
        outcome = 'lost-candy';
        iconName = 'skull';
        color = '#E74C3C';
        description = amount
          ? `Something cursed followed you home — you lost **${amount}** 🍬!`
          : 'Something cursed followed you home, but you had no candy to take!';
      } else {
        title = '👻 YOU GOT TRICKED!';
        amount = await takeCandy(guildId, userId, randomInt(5, 15));
        outcome = 'dropped-candy';
        iconName = 'ghost';
        color = '#F1C40F';
        description = amount
          ? `A ghost scared you and you dropped **${amount}** 🍬!`
          : 'A ghost scared you, but your pockets were already empty!';
      }

      daily.lastOutcome = outcome;
      daily.lastAmount = amount;
      await daily.save();

      const account = await User.findOne({ guildId, userId }).select('candy').lean();
      const left = DAILY_LIMIT - daily.uses;
      const houseIcon = iconAttachment('house');
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setAuthor({
          name: `You visited the ${house.name}...`,
          iconURL: houseIcon ? `attachment://${houseIcon.fileName}` : undefined,
        })
        .setDescription(
          `${description}\n\n` +
          `🍭 **${left}/${DAILY_LIMIT}** Trick-or-Treats left today — run \/trick-or-treat again!`
        )
        .setFooter({ text: `Candy balance: ${(account?.candy ?? 0).toLocaleString()} 🍬` });
      const icon = iconAttachment(iconName);
      if (icon) embed.setThumbnail(`attachment://${icon.fileName}`);

      return interaction.editReply({
        embeds: [embed],
        files: [houseIcon, icon].filter(Boolean).map((entry) => entry.attachment),
      });
    } catch (error) {
      console.error('[trick-or-treat] error:', error);
      return interaction.editReply('❌ I could not finish your Trick-or-Treat. Please try again later.');
    }
  },
};