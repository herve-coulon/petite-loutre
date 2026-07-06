// Tests du moteur pur (node --test, zéro dépendance).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { H, MIN, HATCH_MS, CHILD_AT, ADULT_AT, SAVE_KEY } from '../src/constants.js';
import { newState, saveState, loadState, clearSave } from '../src/state.js';
import { stepSim, simulateOffline, stageFor, ageMs } from '../src/sim.js';
import { newGame, tickGame, clickGame, GAME_DURATION } from '../src/minigame.js';
import { PAL, SPRITES } from '../src/sprites.js';

const T0 = 1_750_000_000_000; // horloge fixe
const noLuck = () => 0.99;    // jamais malade
const rndFix = () => 0.5;

function babyState(over = {}) {
  const s = newState(T0, rndFix);
  s.stage = 'baby';
  s.hatchedAt = T0;
  s.nextPoop = T0 + 100 * H; // pas de caca pendant le test
  return Object.assign(s, over);
}

/* ---------- état & persistance ---------- */

test('newState : œuf sain', () => {
  const s = newState(T0, rndFix);
  assert.equal(s.stage, 'egg');
  assert.equal(s.gameOver, false);
  assert.ok(s.nextPoop > T0);
});

test('saveState/loadState : aller-retour', () => {
  const mem = {};
  const storage = {
    setItem: (k, v) => { mem[k] = v; },
    getItem: k => mem[k] ?? null,
    removeItem: k => { delete mem[k]; }
  };
  const s = babyState({ name: 'Kiwi' });
  assert.equal(saveState(s, storage, T0 + 1000), true);
  const back = loadState(storage);
  assert.equal(back.name, 'Kiwi');
  assert.equal(back.lastTick, T0 + 1000);
  clearSave(storage);
  assert.equal(loadState(storage), null);
});

test('loadState : migration v1 -> v2', () => {
  const mem = { [SAVE_KEY]: JSON.stringify({ ...babyState({ name: 'Vieille' }), v: 1 }) };
  const storage = { getItem: k => mem[k] ?? null, setItem: () => {}, removeItem: () => {} };
  const back = loadState(storage);
  assert.equal(back.v, 2);
  assert.equal(back.name, 'Vieille');
});

test('loadState : sauvegarde corrompue -> null', () => {
  const storage = { getItem: () => '{pas du json', setItem: () => {}, removeItem: () => {} };
  assert.equal(loadState(storage), null);
});

/* ---------- œuf & éclosion ---------- */

test('œuf : ne se dégrade pas', () => {
  const s = newState(T0, rndFix);
  stepSim(s, 5 * H, { simNow: T0 + 60 * 1000, rnd: noLuck }); // pas encore l heure
  assert.equal(s.stage, 'egg');
  assert.equal(s.hunger, 80);
});

test('œuf : éclot après HATCH_MS', () => {
  const s = newState(T0, rndFix);
  const ev = stepSim(s, 1000, { simNow: T0 + HATCH_MS + 1, rnd: noLuck });
  assert.equal(s.stage, 'baby');
  assert.ok(ev.some(e => e.type === 'hatch'));
  assert.equal(s.hatchedAt, T0 + HATCH_MS + 1);
});

/* ---------- décroissance ---------- */

test('éveillée 10 h : décroissance exacte', () => {
  const s = babyState();
  stepSim(s, 10 * H, { simNow: T0 + 10 * H, rnd: noLuck });
  assert.equal(Math.round(s.hunger), 20);  // 80 - 6*10
  assert.equal(Math.round(s.fun), 30);     // 80 - 5*10
  assert.equal(Math.round(s.energy), 50);  // 80 - 3*10
  assert.equal(Math.round(s.clean), 75);   // 100 - 2.5*10
});

test('les jauges ne passent jamais sous 0', () => {
  const s = babyState();
  stepSim(s, 500 * H, { simNow: T0 + 500 * H, rnd: noLuck });
  for (const k of ['hunger', 'fun', 'energy', 'clean', 'health']) {
    assert.ok(s[k] >= 0 && s[k] <= 100 && !Number.isNaN(s[k]), k + '=' + s[k]);
  }
});

/* ---------- sommeil ---------- */

test('sommeil : régénère l énergie, réveil à 100', () => {
  const s = babyState({ sleeping: true, energy: 90 });
  const ev = stepSim(s, 1 * H, { simNow: T0 + H, rnd: noLuck });
  assert.equal(s.sleeping, false);
  assert.equal(s.energy, 100);
  assert.ok(ev.some(e => e.type === 'wake'));
});

test('énergie à 0 : endormissement automatique', () => {
  const s = babyState({ energy: 1 });
  const ev = stepSim(s, 1 * H, { simNow: T0 + H, rnd: noLuck });
  assert.equal(s.sleeping, true);
  assert.ok(ev.some(e => e.type === 'autosleep'));
});

/* ---------- cacas & maladie ---------- */

