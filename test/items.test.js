// Tests v3.8 : trésors rares (raretés, paliers, drops, bonus). Pur + intégration moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HATS, unlockedHats } from '../src/accessories.js';
import { FURS, DECORS, equipBonus, unlockedFurs, unlockedDecors } from '../src/skins.js';

import {
  RARITIES, ITEMS, MILESTONES, itemById, milestoneItem, bonusOf, rollDrop, describeBonus, mergeBonus, cosmeticPrice, treasurePrice } from '../src/items.js';
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
  assert.equal(milestoneItem(6), null, 'pas de palier au niveau 6');
  // invariant : un trésor de palier ne se trouve pas aussi en drop (unicité de l'obtention)
  for (const id of Object.values(MILESTONES)) {
    assert.equal(itemById(id).drop, false, id + ' : exclusif de palier -> non droppable');
  }
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

/* ---------------- Équipement : tout ce qu'on porte compte (v3.52) ---------------- */

test('cumul : trésor + chapeau + pelage se multiplient', () => {
  const b = mergeBonus({ xp: 1.15 }, { xp: 1.12, luck: 1.10 }, { xp: 1.10 });
  assert.ok(Math.abs(b.xp - 1.15 * 1.12 * 1.10) < 1e-9, 'les XP se multiplient');
  assert.equal(b.luck, 1.10);
});

test('cumul : les résistances s\'additionnent mais sont plafonnées', () => {
  const b = mergeBonus({ coldResist: 0.5 }, { coldResist: 0.45 }, { coldResist: 0.6 });
  assert.ok(b.coldResist <= 0.8, 'jamais au-delà de 0,8 : une saison doit rester sensible');
  assert.ok(b.coldResist > 0.5, 'mais cumuler doit servir');
});

test('cumul : rien d\'équipé -> aucun bonus, et pas de plantage', () => {
  assert.deepEqual(mergeBonus(), {});
  assert.deepEqual(mergeBonus(null, undefined, {}), {});
});

test('équipement : chapeaux et pelages portent de vrais effets', () => {
  const avecBonus = HATS.filter(h => h.bonus && Object.keys(h.bonus).length);
  assert.ok(avecBonus.length >= 5, 'les chapeaux ne doivent plus être purement décoratifs');
  const pelages = FURS.filter(f => f.bonus && Object.keys(f.bonus).length);
  assert.ok(pelages.length >= 5, 'les pelages non plus');
  // un bonus doit rester raisonnable : pas de multiplicateur délirant
  for (const it of [...HATS, ...FURS]) {
    for (const [k, v] of Object.entries(it.bonus || {})) {
      if (['xp', 'luck', 'fun', 'energy'].includes(k)) assert.ok(v > 1 && v <= 1.5, it.id + '.' + k);
      if (k.endsWith('Resist')) assert.ok(v > 0 && v <= 0.8, it.id + '.' + k);
    }
  }
});

test('décor : il aménage la BERGE, il ne suit pas la loutre en exploration', () => {
  const base = { gear: 'cristal', hat: 'couronne', fur: 'doree', decor: 'feu' };
  const foyer = equipBonus({ ...base, place: 'berge' });
  const dehors = equipBonus({ ...base, place: 'monde' });
  assert.ok(foyer.coldResist > 0, 'le feu de camp réchauffe au foyer');
  assert.equal(dehors.coldResist, undefined, 'mais pas au milieu de la vallée');
  // le reste de l'équipement, lui, est PORTÉ : il suit partout
  assert.equal(foyer.xp, dehors.xp, 'trésor + chapeau + pelage suivent la loutre');
  // la tanière fait partie du foyer
  assert.ok(equipBonus({ ...base, place: 'taniere' }).coldResist > 0);
});

test('décor : chaque décor déblocable porte un effet (sauf le décor par défaut)', () => {
  const avecEffet = DECORS.filter(d => d.bonus && Object.keys(d.bonus).length);
  assert.equal(avecEffet.length, DECORS.length - 1, 'seul « Berge nature » reste neutre');
  assert.deepEqual(DECORS[0].bonus, undefined, 'le décor par défaut ne donne rien');
});

/* ---------------- Boutique de gemmes (prix des cosmétiques) ---------------- */

