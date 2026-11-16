// The upgrade draft pool. Between waves the player picks one of three; each entry says
// what it does in the draft card's words and applies itself to the run's stats object
// (the world owns the stats; apply() mutates them). Thirteen upgrades — ten for the
// keeper, three for the lantern itself — all stackable, so a long run keeps making
// real choices instead of running out of pool.

import { PLAYER } from './config.js';

export const UPGRADES = [
  {
    id: 'heavy-rounds',
    name: 'Heavy Rounds',
    blurb: '+25% bullet damage. Every hit lands harder.',
    apply(stats) {
      stats.damage *= 1.25;
    },
  },
  {
    id: 'rapid-cycler',
    name: 'Rapid Cycler',
    blurb: '+18% fire rate. The cannon breathes faster.',
    apply(stats) {
      stats.fireInterval *= 0.85;
    },
  },
  {
    id: 'split-cannon',
    name: 'Split Cannon',
    blurb: '+1 projectile per shot, fanned in a spread.',
    apply(stats) {
      stats.projectiles += 1;
    },
  },
  {
    id: 'swift-thrusters',
    name: 'Swift Thrusters',
    blurb: '+12% movement speed. Outrun the swarm.',
    apply(stats) {
      stats.speed *= 1.12;
    },
  },
  {
    id: 'aegis-plating',
    name: 'Aegis Plating',
    blurb: '+25 max hull and repair 25 now.',
    apply(stats, player) {
      stats.maxHp += 25;
      player.hp = Math.min(stats.maxHp, player.hp + 25);
    },
  },
  {
    id: 'phase-drive',
    name: 'Phase Drive',
    blurb: 'Dash recharges 25% faster.',
    apply(stats) {
      stats.dashCooldown *= 0.75;
    },
  },
  {
    id: 'tractor-field',
    name: 'Tractor Field',
    blurb: '+70% shard magnet radius. Greed, weaponised.',
    apply(stats) {
      stats.magnet *= 1.7;
    },
  },
  {
    id: 'nanoweave',
    name: 'Nanoweave Hull',
    blurb: 'Regenerate 1.4 hull per second, forever.',
    apply(stats) {
      stats.regen += 1.4;
    },
  },
  {
    id: 'piercing-rounds',
    name: 'Piercing Rounds',
    blurb: 'Shots pass through +1 enemy before dying.',
    apply(stats) {
      stats.pierce += 1;
    },
  },
  {
    id: 'critical-matrix',
    name: 'Critical Matrix',
    blurb: '+15% chance to crit for double damage.',
    apply(stats) {
      stats.critChance += 0.15;
    },
  },
  {
    id: 'wide-wick',
    name: 'Wide Wick',
    blurb: 'The lantern burns wider: +18% radius on every pool of light you make.',
    apply(stats) {
      stats.lightMult *= 1.18;
    },
  },
  {
    id: 'bright-burn',
    name: 'Bright Burn',
    blurb: 'Hotter flame: foes standing in the light take +30% damage.',
    apply(stats) {
      stats.burnMult *= 1.3;
    },
  },
  {
    id: 'flare-dash',
    name: 'Flare Dash',
    blurb: 'Dashing drops a flare that burns as a pool of light for 4 seconds.',
    apply(stats) {
      stats.flareDash = true;
    },
  },
];

/** The stats every run starts with, seeded from the PLAYER tuning; upgrades mutate them. */
export function baseStats() {
  return {
    damage: PLAYER.bulletDamage,
    fireInterval: PLAYER.fireInterval,
    projectiles: 1,
    pierce: 0,
    speed: PLAYER.speed,
    maxHp: PLAYER.hp,
    dashCooldown: PLAYER.dashCooldown,
    magnet: 74,
    regen: 0,
    critChance: 0.05,
    lightMult: 1,
    burnMult: 1,
    flareDash: false,
  };
}

/** Roll three distinct upgrades for a draft. */
export function rollUpgrades(random) {
  const pool = UPGRADES.slice();
  const rolled = [];
  for (let i = 0; i < 3; i += 1) {
    rolled.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
  }
  return rolled;
}
