// Tests v3.1 : fil narratif (chapitres), premiers pas guidés, éclosion cinématique.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newState, loadState, saveRecords } from '../src/state.js';
import { BEATS, nextBeat, markSeen, coachStep, COACH_STEPS } from '../src/story.js';
import { eggCrackLevel } from '../src/render.js';

const T0 = 1_750_000_000_000;

/* ---------------- chapitres narratifs ---------------- */

test('aucun chapitre tant que l\'œuf n\'a pas éclos', () => {
  const s = newState(T0);              // stage 'egg', pas de nom
  assert.equal(nextBeat(s), null);
});

test('naissance : le Chapitre 1 apparaît dès que la loutre a un nom', () => {
  const s = newState(T0);
  s.stage = 'baby';
  s.name = 'Nout';
  const b = nextBeat(s);
  assert.equal(b.id, 'naissance');
});

test('un chapitre ne se joue qu\'une fois (mémorisé dans storySeen)', () => {
  const s = newState(T0);
  s.stage = 'baby'; s.name = 'Nout';
  const b = nextBeat(s);
  markSeen(s, b.id);
  assert.equal(nextBeat(s), null, 'plus de naissance après l\'avoir vu');
  assert.deepEqual(s.storySeen, ['naissance']);
  markSeen(s, b.id); // idempotent
  assert.deepEqual(s.storySeen, ['naissance']);
});

test('cascade : chapitres joués dans l\'ordre, un par un, même après un saut d\'étape', () => {
  const s = newState(T0);
  s.stage = 'adult'; s.name = 'Nout'; // revient adulte sans avoir vu les chapitres
  assert.equal(nextBeat(s).id, 'naissance');
  markSeen(s, 'naissance');
  assert.equal(nextBeat(s).id, 'jeune');
  markSeen(s, 'jeune');
  assert.equal(nextBeat(s).id, 'adulte');
  markSeen(s, 'adulte');
  assert.equal(nextBeat(s), null);
});

test('pas de chapitre chez le héron ni après un départ', () => {
  const s = newState(T0);
  s.stage = 'child'; s.name = 'Nout';
  s.away = true;
  assert.equal(nextBeat(s), null);
  s.away = false; s.gameOver = true;
  assert.equal(nextBeat(s), null);
});

test('chaque beat a id, titre, lignes et cta', () => {
  for (const b of BEATS) {
    assert.ok(b.id && b.title && b.cta, b.id + ' : métadonnées complètes');
    assert.ok(Array.isArray(b.lines) && b.lines.length > 0, b.id + ' : au moins une ligne');
    assert.equal(typeof b.when, 'function');
  }
});

/* ---------------- premiers pas guidés ---------------- */

test('coach : rien tant que l\'œuf n\'a pas éclos et reçu un nom', () => {
  const s = newState(T0);
  assert.equal(coachStep(s), null);          // œuf
  s.stage = 'baby';
  assert.equal(coachStep(s), null);          // pas encore de nom
});

test('coach : séquence manger -> jouer -> laver, puis terminé', () => {
  const s = newState(T0);
  s.stage = 'baby'; s.name = 'Nout';
  assert.equal(coachStep(s).target, 'b-feed');
  s.fed = 1;
  assert.equal(coachStep(s).target, 'b-play');
  s.played = 1;
  assert.equal(coachStep(s).target, 'b-wash');
  s.washed = 1;
  assert.equal(coachStep(s), null, 'les trois bases acquises -> tutoriel fini');
});

test('coach : chaque étape pointe un bouton distinct existant', () => {
  const targets = COACH_STEPS.map(st => st.target);
  assert.deepEqual(targets, ['b-feed', 'b-play', 'b-wash']);
  assert.equal(new Set(targets).size, 3);
});

/* ---------------- état : storySeen & coach persistés/normalisés ---------------- */

test('newState démarre avec storySeen vide et coach actif', () => {
  const s = newState(T0);
  assert.deepEqual(s.storySeen, []);
  assert.equal(s.coach, true);
});

test('normalisation d\'une vieille sauvegarde : champs narratifs comblés', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  // sauvegarde d'avant v3.1 (pas de storySeen/coach), loutre déjà adulte
  const old = newState(T0);
  delete old.storySeen; delete old.coach; old.stage = 'adult';
  mem.set('petite_loutre_v2', JSON.stringify(old));
  const s = loadState(storage);
  assert.deepEqual(s.storySeen, [], 'storySeen recréé');
  assert.equal(s.coach, false, 'adulte pré-existant : pas de tutoriel rétroactif');
});

/* ---------------- éclosion cinématique ---------------- */

test('eggCrackLevel : intact -> fissuré au fil de la progression', () => {
  assert.equal(eggCrackLevel(0), 0);
  assert.equal(eggCrackLevel(0.5), 0);
  assert.equal(eggCrackLevel(0.55), 1);
  assert.equal(eggCrackLevel(0.82), 2);
  assert.equal(eggCrackLevel(0.97), 3);
  assert.equal(eggCrackLevel(1), 3);
});

test('eggCrackLevel : monotone croissant', () => {
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.02) {
    const lv = eggCrackLevel(p);
    assert.ok(lv >= prev, 'ne redescend jamais à p=' + p.toFixed(2));
    prev = lv;
  }
});
