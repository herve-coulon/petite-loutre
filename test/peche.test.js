// Pêche : l'annonce rend le jeu juste, le combo récompense l'enchaînement,
// et les dorés valent gros. Logique pure (horloge + hasard injectés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, tickGame, clickGame, fishProgress, firstFish,
  GAME_DURATION, WATER_Y, TELL_MS, COMBO_STEP, GOLD_POINTS, MAX_IN_AIR
} from '../src/minigame.js';

const T0 = 1_750_000_000_000;
const seq = (vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); };

// fait naître un poisson (annonce + jaillissement) et le renvoie
function pop(mg, at, rnd = () => 0.5) {
  tickGame(mg, at, rnd);
  tickGame(mg, at + TELL_MS + 1, rnd);
  return firstFish(mg);
}

test('équité : tout poisson est ANNONCÉ avant de jaillir', () => {
  const mg = newGame(T0);
  tickGame(mg, T0 + 500, () => 0.5);
  assert.equal(mg.fishes.length, 0, 'rien ne jaillit sans annonce');
  assert.equal(mg.tells.length, 1);
  const t = mg.tells[0];
  // juste avant l'échéance : toujours rien
  tickGame(mg, t.at + TELL_MS - 5, () => 0.5);
  assert.equal(mg.fishes.length, 0);
  // à l'échéance : il jaillit, au bon endroit
  tickGame(mg, t.at + TELL_MS + 1, () => 0.5);
  assert.equal(mg.fishes.length, 1);
  assert.equal(mg.fishes[0].baseX, t.x);
});

test('le poisson décrit un arc : il sort de l\'eau puis y retombe', () => {
  const mg = newGame(T0);
  const f = pop(mg, T0 + 500);
  const t0 = f.start, span = f.until - f.start;
  tickGame(mg, t0 + span * 0.5, () => 0.5);          // au sommet
  const top = firstFish(mg).y;
  assert.ok(top < WATER_Y - 20, 'il monte bien au-dessus de l\'eau : ' + top);
  tickGame(mg, t0 + span * 0.95, () => 0.5);         // presque retombé
  assert.ok(firstFish(mg).y > top, 'il redescend');
});

test('un poisson manqué brise l\'élan et compte comme raté', () => {
  const mg = newGame(T0);
  mg.combo = 4;
  const f = pop(mg, T0 + 500);
  tickGame(mg, f.until + 10, () => 0.5);
  assert.equal(mg.fishes.length, 0, 'il a replongé');
  assert.equal(mg.missed, 1);
  assert.equal(mg.combo, 0, 'l\'élan est brisé');
  assert.ok(mg.missAt > 0);
});

test('combo : enchaîner rapporte plus que le même nombre de prises isolées', () => {
  const mg = newGame(T0);
  let at = T0 + 500;
  for (let k = 0; k < 6; k++) {
    const f = pop(mg, at);
    assert.ok(f, 'poisson ' + k);
    assert.equal(clickGame(mg, f.x + 5, f.y + 2, 6), true);
    at += 1500;
  }
  assert.equal(mg.caught, 6);
  assert.equal(mg.bestCombo, 6);
  const attendu = [1, 2, 3, 4, 5, 6].reduce((a, c) => a + 1 + Math.floor(c / COMBO_STEP), 0);
  assert.equal(mg.score, attendu, 'le bonus d\'élan doit s\'ajouter');
  assert.ok(mg.score > 6);
});

test('poisson doré : gros bonus, saut plus court', () => {
  const mg = newGame(T0);
  // rnd < 0.12 -> doré ; on scénarise l'annonce
  tickGame(mg, T0 + 500, seq([0.05, 0.5]));
  assert.equal(mg.tells[0].kind, 'gold');
  tickGame(mg, T0 + 500 + TELL_MS + 1, seq([0.5, 0.5, 0.5]));
  const f = firstFish(mg);
  assert.equal(f.kind, 'gold');
  assert.ok(f.jumpH < 80, 'le doré saute plus bas, donc plus vite à saisir');
  assert.equal(clickGame(mg, f.x + 5, f.y + 2, 6), true);
  assert.equal(mg.score, GOLD_POINTS);
  assert.ok(mg.goldAt > 0);
});

test('plusieurs poissons peuvent être en l\'air, mais pas une nuée', () => {
  const mg = newGame(T0);
  let at = T0 + 500;
  for (let k = 0; k < 12; k++) { tickGame(mg, at, () => 0.5); at += 60; }
  assert.ok(mg.fishes.length + mg.tells.length <= MAX_IN_AIR,
    'jamais plus de ' + MAX_IN_AIR + ' à l\'écran : ' + (mg.fishes.length + mg.tells.length));
});

test('le rythme s\'accélère au fil de la partie', () => {
  const mg = newGame(T0);
  assert.equal(fishProgress(mg, T0), 0);
  assert.equal(fishProgress(mg, T0 + GAME_DURATION), 1);
  assert.ok(fishProgress(mg, T0 + 2 * GAME_DURATION) <= 1, 'borné');
  // l'attente avant la prochaine annonce est plus courte en fin de partie
  const gap = (whenP) => {
    const m = newGame(T0);
    const at = T0 + whenP * GAME_DURATION;
    m.nextTell = at;
    tickGame(m, at, () => 0);
    return m.nextTell - at;
  };
  assert.ok(gap(0.9) < gap(0.0), 'ça se resserre : ' + gap(0.9) + ' vs ' + gap(0.0));
});

test('fin de partie : renvoie points, prises et meilleure série', () => {
  const mg = newGame(T0);
  mg.score = 9; mg.total = 5; mg.caught = 4; mg.bestCombo = 3;
  const end = tickGame(mg, T0 + GAME_DURATION + 1, () => 0.5);
  assert.deepEqual(end, { type: 'end', score: 9, total: 5, caught: 4, bestCombo: 3 });
});
