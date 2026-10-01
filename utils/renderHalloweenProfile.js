const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const WIDTH = 900;
const HEIGHT = 400;
const BACKGROUNDS = ['halloween-1.png', 'halloween-2.png', 'halloween-3.png'];

function fitText(ctx, text, maxWidth, startSize, weight = 'normal') {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Arial`;
    size -= 1;
  } while (size > 14 && ctx.measureText(text).width > maxWidth);
  return ctx.font;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function drawCover(ctx, image) {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}

async function renderHalloweenProfile({ target, points, rank, ownedRoles, infection }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const backgroundName = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  const background = await loadImage(path.join(__dirname, '../banners', backgroundName));
  await drawCover(ctx, background);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  roundRect(ctx, 20, 20, WIDTH - 40, HEIGHT - 40, 20);
  ctx.fill();

  const avatarSize = 135;
  const avatarX = 55;
  const avatarY = 45;
  const avatar = await loadImage(target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }));
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.strokeStyle = infection ? '#FF5555' : '#FF7518';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  fitText(ctx, target.globalName || target.username, 610, 38, 'bold');
  ctx.fillText(target.globalName || target.username, 225, 92);

  ctx.fillStyle = '#FFB15C';
  ctx.font = 'bold 25px Arial';
  ctx.fillText(`${points.toLocaleString()} Halloween Points`, 225, 135);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px Arial';
  ctx.fillText(`Rank #${rank + 1}`, 225, 174);
  ctx.fillStyle = infection ? '#FF7777' : '#75F09A';
  ctx.fillText(infection ? 'Status: Infected' : 'Status: Healthy', 430, 174);

  ctx.fillStyle = '#FFB15C';
  ctx.font = 'bold 23px Arial';
  ctx.fillText('Inventory', 55, 245);
  ctx.fillStyle = '#DDDDDD';
  const items = ownedRoles.length ? ownedRoles : [{ name: 'Nothing yet.' }];
  const maxShown = 6;
  items.slice(0, maxShown).forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const label = item.name || 'Seasonal Role';
    fitText(ctx, `• ${label}`, 360, 19);
    ctx.fillText(`• ${label}`, 55 + column * 410, 282 + row * 29);
  });
  if (items.length > maxShown) {
    ctx.fillText(`+${items.length - maxShown} more`, 55, 375);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#AAAAAA';
  ctx.font = 'bold 17px Arial';
  ctx.fillText('OCTOBER SEASON', WIDTH - 55, HEIGHT - 35);

  return canvas.toBuffer('image/png');
}

module.exports = { renderHalloweenProfile };
