// L'Almanach de saison (v3.99) — logique pure : progression par (saison, année),
// paliers débloqués au fil des trésors, réclamation unique, palier 8 = cadeau.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALMANACH_TIERS, almanachProgress, tierState, tierClaimed,
  almanachHasClaimable, almanachCompletion, claimTier
} from '../src/almanach.js';
import { seasonGiftKey } from '../src/seasonpass.js';

const D = new Date('2026-08-03T12:00:00Z');           // été 2026
const KEY = seasonGiftKey(D);
const recWith = (n) => ({ treatsBySeason: { [KEY]: n }, gems: 0, fish: 0, fishTotal: 0, shells: 0, dupes: {} });

test('table : 8 paliers, seuils strictement croissants, palier 8 = le cadeau', () => {
  assert.equal(ALMANACH_TIERS.length, 8);
  for (let i = 1; i < 8; i++) assert.ok(ALMANACH_TIERS[i].need > ALMANACH_TIERS[i - 1].need, 'seuils croissants');
  assert.ok(ALMANACH_TIERS[7].reward.gift, 'le dernier palier est le cadeau de saison');
  assert.equal(ALMANACH_TIERS[7].need, 38);
});

test('progression & états : locked/claimable selon les trésors de la saison', () => {
  const rec = recWith(6);   // 6 trésors récoltés cet été
  assert.equal(almanachProgress(rec, D), 6);
  assert.equal(tierState(rec, 0, D), 'claimable');  // seuil 1
  assert.equal(tierState(rec, 2, D), 'claimable');  // seuil 6
  assert.equal(tierState(rec, 3, D), 'locked');     // seuil 10
  assert.equal(almanachHasClaimable(rec, D), true);
  // une autre saison n'a aucune progression
  const autre = new Date('2026-12-20T12:00:00Z');   // hiver
  assert.equal(almanachProgress(rec, autre), 0);
  assert.equal(almanachHasClaimable(rec, autre), false);
});

test('réclamation : crédite le lot, une seule fois, et avance la complétion', () => {
  const rec = recWith(6);
  const r = claimTier(rec, 0, D);                    // palier 1 : 💎 5
  assert.deepEqual(r, { gems: 5 });
  assert.equal(rec.gems, 5);
  assert.equal(tierState(rec, 0, D), 'claimed');
  assert.equal(claimTier(rec, 0, D), null, 'pas deux fois');
  assert.equal(rec.gems, 5, 'aucune double récompense');
  // palier 3 (💎/🐚) : coquillages
  claimTier(rec, 2, D);                              // seuil 6, reward shells:4
  assert.equal(rec.shells, 4);
  // palier verrouillé : refusé
  assert.equal(claimTier(rec, 3, D), null);
  assert.deepEqual(almanachCompletion(rec, D), { claimed: 2, total: 8 });
});

test('fish crédite portefeuille + à vie ; palier-cadeau marque seasonGifts', () => {
  const rec = recWith(40);                           // tout débloqué
  claimTier(rec, 1, D);                              // fish 25
  assert.equal(rec.fish, 25); assert.equal(rec.fishTotal, 25);
  claimTier(rec, 3, D);                              // dupes 2 commun
  assert.equal(rec.dupes.commun, 2);
  const gift = claimTier(rec, 7, D);                 // palier 8 : cadeau
  assert.ok(gift.gift && gift.gems === 15 && gift.fish === 60);
  assert.equal(rec.gems, 15);
  assert.equal(rec.fish, 25 + 60);
  assert.equal(rec.seasonGifts[KEY], true, 'le cadeau marque seasonGifts (compat)');
});
