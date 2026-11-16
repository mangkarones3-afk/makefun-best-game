// A small seeded random generator (mulberry32). The world runs on one of these, never on
// Math.random, so a seed reproduces a run exactly: the screenshot scenes and any replayed
// game see the same spawns, spreads and drops.

/** Create a generator from a 32-bit seed. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** A random element of a non-empty array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** A random angle in radians. */
    angle() {
      return next() * Math.PI * 2;
    },
    /** A random sign, -1 or 1. */
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
  };
}
