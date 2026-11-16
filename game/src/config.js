// VOIDSTRIKE tuning: every number the simulation runs on lives here, so the rest of the
// code names what it uses instead of scattering literals. The view is a fixed 1280x800
// arena; the page scales the canvas to fit the window and the simulation never resizes.

/** The arena's logical size, in pixels. */
export const VIEW = { width: 1280, height: 800 };

/** The fixed simulation step, in seconds: the world advances in 1/60 s ticks. */
export const STEP = 1 / 60;

/** localStorage key for the best score. */
export const BEST_KEY = 'voidstrike.best.v1';

/** The Warden (the player's ship): size, motion, gun and dash. */
export const PLAYER = {
  radius: 14,
  speed: 268,
  hp: 100,
  fireInterval: 0.235,
  bulletSpeed: 660,
  bulletDamage: 10,
  bulletRadius: 4,
  dashTime: 0.16,
  dashSpeed: 1080,
  dashCooldown: 2.1,
  iframeTime: 0.7,
};

/** Enemy kinds' base stats; the world scales hit points as the waves climb. */
export const FOES = {
  drifter: { hp: 20, speed: 96, radius: 15, contact: 10, score: 50 },
  mite: { hp: 8, speed: 168, radius: 9, contact: 6, score: 25 },
  spitter: { hp: 26, speed: 74, radius: 14, contact: 8, score: 80, range: 255, boltSpeed: 245, boltDamage: 8, fireTime: 2.1 },
  bloom: { hp: 58, speed: 46, radius: 24, contact: 12, score: 120, children: 3 },
  lancer: { hp: 18, speed: 84, radius: 12, contact: 14, score: 90, telegraph: 0.7, chargeTime: 0.55, chargeSpeed: 540 },
  sovereign: { hp: 950, speed: 34, radius: 46, contact: 20, score: 5000, boltSpeed: 265, boltDamage: 10 },
};

/** Wave and combo pacing. */
export const PACE = {
  spawnInterval: 0.65,
  spawnWarnTime: 0.8,
  comboWindow: 2.5,
  comboPerTier: 5,
  comboMaxTier: 8,
  hpGrowth: 0.12,
  shardScore: 20,
  heartChance: 0.07,
  heartHeal: 18,
};

/** The neon palette: one hue family per actor, so a frame reads at a glance. */
export const COLORS = {
  void: '#05060e',
  voidDeep: '#02030a',
  grid: 'rgba(64, 90, 180, 0.13)',
  player: '#59f7ff',
  playerCore: '#eaffff',
  bullet: '#8ff8ff',
  shard: '#3ef2c8',
  heart: '#ff5d8f',
  drifter: '#ff4d6d',
  mite: '#ff8fa3',
  spitter: '#ffa53e',
  bloom: '#69e58a',
  lancer: '#ffe14d',
  sovereign: '#b06bff',
  bolt: '#ff5df2',
  text: '#dfe9ff',
  dim: '#8fa3cc',
  warn: '#ff3b3b',
};