test('caca : apparaît à l échéance', () => {
  const s = babyState({ nextPoop: T0 + 1 });
  stepSim(s, 1000, { simNow: T0 + 1000, rnd: noLuck });
  assert.equal(s.poops.length, 1);
  assert.ok(s.nextPoop > T0 + 1000);
});

test('maladie : déclenchée quand la malchance frappe', () => {
  const s = babyState();
  const ev = stepSim(s, 1 * H, { simNow: T0 + H, rnd: () => 0 });
  assert.equal(s.sick, true);
  assert.ok(ev.some(e => e.type === 'sick'));
});

/* ---------- santé, mort, croissance ---------- */

test('négligence totale : la santé chute puis mort', () => {
  const s = babyState({ hunger: 0, clean: 0, sick: true, health: 5 });
  const ev = stepSim(s, 1 * H, { simNow: T0 + H, rnd: noLuck });
  assert.equal(s.gameOver, true);
  assert.equal(s.diedAt, T0 + H);
  assert.ok(ev.some(e => e.type === 'die'));
});

test('bonne santé : régénération', () => {
  const s = babyState({ health: 50 });
  stepSim(s, 1 * H, { simNow: T0 + H, rnd: noLuck });
  assert.equal(s.health, 56); // +6/h
});

test('croissance : bébé -> jeune -> adulte', () => {
  assert.equal(stageFor(CHILD_AT - 1), 'baby');
  assert.equal(stageFor(CHILD_AT), 'child');
  assert.equal(stageFor(ADULT_AT), 'adult');

  const s = babyState({ hatchedAt: T0 - CHILD_AT });
  const ev = stepSim(s, 1000, { simNow: T0 + 1000, rnd: noLuck });
  assert.equal(s.stage, 'child');
  assert.ok(ev.some(e => e.type === 'evolve' && e.stage === 'child'));
});

test('ageMs : figé à la mort', () => {
  const s = babyState({ diedAt: T0 + 5 * H });
  assert.equal(ageMs(s, T0 + 100 * H), 5 * H);
});

/* ---------- rattrapage hors-ligne ---------- */

test('hors-ligne 10 h : même décroissance qu en direct', () => {
  const s = babyState();
  s.lastTick = T0;
  const { elapsed } = simulateOffline(s, T0 + 10 * H, noLuck);
  assert.equal(elapsed, 10 * H);
  assert.equal(Math.round(s.hunger), 20);
  assert.equal(s.lastTick, T0 + 10 * H);
});

test('hors-ligne : œuf éclot pendant l absence', () => {
  const s = newState(T0, rndFix);
  s.lastTick = T0;
  const { events } = simulateOffline(s, T0 + 10 * MIN, noLuck);
  assert.equal(s.stage, 'baby');
  assert.ok(events.some(e => e.type === 'hatch'));
});

test('hors-ligne : abandon prolongé -> la loutre meurt', () => {
  const s = babyState();
  s.lastTick = T0;
  const { events } = simulateOffline(s, T0 + 6 * 24 * H, noLuck);
  assert.equal(s.gameOver, true);
  assert.ok(events.some(e => e.type === 'die'));
});

test('hors-ligne : rattrapage plafonné à MAX_OFFLINE', () => {
  const s = babyState({ sleeping: true }); // dort : survit longtemps
  s.lastTick = T0;
  const before = Date.now();
  simulateOffline(s, T0 + 300 * 24 * H, noLuck); // 300 jours
  assert.ok(Date.now() - before < 5000, 'la simulation doit rester rapide');
});

/* ---------- mini-jeu ---------- */

test('pêche : spawn, capture, fin', () => {
  const mg = newGame(T0);
  assert.equal(tickGame(mg, T0 + 700, () => 0.5), null);
  assert.ok(mg.fish, 'un poisson doit apparaître');
  const { x, y } = mg.fish;
  assert.equal(clickGame(mg, x - 100, y, 4), false, 'raté loin du poisson');
  assert.ok(mg.fish, 'toujours là après un raté');
  assert.equal(clickGame(mg, x + 5, y + 2, 4), true, 'attrapé');
  assert.equal(mg.score, 1);
  const end = tickGame(mg, T0 + GAME_DURATION + 1, () => 0.5);
  assert.equal(end.type, 'end');
  assert.equal(end.score, 1);
});

test('pêche : hitbox élargie au doigt', () => {
  const mg = newGame(T0);
  tickGame(mg, T0 + 700, () => 0.5);
  const { x, y } = mg.fish;
  assert.equal(clickGame(mg, x - 7, y - 7, 8), true, 'tolérance tactile');
});

/* ---------- sprites ---------- */

test('sprites : largeur constante et couleurs connues', () => {
  for (const [name, rows] of Object.entries(SPRITES)) {
    const w = rows[0].length;
    rows.forEach((r, i) => {
      assert.equal(r.length, w, `${name} ligne ${i}`);
      for (const ch of r) {
        assert.ok(ch === '.' || PAL[ch], `${name} ligne ${i} caractère inconnu: ${ch}`);
      }
    });
  }
});
