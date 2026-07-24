// Tests v2.1 : accessoires, succès, records, export/import (node --test, zéro dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { H } from '../src/constants.js';
import { newState, newRecords, exportSave, importSave, loadState, loadRecords, saveRecords } from '../src/state.js';
import { HATS, hatById, unlockedHats } from '../src/accessories.js';
import { ACHIEVEMENTS, newAchievements } from '../src/achievements.js';
import { PAL } from '../src/sprites.js';
import { unlockedFurs } from '../src/skins.js';
import { FUR_REMAP } from '../src/otter-art.js';
import { COFFRE_ZONES, EPREUVE_ZONES } from '../src/tilemap.js';

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
  rec.xp = 100000; // v2.6 : l'étoile dorée et l'auréole sont des paliers de niveau
  rec.epreuves = [...EPREUVE_ZONES]; // v3.61 : le laurier récompense les épreuves
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

test('succès : fashionista exige tous les chapeaux (paliers de niveau compris)', () => {
  const rec = newRecords();
  rec.mealsTotal = 5; rec.gamesTotal = 10; rec.bathsTotal = 10;
  rec.sleepsTotal = 10; rec.wins = 5; rec.xp = 100000;
  rec.epreuves = [...EPREUVE_ZONES];
  newAchievements(null, rec);
  assert.ok(!rec.achievements.includes('fashion'), 'couronne manquante : pas fashionista');
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
  // nouveaux champs d'aventure (gang, cadeaux de saison) : présents par défaut…
  assert.equal(partial.gang, null);
  assert.deepEqual(partial.seasonGifts, {});
  // …et le gang persiste en aller-retour
  const rec2 = newRecords();
  rec2.gang = { name: 'Les Griffes', emblem: '⚔️', members: [{ name: 'Kiwi', stage: 'adult' }], wins: 2, losses: 1 };
  rec2.seasonGifts = { 'ete-2026': true };
  saveRecords(rec2, storage);
  const back = loadRecords(storage);
  assert.equal(back.gang.name, 'Les Griffes', 'le gang survit à la sauvegarde');
  assert.equal(back.gang.wins, 2);
  assert.equal(back.seasonGifts['ete-2026'], true, 'les cadeaux réclamés persistent');
});

test('complétion : les coffres donnent un pelage, les épreuves un chapeau', () => {
  const rec = newRecords();
  assert.ok(!unlockedFurs(rec).includes('tresor'), 'pelage verrouillé au départ');
  assert.ok(!unlockedHats(rec).includes('laurier'), 'laurier verrouillé au départ');

  // une collection presque finie ne suffit pas : c'est tout ou rien
  rec.chests = COFFRE_ZONES.slice(0, -1);
  rec.epreuves = EPREUVE_ZONES.slice(0, -1);
  assert.ok(!unlockedFurs(rec).includes('tresor'), 'il manque un coffre');
  assert.ok(!unlockedHats(rec).includes('laurier'), 'il manque une championne');

  rec.chests = [...COFFRE_ZONES];
  assert.ok(unlockedFurs(rec).includes('tresor'), 'les 6 coffres donnent le pelage');
  assert.ok(!unlockedHats(rec).includes('laurier'), 'mais pas le chapeau');

  rec.epreuves = [...EPREUVE_ZONES];
  assert.ok(unlockedHats(rec).includes('laurier'), 'les 6 épreuves donnent le laurier');
});

test('complétion : le pelage de trésor existe aussi pour la loutre dessinée', () => {
  // sans son remap, la récompense s'afficherait en roux : une récompense
  // invisible n'en est pas une
  assert.ok('tresor' in FUR_REMAP, 'pelage sans déclinaison pour le kit');
  assert.equal(FUR_REMAP.tresor.fur.length, 5);
  assert.equal(FUR_REMAP.tresor.belly.length, 4);
});

test('complétion : trois succès, dont un qui exige les DEUX collections', () => {
  const rec = newRecords();
  rec.chests = [...COFFRE_ZONES];
  newAchievements(null, rec);
  assert.ok(rec.achievements.includes('coffres'), 'succès des coffres');
  assert.ok(!rec.achievements.includes('championne'), 'pas encore les championnes');
  assert.ok(!rec.achievements.includes('maitresse'), 'ni la maîtrise');

  rec.epreuves = [...EPREUVE_ZONES];
  newAchievements(null, rec);
  assert.ok(rec.achievements.includes('championne'), 'succès des championnes');
  assert.ok(rec.achievements.includes('maitresse'), 'et la maîtrise, une fois les deux');
});
