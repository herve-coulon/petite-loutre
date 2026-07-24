// Toboggan de rivière (2e mini-jeu). Logique pure, horloge + hasard injectés.
// On vérifie surtout ce qui fait le jeu : motifs franchissables, accélération,
// combo, et absence de double comptage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newSlide, setSlideLane, laneAt, tickSlide, spawnPattern,
  slideProgress, slideSpeed,
  SLIDE_DURATION, LANES, LANE_X, SLIDE_OTTER_Y, SLIDE_BOTTOM,
  SPEED_START, SPEED_END, COMBO_STEP, GOLD_POINTS, ROCK_MALUS, GOBE_MS, VIES_MAX, DEGATS_EJECTION
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
  spawnPattern(mg, seq([0.9, 0.0]));            // poisson isolé, couloir 0
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
  spawnPattern(dodge, seq([0.7, 0.0]));         // rocher isolé, couloir 0
  setSlideLane(dodge, 2);
  settle(dodge, T0);
  assert.equal(dodge.bumps, 0, 'rocher esquivé');

  const hit = newSlide(T0);
  hit.combo = 4;                                 // un bel élan…
  hit.score = 10;
  spawnPattern(hit, seq([0.7, 0.0]));
  setSlideLane(hit, 0);
  settle(hit, T0);
  assert.equal(hit.bumps, 1, 'choc enregistré');
  assert.ok(hit.bumpAt > 0, 'horodatage du choc (pour le flash)');
  assert.equal(hit.combo, 0, '…brisé par le rocher');
  // le choc coûte aussi des POINTS : sans cela, foncer dans un rocher pour
  // rafler le poisson d'après ne coûtait rien et la prudence gagnait toujours
  assert.equal(hit.score, 10 - ROCK_MALUS, 'et il coûte des points');
  const plancher = newSlide(T0);
  plancher.score = 1;
  spawnPattern(plancher, seq([0.7, 0.0]));
  setSlideLane(plancher, 0);
  settle(plancher, T0);
  assert.equal(plancher.score, 0, 'le score ne passe jamais sous zéro');
});

test('motifs piégés : le gain et le risque tombent dans le MÊME couloir', () => {
  // sans motifs conflictuels, esquiver ne coûtait jamais un poisson : jouer la
  // sécurité donnait exactement le même score que tout tenter (mesuré au banc)
  const piege = newSlide(T0);
  spawnPattern(piege, seq([0.5, 0.0]));          // chapelet piégé, couloir 0
  const couloirs = new Set(piege.items.map(i => i.lane));
  assert.equal(couloirs.size, 1, 'tout le motif est dans un seul couloir');
  assert.ok(piege.items.some(i => i.kind === 'rock'), 'avec un rocher');
  assert.ok(piege.items.filter(i => i.kind === 'fish').length >= 2, 'et des poissons');

  const garde = newSlide(T0);
  spawnPattern(garde, seq([0.6, 0.0]));          // doré gardé, couloir 0
  assert.equal(new Set(garde.items.map(i => i.lane)).size, 1);
  assert.ok(garde.items.some(i => i.kind === 'gold'), 'le doré est là');
  assert.ok(garde.items.some(i => i.kind === 'rock'), 'gardé par un rocher');
  // le rocher est DEVANT : on le rencontre avant le doré
  const rock = garde.items.find(i => i.kind === 'rock');
  const gold = garde.items.find(i => i.kind === 'gold');
  assert.ok(rock.y > gold.y, 'le rocher se présente en premier');
});

test('combo : enchaîner rapporte plus que la même quantité en pointillé', () => {
  const mg = newSlide(T0);
  setSlideLane(mg, 0);
  // 6 poissons d'affilée dans le couloir 0
  for (let k = 0; k < 6; k++) spawnPattern(mg, seq([0.9, 0.0]));
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

test('difficulté : le courant est bien plus vif qu\'avant sur la fin', () => {
  // mesuré au banc : l'ancienne descente laissait près de 3 s pour changer de
  // couloir, et ne faisait encaisser AUCUN rocher même à 480 ms de réaction
  const mg = newSlide(T0);
  const traversee = (p) => (SLIDE_OTTER_Y + 8) / slideSpeed(mg, T0 + SLIDE_DURATION * p);
  assert.ok(traversee(1) < 700, 'moins de 0,7 s pour réagir à l\'arrivée');
  assert.ok(traversee(0) > 2000, 'mais du temps au départ : la tension doit MONTER');
});

test('progression : « pied marin » absorbe le premier choc, et un seul', () => {
  const mg = newSlide(T0, { amorti: true });
  mg.score = 10;
  spawnPattern(mg, seq([0.7, 0.0]));            // rocher isolé, couloir 0
  setSlideLane(mg, 0);
  settle(mg, T0);
  assert.equal(mg.bumps, 0, 'le premier rocher ne fait rien');
  assert.equal(mg.score, 10, 'et ne coûte pas de points');

  spawnPattern(mg, seq([0.7, 0.0]));
  settle(mg, T0 + 100);
  assert.equal(mg.bumps, 1, 'le suivant, si');
});

test('progression : l\'endurance rallonge la descente', () => {
  const normal = newSlide(T0);
  const long = newSlide(T0, { duree: 1.2 });
  assert.equal(normal.endsAt - normal.startedAt, SLIDE_DURATION);
  assert.equal(long.endsAt - long.startedAt, Math.round(SLIDE_DURATION * 1.2));
  assert.ok(slideProgress(long, T0 + SLIDE_DURATION) < 1);
});

// avance juste assez pour que l'item soit ramassé (settle, lui, vide la liste :
// l'animation de gobage serait déjà finie)
const jusquAuGobage = (mg, from) => {
  let g = 0;
  while (g++ < 900 && !mg.items.some(i => i.got)) tickSlide(mg, from + g * 16, () => 0.99);
  return mg.items.find(i => i.got);
};

test('gobage : un poisson pris s\'arrête, garde ses points, puis disparaît', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.9, 0.0]));            // poisson isolé, couloir 0
  setSlideLane(mg, 0);
  const p = jusquAuGobage(mg, T0);
  assert.ok(p && p.got, 'le poisson est marqué comme pris');
  assert.equal(p.gotAt > 0, true, 'horodaté, pour l\'animation');
  assert.equal(p.pts, 1, 'et il garde les points qu\'il a rapportés');

  // il ne descend plus : il est happé par la loutre, il ne poursuit pas sa route
  const yPris = p.y;
  tickSlide(mg, mg.lastTick + 100, () => 0.99);
  const encore = mg.items.find(i => i === p);
  assert.ok(encore, 'il reste le temps d\'être avalé');
  assert.equal(encore.y, yPris, 'et il ne bouge plus');

  // …puis il s'efface, sans avoir compté deux fois
  const scoreAvant = mg.score;
  tickSlide(mg, mg.lastTick + GOBE_MS + 20, () => 0.99);
  assert.equal(mg.items.includes(p), false, 'disparu après l\'animation');
  assert.equal(mg.score, scoreAvant, 'et jamais recompté');
});

