// Tests v2.2 : combats, skins, actions progressives (node --test, zéro dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, hashSeed, makeFighter, encodeCard, decodeCard, newBattle, playTurn, MOVES, wildFoe, foeIntent, frappeDamage, ELAN_MAX, ROUNDS_MAX } from '../src/battle.js';
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

test('duel : la prise d\'élan charge et fait reprendre son souffle, sans déborder', () => {
  const b = newBattle(newState(T0), { name: 'X', stage: 'baby' }, 'seed');
  b.me.hp = 10;
  b.lastMine = 'esquive';          // -> elle prend son élan aussi : personne ne frappe
  playTurn(b, 'elan');
  assert.equal(b.me.elan, 1, 'un cran d\'élan');
  assert.ok(b.me.hp > 10, 'et un peu de souffle repris');
  assert.ok(b.me.hp <= b.me.maxHp);
  b.me.hp = b.me.maxHp;
  playTurn(b, 'elan');
  assert.ok(b.me.hp <= b.me.maxHp, 'jamais au-dessus du maximum');
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

/* ---------------- Adversaires solo (v3.40) ---------------- */

test('loutre sauvage : engendrée sans code d\'ami, et utilisable telle quelle', () => {
  const foe = wildFoe(8, 'graine');
  for (const k of ['name', 'stage', 'fur', 'health', 'fun', 'energy']) {
    assert.ok(foe[k] !== undefined, 'champ manquant : ' + k);
  }
  assert.ok(['baby', 'child', 'adult'].includes(foe.stage));
  // elle doit pouvoir entrer directement dans l'arène
  const b = newBattle(newState(T0), foe, 'duel');
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

test('combat solo : se termine toujours, avec un vainqueur', () => {
  const b = newBattle(newState(T0), wildFoe(5, 'fin'), 'seed-fin');
  for (let i = 0; i < 200 && !b.over; i++) playTurn(b, ['elan', 'frappe'][i % 2]);
  assert.ok(b.over, 'le combat doit se conclure');
  assert.ok(b.winner === 'me' || b.winner === 'foe');
  // deux dénouements possibles : le K.O., ou la limite de tours qui départage
  // aux points (verrou anti-enlisement, sans lequel deux esquives tourneraient
  // en boucle sans fin)
  assert.ok(b.me.hp === 0 || b.foe.hp === 0 || b.round > ROUNDS_MAX,
    'ni K.O. ni limite de tours : le duel s\'est arrêté sans raison');
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

/* Le duel doit récompenser l'attention, pas la chance ni le martèlement.
   Ces trois tests fixent ce contrat en le MESURANT sur des joueurs simulés. */
function duel(s, me, i, choisir) {
  const b = newBattle(s, wildFoe(20, 'd' + i, me), 's' + i);
  for (let t = 0; t < 60 && !b.over; t++) playTurn(b, choisir(b, t));
  return b;
}
function tauxDeVictoire(choisir, n = 120) {
  const s = newState(T0);
  s.stage = 'adult'; s.health = 90; s.fun = 70; s.energy = 60;
  const me = makeFighter(s);
  let w = 0, ecart = 0;
  for (let i = 0; i < n; i++) {
    const b = duel(s, me, i, choisir);
    if (b.winner === 'me') w++;
    ecart += Math.abs(b.me.hp / b.me.maxHp - b.foe.hp / b.foe.maxHp);
  }
  return { taux: w / n, ecart: ecart / n };
}

test('duel : marteler le même coup est sévèrement puni', () => {
  for (const coup of ['frappe', 'esquive', 'elan']) {
    const r = tauxDeVictoire(() => coup);
    assert.ok(r.taux <= 0.1, 'marteler « ' + coup + ' » ne doit pas gagner : ' + r.taux);
    assert.ok(r.ecart > 0.5, 'et doit se solder par une déroute nette, pas un match serré');
  }
});

test('duel : un joueur qui LIT l\'adversaire l\'emporte', () => {
  // elle annonce son intention par foeIntent ; la contrer est la bonne réponse
  const contre = { frappe: 'esquive', esquive: 'elan', elan: 'frappe' };
  const r = tauxDeVictoire(b => contre[foeIntent(b)]);
  assert.ok(r.taux >= 0.9, 'lire l\'adversaire doit payer : ' + r.taux);
});

test('duel : un rythme régulier perd, mais de peu — la revanche doit tenter', () => {
  const r = tauxDeVictoire((b, t) => ['elan', 'frappe', 'esquive'][t % 3]);
  assert.ok(r.taux < 0.5, 'un cycle mécanique ne doit pas suffire');
  assert.ok(r.ecart < 0.35, 'mais la défaite doit rester serrée : écart ' + r.ecart);
});

test('duel : AUCUN aléa — même partie, même déroulé, à la virgule près', () => {
  const s = newState(T0); s.stage = 'adult';
  const rejoue = () => {
    const b = newBattle(s, wildFoe(12, 'fixe'), 'graine');
    const coups = ['elan', 'elan', 'frappe', 'esquive', 'frappe', 'elan', 'frappe'];
    for (const c of coups) { if (b.over) break; playTurn(b, c); }
    return { hp: [b.me.hp, b.foe.hp], elan: [b.me.elan, b.foe.elan], log: b.log.join('|') };
  };
  assert.deepEqual(rejoue(), rejoue(), 'le duel doit être parfaitement reproductible');
});

test('duel : le triangle est respecté, sans dépendre de la graine', () => {
  const mk = () => newBattle(Object.assign(newState(T0), { stage: 'adult' }),
    { name: 'X', stage: 'adult', health: 90, fun: 70, energy: 10 }, 'g');

  // frappe PUNIT une charge : plus de dégâts qu'une frappe ordinaire
  const a = mk(); a.foe.spd = 1; a.me.elan = 1;
  const avant = a.foe.hp;
  a.hist = ['esquive', 'esquive'];          // -> elle veut charger
  assert.equal(foeIntent(a), 'elan');
  playTurn(a, 'frappe');
  const degatsPunition = avant - a.foe.hp;
  assert.ok(degatsPunition > frappeDamage(a.me, 1), 'la punition doit dépasser un coup normal');

  // esquive ANNULE une frappe faible et riposte
  const c = mk(); c.hist = ['elan', 'elan'];  // -> elle veut frapper
  assert.equal(foeIntent(c), 'frappe');
  const monHp = c.me.hp;
  playTurn(c, 'esquive');
  assert.equal(c.me.hp, monHp, 'une frappe sans élan esquivée ne touche pas');
  assert.ok(c.foe.hp < c.foe.maxHp, 'et la riposte porte');
});

