// Tests v3.3 : toboggan de rivière (2e mini-jeu). Logique pure, horloge + hasard injectés.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newSlide, setSlideLane, laneAt, tickSlide,
  SLIDE_DURATION, LANES, LANE_X, SLIDE_OTTER_Y
} from '../src/toboggan.js';

const T0 = 1_750_000_000_000;
// hasard scénarisé : consomme une liste de valeurs, puis 0.
const seq = (vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0); };

test('newSlide : état initial cohérent, couloir central', () => {
  const mg = newSlide(T0);
  assert.equal(mg.mode, 'slide');
  assert.equal(mg.lane, 1);
  assert.equal(mg.score, 0);
  assert.equal(mg.bumps, 0);
  assert.deepEqual(mg.items, []);
  assert.equal(mg.endsAt, T0 + SLIDE_DURATION);
});

test('setSlideLane : borne le couloir dans [0, LANES-1]', () => {
  const mg = newSlide(T0);
  setSlideLane(mg, 2); assert.equal(mg.lane, 2);
  setSlideLane(mg, 5); assert.equal(mg.lane, LANES - 1);
  setSlideLane(mg, -3); assert.equal(mg.lane, 0);
});

test('laneAt : chaque abscisse tombe dans le bon couloir', () => {
  assert.equal(laneAt(LANE_X[0]), 0);
  assert.equal(laneAt(LANE_X[1]), 1);
  assert.equal(laneAt(LANE_X[2]), 2);
  assert.equal(laneAt(0), 0);
  assert.equal(laneAt(159), 2);
});

test('un poisson gobé dans le bon couloir monte le score une seule fois', () => {
  const mg = newSlide(T0);
  // force l'apparition d'un poisson (rnd: kind<ROCK_P?rock : sinon fish ; lane)
  // 0.9 -> fish (>=0.42), 0.0 -> lane 0
  tickSlide(mg, T0 + 500, seq([0.9, 0.0]));
  assert.equal(mg.items.length, 1);
  assert.equal(mg.items[0].kind, 'fish');
  assert.equal(mg.items[0].lane, 0);

  setSlideLane(mg, 0); // on se met dans son couloir
  // on avance le temps jusqu'à ce que le poisson franchisse la loutre
  let guard = 0;
  while (mg.score === 0 && guard++ < 500) tickSlide(mg, T0 + 500 + guard * 16, seq([0.99]));
  assert.equal(mg.score, 1, 'poisson compté');
  // il ne doit pas recompter aux frames suivantes
  const before = mg.score;
  for (let k = 0; k < 5; k++) tickSlide(mg, T0 + 9000 + k * 16, seq([0.99]));
  assert.equal(mg.score, before, 'pas de double comptage');
});

test('un rocher dans le mauvais couloir est esquivé (pas de bump)', () => {
  const mg = newSlide(T0);
  tickSlide(mg, T0 + 500, seq([0.1, 0.0])); // 0.1 -> rock, lane 0
  assert.equal(mg.items[0].kind, 'rock');
  setSlideLane(mg, 2); // on esquive en changeant de couloir
  let guard = 0;
  while (mg.items.length && guard++ < 500) tickSlide(mg, T0 + 500 + guard * 16, seq([0.99, 0.5]));
  assert.equal(mg.bumps, 0, 'rocher esquivé -> aucun choc');
});

test('un rocher dans le bon couloir provoque un choc', () => {
  const mg = newSlide(T0);
  tickSlide(mg, T0 + 500, seq([0.1, 0.0])); // rock, lane 0
  setSlideLane(mg, 0); // on reste dessus
  let guard = 0;
  while (mg.bumps === 0 && guard++ < 500) tickSlide(mg, T0 + 500 + guard * 16, seq([0.99]));
  assert.equal(mg.bumps, 1, 'choc enregistré');
  assert.ok(mg.bumpAt > 0, 'horodatage du choc posé (pour le flash)');
});

test('la partie se termine à endsAt et renvoie score + bumps', () => {
  const mg = newSlide(T0);
  mg.score = 3; mg.bumps = 1;
  const res = tickSlide(mg, T0 + SLIDE_DURATION, seq([0.99]));
  assert.deepEqual(res, { type: 'end', score: 3, bumps: 1 });
});

test('déterminisme : même graine -> même déroulé', () => {
  const run = () => {
    const mg = newSlide(T0);
    const r = seq([0.1, 0.2, 0.9, 0.5, 0.3, 0.8, 0.1, 0.7]);
    for (let k = 1; k <= 40; k++) tickSlide(mg, T0 + k * 120, r);
    return mg.items.map(it => it.kind + it.lane).join(',') + '|' + mg.score;
  };
  assert.equal(run(), run());
});

test('la ligne de la loutre est bien dans le canvas', () => {
  assert.ok(SLIDE_OTTER_Y > 0 && SLIDE_OTTER_Y < 120);
  for (const x of LANE_X) assert.ok(x > 16 && x < 144, 'couloir dans les bords');
});
