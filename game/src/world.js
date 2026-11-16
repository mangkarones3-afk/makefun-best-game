// The simulation: the Warden, the Hollow swarm, bullets, pickups, waves, the draft
// between them and the Sovereign who ends every fifth wave. Pure rules, no drawing and
// no sound: the world pushes named events ('shoot', 'hit', 'explosion', ...) that the
// shell turns into audio, and the renderer reads the state it leaves behind. Everything
// random comes from the seeded generator handed in at creation, so a seed is a replay.

import { COLORS, FOES, PACE, PLAYER, VIEW } from './config.js';
import { createParticles } from './particles.js';
import { baseStats, rollUpgrades } from './upgrades.js';

export const SCREEN_MENU = 'menu';
export const SCREEN_PLAYING = 'playing';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const BOSS_EVERY = 5;

function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Remove dead entries (active === false) from an array in place, keeping order. */
function compact(list) {
  let write = 0;
  for (let read = 0; read < list.length; read += 1) {
    if (list[read].active) {
      list[write] = list[read];
      write += 1;
    }
  }
  list.length = write;
}

/** The kinds a wave sends, shuffled: new kinds join as the waves climb. */
function waveComposition(wave, random) {
  const kinds = [];
  const add = (kind, count) => {
    for (let i = 0; i < count; i += 1) kinds.push(kind);
  };
  add('drifter', 4 + wave * 2);
  if (wave >= 2) add('spitter', 1 + Math.floor(wave / 2));
  if (wave >= 3) add('bloom', Math.floor(wave / 1.5));
  if (wave >= 4) add('lancer', wave - 2);
  for (let i = kinds.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    const swap = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = swap;
  }
  return kinds;
}

