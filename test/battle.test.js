// Tests du duel RÉFLEXE (temps réel, sans aléa) + skins et cartes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeRng, hashSeed, makeFighter, encodeCard, decodeCard,
  newBattle, stepBattle, duelInput, wildFoe,
  INTRO_MS, PARRY_PERFECT, PARRY_OK, COMBO_OPEN
} from '../src/battle.js';
import { FURS, DECORS, unlockedFurs, unlockedDecors, furById } from '../src/skins.js';
import { HATS } from '../src/accessories.js';
import { newState, newRecords, loadState } from '../src/state.js';
import { PAL } from '../src/sprites.js';

const T0 = 1_750_000_000_000;
const meState = () => Object.assign(newState(T0), { name: 'A', stage: 'adult', health: 90, fun: 70, energy: 60 });
const foeCard = () => ({ name: 'B', stage: 'adult', health: 85, fun: 75, energy: 60 });

/* ---------------- outils ---------------- */

/** Amène le duel jusqu'à la prochaine phase `wind` (ou fin), horloge à l'appui. */
function toWind(b, clock) {
  let t = clock.t;
  while (!b.over && b.phase !== 'wind') { t += 16; stepBattle(b, t); }
  clock.t = t;
  return b;
}

/**
 * Joue un duel entier avec un joueur simulé qui pare avec un DÉCALAGE fixe par
 * rapport à l'impact (0 = parfait) et frappe dans les ouvertures. Retourne b.
 */
function simulate(b, { offset = 0, parry = true, strike = true, maxMs = 90000 } = {}) {
  let t = 0; const DT = 16; let aimed = null;
  while (!b.over && t < maxMs) {
    t += DT; stepBattle(b, t);
    if (b.phase === 'wind' && parry) {
      if (aimed === null) aimed = b.impactAt + offset;
      if (t >= aimed && t < aimed + DT) { duelInput(b, 'parry', t); aimed = null; }
    } else if (b.phase === 'opening' && strike) {
      duelInput(b, 'strike', t);
    } else if (b.phase !== 'wind') {
      aimed = null;
    }
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

/* ---------------- Le duel réflexe ---------------- */

test('duel : une PARADE PARFAITE annule le coup et riposte, le combo monte', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0 });
  stepBattle(b, INTRO_MS);                       // premier coup armé
  assert.equal(b.phase, 'wind');
  const foeAvant = b.foe.hp, monHp = b.me.hp;
  duelInput(b, 'parry', b.impactAt);             // pile à l'impact
  assert.equal(b.me.hp, monHp, 'aucun dégât encaissé');
  assert.ok(b.foe.hp < foeAvant, 'la riposte porte');
  assert.equal(b.combo, 1, 'le combo monte');
  assert.equal(b.phase, 'recover');
});

test('duel : ne PAS parer fait encaisser le coup plein', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0 });
  stepBattle(b, INTRO_MS);
  const monHp = b.me.hp;
  stepBattle(b, b.impactAt + b.wOk + 40);        // la fenêtre passe sans appui
  assert.ok(b.me.hp < monHp, 'le coup non paré touche');
  assert.equal(b.combo, 0);
});

test('duel : parer un peu à côté BLOQUE (dégâts réduits, petite riposte)', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0 });
  stepBattle(b, INTRO_MS);
  const monHp = b.me.hp, foeAvant = b.foe.hp;
  duelInput(b, 'parry', b.impactAt + b.wPerfect + 40);   // hors « parfait », dans « ok »
  const encaisse = monHp - b.me.hp, rendu = foeAvant - b.foe.hp;
  assert.ok(encaisse > 0, 'un bloc coûte un peu');
  assert.ok(rendu > 0, 'mais rend un peu aussi');
  // un bloc encaisse bien moins qu'un coup plein subi
  const plein = newBattle(meState(), foeCard(), 's', { now: 0 });
  stepBattle(plein, INTRO_MS);
  const avant2 = plein.me.hp;
  stepBattle(plein, plein.impactAt + plein.wOk + 40);
  assert.ok(encaisse < avant2 - plein.me.hp, 'bloquer vaut mieux qu\'encaisser');
});

test('duel : parer à contretemps (trop tôt) ouvre la garde — coup plein', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0 });
  stepBattle(b, INTRO_MS);
  const monHp = b.me.hp;
  duelInput(b, 'parry', b.impactAt - b.wOk - 80);  // bien trop tôt
  assert.ok(monHp - b.me.hp > 0, 'un appui à contretemps se paie');
  assert.equal(b.combo, 0);
});

