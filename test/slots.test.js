import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_COUNT, slotKey, clampSlot, summarize } from '../src/slots.js';

test('slotKey : le slot 1 garde la clé d\'origine (compat totale, zéro migration)', () => {
  assert.equal(slotKey('petite_loutre_v2', 1), 'petite_loutre_v2');
  assert.equal(slotKey('rec', 1), 'rec');
});

test('slotKey : les slots suivants sont suffixés', () => {
  assert.equal(slotKey('petite_loutre_v2', 2), 'petite_loutre_v2::2');
  assert.equal(slotKey('rec', 3), 'rec::3');
  // deux bases distinctes ne collisionnent jamais
  assert.notEqual(slotKey('a', 2), slotKey('b', 2));
});

test('clampSlot : borne dans [1..SLOT_COUNT], 1 par défaut', () => {
  assert.equal(clampSlot(1), 1);
  assert.equal(clampSlot(SLOT_COUNT), SLOT_COUNT);
  assert.equal(clampSlot(0), 1);
  assert.equal(clampSlot(SLOT_COUNT + 1), 1);
  assert.equal(clampSlot(NaN), 1);
  assert.equal(clampSlot('2'), 2);
});

test('summarize : vide pour null / sans stade', () => {
  assert.deepEqual(summarize(null), { empty: true });
  assert.deepEqual(summarize({}), { empty: true });
  assert.deepEqual(summarize({ name: 'X' }), { empty: true }); // pas de stage → vide
});

test('summarize : dérive les champs d\'affichage d\'un état', () => {
  const sum = summarize({ stage: 'adult', name: 'Néo', generation: 3, heirOf: 'Rade', fur: 'choco', hat: 'noeud' });
  assert.equal(sum.empty, false);
  assert.equal(sum.name, 'Néo');
  assert.equal(sum.generation, 3);
  assert.equal(sum.heirOf, 'Rade');
  assert.equal(sum.fur, 'choco');
  assert.equal(sum.hat, 'noeud');
  assert.equal(sum.egg, false);
});

test('summarize : reconnaît l\'œuf, le héron, la fin', () => {
  assert.equal(summarize({ stage: 'egg' }).egg, true);
  assert.equal(summarize({ stage: 'adult', away: true }).away, true);
  assert.equal(summarize({ stage: 'adult', gameOver: true }).gameOver, true);
});

test('summarize : valeurs par défaut sûres', () => {
  const sum = summarize({ stage: 'baby' });
  assert.equal(sum.generation, 1);
  assert.equal(sum.fur, 'roux');
  assert.equal(sum.hat, null);
  assert.equal(sum.name, null);
});
