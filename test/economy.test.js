// Économie circulaire (É5) — logique pure : déterminisme par jour, prix progressifs,
// fusion de trésors. « Deux joueurs, même jour → même troc/fusion » est garanti par
// le seed (dayKey).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIERS, nextTier, recruitFishCost, dailyBarter, canCraft, craftChoices, CRAFT_NEED
} from '../src/economy.js';
import { loadRecords, REC_KEY } from '../src/state.js';

test('migration : les portefeuilles héritent du cumul à vie (rien n\'est volé)', () => {
  // save d'AVANT l'économie : que des compteurs à vie, pas de portefeuille
  const old = { v: 1, fishTotal: 30, treatsTotal: 7 };
  const rec = loadRecords({ getItem: (k) => k === REC_KEY ? JSON.stringify(old) : null });
  assert.equal(rec.fish, 30, 'poissons dépensables = cumul pêché');
  assert.equal(rec.shells, 7, 'coquillages dépensables = cumul récolté');
  assert.deepEqual(rec.dupes, {});
  assert.deepEqual(rec.barterUsed, []);
  assert.equal(rec.fishTotal, 30, 'le compteur À VIE reste intact');
  assert.equal(rec.treatsTotal, 7);
  // save neuve : tout à zéro
  const fresh = loadRecords({ getItem: () => null });
  assert.equal(fresh.fish, 0); assert.equal(fresh.shells, 0);
  assert.deepEqual(fresh.dupes, {});
});

test('tiers : échelle de fusion croissante, sommet sans suite', () => {
  assert.deepEqual(TIERS, ['commun', 'rare', 'epique', 'legendaire']);
  assert.equal(nextTier('commun'), 'rare');
  assert.equal(nextTier('epique'), 'legendaire');
  assert.equal(nextTier('legendaire'), null);
  assert.equal(nextTier('inconnu'), null);
});

test('recrutement : prix en poissons doux et strictement progressif', () => {
  assert.equal(recruitFishCost(0), 6);
  assert.equal(recruitFishCost(1), 12);
  assert.equal(recruitFishCost(4), 30);
  for (let n = 0; n < 5; n++) assert.ok(recruitFishCost(n + 1) > recruitFishCost(n));
  assert.equal(recruitFishCost(-3), 6);   // robustesse : jamais négatif
});

test('troc : déterministe par jour, échelle de valeur cohérente + débouché du poisson', () => {
  const a = dailyBarter('2026-08-03');
  const b = dailyBarter('2026-08-03');
  const c = dailyBarter('2026-08-04');
  assert.deepEqual(a, b, 'même jour → même troc (deux joueurs identiques)');
  assert.notDeepEqual(a, c, 'un autre jour → un autre troc');
  assert.equal(a.length, 3, 'trois offres');
  // offre 1 : coquillages → poissons en gros (~3 poissons / coquillage)
  assert.equal(a[0].id, 'fish');
  assert.ok(a[0].give.shells >= 2 && a[0].give.shells <= 3);
  assert.ok(a[0].get.fish >= a[0].give.shells * 3 && a[0].get.fish <= a[0].give.shells * 3 + 2);
  // offre 2 : coquillages → gemmes (premium)
  assert.equal(a[1].id, 'gems');
  assert.ok(a[1].give.shells >= 3 && a[1].give.shells <= 4);
  assert.ok(a[1].get.gems >= 1 && a[1].get.gems <= 2);
  // offre 3 : le trop-plein de POISSONS gagne un débouché → 1 gemme (économie qui circule)
  assert.equal(a[2].id, 'fgems');
  assert.ok(a[2].give.fish >= 12 && a[2].give.fish <= 16);
  assert.equal(a[2].get.gems, 1);
});

test('atelier : 3 doublons requis, choix de 2 candidats seedé et stable', () => {
  assert.equal(CRAFT_NEED, 3);
  assert.equal(canCraft({ commun: 3 }, 'commun'), true);
  assert.equal(canCraft({ commun: 2 }, 'commun'), false);
  assert.equal(canCraft({ legendaire: 9 }, 'legendaire'), false); // pas de tier au-dessus
  assert.equal(canCraft(null, 'commun'), false);

  const pool = { rare: ['r1', 'r2', 'r3', 'r4', 'r5'] };
  const ch1 = craftChoices('commun', pool, '2026-08-03', 0);
  const ch1b = craftChoices('commun', pool, '2026-08-03', 0);
  assert.equal(ch1.length, 2);
  assert.deepEqual(ch1, ch1b, 'même jour/tier/n → même choix');
  assert.notDeepEqual(ch1, craftChoices('commun', pool, '2026-08-03', 1), 'n suivant → autre choix');
  assert.ok(ch1.every(id => pool.rare.includes(id)) && ch1[0] !== ch1[1]);
  // pool ≤ 2 : on rend tout ; sommet : rien
  assert.deepEqual(craftChoices('epique', { legendaire: ['L'] }, 'j'), ['L']);
  assert.deepEqual(craftChoices('legendaire', {}, 'j'), []);
});