test('duel : trois parades parfaites ouvrent une FRAPPE dévastatrice', () => {
  const b = newBattle(meState(), { name: 'Roc', stage: 'adult', health: 100, fun: 90, energy: 40 }, 's', { now: 0 });
  b.foe.maxHp = 9999; b.foe.hp = 9999;             // increvable : on isole l'ouverture
  const clock = { t: 0 };
  for (let k = 0; k < COMBO_OPEN; k++) {
    toWind(b, clock);
    duelInput(b, 'parry', b.impactAt);             // parade parfaite
  }
  assert.equal(b.pendingOpen, true, COMBO_OPEN + ' parades parfaites arment une ouverture');
  let t = clock.t;
  while (b.phase !== 'opening' && !b.over) { t += 16; stepBattle(b, t); }
  assert.equal(b.phase, 'opening');
  const avant = b.foe.hp;
  duelInput(b, 'strike', t);
  const frappe = avant - b.foe.hp;
  assert.ok(frappe > b.me.atk, 'la frappe d\'ouverture doit faire très mal (' + frappe + ')');
});

test('duel : NERVEUX — le télégraphe s\'accélère quand le niveau monte', () => {
  const bas = newBattle(meState(), foeCard(), 's', { now: 0, level: 1 });
  stepBattle(bas, INTRO_MS);
  const haut = newBattle(meState(), foeCard(), 's', { now: 0, level: 28 });
  stepBattle(haut, INTRO_MS);
  assert.ok(haut.windup < bas.windup, 'à haut niveau, on voit venir le coup moins longtemps');
});

test('duel : le talent décide — parer juste gagne, ne jamais parer perd', () => {
  const me = meState();
  const foe = wildFoe(20, 'skill', makeFighter(me));
  const gagne = simulate(newBattle(me, foe, 's', { now: 0, level: 20 }), { offset: 0 });
  assert.equal(gagne.winner, 'me', 'parer juste doit l\'emporter');
  const perd = simulate(newBattle(me, foe, 's', { now: 0, level: 20 }), { parry: false });
  assert.equal(perd.winner, 'foe', 'ne rien faire doit perdre');
});

test('duel : AUCUN aléa — même tempo d\'appuis, déroulé identique', () => {
  const me = meState(), foe = wildFoe(12, 'fixe', makeFighter(me));
  const rejoue = () => {
    const b = simulate(newBattle(me, foe, 'g', { now: 0, level: 12 }), { offset: 45 });
    return { winner: b.winner, hp: [b.me.hp, b.foe.hp], log: b.log.join('|') };
  };
  assert.deepEqual(rejoue(), rejoue(), 'le duel réflexe doit être parfaitement reproductible');
});

test('duel : l\'équipement et la difficulté pèsent (PV/attaque de l\'épreuve)', () => {
  const normal = newBattle(meState(), foeCard(), 'g', { now: 0 });
  const dure = newBattle(meState(), foeCard(), 'g', { now: 0, foeMult: 2 });
  assert.ok(dure.foe.maxHp > normal.foe.maxHp, 'une championne a plus de PV');
  assert.ok(dure.foe.atk > normal.foe.atk, 'et frappe plus fort');
  assert.ok(dure.foe.atk < normal.me.maxHp, 'un coup encaissé ne doit pas tuer d\'un coup');
});

test('duel : les fenêtres de parade sont finies et cohérentes', () => {
  const b = newBattle(meState(), foeCard(), 's', { now: 0 });
  assert.ok(b.wPerfect > 0 && b.wPerfect < b.wOk, 'parfait plus étroit que bloc');
  assert.equal(b.wPerfect, PARRY_PERFECT);        // sans technique « fenêtre »
  assert.equal(b.wOk, PARRY_OK);
  const large = newBattle(meState(), foeCard(), 's', { now: 0, buffs: { fenetre: 1.35 } });
  assert.ok(large.wPerfect > b.wPerfect && large.wOk > b.wOk, 'la maîtrise élargit la parade');
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
  const b = newBattle(newState(T0), foe, 'duel', { now: 0 });
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
  const b = simulate(newBattle(newState(T0), wildFoe(5, 'fin'), 'seed-fin', { now: 0, level: 5 }), { offset: 30 });
  assert.ok(b.over, 'le combat doit se conclure');
  assert.ok(b.winner === 'me' || b.winner === 'foe');
  assert.ok(b.me.hp === 0 || b.foe.hp === 0, 'il se conclut par un K.O.');
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