test('prix des cosmétiques : dérivé du bonus, borné, arrondi ; trophées non vendus', () => {
  // les cosmétiques toujours disponibles ne coûtent rien
  assert.equal(cosmeticPrice(FURS.find(f => f.id === 'roux').bonus), 0, 'la rousse est gratuite');
  assert.equal(cosmeticPrice(DECORS.find(d => d.id === 'aucun').bonus), 0, 'la berge nature est gratuite');
  assert.equal(cosmeticPrice(null), 0, 'pas de bonus -> pas de prix');

  // tout cosmétique VENDABLE a un prix fini, positif, arrondi à 5, dans une fourchette saine
  const vendables = [...HATS, ...FURS, ...DECORS]
    .filter(it => !it.earnOnly && it.bonus && Object.keys(it.bonus).length);
  assert.ok(vendables.length >= 10, 'la boutique doit proposer de quoi dépenser');
  for (const it of vendables) {
    const p = cosmeticPrice(it.bonus);
    assert.ok(Number.isFinite(p) && p > 0 && p <= 150, it.id + ' : prix aberrant (' + p + ')');
    assert.equal(p % 5, 0, it.id + ' : prix non arrondi à 5 (' + p + ')');
  }

  // plus le bonus renforce la loutre, plus il coûte cher
  assert.ok(cosmeticPrice({ xp: 1.20, atq: 1.10 }) > cosmeticPrice({ xp: 1.05 }),
    'un bonus plus fort doit coûter plus cher');

  // les récompenses de collection restent des trophées : ni farmables, ni achetables
  assert.ok(HATS.find(h => h.id === 'laurier').earnOnly, 'le laurier reste un trophée');
  assert.ok(FURS.find(f => f.id === 'tresor').earnOnly, 'le pelage trésor reste un trophée');
});

test('déblocage : un cosmétique ACHETÉ compte comme débloqué (au même titre qu\'un mérité)', () => {
  const vierge = { xp: 0 };                    // aucun exploit, aucun achat
  assert.ok(!unlockedFurs(vierge).includes('choco'), 'chocolat verrouillé sans exploit ni achat');
  assert.ok(unlockedFurs({ xp: 0, bought: ['choco'] }).includes('choco'), 'chocolat débloqué une fois acheté');
  assert.ok(unlockedHats({ xp: 0, bought: ['beret'] }).includes('beret'), 'béret débloqué une fois acheté');
  assert.ok(unlockedDecors({ xp: 0, bought: ['nenuphars'] }).includes('nenuphars'), 'nénuphars débloqués une fois achetés');
  // le mérité marche toujours sans rien acheter
  assert.ok(unlockedFurs({ xp: 0, mealsTotal: 20 }).includes('choco'), 'chocolat encore mérité en servant 20 repas');
});

test('prix des trésors : socle par rareté, trouvables seulement, croissant du commun au légendaire', () => {
  const rang = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
  const trouvables = ITEMS.filter(it => it.drop);
  assert.ok(trouvables.length >= 10, 'assez de trésors achetables pour un vrai puits à gemmes');

  // tout trésor trouvable a un prix fini, positif, arrondi à 5
  const bornes = { 0: [1e9, 0], 1: [1e9, 0], 2: [1e9, 0], 3: [1e9, 0] };
  for (const it of trouvables) {
    const p = treasurePrice(it);
    assert.ok(Number.isFinite(p) && p > 0, it.id + ' : prix aberrant (' + p + ')');
    assert.equal(p % 5, 0, it.id + ' : prix non arrondi à 5 (' + p + ')');
    const r = rang[it.rarity];
    bornes[r][0] = Math.min(bornes[r][0], p);
    bornes[r][1] = Math.max(bornes[r][1], p);
  }
  // les fourchettes de rareté ne se chevauchent pas : un légendaire coûte
  // toujours plus qu'un épique, etc. — le prix REFLÈTE la rareté
  assert.ok(bornes[0][1] < bornes[1][0], 'commun < rare');
  assert.ok(bornes[1][1] < bornes[2][0], 'rare < épique');
  assert.ok(bornes[2][1] < bornes[3][0], 'épique < légendaire');
  // un trésor plus fort dans sa rareté coûte un peu plus (différenciation)
  const rares = trouvables.filter(it => it.rarity === 'rare').map(treasurePrice);
  assert.ok(Math.max(...rares) > Math.min(...rares), 'les prix se différencient dans une rareté');

  // les trésors de PALIER (drop:false) ne sont pas à vendre — ils se gagnent au niveau
  const paliers = ITEMS.filter(it => !it.drop).map(it => it.id);
  for (const id of paliers) assert.ok(milestoneItem_hasId(id), id + ' : un drop:false devrait être un palier');
});

// petit utilitaire local : l'id figure-t-il dans les paliers ?
function milestoneItem_hasId(id) { return Object.values(MILESTONES).includes(id); }