export function createWorld(random) {
  const effects = createParticles(random);

  const world = {
    screen: SCREEN_MENU,
    time: 0,
    playTime: 0,
    wave: 0,
    score: 0,
    best: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    stats: baseStats(),
    upgradesTaken: [],
    draft: [],
    player: null,
    enemies: [],
    bullets: [],
    bolts: [],
    pickups: [],
    spawning: [],
    spawnQueue: [],
    spawnTimer: 0,
    trickleTimer: 0,
    boss: null,
    shake: 0,
    banner: null,
    events: [],
    effects,
    finalScore: 0,
    finalWave: 0,
    newBest: false,
  };

  function resetPlayer() {
    world.player = {
      x: VIEW.width / 2,
      y: VIEW.height / 2,
      vx: 0,
      vy: 0,
      radius: PLAYER.radius,
      hp: world.stats.maxHp,
      angle: -Math.PI / 2,
      fireTimer: 0,
      dashTimer: 0,
      dashDirX: 1,
      dashDirY: 0,
      dashCdTimer: 0,
      iframes: 0,
      alive: true,
    };
  }
  resetPlayer();

  function comboMult() {
    return 1 + Math.min(Math.floor(world.combo / PACE.comboPerTier), PACE.comboMaxTier);
  }
  world.comboMult = comboMult;

  function emit(name) {
    world.events.push(name);
  }

  function spawnPoint() {
    const margin = 36;
    let x = margin;
    let y = margin;
    for (let tries = 0; tries < 8; tries += 1) {
      const edge = random.int(0, 3);
      if (edge === 0) {
        x = random.range(margin, VIEW.width - margin);
        y = margin;
      } else if (edge === 1) {
        x = VIEW.width - margin;
        y = random.range(margin, VIEW.height - margin);
      } else if (edge === 2) {
        x = random.range(margin, VIEW.width - margin);
        y = VIEW.height - margin;
      } else {
        x = margin;
        y = random.range(margin, VIEW.height - margin);
      }
      if (distance2(x, y, world.player.x, world.player.y) > 250 * 250) break;
    }
    return { x, y };
  }

  function makeEnemy(kind, x, y) {
    const base = FOES[kind];
    const growth = 1 + (world.wave - 1) * PACE.hpGrowth;
    const hp = kind === 'sovereign' ? base.hp + (world.wave / BOSS_EVERY - 1) * 350 : Math.round(base.hp * growth);
    return {
      active: true,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius: base.radius,
      speed: base.speed,
      contact: base.contact,
      score: base.score,
      flash: 0,
      wobble: random.angle(),
      state: 'stalk',
      stateTime: 0,
      fireTimer: random.range(0.6, 1.6),
      attackTimer: 1.6,
      spiralTimer: 0,
      spiralAngle: 0,
      summonTimer: 5,
      chargeAngle: 0,
      chargeTimer: 0,
      materialize: 0.25,
    };
  }

  function queueSpawn(kind) {
    const point = spawnPoint();
    world.spawning.push({ kind, x: point.x, y: point.y, timer: PACE.spawnWarnTime });
  }

  function startWave(wave) {
    world.wave = wave;
    world.spawnQueue = [];
    world.spawnTimer = 0.4;
    world.trickleTimer = 3;
    if (wave % BOSS_EVERY === 0) {
      world.banner = { title: 'THE HOLLOW SOVEREIGN', sub: 'End it, Warden.', timer: 2.4 };
      world.spawning.push({ kind: 'sovereign', x: VIEW.width / 2, y: 170, timer: 1.2 });
      emit('boss');
    } else {
      world.spawnQueue = waveComposition(wave, random);
      world.banner = { title: `WAVE ${wave}`, sub: wave === 1 ? 'Hold the gate.' : '', timer: 1.8 };
    }
  }
  world.startWave = startWave;

  function startGame() {
    world.stats = baseStats();
    world.score = 0;
    world.kills = 0;
    world.combo = 0;
    world.comboTimer = 0;
    world.playTime = 0;
    world.upgradesTaken = [];
    world.draft = [];
    world.enemies = [];
    world.bullets = [];
    world.bolts = [];
    world.pickups = [];
    world.spawning = [];
    world.boss = null;
    world.shake = 0;
    world.newBest = false;
    resetPlayer();
    world.screen = SCREEN_PLAYING;
    startWave(1);
  }
  world.startGame = startGame;

  function openDraft() {
    world.draft = rollUpgrades(random);
    world.screen = SCREEN_DRAFT;
    emit('draft');
  }

  function chooseUpgrade(index) {
    if (world.screen !== SCREEN_DRAFT) return;
    const chosen = world.draft[index];
    if (!chosen) return;
    chosen.apply(world.stats, world.player);
    world.upgradesTaken.push(chosen.name);
    world.draft = [];
    world.screen = SCREEN_PLAYING;
    emit('uiclick');
    startWave(world.wave + 1);
  }
  world.chooseUpgrade = chooseUpgrade;

  function gameOver() {
    world.screen = SCREEN_OVER;
    world.finalScore = world.score;
    world.finalWave = world.wave;
    world.newBest = world.score > world.best;
    if (world.newBest) world.best = world.score;
    world.shake = 16;
    effects.burst(world.player.x, world.player.y, COLORS.player, 70, 340, 4, 0.9);
    effects.burst(world.player.x, world.player.y, COLORS.bullet, 40, 220, 3, 0.7);
    emit('explosion-big');
    emit('over');
  }

  function damagePlayer(amount) {
    const player = world.player;
    if (!player.alive || player.iframes > 0) return;
    player.hp -= amount;
    player.iframes = PLAYER.iframeTime;
    world.shake = Math.max(world.shake, 7);
    world.combo = 0;
    world.comboTimer = 0;
    effects.burst(player.x, player.y, COLORS.drifter, 14, 200, 3, 0.4);
    emit('playerhit');
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      gameOver();
    }
  }

  function dropPickups(x, y, rich) {
    const shards = rich ? random.int(2, 4) : random.int(1, 3);
    for (let i = 0; i < shards; i += 1) {
      const angle = random.angle();
      const dist = random.range(4, 26);
      world.pickups.push({
        active: true,
        kind: 'shard',
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 7,
        age: 0,
      });
    }
    if (random.chance(rich ? PACE.heartChance * 2 : PACE.heartChance)) {
      world.pickups.push({ active: true, kind: 'heart', x, y, vx: 0, vy: 0, radius: 9, age: 0 });
    }
  }

  function killEnemy(enemy) {
    enemy.active = false;
    world.kills += 1;
    world.combo += 1;
    world.comboTimer = PACE.comboWindow;
    const gained = enemy.score * comboMult();
    world.score += gained;
    effects.text(enemy.x, enemy.y - enemy.radius, `+${gained}`, COLORS.shard, enemy.kind === 'sovereign' ? 26 : 14);
    if (enemy.kind === 'sovereign') {
      world.boss = null;
      world.shake = 18;
      effects.burst(enemy.x, enemy.y, COLORS.sovereign, 90, 380, 4, 1);
      effects.burst(enemy.x, enemy.y, COLORS.bolt, 50, 260, 3, 0.8);
      emit('explosion-big');
      dropPickups(enemy.x, enemy.y, true);
      return;
    }
    effects.burst(enemy.x, enemy.y, COLORS[enemy.kind], enemy.kind === 'bloom' ? 30 : 16, 230, 3, 0.55);
    emit(enemy.kind === 'bloom' ? 'explosion-big' : 'explosion');
    if (enemy.kind === 'bloom') {
      for (let i = 0; i < FOES.bloom.children; i += 1) {
        const mite = makeEnemy('mite', enemy.x + random.range(-18, 18), enemy.y + random.range(-18, 18));
        mite.materialize = 0.12;
        world.enemies.push(mite);
      }
    }
    dropPickups(enemy.x, enemy.y, enemy.kind === 'bloom');
  }

  function hurtEnemy(enemy, damage, crit) {
    enemy.hp -= damage;
    enemy.flash = 0.09;
    if (crit) effects.text(enemy.x, enemy.y - enemy.radius - 6, `${Math.round(damage)}`, COLORS.lancer, 17);
    effects.burst(enemy.x, enemy.y, COLORS[enemy.kind], 3, 150, 2, 0.3);
    emit('hit');
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function fireBolt(x, y, angle, speed, damage) {
    world.bolts.push({
      active: true,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 6,
      damage,
    });
  }

  function updatePlayer(dt, input) {
    const player = world.player;
    const stats = world.stats;
    if (!player.alive) return;
    if (stats.regen > 0) player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
    player.fireTimer -= dt;
    player.dashCdTimer -= dt;
    player.iframes -= dt;

    let moveX = input.moveX;
    let moveY = input.moveY;
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }

    if (input.dash && player.dashCdTimer <= 0 && player.dashTimer <= 0) {
      const dashX = length > 0.1 ? moveX : Math.cos(player.angle);
      const dashY = length > 0.1 ? moveY : Math.sin(player.angle);
      player.dashDirX = dashX;
      player.dashDirY = dashY;
      player.dashTimer = PLAYER.dashTime;
      player.dashCdTimer = stats.dashCooldown;
      player.iframes = Math.max(player.iframes, PLAYER.dashTime + 0.05);
      emit('dash');
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      player.vx = player.dashDirX * PLAYER.dashSpeed;
      player.vy = player.dashDirY * PLAYER.dashSpeed;
      effects.trail(player.x, player.y, COLORS.player, 5);
    } else {
      player.vx = moveX * stats.speed;
      player.vy = moveY * stats.speed;
      if (length > 0.1 && random.chance(0.35)) {
        effects.trail(player.x - moveX * 14, player.y - moveY * 14, COLORS.player, 2.5);
      }
    }
    player.x = Math.min(VIEW.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(VIEW.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);

    if (input.firing && player.fireTimer <= 0 && player.dashTimer <= 0) {
      player.fireTimer = stats.fireInterval;
      const count = stats.projectiles;
      const spreadStep = 0.085;
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * spreadStep;
        const angle = player.angle + offset + random.range(-0.008, 0.008);
        world.bullets.push({
          active: true,
          x: player.x + Math.cos(player.angle) * 18,
          y: player.y + Math.sin(player.angle) * 18,
          vx: Math.cos(angle) * PLAYER.bulletSpeed,
          vy: Math.sin(angle) * PLAYER.bulletSpeed,
          radius: PLAYER.bulletRadius,
          damage: stats.damage,
          pierce: stats.pierce,
          crit: random.chance(stats.critChance),
        });
      }
      emit('shoot');
    }
  }

  function steer(enemy, dt, targetX, targetY, speed) {
    const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
    enemy.vx = Math.cos(angle) * speed;
    enemy.vy = Math.sin(angle) * speed;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    return angle;
  }

  function updateEnemy(enemy, dt) {
    const player = world.player;
    enemy.flash -= dt;
    if (enemy.materialize > 0) {
      enemy.materialize -= dt;
      return;
    }
    enemy.stateTime += dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wobbleX = Math.cos(world.time * 2.4 + enemy.wobble) * 22;
    const wobbleY = Math.sin(world.time * 2.4 + enemy.wobble) * 22;

    if (enemy.kind === 'drifter' || enemy.kind === 'mite' || enemy.kind === 'bloom') {
      steer(enemy, dt, player.x + wobbleX, player.y + wobbleY, enemy.speed);
    } else if (enemy.kind === 'spitter') {
      const range = FOES.spitter.range;
      let targetX = player.x;
      let targetY = player.y;
      if (dist < range - 45) {
        targetX = enemy.x - dx;
        targetY = enemy.y - dy;
      } else if (dist <= range + 45) {
        targetX = enemy.x - dy * 0.4;
        targetY = enemy.y + dx * 0.4;
      }
      steer(enemy, dt, targetX, targetY, enemy.speed);
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0 && player.alive) {
        enemy.fireTimer = FOES.spitter.fireTime * random.range(0.85, 1.15);
        fireBolt(enemy.x, enemy.y, Math.atan2(dy, dx), FOES.spitter.boltSpeed, FOES.spitter.boltDamage);
      }
    } else if (enemy.kind === 'lancer') {
      if (enemy.state === 'stalk') {
        steer(enemy, dt, player.x, player.y, enemy.speed);
        if (dist < 350 && enemy.stateTime > 0.5) {
          enemy.state = 'telegraph';
          enemy.stateTime = 0;
        }
      } else if (enemy.state === 'telegraph') {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.chargeAngle = Math.atan2(dy, dx);
        if (enemy.stateTime >= FOES.lancer.telegraph) {
          enemy.state = 'charge';
          enemy.stateTime = 0;
        }
      } else if (enemy.state === 'charge') {
        enemy.x += Math.cos(enemy.chargeAngle) * FOES.lancer.chargeSpeed * dt;
        enemy.y += Math.sin(enemy.chargeAngle) * FOES.lancer.chargeSpeed * dt;
        if (enemy.stateTime >= FOES.lancer.chargeTime) {
          enemy.state = 'recover';
          enemy.stateTime = 0;
        }
      } else {
        steer(enemy, dt, player.x, player.y, enemy.speed * 0.35);
        if (enemy.stateTime >= 0.55) {
          enemy.state = 'stalk';
          enemy.stateTime = 0;
        }
      }
    } else if (enemy.kind === 'sovereign') {
      updateSovereign(enemy, dt, dist);
    }

    enemy.x = Math.min(VIEW.width - enemy.radius, Math.max(enemy.radius, enemy.x));
    enemy.y = Math.min(VIEW.height - enemy.radius, Math.max(enemy.radius, enemy.y));
  }

  function updateSovereign(boss, dt, distToPlayer) {
    const player = world.player;
    const phase = boss.hp > boss.maxHp * 0.66 ? 1 : boss.hp > boss.maxHp * 0.33 ? 2 : 3;
    boss.state = `phase${phase}`;
    // Hold a menacing orbit around the arena's heart, drifting toward the player.
    const orbitX = VIEW.width / 2 + Math.cos(world.time * 0.24) * 190 + (player.x - VIEW.width / 2) * 0.22;
    const orbitY = 250 + Math.sin(world.time * 0.31) * 90 + (player.y - 250) * 0.15;
    if (boss.chargeTimer > 0) {
      boss.chargeTimer -= dt;
      boss.x += Math.cos(boss.chargeAngle) * 470 * dt;
      boss.y += Math.sin(boss.chargeAngle) * 470 * dt;
      return;
    }
    steer(boss, dt, orbitX, orbitY, boss.speed * (phase === 3 ? 1.5 : 1));

    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0 && player.alive) {
      boss.attackTimer = phase === 1 ? 2.3 : phase === 2 ? 1.8 : 1.45;
      const roll = random.next();
      if (roll < 0.45) {
        const base = random.angle();
        const bolts = phase === 1 ? 16 : 22;
        for (let i = 0; i < bolts; i += 1) fireBolt(boss.x, boss.y, base + (i / bolts) * Math.PI * 2, FOES.sovereign.boltSpeed * 0.8, FOES.sovereign.boltDamage);
      } else if (roll < 0.8 || phase < 3) {
        const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
        for (let i = -2; i <= 2; i += 1) fireBolt(boss.x, boss.y, aim + i * 0.13, FOES.sovereign.boltSpeed, FOES.sovereign.boltDamage);
      } else {
        boss.chargeAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
        boss.chargeTimer = 0.62;
        emit('boss');
      }
      emit('hit');
    }
    if (phase >= 2) {
      boss.spiralTimer -= dt;
      if (boss.spiralTimer <= 0 && player.alive) {
        boss.spiralTimer = 0.16;
        boss.spiralAngle += 0.42;
        fireBolt(boss.x, boss.y, boss.spiralAngle, FOES.sovereign.boltSpeed * 0.66, FOES.sovereign.boltDamage);
        fireBolt(boss.x, boss.y, boss.spiralAngle + Math.PI, FOES.sovereign.boltSpeed * 0.66, FOES.sovereign.boltDamage);
      }
    }
    boss.summonTimer -= dt;
    if (boss.summonTimer <= 0) {
      boss.summonTimer = phase === 1 ? 7 : 5.5;
      if (world.enemies.length < 14) {
        for (let i = 0; i < 2; i += 1) {
          const minion = makeEnemy(random.chance(0.5) ? 'drifter' : 'mite', boss.x + random.range(-60, 60), boss.y + random.range(-60, 60));
          minion.materialize = 0.3;
          world.enemies.push(minion);
        }
      }
    }
  }

  function updateSpawning(dt) {
    for (const pending of world.spawning) {
      pending.timer -= dt;
      if (pending.timer <= 0) {
        pending.done = true;
        const enemy = makeEnemy(pending.kind, pending.x, pending.y);
        world.enemies.push(enemy);
        if (pending.kind === 'sovereign') world.boss = enemy;
        effects.burst(pending.x, pending.y, COLORS[pending.kind], 10, 120, 2.5, 0.35);
      }
    }
    world.spawning = world.spawning.filter((pending) => !pending.done);

    if (world.spawnQueue.length > 0) {
      world.spawnTimer -= dt;
      if (world.spawnTimer <= 0) {
        world.spawnTimer = PACE.spawnInterval;
        queueSpawn(world.spawnQueue.shift());
      }
    } else if (world.wave % BOSS_EVERY === 0 && world.boss) {
      world.trickleTimer -= dt;
      if (world.trickleTimer <= 0) {
        world.trickleTimer = 4.2;
        if (world.enemies.length < 8) queueSpawn('drifter');
      }
    }
  }

  function updateProjectiles(dt) {
    for (const bullet of world.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -20 || bullet.x > VIEW.width + 20 || bullet.y < -20 || bullet.y > VIEW.height + 20) bullet.active = false;
    }
    for (const bolt of world.bolts) {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.x < -20 || bolt.x > VIEW.width + 20 || bolt.y < -20 || bolt.y > VIEW.height + 20) bolt.active = false;
    }
    compact(world.bullets);
    compact(world.bolts);
  }

  function updateCollisions() {
    const player = world.player;
    for (const bullet of world.bullets) {
      if (!bullet.active) continue;
      for (const enemy of world.enemies) {
        if (!enemy.active || enemy.materialize > 0) continue;
        const reach = enemy.radius + bullet.radius;
        if (distance2(bullet.x, bullet.y, enemy.x, enemy.y) < reach * reach) {
          hurtEnemy(enemy, bullet.crit ? bullet.damage * 2 : bullet.damage, bullet.crit);
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            bullet.active = false;
          }
          break;
        }
      }
    }
    compact(world.bullets);

    if (player.alive) {
      for (const enemy of world.enemies) {
        if (!enemy.active || enemy.materialize > 0) continue;
        const reach = enemy.radius + player.radius;
        if (distance2(enemy.x, enemy.y, player.x, player.y) < reach * reach) {
          damagePlayer(enemy.contact);
          enemy.x -= (player.x - enemy.x) * 0.12;
          enemy.y -= (player.y - enemy.y) * 0.12;
          if (!player.alive) break;
        }
      }
      for (const bolt of world.bolts) {
        if (!bolt.active) continue;
        const reach = bolt.radius + player.radius;
        if (distance2(bolt.x, bolt.y, player.x, player.y) < reach * reach) {
          bolt.active = false;
          damagePlayer(bolt.damage);
          if (!player.alive) break;
        }
      }
      compact(world.bolts);
    }

    // Enemies keep a little distance from one another, so the swarm reads as bodies.
    const enemies = world.enemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active || a.materialize > 0) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active || b.materialize > 0) continue;
        const reach = (a.radius + b.radius) * 0.82;
        const d2 = distance2(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < reach * reach) {
          const dist = Math.sqrt(d2);
          const push = ((reach - dist) / dist) * 0.5;
          const px = (a.x - b.x) * push;
          const py = (a.y - b.y) * push;
          if (a.kind !== 'sovereign') {
            a.x += px;
            a.y += py;
          }
          if (b.kind !== 'sovereign') {
            b.x -= px;
            b.y -= py;
          }
        }
      }
    }
    compact(world.enemies);
    if (world.boss && !world.boss.active) world.boss = null;
  }

  function updatePickups(dt) {
    const player = world.player;
    for (const pickup of world.pickups) {
      pickup.age += dt;
      if (player.alive) {
        const d2 = distance2(pickup.x, pickup.y, player.x, player.y);
        const magnet = world.stats.magnet;
        if (d2 < magnet * magnet) {
          const dist = Math.sqrt(d2) || 1;
          const pull = 560 * (1 - dist / (magnet * 1.6));
          pickup.vx += ((player.x - pickup.x) / dist) * pull * dt * 4;
          pickup.vy += ((player.y - pickup.y) / dist) * pull * dt * 4;
        }
        pickup.vx *= 0.86;
        pickup.vy *= 0.86;
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        const reach = player.radius + pickup.radius + 4;
        if (d2 < reach * reach) {
          pickup.active = false;
          if (pickup.kind === 'shard') {
            world.score += PACE.shardScore;
            effects.text(player.x, player.y - 24, `+${PACE.shardScore}`, COLORS.shard, 12);
          } else {
            player.hp = Math.min(world.stats.maxHp, player.hp + PACE.heartHeal);
            effects.text(player.x, player.y - 24, `+${PACE.heartHeal} HULL`, COLORS.heart, 14);
          }
          emit('pickup');
        }
      }
      if (pickup.age > 25) pickup.active = false;
    }
    compact(world.pickups);
  }

  function update(dt, input) {
    world.time += dt;
    effects.update(dt);
    if (world.banner) {
      world.banner.timer -= dt;
      if (world.banner.timer <= 0) world.banner = null;
    }
    world.shake = Math.max(0, world.shake - dt * 34);
    if (world.screen !== SCREEN_PLAYING) return;

    world.playTime += dt;
    if (world.comboTimer > 0) {
      world.comboTimer -= dt;
      if (world.comboTimer <= 0) world.combo = 0;
    }
    updateSpawning(dt);
    updatePlayer(dt, input);
    for (const enemy of world.enemies) updateEnemy(enemy, dt);
    updateProjectiles(dt);
    updateCollisions();
    updatePickups(dt);

    if (
      world.screen === SCREEN_PLAYING &&
      world.player.alive &&
      world.spawnQueue.length === 0 &&
      world.spawning.length === 0 &&
      world.enemies.length === 0
    ) {
      emit('waveclear');
      openDraft();
    }
  }
  world.update = update;

  /** A plain snapshot of the run, for the hooks and the smoke tests. */
  function snapshot() {
    const player = world.player;
    return {
      screen: world.screen,
      wave: world.wave,
      score: world.score,
      best: world.best,
      combo: world.combo,
      comboMult: comboMult(),
      hp: Math.ceil(player.hp),
      maxHp: world.stats.maxHp,
      alive: player.alive,
      enemies: world.enemies.length,
      spawning: world.spawning.length,
      queued: world.spawnQueue.length,
      boss: world.boss ? { hp: world.boss.hp, maxHp: world.boss.maxHp, phase: world.boss.state } : null,
      upgrades: world.upgradesTaken.slice(),
      kills: world.kills,
      particles: effects.count(),
      playTime: Math.round(world.playTime * 10) / 10,
    };
  }
  world.snapshot = snapshot;

  return world;
}
