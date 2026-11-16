// VOIDSTRIKE's hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/ beside this file: it opens in a desktop
// browser and plays offline. This program delivers it the way the bounty asks: it
// copies game/ and screenshots/ into the output directory (MAKEFUN_OUTPUT_DIR, or
// /output in the grader's container) and writes dossier.json there with the vendored
// make.fun library — the same library, unchanged, that the scorer rebuilds the dossier
// with, so the bytes must match. To prove they do, the dossier is built a second time
// from the written output and compared byte for byte before the program exits.
//
// Run it the way the grader does, from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { Buffer } from 'node:buffer';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, from the kit's gate reference: the dossier's text is capped, the
// screenshots at four files of 256 KiB, the game at 993 files and 48 MiB with no path
// over 1000 bytes. buildDossier refuses anything past them, as the scorer would.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

if (!existsSync(join(here, 'game', 'index.html'))) fail('game/index.html is missing: there is no game to hand in');

const shotNames = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((name) => !name.startsWith('.'))
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  fail(`screenshots/ holds ${shotNames.length} images; the bounty asks for 3 or 4`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

// The grader runs this program twice and compares the runs; catch any drift here,
// where the fix is still ours, instead of there. (buildDossier returns bytes.)
const rebuilt = buildDossier(out, CAPS);
if (!Buffer.from(rebuilt).equals(readFileSync(join(out, 'dossier.json')))) {
  fail('the dossier rebuilt from the written output differs from the one on disk');
}

console.log(`VOIDSTRIKE handed in: game/ and ${shotNames.length} screenshots copied, dossier.json ${Buffer.byteLength(dossier)} bytes, deterministic across rebuilds.`);
