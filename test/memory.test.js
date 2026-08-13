import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remembrance } from '../src/memory.js';

test('remembrance : structure {intro, detail, close}, toutes non vides', () => {
  const m = remembrance({ name: 'Néo', trait: 'caline' });
  assert.ok(m.intro.includes('Néo'), 'le nom apparaît dans l\'intro');
  assert.ok(m.detail.length > 0);
  assert.ok(m.close.length > 0);
});

test('remembrance : déterministe (le même souvenir pour une même loutre)', () => {
  const a = { name: 'Ondine', trait: 'joueuse' };
  assert.deepEqual(remembrance(a), remembrance(a));
});

test('remembrance : le caractère colore le souvenir', () => {
  const g = remembrance({ name: 'X', trait: 'gourmande' }).detail;
  const j = remembrance({ name: 'X', trait: 'joueuse' }).detail;
  assert.notEqual(g, j, 'deux caractères → deux souvenirs');
});

test('remembrance : sans trait, un souvenir générique mais stable', () => {
  const m1 = remembrance({ name: 'Sans', trait: null });
  const m2 = remembrance({ name: 'Sans', trait: null });
  assert.equal(m1.detail, m2.detail);
  assert.ok(m1.detail.length > 0);
});

test('remembrance : robuste sans argument', () => {
  const m = remembrance();
  assert.ok(m.intro && m.detail && m.close);
});