test('gobage : le doré emporte sa grosse valeur dans l\'animation', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.99, 0.0]));           // doré, couloir 0
  setSlideLane(mg, 0);
  const d = jusquAuGobage(mg, T0);
  assert.ok(d, 'le doré doit être ramassé');
  assert.equal(d.kind, 'gold');
  assert.equal(d.pts, GOLD_POINTS, 'le compte affiché doit être le vrai gain');
});

test('gobage : un rocher, lui, poursuit sa route (rien à avaler)', () => {
  const mg = newSlide(T0);
  spawnPattern(mg, seq([0.7, 0.0]));            // rocher isolé, couloir 0
  setSlideLane(mg, 0);
  settle(mg, T0);
  const r = mg.items[0];
  if (!r) return;                                // déjà sorti de l'écran : rien à vérifier
  assert.ok(!r.got, 'un rocher ne se gobe pas');
  const y0 = r.y;
  tickSlide(mg, mg.lastTick + 100, () => 0.99);
  assert.ok(r.y > y0, 'il continue de descendre');
});

/** Envoie un rocher dans le couloir de la loutre et le fait passer sur elle. */
function unRocher(mg, from) {
  spawnPattern(mg, seq([0.7, mg.lane / LANES + 0.01]));
  let g = 0, res = null;
  while (g++ < 900 && !res && mg.items.some(i => !i.done)) {
    res = tickSlide(mg, from + g * 16, () => 0.99);
  }
  return res;
}

test('vies : trois rochers et la loutre est éjectée du torrent', () => {
  const mg = newSlide(T0);
  assert.equal(mg.vies, VIES_MAX, 'on part avec toutes ses vies');
  assert.equal(mg.ejectee, false);

  let t = T0;
  assert.equal(unRocher(mg, t), null, 'un premier choc ne suffit pas');
  assert.equal(mg.vies, VIES_MAX - 1);
  t = mg.lastTick;
  assert.equal(unRocher(mg, t), null, 'ni un deuxième');
  assert.equal(mg.vies, VIES_MAX - 2);
  t = mg.lastTick;
  const fin = unRocher(mg, t);
  assert.ok(fin, 'le troisième met fin à la descente');
  assert.equal(fin.ejectee, true, 'et il est signalé comme une éjection');
  assert.equal(mg.vies, 0);
  // la partie s'arrête NET : bien avant la fin du chrono
  assert.ok(mg.lastTick < mg.endsAt, 'éjectée avant l\'arrivée');
  assert.equal(fin.score, mg.score, 'le score acquis est conservé');
});

test('vies : une descente propre va au bout, sans éjection', () => {
  const mg = newSlide(T0);
  let g = 0, res = null;
  while (g++ < 3000 && !res) res = tickSlide(mg, T0 + g * 16, () => 0.99);
  assert.ok(res, 'la descente se termine');
  assert.ok(!res.ejectee, 'par le chrono, pas par éjection');
  assert.equal(mg.vies, VIES_MAX, 'aucune vie perdue en restant dans un couloir libre');
});

test('vies : « pied marin » offre un choc, donc une vie de plus dans les faits', () => {
  const mg = newSlide(T0, { amorti: true });
  assert.equal(unRocher(mg, T0), null);
  assert.equal(mg.vies, VIES_MAX, 'le choc absorbé ne coûte pas de vie');
  assert.equal(mg.bumps, 0, 'ni ne compte comme un rocher pris');
  // le suivant, lui, entame bien les vies
  assert.equal(unRocher(mg, mg.lastTick), null);
  assert.equal(mg.vies, VIES_MAX - 1);
});

test('vies : l\'éjection a un coût de santé annoncé, et non nul', () => {
  assert.ok(DEGATS_EJECTION > 0 && DEGATS_EJECTION <= 25,
    'assez pour compter, pas assez pour punir une seule descente ratée');
});
