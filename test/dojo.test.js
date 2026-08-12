// Le Dojo de parade (v4.0) — logique pure : enchaînement déterministe par jour,
// jugement des parades, combo, score, ceintures et récompense.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOJO_STRIKES, dailyDojo, judgeParry, parryScore, nextCombo,
  dojoMaxScore, beltFor, dojoReward
} from '../src/dojo.js';

test('enchaînement : 8 assauts, déterministe par jour, se durcit', () => {
  const a = dailyDojo('2026-08-03');
  const b = dailyDojo('2026-08-03');
  const c = dailyDojo('2026-08-04');
  assert.equal(a.strikes.length, DOJO_STRIKES);
  assert.deepEqual(a, b, 'même jour → même enchaînement (deux joueurs identiques)');
  assert.notDeepEqual(a, c, 'un autre jour → un autre enchaînement');
  // la fenêtre se resserre globalement (dernier assaut plus serré que le premier)
  assert.ok(a.strikes[DOJO_STRIKES - 1].window < a.strikes[0].window + 120);
  for (const s of a.strikes) { assert.ok(s.windup > 0 && s.window > 0); }
});

test('jugement : parfait au centre, bien dans la fenêtre, raté hors fenêtre', () => {
  const W = 600;
  assert.equal(judgeParry(W, 300), 'perfect');    // pile au centre
  assert.equal(judgeParry(W, 360), 'perfect');    // dans la bande parfaite (±120)
  assert.equal(judgeParry(W, 500), 'good');        // dans la fenêtre mais décentré
  assert.equal(judgeParry(W, 50), 'good');
  assert.equal(judgeParry(W, -10), 'miss');        // trop tôt (pendant l'annonce)
  assert.equal(judgeParry(W, 700), 'miss');        // trop tard
  assert.equal(judgeParry(W, null), 'miss');       // pas de parade
});

test('combo & score : le parfait enchaîné rapporte plus, le raté remet à zéro', () => {
  assert.equal(parryScore('good'), 5);
  assert.equal(parryScore('miss'), 0);
  assert.equal(parryScore('perfect', 0), 10);
  assert.ok(parryScore('perfect', 3) > parryScore('perfect', 0), 'le combo augmente le parfait');
  assert.equal(nextCombo('perfect', 2), 3);
  assert.equal(nextCombo('good', 2), 3);
  assert.equal(nextCombo('miss', 5), 0);
  assert.ok(dojoMaxScore() > DOJO_STRIKES * 10, 'le score max inclut les bonus de combo');
});

test('ceintures : croissent avec le score, blanche à 0, noire au sommet', () => {
  assert.equal(beltFor(0).name, 'blanche');
  assert.equal(beltFor(dojoMaxScore()).name, 'noire');
  const mid = beltFor(Math.round(dojoMaxScore() * 0.6));
  assert.ok(['orange', 'verte'].includes(mid.name));
});

test('récompense : non-puissance, croissante, bornée', () => {
  const zero = dojoReward(0), max = dojoReward(dojoMaxScore());
  assert.ok(max.gems > zero.gems && max.fish > zero.fish && max.xp > zero.xp);
  assert.ok(zero.gems >= 1 && max.gems <= 5);
  for (const r of [zero, max]) assert.ok(!('atq' in r) && !('pv' in r) && !('power' in r));
});
