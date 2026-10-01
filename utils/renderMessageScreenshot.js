// utils/renderMessageScreenshot.js
// Renders a Discord-message-style "screenshot" image of a message using
// @napi-rs/canvas (already a project dependency). Used by the Do Not Post
// system to capture evidence before deleting the offending message.

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const WIDTH = 600;
const PADDING = 16;
const AVATAR_SIZE = 40;
const LINE_HEIGHT = 22;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.avatarURL
 * @param {string} opts.content
 * @param {Date} opts.timestamp
 * @param {string[]} [opts.attachmentURLs]
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderMessageScreenshot({ username, avatarURL, content, timestamp, attachmentURLs = [] }) {
  // Measure text height first using a throwaway canvas/context
  const measureCanvas = createCanvas(WIDTH, 100);
  const mctx = measureCanvas.getContext('2d');
  mctx.font = '15px sans-serif';

  const textMaxWidth = WIDTH - PADDING * 2 - AVATAR_SIZE - 12;
  const contentLines = content ? wrapText(mctx, content, textMaxWidth) : [];

  const headerHeight = AVATAR_SIZE;
  const textBlockHeight = Math.max(contentLines.length * LINE_HEIGHT, LINE_HEIGHT);
  const attachmentNoteHeight = attachmentURLs.length > 0 ? 22 : 0;

  const totalHeight = PADDING * 2 + headerHeight + 6 + textBlockHeight + attachmentNoteHeight;

  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');

  // Background (Discord dark theme)
  ctx.fillStyle = '#313338';
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  // Avatar
  const avatarX = PADDING;
  const avatarY = PADDING;
  try {
    const avatarImg = await loadImage(avatarURL);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const textX = avatarX + AVATAR_SIZE + 12;

  // Username
  ctx.fillStyle = '#f2f3f5';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(username, textX, avatarY + 16);

  // Timestamp
  const timeStr = timestamp.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
  ctx.fillStyle = '#949ba4';
  ctx.font = '12px sans-serif';
  const usernameWidth = ctx.measureText(username).width;
  ctx.font = 'bold 15px sans-serif';
  const usernameWidthBold = ctx.measureText(username).width;
  ctx.font = '12px sans-serif';
  ctx.fillText(timeStr, textX + usernameWidthBold + 8, avatarY + 16);

  // Message content
  ctx.fillStyle = '#dbdee1';
  ctx.font = '15px sans-serif';
  let cursorY = avatarY + 16 + 22;
  for (const line of contentLines) {
    ctx.fillText(line, textX, cursorY);
    cursorY += LINE_HEIGHT;
  }

  // Attachment note
  if (attachmentURLs.length > 0) {
    ctx.fillStyle = '#949ba4';
    ctx.font = 'italic 13px sans-serif';
    ctx.fillText(
      `📎 ${attachmentURLs.length} attachment${attachmentURLs.length > 1 ? 's' : ''} (see logs for files)`,
      textX,
      cursorY + 6
    );
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderMessageScreenshot };