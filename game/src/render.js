// Everything the player sees: the harbour of Gloamharbour at night — the quay, the
// Great Lantern and its sweeping beam, the braziers, the Warden and the Hollow — and,
// over it all, the darkness. The light pass is the game's signature: a darkness sheet
// is punched with soft holes wherever light falls (the keeper's lantern, the tower,
// the braziers, flares, the beam), so what the simulation calls "lit" is literally
// what the player can see. Drawing only: this module reads the world's state and
// never changes it. Colours come from the palette in config.js — one dominant grade,
// warm lantern amber against deep indigo night.

import { BRAZIERS, COLORS, LANTERN, PACE, VIEW, ZONES } from './config.js';
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

function bar(ctx, x, y, w, h, fraction, fill, back = 'rgba(120, 110, 90, 0.22)') {
  const clamped = Math.max(0, Math.min(1, fraction));
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * clamped, h);
  ctx.strokeStyle = 'rgba(230, 210, 170, 0.35)';
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
  backgroundGradient.addColorStop(0, '#0d0918');
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
    // The quay's painted place names are static too: they join the backdrop here
    // instead of costing four large letter-spaced texts every frame.
    for (const zone of ZONES) {
      drawText(bctx, zone.name, zone.x, zone.y, { size: 27, weight: 800, color: COLORS.dim, align: 'center', alpha: 0.13, spacing: 7 });
    }
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
    tctx.shadowColor = COLORS.flame;
    tctx.shadowBlur = 34;
    tctx.fillStyle = COLORS.text;
    if ('letterSpacing' in tctx) tctx.letterSpacing = '10px';
    tctx.fillText('WICKWARDEN', 560, 96);
  }

  // The darkness sheet: an offscreen canvas the light pass punches holes in each
  // frame, then lays over the scene. Reused, never reallocated. It lives at half
  // resolution — light pools are soft shapes, so the upscale costs nothing
  // visually and the sheet's per-frame work drops fourfold. All sheet drawing
  // happens in arena coordinates through a fixed half-scale transform.
  const darkness = document.createElement('canvas');
  darkness.width = VIEW.width / 2;
  darkness.height = VIEW.height / 2;
  const dctx = darkness.getContext('2d');
  dctx.scale(0.5, 0.5);

  // Light sprites, baked once. A software rasteriser fills a radial gradient over
  // a 600-pixel disc far more slowly than it blits a pre-rendered sprite, and the
  // light pass needs a dozen pools a frame — so every falloff the pass uses is
  // baked into a sprite here and blitted, scaled, at draw time.
  function bakeSprite(size, stops, inner = 0) {
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const sctx = sprite.getContext('2d');
    const gradient = sctx.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, size, size);
    return sprite;
  }
  const poolSprite = bakeSprite(256, [[0, 'rgba(0, 0, 0, 1)'], [0.55, 'rgba(0, 0, 0, 0.78)'], [1, 'rgba(0, 0, 0, 0)']], 15);
  const warmSprite = bakeSprite(256, [[0, 'rgba(255, 150, 50, 1)'], [1, 'rgba(255, 150, 50, 0)']], 13);
  const haloSprite = bakeSprite(256, [[0, 'rgba(176, 107, 255, 0.5)'], [0.5, 'rgba(176, 107, 255, 0.22)'], [1, 'rgba(176, 107, 255, 0)']]);

  // The beam's wedge, baked along its length with feathered edges: drawn rotated
  // around the tower point, once for the darkness sheet and once for the warmth.
  function bakeBeam(fillStops) {
    const sprite = document.createElement('canvas');
    sprite.width = LANTERN.beamLength;
    sprite.height = 280;
    const sctx = sprite.getContext('2d');
    const mid = sprite.height / 2;
    const gradient = sctx.createLinearGradient(0, 0, LANTERN.beamLength, 0);
    for (const [at, color] of fillStops) gradient.addColorStop(at, color);
    sctx.fillStyle = gradient;
    sctx.beginPath();
    sctx.moveTo(0, mid);
    sctx.arc(0, mid, LANTERN.beamLength, -LANTERN.beamHalfAngle, LANTERN.beamHalfAngle);
    sctx.closePath();
    sctx.fill();
    // Feather the wedge's long edges so the beam melts into the dark.
    sctx.globalCompositeOperation = 'destination-out';
    const feather = sctx.createLinearGradient(0, 0, 0, sprite.height);
    feather.addColorStop(0, 'rgba(0, 0, 0, 1)');
    feather.addColorStop(0.18, 'rgba(0, 0, 0, 0)');
    feather.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
    feather.addColorStop(1, 'rgba(0, 0, 0, 1)');
    sctx.fillStyle = feather;
    sctx.fillRect(0, 0, sprite.width, sprite.height);
    return sprite;
  }
  const beamDarkSprite = bakeBeam([[0, 'rgba(0, 0, 0, 0.85)'], [1, 'rgba(0, 0, 0, 0.22)']]);
  const beamWarmSprite = bakeBeam([[0, 'rgba(255, 170, 60, 0.55)'], [1, 'rgba(255, 170, 60, 0.08)']]);

  function drawBackground(world) {
    ctx.drawImage(backdrop, 0, 0);
    const px = world.player ? world.player.x : VIEW.width / 2;
    const py = world.player ? world.player.y : VIEW.height / 2;
    for (const layer of starLayers) {
      for (const star of layer.stars) {
        const x = (((star.x - px * layer.depth) % VIEW.width) + VIEW.width) % VIEW.width;
        const y = (((star.y - py * layer.depth) % VIEW.height) + VIEW.height) % VIEW.height;
        const alpha = 0.22 + 0.2 * Math.sin(world.time * 1.7 + star.twinkle);
        ctx.globalAlpha = Math.max(0.05, alpha);
        ctx.fillStyle = '#ffe9c4';
        ctx.fillRect(x, y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, VIEW.width - 2, VIEW.height - 2);
  }

  /** One piece of quay dressing: crate, barrel, mooring bollard or rope coil. */
  function drawProp(prop) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rot);
    ctx.scale(prop.scale, prop.scale);
    if (prop.kind === 'crate') {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(-16, -16, 32, 32);
      ctx.strokeStyle = '#6b4e2e';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(-16, -16, 32, 32);
      ctx.beginPath();
      ctx.moveTo(-16, -16);
      ctx.lineTo(16, 16);
      ctx.moveTo(16, -16);
      ctx.lineTo(-16, 16);
      ctx.stroke();
    } else if (prop.kind === 'barrel') {
      ctx.fillStyle = '#42301f';
      ctx.beginPath();
      ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#77572f';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (prop.kind === 'bollard') {
      ctx.fillStyle = '#1d1a26';
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#454055';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#6d6785';
      ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
    } else {
      ctx.strokeStyle = '#5a4632';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A flame: a teardrop that leans and breathes with the harbour's own clock. */
  function drawFlame(x, y, size, time, phase) {
    const lean = Math.sin(time * 11 + phase) * size * 0.16;
    const stretch = 1 + Math.sin(time * 13.7 + phase * 2) * 0.14;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = COLORS.flame;
    ctx.beginPath();
    ctx.moveTo(lean, -size * 1.5 * stretch);
    ctx.quadraticCurveTo(size * 0.72, -size * 0.3, 0, size * 0.55);
    ctx.quadraticCurveTo(-size * 0.72, -size * 0.3, lean, -size * 1.5 * stretch);
    ctx.fill();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.moveTo(lean * 0.6, -size * 0.72 * stretch);
    ctx.quadraticCurveTo(size * 0.34, -size * 0.16, 0, size * 0.34);
    ctx.quadraticCurveTo(-size * 0.34, -size * 0.16, lean * 0.6, -size * 0.72 * stretch);
    ctx.fill();
    ctx.restore();
  }

  /** The four harbour braziers: stone bowls with a living flame. */
  function drawBraziers(world) {
    for (const brazier of BRAZIERS) {
      ctx.fillStyle = '#171221';
      ctx.beginPath();
      ctx.moveTo(brazier.x - 17, brazier.y + 4);
      ctx.lineTo(brazier.x + 17, brazier.y + 4);
      ctx.lineTo(brazier.x + 10, brazier.y + 17);
      ctx.lineTo(brazier.x - 10, brazier.y + 17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3d3350';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#0d0a16';
      ctx.fillRect(brazier.x - 3, brazier.y + 17, 6, 9);
      drawFlame(brazier.x, brazier.y + 2, 10, world.time, brazier.x * 0.7);
    }
  }

  /**
   * The Great Lantern of Gloamharbour, standing on the north quay: the landmark
   * every frame is composed around. Its lantern room sits exactly on the
   * simulation's tower point, so the beam the rules burn with leaves the flame
   * the player sees.
   */
  function drawTower(world) {
    const { x, y } = LANTERN.tower;
    // The pier it stands on.
    ctx.fillStyle = '#161020';
    ctx.beginPath();
    ctx.ellipse(x, y + 84, 132, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.14)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // The tapered stone body, from the pier up to the gallery.
    ctx.fillStyle = '#251c33';
    ctx.beginPath();
    ctx.moveTo(x - 37, y + 80);
    ctx.lineTo(x - 23, y + 22);
    ctx.lineTo(x + 23, y + 22);
    ctx.lineTo(x + 37, y + 80);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 6, 18, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 31, y + 52);
    ctx.lineTo(x + 31, y + 52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 179, 71, 0.20)';
    ctx.fillRect(x + 14, y + 30, 5, 44);
    // The gallery the keeper climbs to.
    ctx.fillStyle = '#120d1e';
    ctx.fillRect(x - 31, y + 13, 62, 9);
    // The lantern room: iron frame, lit glass, the flame itself.
    ctx.fillStyle = 'rgba(255, 157, 46, 0.28)';
    ctx.fillRect(x - 18, y - 18, 36, 31);
    ctx.strokeStyle = '#0b0813';
    ctx.lineWidth = 3.4;
    ctx.strokeRect(x - 18, y - 18, 36, 31);
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y + 13);
    ctx.stroke();
    drawFlame(x, y + 6, 11, world.time, 1.7);
    // The roof and its finial.
    ctx.fillStyle = '#120d1e';
    ctx.beginPath();
    ctx.moveTo(x - 25, y - 18);
    ctx.lineTo(x, y - 36);
    ctx.lineTo(x + 25, y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.flame;
    ctx.beginPath();
    ctx.arc(x, y - 38, 2.6, 0, Math.PI * 2);
    ctx.fill();
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
    // A cold halo first (the rim of the eclipse), then the turning rings.
    const haloR = boss.radius * 2.3;
    ctx.drawImage(haloSprite, -haloR, -haloR, haloR * 2, haloR * 2);
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
    ctx.fillStyle = boss.state === 'phase3' ? COLORS.bolt : '#e9d5ff';
    ctx.beginPath();
    ctx.arc(Math.cos(look) * 7, Math.sin(look) * 7, boss.radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * The Warden: a cloaked keeper who carries the lantern toward the aim. The
   * silhouette is a hooded wedge with the bright lamp at its front — readable at
   * gameplay distance and unmistakably not one of the Hollow's shapes.
   */
  function drawPlayer(world) {
    const player = world.player;
    if (!player.alive) return;
    if (player.iframes > 0 && player.dashTimer <= 0 && Math.sin(world.time * 34) > 0.2) {
      // The blink of brief invulnerability: skip the keeper every other flash.
      return;
    }
    ctx.save();
    ctx.translate(player.x, player.y);
    // The lantern's own glow, carried with the keeper: inside his light pool the
    // sheet cannot cover it, so the hero is the brightest point in any frame.
    ctx.globalAlpha = 0.55;
    ctx.drawImage(warmSprite, -48, -48, 96, 96);
    ctx.globalAlpha = 1;
    ctx.rotate(player.angle);
    if (player.dashTimer > 0) {
      // The cloak streams behind a dash.
      ctx.fillStyle = 'rgba(255, 196, 77, 0.30)';
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(-30, 0);
      ctx.lineTo(-8, -8);
      ctx.closePath();
      ctx.fill();
    }
    // The cloak: a hooded wedge, dark umber trimmed with lantern amber.
    ctx.fillStyle = '#2e1f0e';
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-6, 10.5);
    ctx.lineTo(-13, 12);
    ctx.lineTo(-9.5, 0);
    ctx.lineTo(-13, -12);
    ctx.lineTo(-6, -10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The hood.
    ctx.fillStyle = '#17100a';
    ctx.beginPath();
    ctx.arc(3.5, 0, 6.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 196, 77, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // The lantern, held out toward the aim: a caged flame, the brightest point
    // on the keeper.
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(17.5, 6.5, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.flame;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(17.5, 6.5, 5.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawReticle(input) {
    const aim = input.aim();
    ctx.strokeStyle = 'rgba(255, 196, 77, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.playerCore;
    ctx.fillRect(aim.x - 1, aim.y - 1, 2, 2);
  }

  /**
   * One pool of light on the darkness sheet: a radial falloff (the canvas cousin
   * of a smoothstep edge) punched out of the dark. The tint pass then warms the
   * same pool so lit ground feels lamplit, not merely less black.
   */
  function punchPool(x, y, radius, strength) {
    dctx.globalAlpha = strength;
    dctx.drawImage(poolSprite, x - radius, y - radius, radius * 2, radius * 2);
    dctx.globalAlpha = 1;
  }

  function warmPool(x, y, radius, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(warmSprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  /** Blit a baked beam wedge, rotated into its current sweep, on either canvas. */
  function drawBeamSprite(target, sprite, world, alpha) {
    const { x, y } = LANTERN.tower;
    target.save();
    target.translate(x, y);
    target.rotate(world.beamAngle());
    target.globalAlpha = alpha;
    target.drawImage(sprite, 0, -sprite.height / 2);
    target.restore();
    target.globalAlpha = 1;
  }

  /**
   * The light pass. With the keeper in play, every pool the simulation knows is
   * punched and warmed; on the menu only the harbour's own lights burn (the
   * tower, the braziers, the sweeping beam) behind the title.
   */
  function drawLight(world, withKeeper) {
    // The warm tint first, in plain source-over (the fast composite): lamplight
    // is amber, not grey. The darkness sheet then covers everything except the
    // pools, so the warmth survives exactly where the light falls.
    warmPool(LANTERN.tower.x, LANTERN.tower.y, LANTERN.towerRadius, 0.19);
    for (const brazier of BRAZIERS) warmPool(brazier.x, brazier.y, LANTERN.brazierRadius * 0.8, 0.15);
    drawBeamSprite(ctx, beamWarmSprite, world, 0.14);
    if (withKeeper && world.player) {
      warmPool(world.player.x, world.player.y, world.lanternRadius(), 0.21);
      for (const flare of world.flares) warmPool(flare.x, flare.y, LANTERN.flareRadius * 0.8, 0.16);
    }

    dctx.clearRect(0, 0, VIEW.width, VIEW.height);
    dctx.globalCompositeOperation = 'source-over';
    dctx.fillStyle = 'rgba(3, 3, 12, 0.88)';
    dctx.fillRect(0, 0, VIEW.width, VIEW.height);
    dctx.globalCompositeOperation = 'destination-out';
    punchPool(LANTERN.tower.x, LANTERN.tower.y, LANTERN.towerRadius, 0.96);
    for (const brazier of BRAZIERS) punchPool(brazier.x, brazier.y, LANTERN.brazierRadius, 0.92);
    // The beam: the baked wedge blitted along its sweep, softer than the pools.
    drawBeamSprite(dctx, beamDarkSprite, world, 0.95);
    if (withKeeper && world.player) {
      punchPool(world.player.x, world.player.y, world.lanternRadius(), 0.97);
      for (const flare of world.flares) punchPool(flare.x, flare.y, LANTERN.flareRadius, 0.9);
    }
    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkness, 0, 0, VIEW.width, VIEW.height);
  }

  /** The Hollow's eyes: the one part of a shadowed foe the dark cannot hide. */
  function drawShadowEyes(world) {
    ctx.fillStyle = '#ff5d73';
    for (const enemy of world.enemies) {
      if (enemy.lit !== 0 || enemy.materialize > 0 || !enemy.active) continue;
      const look = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
      const px = Math.cos(look + Math.PI / 2);
      const py = Math.sin(look + Math.PI / 2);
      const fx = Math.cos(look);
      const fy = Math.sin(look);
      const spread = enemy.radius * 0.34;
      const reach = enemy.radius * 0.3;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(enemy.x + fx * reach + px * spread, enemy.y + fy * reach + py * spread, 1.9, 0, Math.PI * 2);
      ctx.arc(enemy.x + fx * reach - px * spread, enemy.y + fy * reach - py * spread, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The harbour chart, bottom-left: every light and every foe, at a glance. */
  function drawMinimap(world) {
    const w = 176;
    const h = 110;
    const x0 = 24;
    const y0 = VIEW.height - h - 20;
    const sx = w / VIEW.width;
    const sy = h / VIEW.height;
    ctx.fillStyle = 'rgba(6, 4, 14, 0.74)';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    drawText(ctx, 'GLOAMHARBOUR', x0 + 7, y0 + 14, { size: 9, color: COLORS.dim, spacing: 1.6 });
    // Lights first: tower diamond, brazier sparks, flares.
    ctx.fillStyle = COLORS.flame;
    ctx.save();
    ctx.translate(x0 + LANTERN.tower.x * sx, y0 + LANTERN.tower.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    for (const brazier of BRAZIERS) ctx.fillRect(x0 + brazier.x * sx - 1.4, y0 + brazier.y * sy - 1.4, 2.8, 2.8);
    ctx.fillStyle = 'rgba(255, 179, 71, 0.55)';
    for (const flare of world.flares) ctx.fillRect(x0 + flare.x * sx - 1.4, y0 + flare.y * sy - 1.4, 2.8, 2.8);
    // Foes: full colour in the light, a whisper in the dark.
    for (const enemy of world.enemies) {
      if (!enemy.active || enemy.materialize > 0) continue;
      ctx.globalAlpha = enemy.lit ? 1 : 0.35;
      ctx.fillStyle = COLORS[enemy.kind];
      const r = enemy.kind === 'sovereign' ? 4.6 : 2.6;
      ctx.beginPath();
      ctx.arc(x0 + enemy.x * sx, y0 + enemy.y * sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The keeper: a bright heart with an aim tick.
    const player = world.player;
    if (player && player.alive) {
      const mx = x0 + player.x * sx;
      const my = y0 + player.y * sy;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(player.angle) * 8, my + Math.sin(player.angle) * 8);
      ctx.stroke();
      ctx.fillStyle = COLORS.playerCore;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The kill feed: the fight's recent story, newest first, fading as it ages. */
  function drawFeed(world) {
    let y = 128;
    for (const entry of world.feed) {
      const alpha = Math.max(0, Math.min(1, entry.timer / 1.5));
      drawText(ctx, entry.label, VIEW.width - 92, y, { size: 13, weight: 700, align: 'right', color: entry.color, alpha });
      drawText(ctx, `+${entry.gained}`, VIEW.width - 26, y, { size: 13, weight: 700, align: 'right', color: COLORS.dim, alpha });
      y += 19;
    }
  }

  function drawHud(world, muted) {
    const player = world.player;
    const stats = world.stats;
    // Hull, top-left.
    drawText(ctx, 'HULL', 26, 34, { size: 12, color: COLORS.dim, spacing: 2 });
    const hpFraction = player.hp / stats.maxHp;
    bar(ctx, 26, 42, 264, 15, hpFraction, hpFraction > 0.3 ? COLORS.bloom : COLORS.warn);
    drawText(ctx, `${Math.ceil(player.hp)} / ${stats.maxHp}`, 300, 55, { size: 14, weight: 700 });
    // Dash, under the hull.
    drawText(ctx, 'DASH', 26, 78, { size: 12, color: COLORS.dim, spacing: 2 });
    const dashFraction = player.dashCdTimer > 0 ? 1 - player.dashCdTimer / stats.dashCooldown : 1;
    bar(ctx, 74, 66, 120, 9, dashFraction, dashFraction >= 1 ? COLORS.player : 'rgba(255,196,77,0.4)');
    if (dashFraction >= 1) drawText(ctx, 'READY', 204, 76, { size: 11, color: COLORS.player });
    // Oil, under the dash: the lantern's fuel, and with it the size of the light.
    const oilFraction = world.oil / LANTERN.oilMax;
    const guttering = oilFraction < 0.25;
    drawText(ctx, 'OIL', 26, 102, { size: 12, color: guttering ? COLORS.warn : COLORS.dim, spacing: 2 });
    ctx.globalAlpha = guttering ? 0.65 + 0.35 * Math.sin(world.time * 9) : 1;
    bar(ctx, 74, 90, 216, 10, oilFraction, guttering ? COLORS.warn : COLORS.flame);
    ctx.globalAlpha = 1;
    drawText(ctx, `${Math.round(world.oil)}`, 300, 100, { size: 13, weight: 700, color: guttering ? COLORS.warn : COLORS.text });
    // Score and combo, top-right.
    drawText(ctx, formatScore(world.score), VIEW.width - 26, 46, { size: 30, weight: 800, align: 'right' });
    drawText(ctx, `BEST ${formatScore(Math.max(world.best, world.score))}`, VIEW.width - 26, 68, { size: 12, color: COLORS.dim, align: 'right' });
    if (world.combo > 1) {
      const mult = world.comboMult();
      drawText(ctx, `x${mult} COMBO ${world.combo}`, VIEW.width - 26, 98, {
        size: 17,
        weight: 800,
        align: 'right',
        color: mult >= 5 ? COLORS.flame : COLORS.shard,
      });
      bar(ctx, VIEW.width - 146, 106, 120, 5, world.comboTimer / PACE.comboWindow, COLORS.shard);
    }
    drawFeed(world);
    // Wave, top-centre; the boss takes the centre over with its own bar.
    if (world.boss) {
      const boss = world.boss;
      drawText(ctx, 'THE HOLLOW SOVEREIGN', VIEW.width / 2, 30, { size: 14, weight: 800, color: COLORS.sovereign, align: 'center', spacing: 3 });
      bar(ctx, VIEW.width / 2 - 260, 38, 520, 12, boss.hp / boss.maxHp, COLORS.sovereign);
      drawText(ctx, boss.state === 'phase3' ? 'PHASE III — ECLIPSE' : boss.state === 'phase2' ? 'PHASE II — THE LIGHT FAILS' : 'PHASE I', VIEW.width / 2, 66, {
        size: 11,
        color: COLORS.dim,
        align: 'center',
      });
    } else if (world.wave > 0) {
      drawText(ctx, `WAVE ${world.wave}`, VIEW.width / 2, 42, { size: 19, weight: 800, align: 'center', spacing: 3 });
    }
    drawMinimap(world);
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

  /** A harbour lantern, drawn large: the menu's hero, a caged flame. */
  function drawMenuLantern(world) {
    const cx = VIEW.width / 2;
    const cy = 196;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(warmSprite, cx - 120, cy - 120, 240, 240);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - 58, 13, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy - 46);
    ctx.lineTo(cx + 30, cy - 46);
    ctx.lineTo(cx + 24, cy + 44);
    ctx.lineTo(cx - 24, cy + 44);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 38, cy - 46);
    ctx.lineTo(cx + 38, cy - 46);
    ctx.moveTo(cx - 32, cy + 44);
    ctx.lineTo(cx + 32, cy + 44);
    ctx.stroke();
    drawFlame(cx, cy + 16, 21, world.time, 0.4);
  }

  function drawMenu(world) {
    ctx.fillStyle = 'rgba(3, 4, 12, 0.38)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawMenuLantern(world);
    ctx.drawImage(titlePlate, VIEW.width / 2 - titlePlate.width / 2, 356 - 96);
    drawText(ctx, 'THE LAST LIGHTKEEPER OF GLOAMHARBOUR', VIEW.width / 2, 398, { size: 17, color: COLORS.dim, align: 'center', spacing: 4 });
    drawText(ctx, 'IN DARKNESS THE HOLLOW BARELY BLEEDS. KEEP THE LIGHT FED, AND IT WILL KEEP YOU.', VIEW.width / 2, 428, { size: 14, color: COLORS.text, align: 'center' });
    const blink = Math.sin(world.time * 3.4) > -0.25;
    if (blink) drawText(ctx, 'CLICK OR PRESS ENTER TO TAKE THE WATCH', VIEW.width / 2, 492, { size: 21, weight: 700, color: COLORS.shard, align: 'center' });
    drawText(ctx, 'WASD / ARROWS — MOVE        MOUSE — AIM        HOLD CLICK — FIRE', VIEW.width / 2, 566, { size: 15, color: COLORS.text, align: 'center' });
    drawText(ctx, 'SHIFT / SPACE — DASH        SURVIVE THE WAVE, DRAFT AN UPGRADE, FACE THE SOVEREIGN EVERY 5TH WAVE', VIEW.width / 2, 594, { size: 15, color: COLORS.text, align: 'center' });
    drawText(ctx, 'KILLS AND EMBERS FEED THE OIL. A FOE IN DARKNESS TAKES ONLY A FRACTION OF EVERY HIT.', VIEW.width / 2, 622, { size: 15, color: COLORS.dim, align: 'center' });
    if (world.best > 0) drawText(ctx, `BEST SCORE ${formatScore(world.best)}`, VIEW.width / 2, 668, { size: 16, weight: 700, color: COLORS.flame, align: 'center' });
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
    } else if (id === 'wide-wick') {
      // The lantern's rings, widening: the pool grows.
      for (const r of [6, 12.5, 19]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.flame;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'bright-burn') {
      // A single tall flame.
      ctx.fillStyle = COLORS.flame;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 20);
      ctx.quadraticCurveTo(cx + 11, cy - 2, cx, cy + 15);
      ctx.quadraticCurveTo(cx - 11, cy - 2, cx, cy - 20);
      ctx.fill();
      ctx.fillStyle = COLORS.playerCore;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'flare-dash') {
      // A dash chevron that leaves a flame behind it.
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy - 13);
      ctx.lineTo(cx + 16, cy);
      ctx.lineTo(cx - 2, cy + 13);
      ctx.stroke();
      ctx.fillStyle = COLORS.flame;
      ctx.beginPath();
      ctx.arc(cx - 13, cy, 5.4, 0, Math.PI * 2);
      ctx.fill();
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
    drawText(ctx, 'THE HARBOUR BREATHES. CHOOSE ONE UPGRADE — CLICK A CARD OR PRESS 1, 2 OR 3.', VIEW.width / 2, 234, { size: 15, color: COLORS.dim, align: 'center' });
    const aim = input.aim();
    world.draft.forEach((upgrade, i) => {
      const card = DRAFT_CARDS[i];
      const hovered = aim.x >= card.x && aim.x <= card.x + card.w && aim.y >= card.y && aim.y <= card.y + card.h;
      ctx.fillStyle = hovered ? 'rgba(46, 32, 14, 0.95)' : 'rgba(14, 11, 22, 0.95)';
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.strokeStyle = hovered ? COLORS.player : 'rgba(168, 152, 120, 0.4)';
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
    drawText(ctx, 'THE LIGHT GOES OUT', VIEW.width / 2, 218, { size: 54, weight: 800, align: 'center', spacing: 6, color: '#ff8095' });
    drawText(ctx, `THE WARDEN KEPT GLOAMHARBOUR LIT THROUGH ${world.finalWave} ${world.finalWave === 1 ? 'WAVE' : 'WAVES'}`, VIEW.width / 2, 262, { size: 16, color: COLORS.dim, align: 'center' });
    drawText(ctx, formatScore(world.finalScore), VIEW.width / 2, 348, { size: 64, weight: 800, align: 'center' });
    drawText(ctx, world.newBest ? 'A NEW BEST SCORE' : `BEST ${formatScore(world.best)}`, VIEW.width / 2, 384, {
      size: 15,
      weight: 700,
      align: 'center',
      color: world.newBest ? COLORS.flame : COLORS.dim,
    });
    drawText(ctx, `${world.kills} HOLLOW BROKEN`, VIEW.width / 2, 424, { size: 15, color: COLORS.text, align: 'center' });
    if (world.upgradesTaken.length > 0) {
      drawText(ctx, `UPGRADES CARRIED — ${world.upgradesTaken.join(' · ')}`, VIEW.width / 2, 458, { size: 13.5, color: COLORS.dim, align: 'center' });
    }
    const blink = Math.sin(world.time * 3.4) > -0.25;
    if (blink) drawText(ctx, 'PRESS ENTER OR CLICK TO RELIGHT', VIEW.width / 2, 540, { size: 20, weight: 700, color: COLORS.shard, align: 'center' });
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
      // Summed sines under the decaying shake value, never a per-frame random
      // buzz; driven by world.time, so the offset holds still through hit-stop
      // instead of jittering inside the freeze.
      const t = world.time * 31;
      const ox = (Math.sin(t * 1.7) + Math.sin(t * 2.3) * 0.6) * world.shake * 0.42;
      const oy = (Math.cos(t * 1.9) + Math.sin(t * 2.7) * 0.6) * world.shake * 0.42;
      ctx.translate(ox, oy);
    }
    drawBackground(world);
    for (const prop of world.props) drawProp(prop);
    drawTower(world);
    drawBraziers(world);
    if (world.screen === SCREEN_MENU) {
      drawLight(world, false);
    } else {
      drawSpawnMarkers(world);
      drawProjectiles(world);
      for (const enemy of world.enemies) drawEnemy(world, enemy);
      drawPlayer(world);
      drawLight(world, true);
      drawShadowEyes(world);
      drawPickups(world);
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
