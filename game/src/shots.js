// Screenshot scenes behind ?shot=title|action|boss|draft|over (with &seed=N). Each one
// plays the real rules forward from a fresh world, steered by the autopilot below (it
// aims at the nearest foe with a little lead, keeps its distance, strafes and dashes),
// so the frame is what an actual game looks like and the same seed gives the same frame.
// Nothing here fakes a state: the draft scene is a wave the autopilot really cleared,
// and the game-over scene is a Warden who really stood still and was overrun.

import { PLAYER, STEP, VIEW } from './config.js';
import { SCREEN_DRAFT, SCREEN_OVER, SCREEN_PLAYING } from './world.js';
import { DRAFT_CARDS } from './render.js';

const IDLE = { moveX: 0, moveY: 0, aimX: VIEW.width / 2, aimY: 0, firing: false, dash: false };

function nearestFoe(world) {
  const player = world.player;
  let best = null;
  let bestD2 = Infinity;
  for (const enemy of world.enemies) {
    if (!enemy.active || enemy.materialize > 0) continue;
    const d2 = (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = enemy;
    }
  }
  return { foe: best, dist: Math.sqrt(bestD2) };
}

/** One frame of autopilot input: honest twin-stick play, no state touched directly. */
export function autopilotInput(world) {
  const player = world.player;
  const { foe, dist } = nearestFoe(world);
  if (!foe) {
    return { moveX: Math.sign(VIEW.width / 2 - player.x) * 0.4, moveY: Math.sign(VIEW.height / 2 - player.y) * 0.4, aimX: player.x + 40, aimY: player.y, firing: false, dash: false };
  }
  const lead = Math.min(0.32, dist / PLAYER.bulletSpeed);
  const aimX = foe.x + foe.vx * lead;
  const aimY = foe.y + foe.vy * lead;
  const awayX = (player.x - foe.x) / (dist || 1);
  const awayY = (player.y - foe.y) / (dist || 1);
  let moveX;
  let moveY;
  if (dist < 195) {
    moveX = awayX;
    moveY = awayY;
  } else if (dist > 335) {
    moveX = -awayX;
    moveY = -awayY;
  } else {
    const side = Math.sin(world.time * 0.85) > 0 ? 1 : -1;
    moveX = -awayY * side;
    moveY = awayX * side;
  }
  // Keep off the walls: a gentle pull toward the centre when close to an edge.
  if (player.x < 110) moveX += 0.8;
  if (player.x > VIEW.width - 110) moveX -= 0.8;
  if (player.y < 110) moveY += 0.8;
  if (player.y > VIEW.height - 110) moveY -= 0.8;
  return { moveX, moveY, aimX, aimY, firing: true, dash: dist < 105 };
}

/** Step the world with a fixed input source, draining sound events nobody will play. */
function run(world, seconds, inputOf) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = inputOf(world);
    world.update(STEP, input);
    world.shotAim = { x: input.aimX, y: input.aimY };
    world.events.length = 0;
    if (world.screen === SCREEN_DRAFT) world.chooseUpgrade(0);
    if (world.screen === SCREEN_OVER) return false;
  }
  return world.screen === SCREEN_PLAYING || world.screen === SCREEN_DRAFT;
}

/**
 * Set the world to the named scene and return when it is ready to paint. Any name but
 * action, boss, draft or over is the title.
 */
export function stageShot(name, world) {
  if (name === 'action') {
    world.startGame();
    world.startWave(3);
    run(world, 9.5, autopilotInput);
    if (world.screen === SCREEN_OVER) {
      world.startGame();
      world.startWave(3);
      run(world, 7, autopilotInput);
    }
  } else if (name === 'boss') {
    // Fight through the first four waves for real (drafts auto-picked), so the
    // Sovereign is met by a lived-in run: a banked score and an upgraded cannon.
    world.startGame();
    let guard = Math.round(300 / STEP);
    while (guard-- > 0 && !(world.screen === SCREEN_PLAYING && world.boss)) {
      const input = autopilotInput(world);
      world.update(STEP, input);
      world.shotAim = { x: input.aimX, y: input.aimY };
      world.events.length = 0;
      if (world.screen === SCREEN_DRAFT) world.chooseUpgrade(0);
      if (world.screen === SCREEN_OVER) world.startGame();
    }
    run(world, 9, autopilotInput);
    if (!world.boss) {
      // The upgraded Warden felled it before the portrait: meet it again, fresh.
      world.startGame();
      world.startWave(5);
      run(world, 8, autopilotInput);
    }
  } else if (name === 'draft') {
    world.startGame();
    const cap = Math.round(75 / STEP);
    for (let i = 0; i < cap && world.screen !== SCREEN_DRAFT; i += 1) {
      world.update(STEP, autopilotInput(world));
      world.events.length = 0;
      if (world.screen === SCREEN_OVER) world.startGame();
    }
  } else if (name === 'over') {
    // Play honestly until wave 3 is under way, banking a real score, kills and an
    // upgrade or two — then stop fighting and let the swarm take the gate.
    world.startGame();
    let guard = Math.round(120 / STEP);
    while (guard-- > 0 && !(world.screen === SCREEN_PLAYING && world.wave >= 3)) {
      world.update(STEP, autopilotInput(world));
      world.events.length = 0;
      if (world.screen === SCREEN_DRAFT) world.chooseUpgrade(0);
      if (world.screen === SCREEN_OVER) break;
    }
    guard = Math.round(90 / STEP);
    while (guard-- > 0 && world.screen !== SCREEN_OVER) {
      world.update(STEP, { ...IDLE, aimX: world.player.x + 60, aimY: world.player.y - 20 });
      world.events.length = 0;
      if (world.screen === SCREEN_DRAFT) world.chooseUpgrade(0);
    }
  } else {
    run(world, 2, () => IDLE);
  }
  if (world.screen === SCREEN_DRAFT && name !== 'draft') world.chooseUpgrade(0);
  if (world.screen === SCREEN_DRAFT) {
    // Rest the cursor on the middle card, where a player's would be while choosing.
    const card = DRAFT_CARDS[1];
    world.shotAim = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
  }
}
