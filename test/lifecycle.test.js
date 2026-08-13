import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H } from '../src/constants.js';
import {
  ELDER_AT, LIFE_MAX, HERON_MAX,
  isElder, passesOfAge, passesAtHeron, endOfLife
} from '../src/lifecycle.js';

const DAY = 24 * H;

test('seuils cohérents : aînée avant le grand départ', () => {
  assert.ok(ELDER_AT < LIFE_MAX, 'on devient aînée avant de s\'en aller');
  assert.ok(ELDER_AT > 0 && HERON_MAX > 0);
});

test('isElder : seulement entre ELDER_AT et LIFE_MAX', () => {
  assert.equal(isElder(0), false);
  assert.equal(isElder(ELDER_AT - 1), false);
  assert.equal(isElder(ELDER_AT), true);
  assert.equal(isElder(ELDER_AT + DAY), true);
  assert.equal(isElder(LIFE_MAX), false, 'à LIFE_MAX elle n\'est plus aînée : elle part');
  assert.equal(isElder(LIFE_MAX + DAY), false);
});

test('passesOfAge : au grand âge', () => {
  assert.equal(passesOfAge(LIFE_MAX - 1), false);
  assert.equal(passesOfAge(LIFE_MAX), true);
  assert.equal(passesOfAge(LIFE_MAX + DAY), true);
});

test('passesAtHeron : après une trop longue absence', () => {
  assert.equal(passesAtHeron(HERON_MAX - 1), false);
  assert.equal(passesAtHeron(HERON_MAX), true);
});

test('endOfLife : rien tant que le mode est éteint (jeu cozy intact)', () => {
  assert.equal(endOfLife({ ageMs: LIFE_MAX + DAY, awayMs: HERON_MAX + DAY, lifecycle: false }), null);
  assert.equal(endOfLife({ ageMs: LIFE_MAX + DAY, lifecycle: false }), null);
});

test('endOfLife : grand départ de vieillesse', () => {
  assert.equal(endOfLife({ ageMs: LIFE_MAX, awayMs: null, lifecycle: true }), 'age');
  assert.equal(endOfLife({ ageMs: ELDER_AT, awayMs: null, lifecycle: true }), null, 'aînée mais bien vivante');
});

test('endOfLife : l\'antichambre du héron', () => {
  assert.equal(endOfLife({ ageMs: DAY, awayMs: HERON_MAX, lifecycle: true }), 'heron');
  assert.equal(endOfLife({ ageMs: DAY, awayMs: HERON_MAX - 1, lifecycle: true }), null);
});

test('endOfLife : le héron prime sur la vieillesse (longue absence)', () => {
  assert.equal(endOfLife({ ageMs: LIFE_MAX + DAY, awayMs: HERON_MAX + DAY, lifecycle: true }), 'heron');
});

test('endOfLife : appel sans argument ne casse pas', () => {
  assert.equal(endOfLife(), null);
});
