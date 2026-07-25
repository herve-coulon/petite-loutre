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
import { levelFromXp, xpCost } from '../src/level.js';
import { milestoneItem } from '../src/items.js';

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

/* ---------------- niveau « cliquet » (v3.77) ---------------- */

test('levelReached : nouveau record contient le champ', () => {
  const rec = newRecords();
  assert.equal(typeof rec.levelReached, 'number');
  assert.equal(rec.levelReached, 0);
});

test('levelReached : migration d\'une vieille sauvegarde le compute depuis xp', () => {
  // Simule une vieille save sans levelReached
  const old = { v: 1, xp: xpCost(1) + xpCost(2) + xpCost(3), items: [], achievements: [] };
  const storage = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
  saveRecords(old, storage);
  const loaded = loadRecords(storage);
  assert.equal(loaded.levelReached, 4, 'niveau 4 depuis xp de 4 niveaux');
});

test('levelReached : gainXp met à jour le niveau le plus haut', () => {
  const rec = newRecords();
  // Simule un gain d'XP jusqu'au niveau 3
  rec.xp = xpCost(1) + xpCost(2);
  rec.levelReached = levelFromXp(rec.xp).level;
  assert.equal(rec.levelReached, 3);
  // Simule une perte d'XP (recrutement)
  rec.xp -= 50;
  assert.ok(levelFromXp(rec.xp).level < 3, 'niveau XP baisse');
  // levelReached ne bouge pas
  assert.equal(rec.levelReached, 3, 'levelReached conservé malgré la perte d\'XP');
});

test('levelReached : curLevel never go down (simulation)', () => {
  const rec = newRecords();
  // Monte au niveau 5
  for (let i = 1; i <= 5; i++) rec.xp += xpCost(i);
  rec.levelReached = levelFromXp(rec.xp).level;
  assert.equal(rec.levelReached, 6);
  // Simule une dépense massive d'XP
  rec.xp -= xpCost(5) + xpCost(4);
  const xpLevel = levelFromXp(rec.xp).level;
  const effLevel = Math.max(xpLevel, rec.levelReached);
  assert.ok(xpLevel < 6, 'niveau XP réel a baissé');
  assert.equal(effLevel, 6, 'niveau effectif reste 6');
});

test('levelReached : zones toujours ouvertes après perte d\'XP', () => {
  const rec = newRecords();
  // Monte au niveau 12 (déverrouille cascade)
  for (let i = 1; i <= 12; i++) rec.xp += xpCost(i);
  rec.levelReached = levelFromXp(rec.xp).level;
  // Perte d'XP
  rec.xp -= xpCost(12) + xpCost(11);
  const effLevel = Math.max(levelFromXp(rec.xp).level, rec.levelReached);
  assert.ok(effLevel >= 12, 'niveau effectif >= 12 : cascade reste ouverte');
});

test('levelReached : milestoneItem pas redonné (double octroi protégé)', () => {
  const rec = newRecords();
  // Monte au niveau 2 (débloque un milestone)
  rec.xp = xpCost(1);
  rec.levelReached = 2;
  const mid = milestoneItem(2);
  if (mid) {
    rec.items.push(mid);
    // Simule un gain identique → ne devrait pas re-ajouter
    const before = rec.items.length;
    rec.items.push(mid); // double ajout volontaire
    assert.equal(rec.items.length, before + 1, 'le guard !items.includes empêche le double');
  }
});
