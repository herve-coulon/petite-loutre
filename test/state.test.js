// Tests de l'assainissement des sauvegardes (audit M7) — import/export robustes.
// Un code de sauvegarde est une entrée non fiable : taille, 1e999 -> Infinity,
// chaînes, null… rien ne doit casser la sim ni l'UI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, newRecords, exportSave, importSave, loadState, loadRecords } from '../src/state.js';

/** Fabrique un code LOUTRE1 depuis un JSON brut (pour injecter des valeurs que
    JSON.stringify n'émettrait jamais, ex. "hunger":1e999 -> Infinity au parse). */
function rawCode(jsonText) {
  return 'LOUTRE1.' + Buffer.from(jsonText, 'utf8').toString('base64');
}

test('round-trip : une save légitime exportée se réimporte à l\'identique', () => {
  const s = newState();
  s.name = 'Kiwi'; s.stage = 'child'; s.hunger = 55;
  const rec = newRecords();
  rec.fish = 12; rec.gems = 3; rec.streakCount = 7;
  const back = importSave(exportSave(s, rec));
  assert.ok(back, 'import accepté');
  assert.equal(back.s.name, 'Kiwi');
  assert.equal(back.s.stage, 'child');
  assert.equal(back.s.hunger, 55);
  assert.equal(back.rec.fish, 12);
  assert.equal(back.rec.gems, 3);
  assert.equal(back.rec.streakCount, 7);
});

test('rejets : mauvais préfixe, JSON cassé, code trop gros', () => {
  assert.equal(importSave('NIMPORTE'), null);
  assert.equal(importSave('LOUTRE1.%%%'), null);
  assert.equal(importSave('LOUTRE1.' + 'A'.repeat(100_001)), null, 'taille bornée (100 Ko)');
});

test('jauges : valeurs absurdes clampées, pas de NaN/Infinity', () => {
  const code = rawCode('{"s":{"v":2,"stage":"baby","name":"X","hunger":1e999,"fun":"abc","energy":-50,"clean":150,"health":null},"rec":{"v":1,"fish":1e999,"streakCount":"x","gems":-3}}');
  const back = importSave(code);
  assert.ok(back, 'import accepté malgré les valeurs absurdes');
  assert.equal(back.s.hunger, 80, '1e999 (Infinity) -> défaut sain');
  assert.equal(back.s.fun, 80, 'chaîne -> défaut');
  assert.equal(back.s.energy, 0, '-50 -> borné à 0');
  assert.equal(back.s.clean, 100, '150 -> borné à 100');
  assert.equal(back.s.health, 100, 'null -> défaut');
  assert.ok(Number.isFinite(back.s.hunger) && Number.isFinite(back.s.clean));
  assert.equal(back.rec.fish, 0, 'poissons Infinity -> 0');
  assert.equal(back.rec.streakCount, 0, 'série non numérique -> 0');
  assert.equal(back.rec.gems, 0, 'gemmes négatives -> 0');
});

test('stade, nom et cacas : corrigés sans casser', () => {
  const code = rawCode('{"s":{"v":2,"stage":"volcan","name":123,"poops":[0,"x",2],"hatchedAt":null},"rec":{"v":1}}');
  const back = importSave(code);
  assert.ok(back);
  assert.ok(['egg', 'baby', 'child', 'adult'].includes(back.s.stage), 'stade whitelisté');
  assert.equal(back.s.name, null, 'nom non-string -> null');
  assert.deepEqual(back.s.poops, [0, 2], 'cacas numériques seulement');
});

test('nom surdimensionné tronqué, chaînes longues bornées', () => {
  const bigName = 'A'.repeat(500);
  const bigFound = 'X'.repeat(300);
  const code = rawCode('{"s":{"v":2,"stage":"baby","name":"' + bigName + '"},' +
    '"rec":{"v":1,"found":["' + bigFound + '"]}}');
  const back = importSave(code);
  assert.equal(back.s.name.length, 64, 'nom borné à 64 (pas de bombe de 500 car.)');
  assert.equal(back.rec.found[0].length, 64, 'chaîne de tableau bornée');
});

test('loadState : une save corrompue dans localStorage est assainie, pas fatale', () => {
  const storage = { getItem: () => '{"v":2,"name":"Kiwi","stage":"baby","hunger":1e999}' };
  const s = loadState(storage);
  assert.ok(s, 'chargé malgré le 1e999');
  assert.equal(s.hunger, 80);
  assert.equal(s.name, 'Kiwi');
});

test('loadRecords : records corrompus assainis', () => {
  const storage = { getItem: () => '{"v":1,"fish":1e999,"streakCount":"z"}' };
  const rec = loadRecords(storage);
  assert.equal(rec.fish, 0);
  assert.equal(rec.streakCount, 0);
  assert.ok(Number.isFinite(rec.fish));
});
