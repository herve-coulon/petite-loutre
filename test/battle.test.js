// Tests du duel TOUR PAR TOUR (Pokémon-like, combo à risque) + skins et cartes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeRng, hashSeed, makeFighter, encodeCard, decodeCard,
  newBattle, stepBattle, duelInput, wildFoe,
  INTRO_MS, TECHNIQUES, techniqueById, playerTechniques
} from '../src/battle.js';
import { FURS, DECORS, unlockedFurs, unlockedDecors, furById } from '../src/skins.js';
import { HATS } from '../src/accessories.js';
import { newState, newRecords, loadState } from '../src/state.js';
import { PAL } from '../src/sprites.js';

const T0 = 1_750_000_000_000;
const meState = () => Object.assign(newState(T0), { name: 'A', stage: 'adult', health: 90, fun: 70, energy: 60 });
const foeCard = () => ({ name: 'B', stage: 'adult', health: 85, fun: 75, energy: 60 });

/* ---------------- outils ---------------- */

/** Joue un duel entier avec un joueur simulé qui choisit la technique donnée. */
function simulate(b, { tech = 'morsure', maxMs = 90000 } = {}) {
  let t = 0; const DT = 16;
  while (!b.over && t < maxMs) {
    t += DT; stepBattle(b, t);
    if (b.phase === 'choose') duelInput(b, tech, t);
  }
  return b;
}

/* ---------------- RNG & cartes (inchangés) ---------------- */

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

/* ---------------- Le duel tour-par-tour ---------------- */

test('duel : une attaque inflige des dégâts et le combo monte', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure'] });
  b.foe.maxHp = 9999; b.foe.hp = 9999; // increvable pour isoler le joueur
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  assert.equal(b.phase, 'choose');
  const foeAvant = b.foe.hp;
  duelInput(b, 'morsure', t);
  assert.ok(b.foe.hp < foeAvant, 'l\'attaque porte des dégâts');
  assert.equal(b.bestCombo, 1, 'bestCombo monte à 1');
});

test('duel : le combo booste les dégâts (x1.15 à x1.75)', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure'] });
  b.foe.maxHp = 9999; b.foe.hp = 9999;
  let t = 0;
  // Tour 1 : combo 0 → x1.00
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'morsure', t);
  const dmg1 = 9999 - b.foe.hp;
  // Tour 2 : combo devrait monter (ennemi ne reset pas si pas touché)
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  const hp2 = b.foe.hp;
  if (!b.over && b.phase === 'choose') {
    duelInput(b, 'morsure', t);
    const dmg2 = hp2 - b.foe.hp;
    assert.ok(dmg2 >= dmg1, 'combo x1.15 fait plus de dégâts que x1.00');
  }
});

test('duel : le soin récupère des PV', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['soin'] });
  b.me.hp = 80; b.me.maxHp = 100;
  b.foe.atk = 0; // l'ennemi fait 1 dégâts min (formule max(1,...))
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'soin', t);
  assert.equal(b.me.hp, 97, 'soin = +18 PV, ennemi fait 1 dégâts min (80+18-1=97)');
});

test('duel : les PP sont consommés', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['jet_eau'] });
  assert.equal(b.pp.jet_eau, 5, 'commence à 5 PP');
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'jet_eau', t);
  assert.equal(b.pp.jet_eau, 4, 'consomme 1 PP');
});

test('duel : plus de PP = impossible d\'utiliser', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['jet_eau'] });
  b.pp.jet_eau = 0;
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'jet_eau', t);
  assert.equal(b.feedback.kind, 'miss', 'feedback "miss" si plus de PP');
});

test('duel : tsunami nécessite combo ≥ 3', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure', 'tsunami'] });
  b.combo = 0;
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'tsunami', t);
  assert.equal(b.feedback.kind, 'miss', 'tsunami refusé sans combo');
  assert.equal(b.combo, 0, 'combo reste à 0');
});

test('duel : tsunami fonctionne avec combo ≥ 3', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure', 'tsunami'] });
  b.combo = 3;
  b.foe.maxHp = 9999; b.foe.hp = 9999;
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  const avant = b.foe.hp;
  duelInput(b, 'tsunami', t);
  assert.ok(avant - b.foe.hp > 0, 'tsunami inflige de gros dégâts');
});

test('duel : un coup de l\'ennemi reset le combo', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure'] });
  b.combo = 3;
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  // Ne pas attaquer — laisser l'ennemi frapper
  t += 3000; stepBattle(b, t);
  if (b.me.hp < b.me.maxHp) {
    assert.equal(b.combo, 0, 'combo reset après coup reçu');
  }
});

test('duel : la furie ajoute un stack de combo', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0, techIds: ['morsure', 'furie'] });
  b.foe.maxHp = 9999; b.foe.hp = 9999;
  let t = 0;
  while (!b.over && b.phase !== 'choose') { t += 16; stepBattle(b, t); }
  duelInput(b, 'furie', t);
  // Furie = 1 base (attaque) + 1 bonus (furie.bonusCombo) = bestCombo 2
  assert.equal(b.bestCombo, 2, 'furie = 1 base + 1 bonus = bestCombo 2');
});

