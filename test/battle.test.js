// Tests v2.2 : combats, skins, actions progressives (node --test, zéro dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, hashSeed, makeFighter, encodeCard, decodeCard, newBattle, playTurn, MOVES } from '../src/battle.js';
import { FURS, DECORS, unlockedFurs, unlockedDecors, furById } from '../src/skins.js';
import { HATS } from '../src/accessories.js';
import { newState, newRecords, loadState } from '../src/state.js';
import { PAL } from '../src/sprites.js';

const T0 = 1_750_000_000_000;

test('rng seedé : déterministe', () => {
  const a = makeRng(hashSeed('graine')), b = makeRng(hashSeed('graine'));
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.notEqual(makeRng(hashSeed('autre'))(), makeRng(hashSeed('graine'))());
});

test('carte de combat : encode/décode', () => {
  const s = newState(T0);
  s.name = 'Kiwi'; s.stage = 'adult'; s.fur = 'doree'; s.hat = 'couronne';
  const card = decodeCard(encodeCard(s));
  assert.equal(card.name, 'Kiwi');
  assert.equal(card.stage, 'adult');
  assert.equal(card.fur, 'doree');
  assert.equal(decodeCard('pas un code'), null);
});

test('combattant : les stats croissent avec le stade', () => {
  const babyF = makeFighter({ stage: 'baby', health: 80, fun: 60, energy: 50 });
  const adultF = makeFighter({ stage: 'adult', health: 80, fun: 60, energy: 50 });
  assert.ok(adultF.maxHp > babyF.maxHp);
  assert.ok(adultF.atk > babyF.atk);
});

test('combat : reproductible avec la même graine, se termine toujours', () => {
  const me = newState(T0); me.name = 'A'; me.stage = 'child'; me.health = 90; me.fun = 80; me.energy = 70;
  const foe = { name: 'B', stage: 'child', health: 85, fun: 75, energy: 60 };

  const run = () => {
    const b = newBattle(me, foe, 'graine-fixe');
    let guard = 0;
    while (!b.over && guard++ < 200) playTurn(b, 'splash');
    return b;
  };
  const b1 = run(), b2 = run();
  assert.ok(b1.over && b2.over, 'les combats se terminent');
  assert.equal(b1.winner, b2.winner, 'même vainqueur');
  assert.deepEqual(b1.log, b2.log, 'même déroulé');
  assert.ok(['me', 'foe'].includes(b1.winner));
});

test('combat : le câlin soigne sans dépasser le max', () => {
  const b = newBattle(newState(T0), { name: 'X', stage: 'baby' }, 'seed');
  b.me.hp = 10;
  playTurn(b, 'calin');
  assert.ok(b.me.hp > 10 || b.over, 'soin appliqué (ou K.O. adverse premier)');
  assert.ok(b.me.hp <= b.me.maxHp);
  assert.equal(MOVES.length, 3);
});

test('skins : pelages/décors débloqués par records, ids uniques', () => {
  const rec = newRecords();
  assert.deepEqual(unlockedFurs(rec), ['roux']);
  assert.deepEqual(unlockedDecors(rec), ['aucun']);
  rec.mealsTotal = 20; rec.wins = 3; rec.gamesTotal = 5;
  assert.ok(unlockedFurs(rec).includes('choco'));
  assert.ok(unlockedFurs(rec).includes('bonbon'));
  assert.ok(unlockedDecors(rec).includes('nenuphars'));
  const ids = [...FURS, ...DECORS, ...HATS].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'aucun id dupliqué');
  assert.equal(furById('inexistant').id, 'roux', 'repli sur le pelage par défaut');
});

test('skins : palettes des pelages = couleurs hex valides', () => {
  for (const f of FURS) {
    if (!f.map) continue;
    for (const [k, v] of Object.entries(f.map)) {
      assert.ok(['B', 'C', 'D'].includes(k), f.id);
      assert.match(v, /^#[0-9a-f]{6}$/i, f.id + '.' + k);
    }
  }
  for (const hat of HATS) {
    hat.rows.forEach((r, i) => {
      assert.equal(r.length, 16, `${hat.id} ligne ${i}`);
      for (const ch of r) assert.ok(ch === '.' || PAL[ch], `${hat.id}: ${ch}`);
    });
  }
});

test('migration : sauvegarde v2.1 (sans fur/decor/plongée) complétée', () => {
  const old = newState(T0);
  delete old.fur; delete old.decor; delete old.lastTreat; delete old.divingUntil;
  const mem = { petite_loutre_v2: JSON.stringify(old) };
  const back = loadState({ getItem: k => mem[k] ?? null, setItem: () => {}, removeItem: () => {} });
  assert.equal(back.fur, 'roux');
  assert.equal(back.decor, 'aucun');
  assert.equal(back.divingUntil, 0);
});
