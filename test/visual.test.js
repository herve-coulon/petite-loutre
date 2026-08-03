// Tests visuels : snapshots pixel-art pour détecter les régressions de rendu.
// Utilise un canvas factice qui capture les opérations de dessin en une grille 160×120.
// Date est gelée pour rendu 100% déterministe (snapshots identiques sur toute plateforme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeRenderer, OTTER_X } from '../src/render.js';
import { newState } from '../src/state.js';
import { SPRITES, SPRITES_PORTRAITS } from '../src/sprites.js';

// Geler Date.now() pour snap identiques sur macOS / Linux / CI
const FROZEN_MS = 1700000000000;
const _RealDate = globalThis.Date;
let _nowVal = FROZEN_MS;
globalThis.Date = class extends _RealDate {
  constructor(...a) { super(a.length ? a : _nowVal); }
  static now() { return _nowVal; }
  valueOf() { return _nowVal; }
  getTime() { return _nowVal; }
  toISOString() { return new _RealDate(_nowVal).toISOString(); }
  toDateString() { return new _RealDate(_nowVal).toDateString(); }
  toTimeString() { return new _RealDate(_nowVal).toTimeString(); }
};
globalThis.Date.now = () => _nowVal;
globalThis.Date.UTC = _RealDate.UTC;
globalThis.Date.parse = _RealDate.parse;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '..', 'test', 'snapshots');

const W = 160, H = 200;

/**
 * Canvas factice qui capture fillRect en une grille de pixels.
 * Chaque case = 1px canvas → 1 caractère dans le snapshot.
 * Gère correctement save/restore + translate (pile de transforms).
 */
function captureCanvas() {
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const stack = [];
  const ctx = {
    fillStyle: '#000000',
    font: '', textAlign: 'left',
    _tx: 0, _ty: 0,
    fillRect(x, y, w, h) {
      const raw = this.fillStyle;
      const c = (raw && raw._c) ? raw._c : String(raw);
      if (c === 'rgba(0,0,0,0)' || c === 'transparent' || c === '[object Object]') return;
      const col = c.replace('#','').slice(0,6);
      const r = parseInt(col.slice(0,2),16);
      const g = parseInt(col.slice(2,4),16);
      const b = parseInt(col.slice(4,6),16);
      if (isNaN(r)) return;
      const ch = (r<80&&g<80&&b<80) ? '#' : (r>230&&g>230&&b>230) ? 'O'
        : (r>200&&g>200&&b<100) ? 'Y' : (r>200&&g>100&&g<200&&b<80) ? 'o'
        : (g>r&&g>b) ? 'g' : (b>r&&b>g) ? 'b' : (r>g&&r>b) ? 'r' : '+';
      const x0 = Math.max(0, Math.round(x + this._tx));
      const y0 = Math.max(0, Math.round(y + this._ty));
      for (let dy = 0; dy < Math.round(h); dy++) {
        for (let dx = 0; dx < Math.round(w); dx++) {
          const px = x0 + dx, py = y0 + dy;
          if (py >= 0 && py < H && px >= 0 && px < W) grid[py][px] = ch;
        }
      }
    },
    fillText() {}, strokeText() {},
    save() { stack.push([this._tx, this._ty]); },
    restore() { const s = stack.pop(); this._tx = s ? s[0] : 0; this._ty = s ? s[1] : 0; },
    // setTransform absolu : ré-ancrage dpr de chaque frame (cf. hotfix HiDPI).
    // L'échelle est ignorée par ce mock (comme scale) ; on remet la translation à 0.
    setTransform() { this._tx = 0; this._ty = 0; },
    translate(a, b) { this._tx += a; this._ty += b; },
    scale() {},
    createLinearGradient() { const g = { _c: '#000000', addColorStop(_, c) { this._c = c; } }; return g; },
    createRadialGradient() { const g = { _c: '#000000', addColorStop(_, c) { this._c = c; } }; return g; },
    beginPath() {}, ellipse() {}, stroke() {},
    set lineWidth(_) {}, set strokeStyle(_) {},
  };
  const cv = {
    width: W, height: H,
    getContext: () => ctx,
    style: {},
    getBoundingClientRect: () => ({ width: W, height: H, top: 0, left: 0 }),
  };
  return { cv, grid, toAscii: () => grid.map(r => r.join('')).join('\n') };
}

function otter(overrides = {}) {
  const s = newState(Date.now());
  Object.assign(s, {
    stage: 'baby', hatchedAt: Date.now() - 86400000, name: 'Snap',
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 90
  }, overrides);
  return s;
}

function renderFrame(s, opts = {}) {
  const { cv, grid, toAscii } = captureCanvas();
  const R = makeRenderer(cv);
  R.render(s, opts.mg || null, opts.frame || 100, opts.fx || {});
  return { ascii: toAscii(), R };
}

