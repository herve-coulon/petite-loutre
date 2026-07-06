// Tests v2.1 : accessoires, succès, records, export/import (node --test, zéro dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { H } from '../src/constants.js';
import { newState, newRecords, exportSave, importSave, loadState, loadRecords, saveRecords } from '../src/state.js';
import { HATS, hatById, unlockedHats } from '../src/accessories.js';
import { ACHIEVEMENTS, newAchievements } from '../src/achievements.js';
import { PAL } from '../src/sprites.js';

const T0 = 1_750_000_000_000;

/* ---------------- accessoires ---------------- */

test('chapeaux : verrouillés au départ, débloqués par les records', () => {
  const rec = newRecords();
  assert.deepEqual(unlockedHats(rec), []);

  rec.mealsTotal = 5;
  assert.deepEqual(unlockedHats(rec), ['noeud']);

  rec.gamesTotal = 10;
  rec.bathsTotal = 10;
  rec.bestAge = 72 * H;
  rec.sleepsTotal = 10;
  rec.wins = 5;
  assert.equal(unlockedHats(rec).length, HATS.length, 'tout débloqué');
});

test('chapeaux : sprites valides (largeur 16, couleurs connues)', () => {
  for (const hat of HATS) {
    hat.rows.forEach((r, i) => {
      assert.equal(r.length, 16, `${hat.id} ligne ${i}`);
      for (const ch of r) assert.ok(ch === '.' || PAL[ch], `${hat.id} couleur inconnue: ${ch}`);
    });
    assert.ok(hatById(hat.id) === hat);
  }
});

/* ---------------- succès ---------------- */

test('succès : détectés une seule fois, persistés dans rec', () => {
  const rec = newRecords();
  const s = newState(T0);
  s.stage = 'baby'; s.hatchedAt = T0;

  let got = newAchievements(s, rec);
  assert.deepEqual(got.map(a => a.id), ['naissance']);
  got = newAchievements(s, rec);
  assert.equal(got.length, 0, 'pas de doublon');

  rec.mealsTotal = 10; rec.bathsTotal = 1;
  got = newAchievements(s, rec);
  assert.deepEqual(got.map(a => a.id).sort(), ['bain', 'gourmande']);
  assert.ok(rec.achievements.includes('gourmande'));
});

test('succès : fashionista exige tous les chapeaux', () => {
  const rec = newRecords();
  rec.mealsTotal = 5; rec.gamesTotal = 10; rec.bathsTotal = 10;
  rec.sleepsTotal = 10; rec.wins = 5;
  newAchievements(null, rec);
  assert.ok(!rec.achievements.includes('fashion'));
  rec.bestAge = 72 * H;
  newAchievements(null, rec);
  assert.ok(rec.achievements.includes('fashion'));
});

test('succès : chaque définition a un test exécutable', () => {
  const rec = newRecords();
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.test(newState(T0), rec), 'boolean', a.id);
  }
});

/* ---------------- export / import ---------------- */

test('export/import : aller-retour fidèle (accents inclus)', () => {
  const s = newState(T0);
  s.name = 'Bébé Loutre 💛';
  s.stage = 'child';
  s.hat = 'noeud';
  const rec = newRecords();
  rec.mealsTotal = 42; rec.achievements = ['naissance'];

  const code = exportSave(s, rec);
  assert.ok(code.startsWith('LOUTRE1.'));

  const back = importSave(code);
  assert.ok(back, 'import valide');
  assert.equal(back.s.name, 'Bébé Loutre 💛');
  assert.equal(back.s.hat, 'noeud');
  assert.equal(back.rec.mealsTotal, 42);
  assert.deepEqual(back.rec.achievements, ['naissance']);
});

test('import : rejette les codes invalides', () => {
  assert.equal(importSave('n importe quoi'), null);
  assert.equal(importSave('LOUTRE1.zzz##'), null);
  assert.equal(importSave(''), null);
});

test('import : espaces et retours à la ligne tolérés', () => {
  const code = exportSave(newState(T0), newRecords());
  assert.ok(importSave('  ' + code + '\n'));
});

/* ---------------- migration & records ---------------- */

test('loadState : une sauvegarde v2.0 (sans hat) reçoit les nouveaux champs', () => {
  const old = newState(T0);
  delete old.hat;
  const mem = { petite_loutre_v2: JSON.stringify(old) };
  const storage = { getItem: k => mem[k] ?? null, setItem: () => {}, removeItem: () => {} };
  const back = loadState(storage);
  assert.equal(back.hat, null);
});

test('records : sauvegarde/lecture avec valeurs par défaut', () => {
  const mem = {};
  const storage = {
    setItem: (k, v) => { mem[k] = v; },
    getItem: k => mem[k] ?? null,
    removeItem: k => { delete mem[k]; }
  };
  assert.equal(loadRecords(storage).mealsTotal, 0, 'défauts sans sauvegarde');
  const rec = newRecords();
  rec.fishTotal = 7;
  saveRecords(rec, storage);
  assert.equal(loadRecords(storage).fishTotal, 7);
  // ancien enregistrement partiel -> complété
  mem.petite_loutre_records_v1 = JSON.stringify({ v: 1, bestAge: 5 });
  const partial = loadRecords(storage);
  assert.equal(partial.bestAge, 5);
  assert.equal(partial.perfectGames, 0);
  assert.deepEqual(partial.achievements, []);
});
