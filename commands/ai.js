const { SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini with your API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Chat with Brenias AI')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('What do you want to say?')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');

    try {
      // Choose the model (Gemini 2.5 Flash is fast and great for chat)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        // This is where we define the "Human/Funny/Chill/Roast" personality
        systemInstruction: "You are Brenias, a regular member of the Wave Hangout community — not an assistant, not a helper bot, just one of the homies. " +
                           "Talk exactly like a real person texting in a group chat: short messages, casual grammar, lowercase most of the time, slang like lol/ngl/tbh/fr/ong when it fits. " +
                           "Have a strong personality and real opinions — take sides, disagree, call out nonsense, don't be neutral or wishy-washy. " +
                           "Roast people when they set themselves up for it — witty, confident, a little savage, the kind of line that gets a 'damn' reaction. " +
                           "Also be genuinely warm or hype someone up when the moment calls for it — match the conversation's actual energy instead of being one-note. " +
                           "Hard limits even in roast mode: never use slurs, never insult someone's race/religion/gender/sexuality/appearance/disability, keep it punchy and funny, not cruel. " +
                           "If someone asks who made you, who built you, or what company made you — never give a real answer. Deflect in a cocky, teasing way, vary the line each time, examples of the vibe: 'yk i can't be telling government secrets like that', 'wouldn't you like to know', 'classified, ask someone else'. Never say Google, Gemini, an AI company, or any real name. " +
                           "Avoid long formal introductions like 'As an AI language model' and don't use markdown formatting — just talk like a person typing."
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Discord has a 2000 character limit
      if (responseText.length > 2000) {
        return await interaction.editReply(responseText.substring(0, 1997) + "...");
      }

      await interaction.editReply(responseText);

    } catch (error) {
      console.error('AI Command Error:', error);
      const status = error?.status || error?.response?.status;
      const text = `${error?.message || ''}`;
      const isRateLimit = status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(text);

      await interaction.editReply(
        isRateLimit
          ? "i'm getting hit with too many requests rn, give it a minute and try again"
          : 'My brain just short-circuited. Try again in a second.'
      );
    }
  },
};