function saveSnapshot(name, ascii) {
  if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });
  writeFileSync(join(SNAP_DIR, name + '.txt'), ascii);
}

function loadSnapshot(name) {
  const p = join(SNAP_DIR, name + '.txt');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function assertSnapshot(name, ascii) {
  const baseline = loadSnapshot(name);
  if (!baseline) {
    saveSnapshot(name, ascii);
    console.log(`  📸 Snapshot "${name}" créé (première exécution)`);
    return;
  }
  if (baseline !== ascii) {
    saveSnapshot(name + '.actual', ascii);
    assert.fail(`Snapshot "${name}" diffère — voir test/snapshots/${name}.actual.txt`);
  }
}

/* ---------------- Snapshots ---------------- */

test('snapshot : bébé sur la berge', () => {
  const s = otter({ stage: 'baby' });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-berge', ascii);
});

test('snapshot : adulte sur la berge', () => {
  const s = otter({ stage: 'adult' });
  const { ascii } = renderFrame(s);
  assertSnapshot('adult-berge', ascii);
});

test('snapshot : œuf qui tremble', () => {
  const s = otter({ stage: 'egg', born: Date.now() - 120000 });
  const { ascii } = renderFrame(s);
  assertSnapshot('egg-shaking', ascii);
});

test('snapshot : loutre endormie', () => {
  const s = otter({ sleeping: true });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-sleeping', ascii);
});

test('snapshot : loutre malade', () => {
  const s = otter({ sick: true, health: 20 });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-sick', ascii);
});

test('snapshot : nuit', () => {
  const s = otter();
  const { ascii } = renderFrame(s, { fx: { night: true } });
  assertSnapshot('baby-night', ascii);
});

test('snapshot : chez le héron', () => {
  const s = otter({ away: true, awayCare: 1 });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-heron', ascii);
});

test('snapshot : avec chapeau', () => {
  const s = otter({ hat: 'chapeau_1' });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-hat', ascii);
});

test('snapshot : en marche (profil)', () => {
  const s = otter();
  const { ascii } = renderFrame(s, { frame: 50 });
  assertSnapshot('baby-walking', ascii);
});

test('snapshot : game over', () => {
  const s = otter({ gameOver: true });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-gameover', ascii);
});

test('snapshot : level up cheer', () => {
  const s = otter();
  const { ascii } = renderFrame(s, { fx: { cheer: { title: 'Niveau 5 !', reward: '🍡' } } });
  assertSnapshot('baby-levelup', ascii);
});

test('snapshot : combat (adversaire)', () => {
  const s = otter();
  const foe = { stage: 'adult', fur: 'roux', name: 'Rival' };
  const { ascii } = renderFrame(s, { fx: { foe } });
  assertSnapshot('baby-battle', ascii);
});

test('snapshot : plongée', () => {
  const s = otter();
  const { ascii } = renderFrame(s, { fx: { diving: true } });
  assertSnapshot('baby-diving', ascii);
});

test('snapshot : arc-en-ciel', () => {
  const s = otter();
  const { ascii } = renderFrame(s, { fx: { dailyEvent: 'arcenciel' } });
  assertSnapshot('baby-rainbow', ascii);
});

test('snapshot : pêche en cours', () => {
  const s = otter();
  const mg = { mode: 'fish', fish: [], score: 0, caught: 0, total: 0 };
  const { ascii } = renderFrame(s, { mg });
  assertSnapshot('baby-fishing', ascii);
});

test('snapshot : toboggan', () => {
  const s = otter();
  const mg = { mode: 'slide', lane: 1, x: 80, items: [], lives: 3, score: 0, speed: 0.5 };
  const { ascii } = renderFrame(s, { mg });
  assertSnapshot('baby-slide', ascii);
});

test('snapshot : tanière', () => {
  const s = otter({ place: 'taniere' });
  const { ascii } = renderFrame(s);
  assertSnapshot('baby-den', ascii);
});

test('snapshot : saisons — hiver', () => {
  const s = otter();
  // Force hiver via le mock de season
  const { ascii } = renderFrame(s, { fx: { season: 'hiver' } });
  assertSnapshot('baby-winter', ascii);
});

test('snapshot : 1500 frames sans erreur', () => {
  const s = otter();
  const { cv, grid } = captureCanvas();
  const R = makeRenderer(cv);
  let err = null;
  for (let f = 0; f < 1500; f++) {
    try { R.render(s, null, f, {}); } catch (e) { err = e; break; }
  }
  assert.equal(err, null, 'erreur au frame ' + (err ? err.message : ''));
});
