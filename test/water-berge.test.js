// É4 — L'eau rendue à la berge. Trois garanties :
//   1) la nage idle s'anime sans jamais planter sur une longue session calme ;
//   2) le ricochet (galet lancé à l'eau) peint bien quelque chose et retombe ;
//   3) le bandeau de quêtes replié est un état PERSISTÉ (défaut = déplié).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRenderer, SWIM_IDLE_FRAMES } from '../src/render.js';
import { WATER_Y } from '../src/minigame.js';
import { newState, loadState } from '../src/state.js';
import { SAVE_KEY } from '../src/constants.js';

// Date gelée (le rendu appelle new Date()) — snapshots/positions déterministes.
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

function captureCtx(rects) {
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  return {
    fillStyle: '', strokeStyle: '', font: '', textAlign: 'left', globalAlpha: 1, lineWidth: 1,
    _tx: 0, _ty: 0,
    fillRect(x, y, w, h) { rects.push([x + this._tx, y + this._ty, w, h, this.fillStyle]); },
    fillText: noop, strokeText: noop, strokeRect: noop, drawImage: noop, clearRect: noop,
    save() {}, restore() { this._tx = 0; this._ty = 0; }, setTransform() { this._tx = 0; this._ty = 0; },
    translate(a, b) { this._tx += a; this._ty += b; }, scale: noop, rotate: noop,
    beginPath: noop, ellipse: noop, stroke: noop, measureText: () => ({ width: 10 }),
    createLinearGradient: grad, createRadialGradient: grad,
  };
}
function fakeCanvas(rects) {
  return { width: 160, height: 346, style: {}, getContext: () => captureCtx(rects),
    getBoundingClientRect: () => ({ width: 160, height: 346, top: 0, left: 0 }) };
}
function berge(over = {}) {
  return Object.assign(newState(_nowVal), {
    stage: 'baby', place: 'berge', hatchedAt: _nowVal - 86400000, name: 'Eau',
    hunger: 90, fun: 95, energy: 90, clean: 90, health: 95
  }, over);
}

test('nage idle : longue session calme rendue sans crash, scène toujours peinte', () => {
  const rects = [];
  const R = makeRenderer(fakeCanvas(rects));
  const s = berge();
  // au-delà de la 1re baignade (nextSwimAt ≤ ~1600) et d'un cycle complet
  for (let f = 0; f < 2 * SWIM_IDLE_FRAMES + 1700; f++) {
    rects.length = 0;
    R.render(s, null, f, {});
  }
  assert.ok(rects.length > 20, 'la dernière frame peint bien la scène');
  assert.ok(SWIM_IDLE_FRAMES > 0 && WATER_Y > 0);
});

test('ricochet : le galet est peint puis retombe (les rebonds finissent par mourir)', () => {
  const rects = [];
  const R = makeRenderer(fakeCanvas(rects));
  const s = berge();
  R.render(s, null, 5, {});          // amorce la scène
  R.ricochet(80);                    // lancer au milieu de la rivière
  let stoneSeen = false;
  for (let f = 6; f < 6 + 120; f++) {
    rects.length = 0;
    R.render(s, null, f, {});
    if (rects.some(r => r[4] === '#6b6f76')) stoneSeen = true;   // pixel du galet
  }
  assert.ok(stoneSeen, 'le galet a bien été peint pendant son vol');
  // après 120 frames, plus de galet à l'écran (vie bornée + 3 rebonds)
  rects.length = 0;
  R.render(s, null, 300, {});
  assert.ok(!rects.some(r => r[4] === '#6b6f76'), 'le galet a disparu (pas d\'accumulation)');
});

test('bandeau de quêtes : questCollapsed défaut = déplié, et persisté par la sauvegarde', () => {
  assert.equal(newState(_nowVal).questCollapsed, false);
  // vieille sauvegarde v2 sans le champ → normalisée à false, jamais undefined
  const old = { ...newState(_nowVal) };
  delete old.questCollapsed;
  const storage = { getItem: (k) => k === SAVE_KEY ? JSON.stringify(old) : null };
  const loaded = loadState(storage);
  assert.equal(loaded.questCollapsed, false);
  // un champ déjà replié est respecté
  const storage2 = { getItem: (k) => k === SAVE_KEY ? JSON.stringify({ ...old, questCollapsed: true }) : null };
  assert.equal(loadState(storage2).questCollapsed, true);
});
