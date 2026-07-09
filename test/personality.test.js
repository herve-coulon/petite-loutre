// Tests v3.10 : le caractère de la loutre (personnalité + lien). Pur.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRAITS, traitById, pickTrait, isFavorite, favoriteLine,
  bondGain, bondLevel, BOND_LEVELS
} from '../src/personality.js';

test('chaque personnalité est complète et unique', () => {
  const ids = new Set(), likes = new Set();
  for (const t of TRAITS) {
    assert.ok(t.id && t.name && t.emoji && t.like && t.desc, t.id + ' : champs complets');
    assert.ok(!ids.has(t.id), 'id unique : ' + t.id); ids.add(t.id);
    likes.add(t.like);
  }
  assert.equal(likes.size, TRAITS.length, 'chaque personnalité a une activité préférée distincte');
});

test('pickTrait : tire un id valide, déterministe selon le hasard', () => {
  assert.equal(pickTrait(() => 0), TRAITS[0].id);
  assert.equal(pickTrait(() => 0.999), TRAITS[TRAITS.length - 1].id);
  for (let i = 0; i < 20; i++) assert.ok(traitById(pickTrait(() => i / 20)), 'toujours un trait connu');
});

test('isFavorite : reconnaît l\'activité préférée', () => {
  assert.equal(isFavorite('gourmande', 'feed'), true);
  assert.equal(isFavorite('gourmande', 'play'), false);
  assert.equal(isFavorite('joueuse', 'play'), true);
  assert.equal(isFavorite(null, 'feed'), false);
  assert.equal(isFavorite('inconnu', 'feed'), false);
});

test('favoriteLine : réaction non vide pour l\'activité aimée', () => {
  for (const t of TRAITS) {
    const line = favoriteLine(t.id, 'Nout', () => 0);
    assert.ok(typeof line === 'string' && line.length > 3, t.id + ' : réaction');
    assert.match(line, /Nout/, t.id + ' : nomme la loutre');
  }
});

test('bondGain : l\'activité préférée rapporte double', () => {
  // gourmande aime feed : feed rapporte 2× base, play reste au taux normal
  assert.ok(bondGain('feed', 'gourmande') > bondGain('feed', 'joueuse'), 'préférée > normale');
  assert.equal(bondGain('feed', 'gourmande'), 2 * bondGain('feed', 'joueuse'), 'exactement double');
  assert.ok(bondGain('care', 'gourmande') > 0, 'un geste inconnu de préférence rapporte quand même');
});

test('bondLevel : paliers croissants, progression, palier max', () => {
  assert.equal(bondLevel(0).level, 1);
  assert.equal(bondLevel(0).name, BOND_LEVELS[0].name);
  assert.equal(bondLevel(-10).level, 1, 'jamais sous 1');
  // pile au seuil du 2e palier
  assert.equal(bondLevel(BOND_LEVELS[1].at).level, 2);
  assert.equal(bondLevel(BOND_LEVELS[1].at - 1).level, 1);
  const top = bondLevel(999999);
  assert.equal(top.level, BOND_LEVELS.length, 'plafonne au dernier palier');
  assert.equal(top.max, true);
  assert.equal(top.next, 0, 'plus de suite au sommet');
  // progression dans un palier intermédiaire
  const mid = bondLevel(BOND_LEVELS[1].at + 5);
  assert.equal(mid.cur, 5);
  assert.ok(mid.next > 0 && !mid.max);
});
