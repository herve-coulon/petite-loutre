// HOTFIX HiDPI (v3.90.1) : le rendu se tassait dans le tiers haut-gauche
// (ratio 1/dpr) après un déséquilibre save/restore en cours de session, et ne
// se réparait qu'au rechargement. Deux garde-fous, deux tests :
//   1) la passe de rendu reste ÉQUILIBRÉE (autant de restore que de save), même
//      sur une frame qui chevauche la fin d'un squash (squashUntil = now ± 0) ;
//   2) le renderer est AUTO-RÉPARANT : quel que soit l'état de transform laissé
//      par la frame précédente, render() ré-ancre l'échelle dpr en tête de frame
//      (ctx.setTransform(dpr,0,0,dpr,0,0)).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRenderer, SQUASH_MS } from '../src/render.js';
import { newState } from '../src/state.js';

// Horloge gelée mais AVANÇABLE (on doit franchir la fin d'un squash à la frame près)
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

/**
 * Mock ctx qui SUIT la matrice de transform (échelle + translation) avec une
 * vraie pile save/restore, et COMPTE les save/restore. restore() sur pile vide
 * est un no-op (conforme au spec canvas) — on ne triche pas.
 */
function makeCtx() {
  let cur = { sx: 1, sy: 1, tx: 0, ty: 0 };
  const stack = [];
  let saves = 0, restores = 0, orphanRestores = 0;
  const setTransforms = [];
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', font: '', textAlign: 'left',
    globalAlpha: 1, lineWidth: 1,
    save() { saves++; stack.push({ ...cur }); },
    restore() {
      restores++;
      if (stack.length === 0) { orphanRestores++; return; }  // no-op, comme le navigateur
      cur = stack.pop();
    },
    setTransform(a, b, c, d, e, f) { cur = { sx: a, sy: d, tx: e, ty: f }; setTransforms.push([a, b, c, d, e, f]); },
    scale(x, y) { cur.sx *= x; cur.sy *= y; },
    translate(x, y) { cur.tx += x * cur.sx; cur.ty += y * cur.sy; },
    rotate: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
    fillText: noop, strokeText: noop, drawImage: noop,
    beginPath: noop, ellipse: noop, stroke: noop,
    measureText: () => ({ width: 10 }),
    createLinearGradient: grad, createRadialGradient: grad,
    _state: () => ({ saves, restores, orphanRestores, depth: stack.length, cur, setTransforms }),
  };
  return ctx;
}

function fakeCanvas(ctx) {
  return {
    width: 160, height: 346, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 160, height: 346, top: 0, left: 0 }),
  };
}

function berge(overrides = {}) {
  const s = newState(_nowVal);
  return Object.assign(s, {
    stage: 'baby', place: 'berge', hatchedAt: _nowVal - 86400000, name: 'Fix',
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 90
  }, overrides);
}

test('rendu équilibré : autant de restore que de save, même en franchissant la fin d\'un squash', () => {
  _nowVal = FROZEN_MS;
  const ctx = makeCtx();
  const R = makeRenderer(fakeCanvas(ctx));
  R.squash();                              // squashUntil = now + SQUASH_MS
  const s = berge();
  // trois frames autour de la fin du squash : plein squash, pile la fin, juste après
  for (const dt of [0, SQUASH_MS, SQUASH_MS + 16]) {
    _nowVal = FROZEN_MS + dt;
    const before = ctx._state();
    const s0 = before.saves, r0 = before.restores;
    R.render(s, null, 100 + dt, {});
    const after = ctx._state();
    const dSave = after.saves - s0, dRestore = after.restores - r0;
    assert.equal(dSave, dRestore, `frame dt=${dt} : ${dSave} save vs ${dRestore} restore`);
    assert.equal(after.orphanRestores, 0, `frame dt=${dt} : un restore orphelin dépilerait l'échelle`);
    assert.equal(after.depth, 0, `frame dt=${dt} : la pile de transform doit être vide en fin de frame`);
  }
});

test('renderer auto-réparant : render() ré-ancre l\'échelle dpr en tête de frame', () => {
  _nowVal = FROZEN_MS;
  const prevWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 3 };   // simule un écran dpr=3 (mobile)
  try {
    const ctx = makeCtx();
    const cv = fakeCanvas(ctx);
    const R = makeRenderer(cv);
    // le back-buffer est bien dimensionné à la résolution native
    assert.equal(cv.width, 160 * 3);
    assert.equal(cv.height, 346 * 3);
    // on SABOTE l'échelle comme le ferait un restore orphelin d'une frame passée
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx._state().setTransforms.length = 0;         // on ne veut voir que ce que fait render()
    R.render(berge(), null, 100, {});
    const st = ctx._state();
    // 1re opération de transform de la frame : setTransform(3,0,0,3,0,0)
    assert.deepEqual(st.setTransforms[0], [3, 0, 0, 3, 0, 0]);
    // et l'échelle de base est bien redevenue 3 malgré le sabotage
    assert.equal(st.setTransforms[0][0], 3);
  } finally {
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
  }
});
