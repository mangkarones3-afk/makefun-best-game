// Particles and floating texts, both pooled: fixed-size rings of plain objects that are
// reused in place, so a busy fight allocates nothing per frame. Particles are sparks,
// shards and engine trail; texts are the damage and score numbers that rise and fade.
// This module owns their drawing: the renderer calls draw() between the world and the HUD.

const MAX_PARTICLES = 900;
const MAX_TEXTS = 48;

export function createParticles(random) {
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0 });
  }
  const texts = [];
  for (let i = 0; i < MAX_TEXTS; i += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, value: '', color: '#fff', size: 15 });
  }
  let particleCursor = 0;
  let textCursor = 0;

  function spawn(x, y, vx, vy, life, size, color, drag) {
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.drag = drag;
  }

  return {
    /** A radial burst of sparks, for hits and explosions. */
    burst(x, y, color, count, speed, size = 3, life = 0.5) {
      for (let i = 0; i < count; i += 1) {
        const angle = random.angle();
        const v = speed * (0.25 + random.next() * 0.95);
        spawn(x, y, Math.cos(angle) * v, Math.sin(angle) * v, life * (0.5 + random.next() * 0.8), size * (0.6 + random.next() * 0.8), color, 2.6);
      }
    },
    /** A short-lived trail mote, for the ship's engine and the dash. */
    trail(x, y, color, size = 3) {
      spawn(x, y, random.range(-16, 16), random.range(-16, 16), 0.3, size, color, 1.2);
    },
    /** A rising number or label: damage, score, pickups. */
    text(x, y, value, color, size = 15) {
      const t = texts[textCursor];
      textCursor = (textCursor + 1) % MAX_TEXTS;
      t.active = true;
      t.x = x + random.range(-6, 6);
      t.y = y;
      t.life = 0.9;
      t.maxLife = 0.9;
      t.value = value;
      t.color = color;
      t.size = size;
    },
    update(dt) {
      for (const p of particles) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        const drag = Math.max(0, 1 - p.drag * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const t of texts) {
        if (!t.active) continue;
        t.life -= dt;
        if (t.life <= 0) {
          t.active = false;
          continue;
        }
        t.y -= 44 * dt;
      }
    },
    draw(ctx) {
      for (const p of particles) {
        if (!p.active) continue;
        const fade = p.life / p.maxLife;
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const t of texts) {
        if (!t.active) continue;
        ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 1.6);
        ctx.font = `700 ${t.size}px system-ui, sans-serif`;
        ctx.fillStyle = t.color;
        ctx.fillText(t.value, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
    /** Live particle count, for the diagnostics snapshot. */
    count() {
      let n = 0;
      for (const p of particles) if (p.active) n += 1;
      return n;
    },
  };
}
