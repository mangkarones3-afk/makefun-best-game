// Everything the player sees: the starfield and the arena, the swarm's shapes (one
// silhouette per kind, told apart at a glance), the Warden, the HUD, and the screens
// around the fight (title, draft, pause, game over). Drawing only: this module reads
// the world's state and never changes it. Colours come from the palette in config.js,
// so a frame's actors are colour-coded the same way everywhere.

import { COLORS, PACE, VIEW } from './config.js';
import { SCREEN_DRAFT, SCREEN_MENU, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAYING } from './world.js';

/** The draft cards' layout, shared with the shell so clicks land on the card drawn. */
export const DRAFT_CARDS = (() => {
  const width = 300;
  const height = 196;
  const gap = 28;
  const startX = (VIEW.width - (width * 3 + gap * 2)) / 2;
  return [0, 1, 2].map((i) => ({ x: startX + i * (width + gap), y: 322, w: width, h: height }));
})();

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function formatScore(value) {
  return String(Math.floor(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function drawText(ctx, value, x, y, { size = 16, weight = 600, color = COLORS.text, align = 'left', alpha = 1, spacing = 0 } = {}) {
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  if (spacing > 0 && 'letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(value, x, y);
  if (spacing > 0 && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
}

/** Wrap a string into lines of at most maxWidth pixels in the current font. */
function wrapLines(ctx, value, maxWidth) {
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function bar(ctx, x, y, w, h, fraction, fill, back = 'rgba(120, 140, 190, 0.22)') {
  const clamped = Math.max(0, Math.min(1, fraction));
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * clamped, h);
  ctx.strokeStyle = 'rgba(200, 220, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  // Three star layers, fixed points in arena space, drawn with a parallax drift.
  const starLayers = [];
  {
    let seed = 1234567;
    const starRandom = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (const [count, depth, size] of [[70, 0.012, 1.4], [50, 0.03, 2], [26, 0.06, 2.8]]) {
      const stars = [];
      for (let i = 0; i < count; i += 1) {
        stars.push({ x: starRandom() * VIEW.width, y: starRandom() * VIEW.height, twinkle: starRandom() * Math.PI * 2 });
      }
      starLayers.push({ stars, depth, size });
    }
  }

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  backgroundGradient.addColorStop(0, '#070a1c');
  backgroundGradient.addColorStop(0.55, COLORS.void);
  backgroundGradient.addColorStop(1, COLORS.voidDeep);
  const vignette = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  const lowHpEdge = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.36, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.8);
  lowHpEdge.addColorStop(0, 'rgba(255,0,0,0)');
  lowHpEdge.addColorStop(1, 'rgba(255, 30, 40, 0.55)');

  // The static backdrop (gradient, grid, vignette) is painted once to its own canvas:
  // full-screen gradient fills are the most expensive thing a software rasteriser
  // does, and this scene redraws sixty times a second.
  const backdrop = document.createElement('canvas');
  backdrop.width = VIEW.width;
  backdrop.height = VIEW.height;
  {
    const bctx = backdrop.getContext('2d');
    bctx.fillStyle = backgroundGradient;
    bctx.fillRect(0, 0, VIEW.width, VIEW.height);
    bctx.strokeStyle = COLORS.grid;
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let x = 0; x <= VIEW.width; x += 64) {
      bctx.moveTo(x, 0);
      bctx.lineTo(x, VIEW.height);
    }
    for (let y = 0; y <= VIEW.height; y += 64) {
      bctx.moveTo(0, y);
      bctx.lineTo(VIEW.width, y);
    }
    bctx.stroke();
    bctx.fillStyle = vignette;
    bctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // The title wordmark, with its glow, is also painted once: shadow blur on a big
  // display font is the single most expensive call in the whole renderer.
  const titlePlate = document.createElement('canvas');
  titlePlate.width = 1120;
  titlePlate.height = 140;
  {
    const tctx = titlePlate.getContext('2d');
    tctx.font = `800 84px ${FONT}`;
    tctx.textAlign = 'center';
    tctx.shadowColor = COLORS.player;
    tctx.shadowBlur = 34;
    tctx.fillStyle = COLORS.text;
    if ('letterSpacing' in tctx) tctx.letterSpacing = '10px';
    tctx.fillText('VOIDSTRIKE', 560, 96);
  }

  function drawBackground(world) {
    ctx.drawImage(backdrop, 0, 0);
    const px = world.player ? world.player.x : VIEW.width / 2;
    const py = world.player ? world.player.y : VIEW.height / 2;
    for (const layer of starLayers) {
      for (const star of layer.stars) {
        const x = (((star.x - px * layer.depth) % VIEW.width) + VIEW.width) % VIEW.width;
        const y = (((star.y - py * layer.depth) % VIEW.height) + VIEW.height) % VIEW.height;
        const alpha = 0.35 + 0.3 * Math.sin(world.time * 1.7 + star.twinkle);
        ctx.globalAlpha = Math.max(0.08, alpha);
        ctx.fillStyle = '#cfe4ff';
        ctx.fillRect(x, y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(89, 247, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, VIEW.width - 2, VIEW.height - 2);
  }

  function drawSpawnMarkers(world) {
    for (const pending of world.spawning) {
      const pulse = 0.45 + 0.4 * Math.sin(world.time * 14);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = COLORS[pending.kind] || COLORS.warn;
      ctx.lineWidth = 2;
      const r = 16 + 6 * Math.sin(world.time * 10);
      ctx.beginPath();
      ctx.arc(pending.x, pending.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pending.x - 7, pending.y - 7);
      ctx.lineTo(pending.x + 7, pending.y + 7);
      ctx.moveTo(pending.x + 7, pending.y - 7);
      ctx.lineTo(pending.x - 7, pending.y + 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(world) {
    for (const pickup of world.pickups) {
      const bob = Math.sin(world.time * 5 + pickup.x * 0.05) * 2;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      if (pickup.kind === 'shard') {
        ctx.rotate(world.time * 2.4 + pickup.x);
        ctx.fillStyle = COLORS.shard;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = COLORS.heart;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1.8, -6, 3.6, 12);
        ctx.fillRect(-6, -1.8, 12, 3.6);
      }
      ctx.restore();
    }
  }

  function drawProjectiles(world) {
    ctx.lineCap = 'round';
    for (const bullet of world.bullets) {
      ctx.strokeStyle = COLORS.bullet;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.fillStyle = COLORS.playerCore;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const bolt of world.bolts) {
      ctx.fillStyle = COLORS.bolt;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius + 1.6 + Math.sin(world.time * 16 + bolt.x) * 0.8, 0, Math.PI * 2);
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius - 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function flashOverlay(x, y, radius, flash) {
    if (flash <= 0) return;
    ctx.globalAlpha = Math.min(0.85, flash * 7);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawEnemy(world, enemy) {
    const color = COLORS[enemy.kind];
    const alpha = enemy.materialize > 0 ? 0.35 : 1;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha = alpha;
    if (enemy.kind === 'drifter' || enemy.kind === 'mite') {
      const angle = Math.atan2(enemy.vy, enemy.vx);
      ctx.rotate(angle);
      const r = enemy.radius;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, r * 0.72);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.8, -r * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(10, 4, 12, 0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'spitter') {
      const aim = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 8, 0, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(aim);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(enemy.radius * 0.4, -3.4, enemy.radius * 0.85, 6.8);
    } else if (enemy.kind === 'bloom') {
      const wobble = 1 + Math.sin(world.time * 3.2 + enemy.wobble) * 0.07;
      ctx.scale(wobble, wobble);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(6, 24, 10, 0.5)';
      for (const [ox, oy] of [[-9, -5], [8, -8], [2, 9]]) {
        ctx.beginPath();
        ctx.arc(ox, oy, 6.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.mite;
      for (const [ox, oy] of [[-9, -5], [8, -8], [2, 9]]) {
        ctx.beginPath();
        ctx.arc(ox, oy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (enemy.kind === 'lancer') {
      if (enemy.state === 'telegraph') {
        const blink = Math.sin(world.time * 30) > 0 ? 0.75 : 0.2;
        ctx.globalAlpha = blink * alpha;
        ctx.strokeStyle = COLORS.warn;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(enemy.chargeAngle) * 330, Math.sin(enemy.chargeAngle) * 330);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
        ctx.rotate(enemy.chargeAngle);
      } else {
        ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
      }
      const r = enemy.radius;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0);
      ctx.lineTo(-r, r * 0.62);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r, -r * 0.62);
      ctx.closePath();
      ctx.fill();
    } else if (enemy.kind === 'sovereign') {
      drawSovereign(world, enemy, color);
    }
    ctx.restore();
    flashOverlay(enemy.x, enemy.y, enemy.radius, enemy.flash);
    if ((enemy.kind === 'bloom' || enemy.kind === 'lancer' || enemy.kind === 'spitter') && enemy.hp < enemy.maxHp) {
      bar(ctx, enemy.x - 20, enemy.y - enemy.radius - 13, 40, 4.6, enemy.hp / enemy.maxHp, color);
    }
  }

  function drawSovereign(world, boss, color) {
    const spin = world.time * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    for (let ring = 0; ring < 2; ring += 1) {
      const radius = boss.radius + 12 + ring * 11;
      const direction = ring === 0 ? 1 : -1;
      for (let i = 0; i < 3; i += 1) {
        const start = spin * direction + (i * Math.PI * 2) / 3 + ring;
        ctx.beginPath();
        ctx.arc(0, 0, radius, start, start + Math.PI * 0.52);
        ctx.stroke();
      }
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = spin * 0.4 + (i * Math.PI) / 3;
      const x = Math.cos(angle) * boss.radius;
      const y = Math.sin(angle) * boss.radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const look = Math.atan2(world.player.y - boss.y, world.player.x - boss.x);
    ctx.fillStyle = '#12041f';
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = boss.state === 'phase3' ? COLORS.bolt : '#ffd7ff';
    ctx.beginPath();
    ctx.arc(Math.cos(look) * 7, Math.sin(look) * 7, boss.radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(world) {
    const player = world.player;
    if (!player.alive) return;
    if (player.iframes > 0 && player.dashTimer <= 0 && Math.sin(world.time * 34) > 0.2) {
      // The blink of brief invulnerability: skip the hull every other flash.
    } else {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      const thrust = Math.hypot(player.vx, player.vy) > 20;
      if (thrust) {
        const flame = 10 + Math.sin(world.time * 42) * 4 + (player.dashTimer > 0 ? 12 : 0);
        ctx.fillStyle = 'rgba(89, 247, 255, 0.75)';
        ctx.beginPath();
        ctx.moveTo(-12, 5);
        ctx.lineTo(-12 - flame, 0);
        ctx.lineTo(-12, -5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.moveTo(19, 0);
      ctx.lineTo(-8, 7.5);
      ctx.lineTo(-13, 13);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-13, -13);
      ctx.lineTo(-8, -7.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COLORS.playerCore;
      ctx.beginPath();
      ctx.arc(3, 0, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Aim reticle: a small ring on the mouse, so the twin-stick reads clearly.
  }

  function drawReticle(input) {
    const aim = input.aim();
    ctx.strokeStyle = 'rgba(89, 247, 255, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(89, 247, 255, 0.9)';
    ctx.fillRect(aim.x - 1, aim.y - 1, 2, 2);
  }

  function drawHud(world, muted) {
    const player = world.player;
    const stats = world.stats;
    // Hull, top-left.
    drawText(ctx, 'HULL', 26, 34, { size: 12, color: COLORS.dim, spacing: 2 });
    const hpFraction = player.hp / stats.maxHp;
    bar(ctx, 26, 42, 264, 15, hpFraction, hpFraction > 0.3 ? '#3ef2c8' : COLORS.warn);
    drawText(ctx, `${Math.ceil(player.hp)} / ${stats.maxHp}`, 300, 55, { size: 14, weight: 700 });
    // Dash, under the hull.
    drawText(ctx, 'DASH', 26, 78, { size: 12, color: COLORS.dim, spacing: 2 });
    const dashFraction = player.dashCdTimer > 0 ? 1 - player.dashCdTimer / stats.dashCooldown : 1;
    bar(ctx, 74, 66, 120, 9, dashFraction, dashFraction >= 1 ? COLORS.player : 'rgba(89,247,255,0.4)');
    if (dashFraction >= 1) drawText(ctx, 'READY', 204, 76, { size: 11, color: COLORS.player });
    // Score and combo, top-right.
    drawText(ctx, formatScore(world.score), VIEW.width - 26, 46, { size: 30, weight: 800, align: 'right' });
    drawText(ctx, `BEST ${formatScore(Math.max(world.best, world.score))}`, VIEW.width - 26, 68, { size: 12, color: COLORS.dim, align: 'right' });
    if (world.combo > 1) {
      const mult = world.comboMult();
      drawText(ctx, `x${mult} COMBO ${world.combo}`, VIEW.width - 26, 98, {
        size: 17,
        weight: 800,
        align: 'right',
        color: mult >= 5 ? COLORS.lancer : COLORS.shard,
      });
      bar(ctx, VIEW.width - 146, 106, 120, 5, world.comboTimer / PACE.comboWindow, COLORS.shard);
    }
    // Wave, top-centre; the boss takes the centre over with its own bar.
    if (world.boss) {
      const boss = world.boss;
      drawText(ctx, 'THE HOLLOW SOVEREIGN', VIEW.width / 2, 36, { size: 14, weight: 800, color: COLORS.sovereign, align: 'center', spacing: 3 });
      bar(ctx, VIEW.width / 2 - 260, 46, 520, 12, boss.hp / boss.maxHp, COLORS.sovereign);
      drawText(ctx, boss.state === 'phase3' ? 'PHASE III — UNBOUND' : boss.state === 'phase2' ? 'PHASE II — THE CHOIR SINGS' : 'PHASE I', VIEW.width / 2, 76, {
        size: 11,
        color: COLORS.dim,
        align: 'center',
      });
    } else if (world.wave > 0) {
      drawText(ctx, `WAVE ${world.wave}`, VIEW.width / 2, 42, { size: 19, weight: 800, align: 'center', spacing: 3 });
    }
    drawText(ctx, muted ? 'M — SOUND OFF' : 'M — SOUND ON · ESC — PAUSE', VIEW.width - 26, VIEW.height - 18, { size: 11, color: COLORS.dim, align: 'right', alpha: 0.8 });
    if (hpFraction <= 0.3 && player.alive) {
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(world.time * 6);
      ctx.fillStyle = lowHpEdge;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.globalAlpha = 1;
    }
  }

  function drawBanner(world) {
    if (!world.banner) return;
    const { title, sub, timer } = world.banner;
    const alpha = Math.min(1, timer / 0.5);
    ctx.fillStyle = `rgba(3, 4, 12, ${0.32 * alpha})`;
    ctx.fillRect(0, VIEW.height * 0.3, VIEW.width, 120);
    drawText(ctx, title, VIEW.width / 2, VIEW.height * 0.3 + 62, { size: 40, weight: 800, align: 'center', alpha, spacing: 5 });
    if (sub) drawText(ctx, sub, VIEW.width / 2, VIEW.height * 0.3 + 94, { size: 16, color: COLORS.dim, align: 'center', alpha });
  }

  function drawMenu(world) {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // The Warden, large and slow-turning, above the title.
    ctx.save();
    ctx.translate(VIEW.width / 2, 196);
    ctx.rotate(Math.sin(world.time * 0.6) * 0.3 - Math.PI / 2);
    ctx.scale(2.6, 2.6);
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-8, 7.5);
    ctx.lineTo(-13, 13);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-13, -13);
    ctx.lineTo(-8, -7.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(3, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(titlePlate, VIEW.width / 2 - titlePlate.width / 2, 356 - 96);
    drawText(ctx, 'HOLD THE GATE AGAINST THE HOLLOW', VIEW.width / 2, 398, { size: 17, color: COLORS.dim, align: 'center', spacing: 4 });
    const blink = Math.sin(world.time * 3.4) > -0.25;
    if (blink) drawText(ctx, 'CLICK OR PRESS ENTER TO PLAY', VIEW.width / 2, 486, { size: 21, weight: 700, color: COLORS.shard, align: 'center' });
    drawText(ctx, 'WASD / ARROWS — MOVE        MOUSE — AIM        HOLD CLICK — FIRE', VIEW.width / 2, 566, { size: 15, color: COLORS.text, align: 'center' });
    drawText(ctx, 'SHIFT / SPACE — DASH        SURVIVE THE WAVE, DRAFT AN UPGRADE, FACE THE SOVEREIGN EVERY 5TH WAVE', VIEW.width / 2, 594, { size: 15, color: COLORS.text, align: 'center' });
    if (world.best > 0) drawText(ctx, `BEST SCORE ${formatScore(world.best)}`, VIEW.width / 2, 662, { size: 16, weight: 700, color: COLORS.lancer, align: 'center' });
  }

  /** A small geometric glyph per upgrade, drawn inside its draft card. */
  function drawUpgradeIcon(id, cx, cy) {
    ctx.strokeStyle = COLORS.player;
    ctx.fillStyle = COLORS.player;
    ctx.lineWidth = 3;
    if (id === 'heavy-rounds') {
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 19, 0, Math.PI * 2);
      ctx.stroke();
    } else if (id === 'rapid-cycler') {
      for (const dx of [-14, 0, 14]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - 5, cy - 10);
        ctx.lineTo(cx + dx + 6, cy);
        ctx.lineTo(cx + dx - 5, cy + 10);
        ctx.stroke();
      }
    } else if (id === 'split-cannon') {
      for (const dx of [-16, 0, 16]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy, 5.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'swift-thrusters') {
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy + 12);
      ctx.lineTo(cx + 4, cy - 14);
      ctx.lineTo(cx + 10, cy + 2);
      ctx.lineTo(cx + 20, cy - 6);
      ctx.lineTo(cx - 2, cy + 16);
      ctx.closePath();
      ctx.stroke();
    } else if (id === 'aegis-plating') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx + 15, cy - 9);
      ctx.lineTo(cx + 15, cy + 6);
      ctx.quadraticCurveTo(cx + 14, cy + 16, cx, cy + 20);
      ctx.quadraticCurveTo(cx - 14, cy + 16, cx - 15, cy + 6);
      ctx.lineTo(cx - 15, cy - 9);
      ctx.closePath();
      ctx.stroke();
    } else if (id === 'phase-drive') {
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0.6, 4.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 12, cy - 14);
      ctx.lineTo(cx + 20, cy - 3);
      ctx.lineTo(cx + 8, cy - 4);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'tractor-field') {
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 10, 11, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 8, cy + 10, 11, Math.PI * -0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'nanoweave') {
      ctx.fillRect(cx - 3, cy - 16, 6, 32);
      ctx.fillRect(cx - 16, cy - 3, 32, 6);
    } else if (id === 'piercing-rounds') {
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy);
      ctx.lineTo(cx + 14, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy - 7);
      ctx.lineTo(cx + 21, cy);
      ctx.lineTo(cx + 8, cy + 7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 8, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // critical-matrix: a four-point star.
      ctx.beginPath();
      ctx.moveTo(cx, cy - 19);
      ctx.quadraticCurveTo(cx + 3.4, cy - 3.4, cx + 19, cy);
      ctx.quadraticCurveTo(cx + 3.4, cy + 3.4, cx, cy + 19);
      ctx.quadraticCurveTo(cx - 3.4, cy + 3.4, cx - 19, cy);
      ctx.quadraticCurveTo(cx - 3.4, cy - 3.4, cx, cy - 19);
      ctx.fill();
    }
  }

  function drawDraft(world, input) {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, `WAVE ${world.wave} HELD`, VIEW.width / 2, 196, { size: 40, weight: 800, align: 'center', spacing: 4 });
    drawText(ctx, 'THE GATE BREATHES. CHOOSE ONE UPGRADE — CLICK A CARD OR PRESS 1, 2 OR 3.', VIEW.width / 2, 234, { size: 15, color: COLORS.dim, align: 'center' });
    const aim = input.aim();
    world.draft.forEach((upgrade, i) => {
      const card = DRAFT_CARDS[i];
      const hovered = aim.x >= card.x && aim.x <= card.x + card.w && aim.y >= card.y && aim.y <= card.y + card.h;
      ctx.fillStyle = hovered ? 'rgba(24, 38, 74, 0.95)' : 'rgba(12, 18, 38, 0.95)';
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.strokeStyle = hovered ? COLORS.player : 'rgba(120, 150, 220, 0.4)';
      ctx.lineWidth = hovered ? 2.6 : 1.4;
      ctx.strokeRect(card.x, card.y, card.w, card.h);
      drawUpgradeIcon(upgrade.id, card.x + card.w / 2, card.y + 52);
      drawText(ctx, upgrade.name.toUpperCase(), card.x + card.w / 2, card.y + 108, { size: 18, weight: 800, align: 'center' });
      ctx.font = `500 14.5px ${FONT}`;
      const lines = wrapLines(ctx, upgrade.blurb, card.w - 44);
      lines.forEach((line, li) => {
        drawText(ctx, line, card.x + card.w / 2, card.y + 138 + li * 20, { size: 14.5, weight: 500, color: COLORS.dim, align: 'center' });
      });
      drawText(ctx, `[ ${i + 1} ]`, card.x + card.w / 2, card.y + card.h - 14, { size: 13, color: COLORS.player, align: 'center' });
    });
  }

  function drawOver(world) {
    ctx.fillStyle = 'rgba(5, 2, 8, 0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, 'THE GATE FALLS', VIEW.width / 2, 218, { size: 54, weight: 800, align: 'center', spacing: 6, color: '#ff8095' });
    drawText(ctx, `THE WARDEN HELD FOR ${world.finalWave} ${world.finalWave === 1 ? 'WAVE' : 'WAVES'}`, VIEW.width / 2, 262, { size: 16, color: COLORS.dim, align: 'center' });
    drawText(ctx, formatScore(world.finalScore), VIEW.width / 2, 348, { size: 64, weight: 800, align: 'center' });
    drawText(ctx, world.newBest ? 'A NEW BEST SCORE' : `BEST ${formatScore(world.best)}`, VIEW.width / 2, 384, {
      size: 15,
      weight: 700,
      align: 'center',
      color: world.newBest ? COLORS.lancer : COLORS.dim,
    });
    drawText(ctx, `${world.kills} HOLLOW BROKEN`, VIEW.width / 2, 424, { size: 15, color: COLORS.text, align: 'center' });
    if (world.upgradesTaken.length > 0) {
      drawText(ctx, `UPGRADES CARRIED — ${world.upgradesTaken.join(' · ')}`, VIEW.width / 2, 458, { size: 13.5, color: COLORS.dim, align: 'center' });
    }
    const blink = Math.sin(world.time * 3.4) > -0.25;
    if (blink) drawText(ctx, 'PRESS ENTER OR CLICK TO FIGHT AGAIN', VIEW.width / 2, 540, { size: 20, weight: 700, color: COLORS.shard, align: 'center' });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawText(ctx, 'PAUSED', VIEW.width / 2, VIEW.height / 2, { size: 44, weight: 800, align: 'center', spacing: 8 });
    drawText(ctx, 'ESC OR P TO RESUME', VIEW.width / 2, VIEW.height / 2 + 40, { size: 15, color: COLORS.dim, align: 'center' });
  }

  function draw(world, input, hud) {
    ctx.save();
    if (world.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
    }
    drawBackground(world);
    if (world.screen !== SCREEN_MENU) {
      drawSpawnMarkers(world);
      drawPickups(world);
      drawProjectiles(world);
      for (const enemy of world.enemies) drawEnemy(world, enemy);
      drawPlayer(world);
      world.effects.draw(ctx);
    }
    ctx.restore();

    if (world.screen !== SCREEN_MENU) drawHud(world, hud.muted);
    if (world.screen === SCREEN_PLAYING || world.screen === SCREEN_DRAFT) drawReticle(input);
    drawBanner(world);
    if (world.screen === SCREEN_MENU) drawMenu(world);
    else if (world.screen === SCREEN_DRAFT) drawDraft(world, input);
    else if (world.screen === SCREEN_OVER) drawOver(world);
    else if (world.screen === SCREEN_PAUSED) drawPaused();
  }

  return { draw };
}
