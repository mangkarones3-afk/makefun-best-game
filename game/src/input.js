// Keyboard and mouse, gathered in one place. The game loop polls a plain snapshot each
// frame: a movement axis, the aim point in arena coordinates, whether the trigger is held,
// and the set of actions pressed since the last frame (edges, so a held key fires once).
// The canvas is letterboxed to the window, so pointer positions are mapped through its
// bounding rectangle into the fixed 1280x800 arena.

import { VIEW } from './config.js';

/** Key codes that count as each named action; edges are read with wasPressed(). */
const ACTION_KEYS = {
  confirm: ['Enter', 'Space'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  dash: ['ShiftLeft', 'ShiftRight', 'Space'],
  one: ['Digit1', 'Numpad1'],
  two: ['Digit2', 'Numpad2'],
  three: ['Digit3', 'Numpad3'],
};

const MOVE_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
};

/** Keys the page must not scroll or swallow while playing. */
const GAME_KEYS = new Set([
  ...Object.values(ACTION_KEYS).flat(),
  ...Object.values(MOVE_KEYS).flat(),
]);

export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  const mouse = { x: VIEW.width / 2, y: VIEW.height / 2, down: false };
  let click = null;

  function toArena(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) edges.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = toArena(event);
    mouse.x = point.x;
    mouse.y = point.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toArena(event);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.down = true;
    click = point;
    edges.add('Pointer');
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function anyHeld(codes) {
    return codes.some((code) => held.has(code));
  }

  return {
    /** The movement axis, each component in [-1, 1], not normalised (the world does that). */
    axis() {
      return {
        x: (anyHeld(MOVE_KEYS.right) ? 1 : 0) - (anyHeld(MOVE_KEYS.left) ? 1 : 0),
        y: (anyHeld(MOVE_KEYS.down) ? 1 : 0) - (anyHeld(MOVE_KEYS.up) ? 1 : 0),
      };
    },
    /** The aim point in arena coordinates. */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** True while the mouse button is held: the trigger. */
    firing() {
      return mouse.down;
    },
    /** True once per press of any key bound to the action (or a click, for 'confirm'). */
    wasPressed(action) {
      if (action === 'confirm' && edges.has('Pointer')) return true;
      return ACTION_KEYS[action].some((code) => edges.has(code));
    },
    /** The last click point in arena coordinates, or null; consumed by reading. */
    takeClick() {
      const point = click;
      click = null;
      return point;
    },
    /** Call at the end of each frame: pressed edges last exactly one frame. */
    endFrame() {
      edges.clear();
    },
  };
}
