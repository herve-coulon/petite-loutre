// Tests v3.2 : saisons (monde vivant). Déterministe par date, pur.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seasonFor, seasonInfo, SEASONS } from '../src/seasons.js';
import { stepSim } from '../src/sim.js';
import { newState } from '../src/state.js';
import { H } from '../src/constants.js';

// Date locale à un mois donné (jour 15 pour éviter tout effet de bord).
const at = (month) => new Date(2026, month, 15, 12, 0, 0);

test('seasonFor : chaque mois tombe dans la bonne saison (hémisphère nord)', () => {
  const expected = [
    'hiver', 'hiver',                 // jan, fév
    'printemps', 'printemps', 'printemps', // mar, avr, mai
    'ete', 'ete', 'ete',             // juin, juil, août
    'automne', 'automne', 'automne', // sep, oct, nov
    'hiver'                          // déc
  ];
  for (let m = 0; m < 12; m++) {
    assert.equal(seasonFor(at(m)), expected[m], 'mois ' + m);
  }
});

test('seasonFor : les 4 saisons sont couvertes sur l\'année', () => {
  const set = new Set();
  for (let m = 0; m < 12; m++) set.add(seasonFor(at(m)));
  assert.deepEqual([...set].sort(), ['automne', 'ete', 'hiver', 'printemps']);
});

test('seasonInfo : renvoie les métadonnées complètes de la saison', () => {
  const info = seasonInfo(at(6)); // juillet -> été
  assert.equal(info.key, 'ete');
  assert.equal(info.label, 'Été');
  assert.ok(info.emoji && info.day && info.card);
});

test('chaque saison : palette jour valide, carte narrative complète', () => {
  for (const key of Object.keys(SEASONS)) {
    const s = SEASONS[key];
    assert.equal(s.key, key, key + ' : clé cohérente');
    assert.ok(s.label && s.emoji, key + ' : label + emoji');
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.day.hill), key + ' : couleur colline jour valide');
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.day.hill2), key + ' : couleur colline2 jour valide');
    const c = s.card;
    assert.ok(c && c.title && c.cta, key + ' : carte titrée');
    assert.ok(Array.isArray(c.lines) && c.lines.length > 0, key + ' : carte a du texte');
    // ambient : soit null, soit un des trois types connus
    assert.ok(s.ambient === null || ['petales', 'feuilles', 'neige'].includes(s.ambient),
      key + ' : ambiance connue');
  }
});

test('teinte nuit d\'hiver présente (la neige reste visible sous la lune)', () => {
  assert.ok(SEASONS.hiver.night, 'hiver a une teinte nuit');
  assert.ok(/^#[0-9a-f]{6}$/i.test(SEASONS.hiver.night.hill), 'colline nuit valide');
  // les autres saisons gardent la palette nuit par défaut (pas d'override)
  assert.equal(SEASONS.ete.night, null);
});

/* ---------------- effets de saison sur la santé (v3.4) ---------------- */

const WINTER = new Date(2026, 0, 15, 12).getTime(); // janvier
const SUMMER = new Date(2026, 6, 15, 12).getTime(); // juillet
const SPRING = new Date(2026, 3, 15, 12).getTime(); // avril (neutre)

// Loutre bébé éveillée en pleine forme, sans caca parasite pendant le pas.
function otter(simNow, over = {}) {
  const s = newState(0);
  Object.assign(s, {
    stage: 'baby', hatchedAt: simNow - 1000, sleeping: false, sick: false,
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 80,
    poops: [], nextPoop: Number.POSITIVE_INFINITY
  }, over);
  return s;
}

test('hiver : le froid augmente le risque de maladie (même hasard)', () => {
  const rnd = () => 0.015; // entre la base (0.004) et le risque hivernal (~0.024)
  const w = otter(WINTER); stepSim(w, H, { simNow: WINTER, rnd });
  const e = otter(SUMMER); stepSim(e, H, { simNow: SUMMER, rnd });
  assert.equal(w.sick, true, 'attrape froid l\'hiver');
  assert.equal(e.sick, false, 'pas malade l\'été avec le même tirage');
});

test('hiver : affaiblie, elle attrape froid là où en forme elle résiste', () => {
  const rnd = () => 0.04; // au-dessus du risque « en forme », sous celui « affaiblie »
  const strong = otter(WINTER, { energy: 80, hunger: 80 });
  stepSim(strong, H, { simNow: WINTER, rnd });
  const weak = otter(WINTER, { energy: 20, hunger: 20 });
  stepSim(weak, H, { simNow: WINTER, rnd });
  assert.equal(strong.sick, false, 'en forme, elle tient');
  assert.equal(weak.sick, true, 'affaiblie, le froid la gagne');
});

test('été : la chaleur accélère la soif (faim) et la fatigue', () => {
  const rnd = () => 0.99; // jamais malade
  const summer = otter(SUMMER); stepSim(summer, H, { simNow: SUMMER, rnd });
  const spring = otter(SPRING); stepSim(spring, H, { simNow: SPRING, rnd });
  assert.ok(summer.hunger < spring.hunger, 'la faim descend plus vite l\'été');
  assert.ok(summer.energy < spring.energy, 'l\'énergie descend plus vite l\'été');
});

test('été : elle surchauffe et perd de la santé si elle n\'est pas rafraîchie', () => {
  const rnd = () => 0.99;
  const summer = otter(SUMMER, { clean: 20 }); stepSim(summer, H, { simNow: SUMMER, rnd });
  const spring = otter(SPRING, { clean: 20 }); stepSim(spring, H, { simNow: SPRING, rnd });
  assert.ok(summer.health < 80, 'surchauffe -> la santé baisse l\'été');
  assert.equal(spring.health, 80, 'aucun malus de chaleur au printemps');
});

test('printemps : saison neutre, décroissance de base (repère)', () => {
  const rnd = () => 0.99;
  const spring = otter(SPRING); stepSim(spring, H, { simNow: SPRING, rnd });
  assert.equal(Math.round(spring.hunger), 74, '80 - 6/h de base');
  assert.equal(spring.health, 86, 'bien soignée -> régénère (+6)');
});
