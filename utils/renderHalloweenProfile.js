const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

const BACKGROUNDS = ['halloween-1.png', 'halloween-2.png', 'halloween-3.png'];
const DISPLAY_FONT_PATH = path.join(__dirname, '../fonts/creepster/Creepster-Regular.ttf');

registerFont(DISPLAY_FONT_PATH, { family: 'Creepster' });

function fitText(ctx, text, maxWidth, startSize, weight = 'bold', family = 'Arial') {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "${family}"`;
    size -= 1;
  } while (size > 16 && ctx.measureText(text).width > maxWidth);
  return ctx.font;
}

function drawBox(ctx, label, value, x, y, width, color = '#FFFFFF') {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F5F5F5';
  ctx.font = '20px "Creepster"';
  ctx.fillText(label.toUpperCase(), x + width / 2, y + 40);
  ctx.fillStyle = color;
  fitText(ctx, value, width - 36, 32, 'bold', 'Arial');
  ctx.fillText(value, x + width / 2, y + 82);
}

function drawRankBox(ctx, rank, x, y, width) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFB15C';
  ctx.font = '20px "Creepster"';
  ctx.fillText('RANK', x + 70, y + 40);
  ctx.fillStyle = '#FFFFFF';
  fitText(ctx, `#${rank + 1}  •  ${rank < 10 ? 'Candy Newbie' : 'Halloween Champion'}`, width - 120, 32, 'bold', 'Arial');
  ctx.fillText(`#${rank + 1}  •  ${rank < 10 ? 'Candy Newbie' : 'Halloween Champion'}`, x + 70, y + 86);
}

async function renderHalloweenProfile({ target, points, rank, ownedRoles, infection }) {
  const backgroundName = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  const background = await loadImage(path.join(__dirname, '../banners', backgroundName));
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  const avatar = await loadImage(target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }));
  ctx.save();
  ctx.beginPath();
  ctx.arc(1850, 145, 105, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, 1745, 40, 210, 210);
  ctx.restore();
  ctx.strokeStyle = '#FF7518';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(1850, 145, 105, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  fitText(ctx, target.globalName || target.username, 720, 58, 'normal', 'Creepster');
  ctx.fillText(target.globalName || target.username, 1090, 145);

  const status = infection ? 'INFECTED' : 'HEALTHY';
  const statusColor = infection ? '#FF5555' : '#75F09A';
  drawBox(ctx, 'Points', points.toLocaleString(), 1050, 265, 300, '#FFB15C');
  drawBox(ctx, 'Candy', '0', 1380, 265, 300, '#FFFFFF');
  drawBox(ctx, 'Status', infection ? 'Infected' : 'Not infected', 1710, 265, 300, statusColor);

  drawBox(ctx, 'Houses visited', '0', 1050, 420, 300, '#FFFFFF');
  drawBox(ctx, 'Tricks survived', '0', 1380, 420, 300, '#FFFFFF');
  drawBox(ctx, 'Rare items found', '0', 1710, 420, 300, '#FFFFFF');

  const inventory = ownedRoles.length
    ? ownedRoles.map((role) => role.name || 'Seasonal Role').join(' • ')
    : 'Empty';
  drawRankBox(ctx, rank, 1220, 570, 800);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '24px "Creepster"';
  ctx.fillStyle = '#FFB15C';
  ctx.fillText('INVENTORY', 1510, 825);
  ctx.textAlign = 'left';
  ctx.font = 'normal 20px Arial';
  ctx.fillStyle = '#D6D6D6';
  fitText(ctx, inventory, 1550, 25, 'normal', 'Arial');
  ctx.fillText(inventory, 1100, 870);

  return canvas.toBuffer('image/png');
}

module.exports = { renderHalloweenProfile };
