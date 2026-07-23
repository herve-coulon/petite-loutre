// Toboggan de rivière (2e mini-jeu). Logique pure, horloge + hasard injectés.
// On vérifie surtout ce qui fait le jeu : motifs franchissables, accélération,
// combo, et absence de double comptage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newSlide, setSlideLane, laneAt, tickSlide, spawnPattern,
  slideProgress, slideSpeed,
  SLIDE_DURATION, LANES, LANE_X, SLIDE_OTTER_Y, SLIDE_BOTTOM,
  SPEED_START, SPEED_END, COMBO_STEP, GOLD_POINTS
} from '../src/toboggan.js';

const T0 = 1_750_000_000_000;
// hasard scénarisé : consomme une liste de valeurs, puis 0.
const seq = (vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0); };
// fait descendre les items jusqu'à la loutre, sans plus rien faire apparaître
const settle = (mg, from) => {
  let g = 0;
  while (mg.items.length && g++ < 900) tickSlide(mg, from + g * 16, () => 0.99);
  return g;
};

test('newSlide : état initial cohérent, couloir central', () => {
  const mg = newSlide(T0);
  assert.equal(mg.mode, 'slide');
  assert.equal(mg.lane, 1);
  assert.equal(mg.score, 0);
  assert.equal(mg.bumps, 0);
  assert.equal(mg.combo, 0);
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

test('la descente accélère du début à la fin', () => {
  const mg = newSlide(T0);
  assert.equal(slideProgress(mg, T0), 0);
  assert.equal(slideProgress(mg, T0 + SLIDE_DURATION), 1);
  assert.ok(slideProgress(mg, T0 + 2 * SLIDE_DURATION) <= 1, 'progression bornée');
  assert.equal(slideSpeed(mg, T0), SPEED_START);
  assert.equal(slideSpeed(mg, T0 + SLIDE_DURATION), SPEED_END);
  assert.ok(slideSpeed(mg, T0 + SLIDE_DURATION / 2) > SPEED_START, 'ça s\'emballe');
  assert.ok(SPEED_END > SPEED_START);
});

test('motif « mur de rochers » : il reste TOUJOURS une trouée', () => {
  for (let g = 0; g < LANES; g++) {
    const mg = newSlide(T0);
    // 0.1 -> mur ; puis la valeur qui choisit la trouée
    spawnPattern(mg, seq([0.1, g / LANES + 0.01]));
    const rocks = mg.items.filter(it => it.kind === 'rock').map(it => it.lane);
    assert.equal(rocks.length, LANES - 1, 'un mur laisse un passage');
    const free = [0, 1, 2].filter(l => !rocks.includes(l));
    assert.equal(free.length, 1, 'exactement une trouée');
  }
});

test('motif « chapelet » : plusieurs poissons alignés dans le même couloir', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.3, 0.0]));            // 0.3 -> chapelet, couloir 0
  const fish = mg.items.filter(it => it.kind === 'fish');
  assert.ok(fish.length >= 3, 'un chapelet, pas un poisson isolé');
  assert.ok(fish.every(f => f.lane === fish[0].lane), 'tous dans le même couloir');
  const ys = fish.map(f => f.y);
  assert.equal(new Set(ys).size, ys.length, 'échelonnés, pas superposés');
});

test('un poisson gobé monte le score une seule fois', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.8, 0.0]));            // poisson isolé, couloir 0
  assert.equal(mg.items.length, 1);
  setSlideLane(mg, 0);
  settle(mg, T0);
  assert.equal(mg.score, 1, 'poisson compté');
  const before = mg.score;
  for (let k = 0; k < 5; k++) tickSlide(mg, T0 + 30000 + k * 16, () => 0.99);
  assert.equal(mg.score, before, 'pas de double comptage');
});

test('un rocher esquivé ne coûte rien ; pris, il choque et brise le combo', () => {
  const dodge = newSlide(T0);
  spawnPattern(dodge, seq([0.6, 0.0]));         // rocher isolé, couloir 0
  setSlideLane(dodge, 2);
  settle(dodge, T0);
  assert.equal(dodge.bumps, 0, 'rocher esquivé');

  const hit = newSlide(T0);
  hit.combo = 4;                                 // un bel élan…
  spawnPattern(hit, seq([0.6, 0.0]));
  setSlideLane(hit, 0);
  settle(hit, T0);
  assert.equal(hit.bumps, 1, 'choc enregistré');
  assert.ok(hit.bumpAt > 0, 'horodatage du choc (pour le flash)');
  assert.equal(hit.combo, 0, '…brisé par le rocher');
});

test('combo : enchaîner rapporte plus que la même quantité en pointillé', () => {
  const mg = newSlide(T0);
  setSlideLane(mg, 0);
  // 6 poissons d'affilée dans le couloir 0
  for (let k = 0; k < 6; k++) spawnPattern(mg, seq([0.8, 0.0]));
  settle(mg, T0);
  assert.equal(mg.combo, 6);
  assert.equal(mg.bestCombo, 6);
  assert.ok(mg.score > 6, 'le bonus d\'élan doit s\'ajouter : ' + mg.score);
  // le bonus démarre au palier
  assert.equal(mg.score, 6 + [1, 2, 3, 4, 5, 6].reduce((a, c) => a + Math.floor(c / COMBO_STEP), 0));
});

test('poisson doré : gros bonus et horodatage pour l\'éclat', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.99, 0.0]));           // 0.99 -> doré, couloir 0
  assert.equal(mg.items[0].kind, 'gold');
  setSlideLane(mg, 0);
  settle(mg, T0);
  assert.equal(mg.score, GOLD_POINTS);
  assert.ok(mg.goldAt > 0);
});

test('la partie se termine à endsAt et renvoie score, bumps et meilleur combo', () => {
  const mg = newSlide(T0);
  mg.score = 3; mg.bumps = 1; mg.bestCombo = 4;
  const res = tickSlide(mg, T0 + SLIDE_DURATION, () => 0.99);
  assert.deepEqual(res, { type: 'end', score: 3, bumps: 1, bestCombo: 4 });
});

test('déterminisme : même graine -> même déroulé', () => {
  const run = () => {
    const mg = newSlide(T0);
    const r = seq([0.1, 0.2, 0.9, 0.5, 0.3, 0.8, 0.1, 0.7, 0.4, 0.6]);
    for (let k = 1; k <= 40; k++) tickSlide(mg, T0 + k * 120, r);
    return mg.items.map(it => it.kind + it.lane).join(',') + '|' + mg.score;
  };
  assert.equal(run(), run());
});

test('la piste occupe bien le plein écran (et non l\'ancien format court)', () => {
  assert.ok(SLIDE_OTTER_Y > 200, 'la loutre est en bas de l\'écran plein format');
  assert.ok(SLIDE_BOTTOM > SLIDE_OTTER_Y, 'les items sortent sous la loutre');
  for (const x of LANE_X) assert.ok(x > 16 && x < 144, 'couloir dans les bords');
});