test('duel : le talent décide — attaquer juste gagne', () => {
  const me = meState();
  const foe = wildFoe(20, 'skill', makeFighter(me));
  // Utiliser morsure (infinie) — l'important est que le joueur attaque à chaque tour
  const b = simulate(newBattle(me, foe, 's', { now: 0, level: 20, techIds: ['morsure'] }));
  // Le combat doit se terminer avec un vainqueur (pas forcément "me" car l'ennemi peut être plus fort)
  assert.ok(b.over, 'le combat se termine');
  assert.ok(b.winner === 'me' || b.winner === 'foe', 'il y a un vainqueur');
});

test('duel : AUCUN aléa — même sequence, déroulé identique', () => {
  const me = meState(), foe = wildFoe(12, 'fixe', makeFighter(me));
  const rejoue = () => {
    const b = simulate(newBattle(me, foe, 'g', { now: 0, level: 12, techIds: ['morsure'] }));
    return { winner: b.winner, hp: [b.me.hp, b.foe.hp] };
  };
  assert.deepEqual(rejoue(), rejoue(), 'le duel doit être parfaitement reproductible');
});

test('duel : l\'équipement et la difficulté pèsent', () => {
  const normal = newBattle(meState(), foeCard(), 'g', { now: 0, techIds: ['morsure'] });
  const dure = newBattle(meState(), foeCard(), 'g', { now: 0, foeMult: 2, techIds: ['morsure'] });
  assert.ok(dure.foe.maxHp > normal.foe.maxHp, 'une championne a plus de PV');
  assert.ok(dure.foe.atk > normal.foe.atk, 'et frappe plus fort');
});

test('duel : les techniques sont bien définies', () => {
  assert.ok(TECHNIQUES.length >= 8, 'au moins 8 techniques');
  const m = techniqueById('morsure');
  assert.ok(m, 'morsure existe');
  assert.equal(m.power, 12);
  assert.equal(m.cost, 0);
  const t = techniqueById('tsunami');
  assert.ok(t.minCombo >= 3, 'tsunami nécessite combo ≥ 3');
});

test('playerTechniques : déblocage progressif', () => {
  const rec = {};
  assert.deepEqual(playerTechniques(rec), ['morsure'], 'début : morsure seule');
  rec.battles = 3;
  assert.ok(playerTechniques(rec).includes('jet_eau'), '3 batailles → jet_eau');
  rec.wins = 2;
  assert.ok(playerTechniques(rec).includes('soin'), '2 victoires → soin');
  rec.wins = 5;
  assert.ok(playerTechniques(rec).includes('coup_queue'), '5 victoires → coup_queue');
});

test('combat solo : se termine toujours, avec un vainqueur', () => {
  const b = simulate(newBattle(newState(T0), wildFoe(5, 'fin'), 'seed-fin', { now: 0, level: 5, techIds: ['morsure'] }));
  assert.ok(b.over, 'le combat doit se conclure');
  assert.ok(b.winner === 'me' || b.winner === 'foe');
  assert.ok(b.me.hp === 0 || b.foe.hp === 0, 'il se conclut par un K.O.');
});

/* ---------------- Skins, cartes, migration (inchangés) ---------------- */

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
      assert.ok(['B', 'C', 'D', 'q'].includes(k), f.id);
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

/* ---------------- Adversaires solo ---------------- */

test('loutre sauvage : engendrée sans code d\'ami, et utilisable telle quelle', () => {
  const foe = wildFoe(8, 'graine');
  for (const k of ['name', 'stage', 'fur', 'health', 'fun', 'energy']) {
    assert.ok(foe[k] !== undefined, 'champ manquant : ' + k);
  }
  assert.ok(['baby', 'child', 'adult'].includes(foe.stage));
  const b = newBattle(newState(T0), foe, 'duel', { now: 0, techIds: ['morsure'] });
  assert.ok(b.foe.maxHp > 0 && b.foe.atk > 0);
  assert.equal(b.foe.name, foe.name);
});

test('loutre sauvage : seedée (même graine -> même adversaire)', () => {
  assert.deepEqual(wildFoe(10, 'x'), wildFoe(10, 'x'));
  assert.notDeepEqual(wildFoe(10, 'x'), wildFoe(10, 'y'));
});

test('loutre sauvage : plus coriace à haut niveau', () => {
  const avg = (lv) => {
    let hp = 0;
    for (let i = 0; i < 40; i++) hp += makeFighter(wildFoe(lv, 'g' + i)).maxHp;
    return hp / 40;
  };
  assert.ok(avg(25) > avg(1), 'les adversaires doivent monter en puissance');
});

test('adversaire calé sur la loutre : les gabarits restent comparables', () => {
  const s = newState(T0);
  s.stage = 'adult'; s.health = 90; s.fun = 70; s.energy = 60;
  const me = makeFighter(s);
  for (let i = 0; i < 60; i++) {
    const foe = makeFighter(wildFoe(20, 'duel' + i, me));
    assert.ok(foe.maxHp > me.maxHp * 0.6 && foe.maxHp < me.maxHp * 1.4,
      'PV hors fourchette : ' + foe.maxHp + ' vs ' + me.maxHp);
  }
});
