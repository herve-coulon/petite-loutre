// Tests v3.8 : trésors rares (raretés, paliers, drops, bonus). Pur + intégration moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RARITIES, ITEMS, MILESTONES, itemById, milestoneItem, bonusOf, rollDrop, describeBonus
} from '../src/items.js';
import { stepSim } from '../src/sim.js';
import { newState } from '../src/state.js';
import { H } from '../src/constants.js';

// rnd déterministe à partir d'une liste de valeurs (boucle si épuisée).
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

/* ---------------- catalogue ---------------- */

test('chaque trésor est complet et cohérent', () => {
  const ids = new Set();
  for (const it of ITEMS) {
    assert.ok(it.id && it.emoji && it.name, it.id + ' : id/emoji/nom');
    assert.ok(!ids.has(it.id), 'id unique : ' + it.id); ids.add(it.id);
    assert.ok(RARITIES[it.rarity], it.id + ' : rareté connue');
    assert.equal(typeof it.drop, 'boolean', it.id + ' : drop booléen');
    assert.ok(it.bonus && Object.keys(it.bonus).length > 0, it.id + ' : au moins un bonus');
  }
});

test('raretés : poids positifs, du commun au légendaire', () => {
  for (const k of Object.keys(RARITIES)) {
    assert.ok(RARITIES[k].weight > 0 && RARITIES[k].label && /^#/.test(RARITIES[k].color), k);
  }
  assert.ok(RARITIES.commun.weight > RARITIES.rare.weight);
  assert.ok(RARITIES.rare.weight > RARITIES.epique.weight);
  assert.ok(RARITIES.epique.weight > RARITIES.legendaire.weight);
});

test('paliers : chaque milestone pointe un trésor existant', () => {
  for (const [lv, id] of Object.entries(MILESTONES)) {
    assert.ok(itemById(id), 'niveau ' + lv + ' -> trésor ' + id + ' existe');
    assert.equal(milestoneItem(+lv), id);
  }
  assert.equal(milestoneItem(7), null, 'pas de palier au niveau 7');
});

/* ---------------- bonus ---------------- */

test('bonusOf : bonus de l\'objet, {} si inconnu/aucun', () => {
  assert.deepEqual(bonusOf(null), {});
  assert.deepEqual(bonusOf('inexistant'), {});
  assert.deepEqual(bonusOf('caillou'), itemById('caillou').bonus);
});

test('describeBonus : jamais vide, lisible', () => {
  for (const it of ITEMS) {
    const d = describeBonus(it.bonus);
    assert.ok(typeof d === 'string' && d.length > 0, it.id);
  }
});

/* ---------------- drops ---------------- */

test('rollDrop : rien si le tirage dépasse la chance de base', () => {
  assert.equal(rollDrop(seq(0.99)), null, 'gros tirage -> pas de drop');
});

test('rollDrop : un objet droppable valide quand ça tombe', () => {
  const droppableIds = new Set(ITEMS.filter(it => it.drop).map(it => it.id));
  for (let i = 0; i < 50; i++) {
    const id = rollDrop(seq(0.01, i / 50)); // gate ouvert, pick balayé
    assert.ok(id === null || droppableIds.has(id), 'drop valide : ' + id);
    assert.ok(id !== 'medaillon' && id !== 'etoilefilante', 'les exclusifs de palier ne droppent pas');
  }
});

test('rollDrop : la chance (luck) ouvre plus souvent la porte', () => {
  // tirage de gate à 0.30 : fermé sans chance (base 0.12), ouvert avec forte chance
  assert.equal(rollDrop(seq(0.30, 0.5), 1), null, 'sans chance : fermé');
  assert.ok(rollDrop(seq(0.30, 0.5), 3) !== null, 'avec chance : ouvert');
});

test('rollDrop : la pondération favorise les communs (statistique)', () => {
  let commun = 0, legend = 0, n = 4000;
  // rnd pseudo-aléatoire déterministe (LCG) pour un échantillon stable
  let x = 123456789;
  const rnd = () => { x = (1103515245 * x + 12345) % 2147483648; return x / 2147483648; };
  for (let i = 0; i < n; i++) {
    const id = rollDrop(rnd, 5); // chance forte -> beaucoup de drops
    if (!id) continue;
    const r = itemById(id).rarity;
    if (r === 'commun') commun++;
    if (r === 'legendaire') legend++;
  }
  assert.ok(commun > legend * 3, 'communs bien plus fréquents que légendaires (' + commun + ' vs ' + legend + ')');
});

/* ---------------- intégration moteur : les bonus agissent ---------------- */

function otter(over = {}) {
  const s = newState(0);
  return Object.assign(s, {
    stage: 'baby', hatchedAt: -1000, sleeping: false, sick: false,
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 80,
    poops: [], nextPoop: Number.POSITIVE_INFINITY, gear: null
  }, over);
}
const SPRING = new Date(2026, 3, 15, 12).getTime(); // neutre
const WINTER = new Date(2026, 0, 15, 12).getTime();

test('bonus decay : un trésor ralentit la décroissance des jauges', () => {
  const rnd = () => 0.99;
  const plain = otter(); stepSim(plain, H, { simNow: SPRING, rnd });
  const geared = otter({ gear: 'medaillon' }); // decay 0.92
  stepSim(geared, H, { simNow: SPRING, rnd });
  assert.ok(geared.hunger > plain.hunger, 'faim descend moins vite avec le médaillon');
  assert.ok(geared.clean > plain.clean, 'propreté descend moins vite');
});

test('bonus coldResist : un trésor atténue le risque de froid l\'hiver', () => {
  // tirage pile entre le risque sans résistance (~0.09) et le risque atténué (~0.02)
  const rnd = () => 0.05;
  const plain = otter({ energy: 20, hunger: 20 });
  stepSim(plain, H, { simNow: WINTER, rnd });
  const warm = otter({ energy: 20, hunger: 20, gear: 'coeur' }); // coldResist 0.8
  stepSim(warm, H, { simNow: WINTER, rnd });
  assert.equal(plain.sick, true, 'sans résistance : attrape froid');
  assert.equal(warm.sick, false, 'avec le Cœur de la rivière : résiste');
});
