// Boot and the one loop. Input is gathered once a frame; the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one, a long stall dropped rather
// than replayed); the renderer paints what is there. This shell owns the screen-level
// keys (start, pause, draft picks, restart, mute), turns the world's sound events into
// audio, keeps the best score in localStorage, and exposes window.__wickwarden so the
// game can be driven and inspected from outside (screenshot staging, smoke tests).
//
// Hit-stop lives here too: the world only asks (world.hitStop, set by crits, big
// kills, the draft opening, the death), and this shell freezes the simulation for
// that many real seconds — the renderer keeps painting the frozen frame, shake
// included, so the pause reads as weight, not as a stall.
//
// ?seed=N fixes the run's randomness. ?shot=title|action|boss|draft|over (with &seed=N)
// stages that scene instead of running the loop, paints it and sets window.__shotReady.

import { BEST_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, SCREEN_DRAFT, SCREEN_MENU, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAYING } from './world.js';
import { createRenderer, DRAFT_CARDS } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.1;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}
world.best = readBest();

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const EVENT_SOUNDS = {
  shoot: () => audio.shoot(),
  hit: () => audio.hit(),
  explosion: () => audio.explosion(false),
  'explosion-big': () => audio.explosion(true),
  playerhit: () => audio.playerHit(),
  dash: () => audio.dash(),
  pickup: () => audio.pickup(),
  uiclick: () => audio.uiClick(),
  draft: () => audio.draft(),
  boss: () => audio.bossRoar(),
  waveclear: () => audio.waveClear(),
  over: () => audio.gameOver(),
};

function playEvents() {
  const played = new Set();
  for (const name of world.events) {
    if (played.has(name)) continue;
    played.add(name);
    const sound = EVENT_SOUNDS[name];
    if (sound) sound();
  }
  world.events.length = 0;
}

function announce(message) {
  if (status) status.textContent = message;
}

let announcedScreen = world.screen;
function announceScreen() {
  if (world.screen === announcedScreen) return;
  announcedScreen = world.screen;
  if (world.screen === SCREEN_OVER) announce(`Game over. Score ${world.finalScore}, wave ${world.finalWave}. Press Enter to play again.`);
  else if (world.screen === SCREEN_DRAFT) announce(`Wave ${world.wave} held. Choose an upgrade: 1, 2 or 3.`);
  else if (world.screen === SCREEN_PLAYING) announce(`Wave ${world.wave}.`);
}

function startRun() {
  audio.unlock();
  audio.startMusic();
  world.startGame();
  announce('Game started. Wave 1.');
}

/** Screen-level input: the keys and clicks that move between screens. */
function handleScreenInput() {
  const click = input.takeClick();
  if (input.wasPressed('mute')) audio.toggleMute();

  if (world.screen === SCREEN_MENU) {
    if (input.wasPressed('confirm')) startRun();
    return;
  }
  if (world.screen === SCREEN_OVER) {
    if (input.wasPressed('confirm')) startRun();
    return;
  }
  if (world.screen === SCREEN_PAUSED) {
    if (input.wasPressed('pause') || input.wasPressed('confirm')) world.screen = SCREEN_PLAYING;
    return;
  }
  if (world.screen === SCREEN_DRAFT) {
    if (input.wasPressed('one')) world.chooseUpgrade(0);
    else if (input.wasPressed('two')) world.chooseUpgrade(1);
    else if (input.wasPressed('three')) world.chooseUpgrade(2);
    else if (click) {
      const index = DRAFT_CARDS.findIndex((card) => click.x >= card.x && click.x <= card.x + card.w && click.y >= card.y && click.y <= card.y + card.h);
      if (index >= 0) world.chooseUpgrade(index);
    }
    return;
  }
  if (world.screen === SCREEN_PLAYING && input.wasPressed('pause')) {
    world.screen = SCREEN_PAUSED;
    announce('Paused.');
  }
}

function worldInput() {
  const axis = input.axis();
  const aim = input.aim();
  return {
    moveX: axis.x,
    moveY: axis.y,
    aimX: aim.x,
    aimY: aim.y,
    firing: input.firing(),
    dash: input.wasPressed('dash'),
  };
}

window.__wickwarden = {
  snapshot: () => world.snapshot(),
  startGame: () => startRun(),
  setWave: (wave) => {
    if (world.screen !== SCREEN_PLAYING) world.startGame();
    world.enemies = [];
    world.spawning = [];
    world.spawnQueue = [];
    world.bolts = [];
    world.boss = null;
    world.startWave(Math.max(1, Math.floor(wave) || 1));
    world.screen = SCREEN_PLAYING;
  },
  world,
};

if (shotName !== null) {
  stageShot(shotName, world);
  // The staged frame is painted with the cursor where the autopilot's aim rests (on
  // its target, or on the draft card being weighed), as a player's cursor would be.
  const shotInput = { aim: () => world.shotAim ?? { x: VIEW.width / 2, y: VIEW.height / 2 } };
  renderer.draw(world, shotInput, { muted: audio.muted });
  requestAnimationFrame(() => {
    renderer.draw(world, shotInput, { muted: audio.muted });
    window.__shotReady = true;
  });
} else {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    handleScreenInput();
    const stepInput = worldInput();
    if (world.hitStop > 0) {
      // Frozen: burn the stop down in real time and let the accumulated frame
      // time go — the world resumes from the pose it froze in.
      world.hitStop = Math.max(0, world.hitStop - dt);
      accumulator = 0;
    } else {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.update(STEP, stepInput);
        accumulator -= STEP;
      }
    }
    playEvents();
    audio.setIntensity(world.boss ? 1 : 0);
    if (world.newBest) saveBest(world.best);
    announceScreen();
    renderer.draw(world, input, { muted: audio.muted });
    input.endFrame();
  };
  requestAnimationFrame(frame);
}
