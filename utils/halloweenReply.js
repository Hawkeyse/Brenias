// utils/halloweenReply.js
// Tiny shared helper so every short status reply (errors, permission
// checks, confirmations) is a consistent embed instead of each command
// building its own one-off EmbedBuilder for a single line of text.
const { EmbedBuilder } = require('discord.js');

const COLORS = {
  success: '#57F287',
  error: '#ED4245',
  warning: '#FEE75C',
  info: '#FF7518',
};

function simpleEmbed(description, color = COLORS.info) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports = { simpleEmbed, COLORS };
