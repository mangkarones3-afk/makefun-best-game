// WICKWARDEN tuning: every number the simulation runs on lives here, so the rest of
// the code names what it uses instead of scattering literals. The view is a fixed
// 1280x800 harbour; the page scales the canvas to fit the window and the simulation
// never resizes.

/** The harbour's logical size, in pixels. */
export const VIEW = { width: 1280, height: 800 };

/** The fixed simulation step, in seconds: the world advances in 1/60 s ticks. */
export const STEP = 1 / 60;

/** localStorage key for the best score. */
export const BEST_KEY = 'wickwarden.best.v1';

/** The Warden (the player's keeper): size, motion, gun and dash. */
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

/**
 * The lantern system: light is the game's second resource and its core rule. The
 * Warden's lantern burns oil; its light pool is where the Hollow can be hurt at full
 * strength. In darkness a foe is a shadow — half-seen and barely scratched. Kills and
 * embers feed the oil. The Great Lantern's beam and the four braziers are the other
 * light sources; the Sovereign's later phases eclipse the flame and shrink the pool.
 */
export const LANTERN = {
  oilMax: 100,
  oilStart: 84,
  oilDrain: 0.8,
  oilPerShard: 5,
  oilPerKill: 1.5,
  radiusMin: 118,
  radiusMax: 292,
  towerRadius: 152,
  brazierRadius: 118,
  flareRadius: 132,
  beamLength: 580,
  beamHalfAngle: 0.21,
  beamPeriod: 26,
  beamDps: 30,
  shadowDamageMult: 0.4,
  tower: { x: 640, y: 118 },
};

/** The four harbour braziers: fixed pockets of light at the corners of the quay. */
export const BRAZIERS = [
  { x: 168, y: 176 },
  { x: 1112, y: 176 },
  { x: 168, y: 624 },
  { x: 1112, y: 624 },
];

/** Place names painted on the quay floor: the harbour is a named world, not a box. */
export const ZONES = [
  { name: 'NORTH QUAY', x: 330, y: 120 },
  { name: 'SOUTH PIER', x: 950, y: 120 },
  { name: 'THE WRECK', x: 330, y: 706 },
  { name: 'TIDE STEPS', x: 950, y: 706 },
];

/**
 * The palette: one dominant grade — warm lantern amber against deep indigo night, so
 * a frame reads at thumbnail size. Each actor keeps a hue family inside that grade.
 */
export const COLORS = {
  void: '#0a0714',
  voidDeep: '#04030a',
  grid: 'rgba(150, 118, 62, 0.14)',
  player: '#ffc44d',
  playerCore: '#fff3d6',
  bullet: '#ffd166',
  shard: '#ffb347',
  heart: '#ff5d8f',
  drifter: '#ff4d6d',
  mite: '#ff8fa3',
  spitter: '#ff8c42',
  bloom: '#69e58a',
  lancer: '#4dd8ff',
  sovereign: '#b06bff',
  bolt: '#c44dff',
  text: '#f5ead2',
  dim: '#a89878',
  warn: '#ff3b3b',
  lantern: '#ffb347',
  flame: '#ff9d2e',
  shadow: '#101527',
};
