// Tests v2.4 « polish » : game feel, humeurs, carte photo (node --test, zéro DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { squashScale, SQUASH_MS, makeRenderer } from '../src/render.js';
import { moodOf, pickIdle, canIdle, IDLES, IDLE_FRAMES } from '../src/mood.js';
import { newState } from '../src/state.js';

const T0 = 1_750_000_000_000;

/** Loutre en bonne santé, réveillée, prête à poser. */
function otter(over = {}) {
  const s = newState(T0);
  Object.assign(s, {
    stage: 'baby', hatchedAt: T0, name: 'Test',
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 90
  }, over);
  return s;
}

/** Canvas factice : enregistre les fillRect (avec translation) pour comparer des rendus. */
function fakeCanvas(rects) {
  const ctx = {
    fillStyle: '', font: '', _tx: 0, _ty: 0,
    fillRect(x, y, w, h) { rects.push([x + this._tx, y + this._ty, w, h, this.fillStyle]); },
    fillText() {}, save() {}, restore() { this._tx = 0; this._ty = 0; },
    translate(a, b) { this._tx += a; this._ty += b; }, scale() {}
  };
  return { getContext: () => ctx };
}

/* ---------------- game feel : squash & stretch ---------------- */

test('squash : écrasée et élargie au contact', () => {
  const { sx, sy } = squashScale(0);
  assert.ok(sy < 0.75, 'écrasée verticalement (sy=' + sy + ')');
  assert.ok(sx > 1.15, 'élargie horizontalement (sx=' + sx + ')');
});

test('squash : rebond étiré au milieu de l\'animation', () => {
  const overshoot = [...Array(9)].some((_, i) => squashScale((i + 1) / 10).sy > 1.02);
  assert.ok(overshoot, 'la loutre s\'étire au-delà de sa taille pendant le rebond');
});

test('squash : retour exact au repos (fin, hors bornes, NaN)', () => {
  assert.deepEqual(squashScale(1), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(2), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(-0.5), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(NaN), { sx: 1, sy: 1 });
  assert.ok(SQUASH_MS > 0 && SQUASH_MS < 1000, 'durée courte : c\'est un accent, pas une cinématique');
});

test('squash : enveloppe continue (pas de saut visible entre deux frames)', () => {
  let prev = squashScale(0).sy;
  for (let t = 0.02; t <= 1; t += 0.02) {
    const { sy } = squashScale(t);
    assert.ok(Math.abs(sy - prev) < 0.12, 'saut de ' + Math.abs(sy - prev) + ' à t=' + t);
    prev = sy;
  }
});

/* ---------------- humeurs ---------------- */

test('humeur : priorités décroissantes (dodo > malade > affamée > boudeuse)', () => {
  assert.equal(moodOf(otter({ sleeping: true, sick: true, hunger: 5 })), 'dodo');
  assert.equal(moodOf(otter({ sick: true, hunger: 5, fun: 5 })), 'malade');
  assert.equal(moodOf(otter({ hunger: 5, fun: 5 })), 'affamee');
  assert.equal(moodOf(otter({ fun: 5 })), 'boudeuse');
});

test('humeur : contente seulement si tout va vraiment bien', () => {
  assert.equal(moodOf(otter({ fun: 90, hunger: 80, health: 90 })), 'contente');
  assert.equal(moodOf(otter({ fun: 90, hunger: 30 })), 'neutre', 'petit creux : plus de grand sourire');
  assert.equal(moodOf(otter({ fun: 50, hunger: 80 })), 'neutre');
  assert.equal(moodOf(otter({ fun: 90, hunger: 80, health: 40 })), 'neutre', 'santé fragile');
});

test('humeur : œuf, partie finie et état absent -> null', () => {
  assert.equal(moodOf(otter({ stage: 'egg' })), null);
  assert.equal(moodOf(otter({ gameOver: true })), null);
  assert.equal(moodOf(null), null);
});

test('manies : tirage borné, durées définies, seulement quand tout est calme', () => {
  for (let i = 0; i < 20; i++) assert.ok(IDLES.includes(pickIdle()));
  assert.equal(pickIdle(() => 0), IDLES[0]);
  assert.equal(pickIdle(() => 0.999), IDLES[IDLES.length - 1]);
  for (const k of IDLES) assert.ok(IDLE_FRAMES[k] > 30, k + ' dure assez pour être vue');
  assert.ok(canIdle('neutre') && canIdle('contente'));
  assert.ok(!canIdle('affamee') && !canIdle('malade') && !canIdle('dodo') && !canIdle(null));
});

/* ---------------- rendu : le visage suit l'humeur ---------------- */

test('rendu : chaque humeur peint un visage différent', () => {
  const paint = (s) => {
    const rects = [];
    makeRenderer(fakeCanvas(rects)).render(s, null, 10, {});
    return JSON.stringify(rects);
  };
  const faces = [
    paint(otter({ fun: 90, hunger: 80 })),   // contente
    paint(otter({ hunger: 10 })),            // affamée
    paint(otter({ fun: 10 })),               // boudeuse
    paint(otter({ sick: true })),            // malade
    paint(otter({ fun: 50 }))                // neutre
  ];
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      assert.notEqual(faces[i], faces[j], 'humeurs ' + i + ' et ' + j + ' identiques à l\'écran');
    }
  }
});

test('rendu : 1500 frames (manies, libellule, poissons sauteurs) sans erreur', () => {
  const rects = [];
  const R = makeRenderer(fakeCanvas(rects));
  const s = otter({ fun: 90, hunger: 80 });
  for (let f = 0; f < 1500; f++) {
    rects.length = 0;
    R.render(s, null, f, {});
  }
  assert.ok(rects.length > 50, 'la scène est bien peinte à la dernière frame');
});
