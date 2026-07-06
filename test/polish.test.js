// Tests v2.4 « polish » : game feel, humeurs, carte photo (node --test, zéro DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { squashScale, SQUASH_MS } from '../src/render.js';

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
