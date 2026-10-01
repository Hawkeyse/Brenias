const { ChannelType, EmbedBuilder } = require('discord.js');
const HalloweenPuzzle = require('../models/HalloweenPuzzle');
const HalloweenPuzzleSchedule = require('../models/HalloweenPuzzleSchedule');
const { logPuzzlePosted } = require('./halloweenLog');

const NEXT_PUZZLE_DELAY_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
const REWARD_POINTS = 300;
const postingGuilds = new Set();
const DAILY_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000;
let aiCooldownUntil = 0;
let lastQuotaWarningAt = 0;
let lastFallbackIndex = -1;

const FALLBACK_PUZZLES = [
  { question: 'I have hands but cannot clap, and a face but cannot smile. What am I?', answer: 'clock' },
  { question: 'The more you take away from me, the larger I become. What am I?', answer: 'a hole' },
  { question: 'I have teeth but never bite, and I help tame a tangled mane. What am I?', answer: 'comb' },
  { question: 'I get wetter while helping you dry off after a midnight swim. What am I?', answer: 'towel' },
  { question: 'I have keys but open no locks, and music lives beneath my fingers. What am I?', answer: 'piano' },
  { question: 'I have a neck but no head, and I may hold a potion for a witch. What am I?', answer: 'bottle' },
  { question: 'I fly without wings, cry without eyes, and darkness follows wherever I go. What am I?', answer: 'cloud' },
  { question: 'I have one eye but cannot see, though I help stitch a spooky disguise. What am I?', answer: 'needle' },
  { question: 'I have a bed but never sleep, and I run without legs past the haunted mill. What am I?', answer: 'river' },
  { question: 'I guard a tiny flame, grow shorter as I work, and often glow in a pumpkin. What am I?', answer: 'candle' },
  { question: 'I have many branches but no leaves, and the ghost may keep treasure in me. What am I?', answer: 'bank' },
  { question: 'I am full of holes but still hold water for a thirsty monster. What am I?', answer: 'sponge' },
];

function fallbackPuzzle() {
  let index = Math.floor(Math.random() * FALLBACK_PUZZLES.length);
  if (FALLBACK_PUZZLES.length > 1 && index === lastFallbackIndex) {
    index = (index + 1 + Math.floor(Math.random() * (FALLBACK_PUZZLES.length - 1))) % FALLBACK_PUZZLES.length;
  }
  lastFallbackIndex = index;
  return FALLBACK_PUZZLES[index];
}

async function generatePuzzle() {
  if (!process.env.OPENAI_API_KEY || Date.now() < aiCooldownUntil) return fallbackPuzzle();

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        instructions:
          'Create one original, short Halloween riddle for a Discord game. The answer must be a single ' +
          'common word or short phrase, unambiguous, and not included in the riddle. Return only JSON ' +
          'with string properties question and answer. The question should be one or two sentences.',
        input: 'Generate one Halloween riddle and its answer.',
        text: { format: { type: 'json_object' } },
        max_output_tokens: 160,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(`OpenAI returned HTTP ${response.status}: ${errorBody.slice(0, 400)}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      throw error;
    }

    const payload = await response.json();
    const rawText = payload.output_text || payload.output
      ?.flatMap((block) => block.content || [])
      .find((item) => item.type === 'output_text')?.text;
    if (!rawText) throw new Error('OpenAI returned no puzzle text.');

    const puzzle = JSON.parse(rawText.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const question = String(puzzle.question || '').trim();
    const answer = String(puzzle.answer || '').trim().toLowerCase();
    if (!question || !answer || question.length > 800 || answer.length > 60) {
      throw new Error('OpenAI returned an invalid Halloween puzzle.');
    }
    return { question, answer };
  } catch (error) {
    const isRateLimit = error.status === 429 || /quota|rate.?limit/i.test(error.message || '');
    if (isRateLimit) {
      const dailyLimit = /per.?day|daily|quota.?exceeded|current quota|insufficient[_ -]quota|billing/i.test(error.message || '');
      const retryAfterMs = Number(error.retryAfter) * 1000;
      aiCooldownUntil = Date.now() + (dailyLimit
        ? DAILY_QUOTA_COOLDOWN_MS
        : Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 15 * 60 * 1000);
      if (Date.now() - lastQuotaWarningAt > 60 * 60 * 1000) {
        console.warn('[halloweenPuzzle] OpenAI quota/rate limit reached; using local riddles until cooldown expires.');
        lastQuotaWarningAt = Date.now();
      }
    } else {
      console.error('[halloweenPuzzle] OpenAI puzzle generation failed; using local riddle:', error.message);
    }
    return fallbackPuzzle();
  }
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