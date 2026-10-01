const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ChannelType, EmbedBuilder } = require('discord.js');
const HalloweenPuzzle = require('../models/HalloweenPuzzle');
const HalloweenPuzzleSchedule = require('../models/HalloweenPuzzleSchedule');
const { logPuzzlePosted } = require('./halloweenLog');

const NEXT_PUZZLE_DELAY_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const REWARD_POINTS = 300;
const postingGuilds = new Set();

async function generatePuzzle() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');

  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' },
  });
  const result = await model.generateContent(
    'Create one original, short Halloween riddle for a Discord game. The answer must be a single ' +
    'common word or short phrase, unambiguous, and not included in the riddle. Return only JSON ' +
    'with string properties "question" and "answer". The question should be one or two sentences.'
  );
  const puzzle = JSON.parse(result.response.text());
  const question = String(puzzle.question || '').trim();
  const answer = String(puzzle.answer || '').trim().toLowerCase();
  if (!question || !answer || question.length > 800 || answer.length > 60) {
    throw new Error('AI returned an invalid Halloween puzzle.');
  }
  return { question, answer };
}

async function postNextPuzzle(client, guildId, { force = false } = {}) {
  if (postingGuilds.has(guildId)) return { posted: false, reason: 'posting' };
  postingGuilds.add(guildId);

  try {
    const schedule = await HalloweenPuzzleSchedule.findOne({ guildId, enabled: true });
    if (!schedule) return { posted: false, reason: 'not-configured' };
    if (!force && (!schedule.nextPostAt || schedule.nextPostAt > new Date())) {
      return { posted: false, reason: 'not-due' };
    }

    const active = await HalloweenPuzzle.findOne({ guildId, channelId: schedule.channelId, solved: false });
    if (active) return { posted: false, reason: 'active' };

    const channel = await client.channels.fetch(schedule.channelId).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      throw new Error(`Puzzle channel ${schedule.channelId} is unavailable or not a text channel.`);
    }

    const puzzleData = await generatePuzzle();
    const count = await HalloweenPuzzle.countDocuments({ guildId });
    const puzzle = await HalloweenPuzzle.create({
      guildId,
      number: count + 1,
      question: puzzleData.question,
      answer: puzzleData.answer,
      channelId: channel.id,
      reward: REWARD_POINTS,
    });

    const embed = new EmbedBuilder()
      .setColor('#FF7518')
      .setTitle(`🧩 Halloween Puzzle #${puzzle.number}`)
      .setDescription(puzzle.question)
      .addFields({ name: '\u200b', value: 'First correct answer wins **300 Halloween Points**. Type your answer below!' });

    try {
      const message = await channel.send({ embeds: [embed] });
      puzzle.messageId = message.id;
      await puzzle.save();
      schedule.lastPostedAt = new Date();
      schedule.nextPostAt = null;
      await schedule.save();
      await logPuzzlePosted(client, { number: puzzle.number, reward: REWARD_POINTS, channelId: channel.id });
      return { posted: true, puzzle, message };
    } catch (error) {
      puzzle.solved = true;
      await puzzle.save().catch(() => {});
      throw error;
    }
  } catch (error) {
    await HalloweenPuzzleSchedule.updateOne(
      { guildId, enabled: true },
      { $set: { nextPostAt: new Date(Date.now() + RETRY_DELAY_MS) } }
    ).catch(() => {});
    throw error;
  } finally {
    postingGuilds.delete(guildId);
  }
}

async function scheduleNextPuzzle(guildId) {
  const schedule = await HalloweenPuzzleSchedule.findOneAndUpdate(
    { guildId, enabled: true },
    { $set: { nextPostAt: new Date(Date.now() + NEXT_PUZZLE_DELAY_MS) } },
    { new: true }
  );
  return schedule?.nextPostAt ?? null;
}

async function checkDuePuzzles(client) {
  const due = await HalloweenPuzzleSchedule.find({
    enabled: true,
    nextPostAt: { $lte: new Date() },
  }).select('guildId');

  for (const schedule of due) {
    await postNextPuzzle(client, schedule.guildId).catch((error) => {
      console.error('[halloweenPuzzle] scheduled post failed:', error.message);
    });
  }
}

module.exports = {
  NEXT_PUZZLE_DELAY_MS,
  REWARD_POINTS,
  generatePuzzle,
  postNextPuzzle,
  scheduleNextPuzzle,
  checkDuePuzzles,
};