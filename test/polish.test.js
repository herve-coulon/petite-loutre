// Tests v2.4 « polish » : game feel, humeurs, carte photo (node --test, zéro DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { squashScale, SQUASH_MS, makeRenderer } from '../src/render.js';
import { moodOf, pickIdle, canIdle, IDLES, IDLE_FRAMES } from '../src/mood.js';
import { cardData, drawCard, makeCard, CARD_W, CARD_H, CARD_URL } from '../src/photocard.js';
import { newState } from '../src/state.js';
import { stepSim } from '../src/sim.js';
import { MELODY, BASS, LOOP, stepDur, isNightHour, DAY_BPM, NIGHT_BPM } from '../src/music.js';

const T0 = 1_750_000_000_000;

/** Loutre en bonne santé, réveillée, prête à poser. */
function otter(over = {}) {
  const s = newState(T0);
  Object.assign(s, {
    stage: 'baby', hatchedAt: T0, name: 'Test',
    hunger: 80, fun: 80, energy: 80, clean: 80, health: 90
  }, over);
  return s;
}

/** Canvas factice : enregistre les fillRect (avec translation) pour comparer des rendus. */
function fakeCanvas(rects) {
  const ctx = {
    fillStyle: '', font: '', _tx: 0, _ty: 0,
    fillRect(x, y, w, h) { rects.push([x + this._tx, y + this._ty, w, h, this.fillStyle]); },
    fillText() {}, save() {}, restore() { this._tx = 0; this._ty = 0; },
    translate(a, b) { this._tx += a; this._ty += b; }, scale() {}
  };
  return { getContext: () => ctx };
}

/* ---------------- game feel : squash & stretch ---------------- */

test('squash : écrasée et élargie au contact', () => {
  const { sx, sy } = squashScale(0);
  assert.ok(sy < 0.75, 'écrasée verticalement (sy=' + sy + ')');
  assert.ok(sx > 1.15, 'élargie horizontalement (sx=' + sx + ')');
});

test('squash : rebond étiré au milieu de l\'animation', () => {
  const overshoot = [...Array(9)].some((_, i) => squashScale((i + 1) / 10).sy > 1.02);
  assert.ok(overshoot, 'la loutre s\'étire au-delà de sa taille pendant le rebond');
});

test('squash : retour exact au repos (fin, hors bornes, NaN)', () => {
  assert.deepEqual(squashScale(1), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(2), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(-0.5), { sx: 1, sy: 1 });
  assert.deepEqual(squashScale(NaN), { sx: 1, sy: 1 });
  assert.ok(SQUASH_MS > 0 && SQUASH_MS < 1000, 'durée courte : c\'est un accent, pas une cinématique');
});

test('squash : enveloppe continue (pas de saut visible entre deux frames)', () => {
  let prev = squashScale(0).sy;
  for (let t = 0.02; t <= 1; t += 0.02) {
    const { sy } = squashScale(t);
    assert.ok(Math.abs(sy - prev) < 0.12, 'saut de ' + Math.abs(sy - prev) + ' à t=' + t);
    prev = sy;
  }
});

/* ---------------- humeurs ---------------- */

test('humeur : priorités décroissantes (dodo > malade > affamée > boudeuse)', () => {
  assert.equal(moodOf(otter({ sleeping: true, sick: true, hunger: 5 })), 'dodo');
  assert.equal(moodOf(otter({ sick: true, hunger: 5, fun: 5 })), 'malade');
  assert.equal(moodOf(otter({ hunger: 5, fun: 5 })), 'affamee');
  assert.equal(moodOf(otter({ fun: 5 })), 'boudeuse');
});

test('humeur : contente seulement si tout va vraiment bien', () => {
  assert.equal(moodOf(otter({ fun: 90, hunger: 80, health: 90 })), 'contente');
  assert.equal(moodOf(otter({ fun: 90, hunger: 30 })), 'neutre', 'petit creux : plus de grand sourire');
  assert.equal(moodOf(otter({ fun: 50, hunger: 80 })), 'neutre');
  assert.equal(moodOf(otter({ fun: 90, hunger: 80, health: 40 })), 'neutre', 'santé fragile');
});

test('humeur : réveil forcé -> bouderie temporaire, prioritaire sur les jauges', () => {
  const s = otter({ fun: 90, hunger: 80, grumpyUntil: T0 + 5 * 60000 });
  assert.equal(moodOf(s, T0), 'boudeuse', 'boude malgré des jauges au vert');
  assert.equal(moodOf(s, T0 + 11 * 60000), 'contente', 'la bouderie finit par passer');
  const sick = otter({ sick: true, grumpyUntil: T0 + 5 * 60000 });
  assert.equal(moodOf(sick, T0), 'malade', 'la maladie prime sur la bouderie');
});

test('sommeil v2.4.1 : une heure de sieste recharge à vue d\'œil', () => {
  const s = otter({ sleeping: true, energy: 20 });
  stepSim(s, 3600 * 1000, { simNow: T0 + 3600 * 1000, rnd: () => 0.5 });
  assert.ok(s.energy >= 55, 'au moins +35 d\'énergie par heure (' + s.energy + ')');
  assert.equal(s.sleeping, true, 'elle dort encore, réveil auto seulement à 100');
});

test('humeur : œuf, partie finie et état absent -> null', () => {
  assert.equal(moodOf(otter({ stage: 'egg' })), null);
  assert.equal(moodOf(otter({ gameOver: true })), null);
  assert.equal(moodOf(null), null);
});

test('manies : tirage borné, durées définies, seulement quand tout est calme', () => {
  for (let i = 0; i < 20; i++) assert.ok(IDLES.includes(pickIdle()));
  assert.equal(pickIdle(() => 0), IDLES[0]);
  assert.equal(pickIdle(() => 0.999), IDLES[IDLES.length - 1]);
  for (const k of IDLES) assert.ok(IDLE_FRAMES[k] > 30, k + ' dure assez pour être vue');
  assert.ok(canIdle('neutre') && canIdle('contente'));
  assert.ok(!canIdle('affamee') && !canIdle('malade') && !canIdle('dodo') && !canIdle(null));
});

/* ---------------- rendu : le visage suit l'humeur ---------------- */

test('rendu : chaque humeur peint un visage différent', () => {
  const paint = (s) => {
    const rects = [];
    makeRenderer(fakeCanvas(rects)).render(s, null, 10, {});
    return JSON.stringify(rects);
  };
  const faces = [
    paint(otter({ fun: 90, hunger: 80 })),   // contente
    paint(otter({ hunger: 10 })),            // affamée
    paint(otter({ fun: 10 })),               // boudeuse
    paint(otter({ sick: true })),            // malade
    paint(otter({ fun: 50 }))                // neutre
  ];
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      assert.notEqual(faces[i], faces[j], 'humeurs ' + i + ' et ' + j + ' identiques à l\'écran');
    }
  }
});

/* ---------------- musique ---------------- */

test('musique : partition cohérente (boucle, notes valides, basse alignée)', () => {
  assert.equal(MELODY.length, LOOP, 'la mélodie remplit exactement la boucle');
  assert.equal(LOOP % 4, 0, 'boucle découpable en blanches');
  assert.equal(BASS.length, LOOP / 4, 'une note de basse par blanche');
  for (const f of MELODY) assert.ok(f === 0 || (f > 80 && f < 2000), 'note audible ou silence : ' + f);
  for (const f of BASS) assert.ok(f > 40 && f < 400, 'basse dans le grave : ' + f);
  assert.ok(MELODY.filter(Boolean).length >= 12, 'assez de notes pour faire un air');
});

test('musique : berceuse la nuit (plus lente), enjouée le jour', () => {
  assert.ok(DAY_BPM > NIGHT_BPM);
  assert.ok(stepDur(true) > stepDur(false));
  assert.ok(isNightHour(23) && isNightHour(3), 'nuit à 23 h et 3 h');
  assert.ok(!isNightHour(12) && !isNightHour(8), 'jour à midi et 8 h');
});

/* ---------------- carte photo ---------------- */

test('carte : textes fidèles à la loutre (nom, stade, exploits du jour, url)', () => {
  const s = otter({ name: 'Kiwi', stage: 'child' });
  s.qDaily = { date: '2026-07-06', progress: { fish: 7, meals: 2 }, done: ['a', 'b'] };
  const rec = { bestAge: 26 * 3600 * 1000 };
  const d = cardData(s, rec, T0 + 3 * 3600 * 1000);
  assert.equal(d.name, 'KIWI');
  assert.match(d.stageLine, /JEUNE LOUTRE/);
  assert.match(d.stageLine, /3 h/);
  assert.match(d.lines[0], /7 poissons/);
  assert.match(d.lines[0], /2 repas/);
  assert.match(d.lines[1], /2\/3/);
  assert.match(d.lines[2], /1 j 2 h/);
  assert.match(d.url, /petite-loutre/);
  assert.ok(CARD_URL.startsWith('https://') && CARD_URL.includes(d.url), 'lien de partage cohérent');
});

test('carte : sans nom ni quêtes du jour, textes de repli propres', () => {
  const d = cardData(otter({ name: null }), { bestAge: 0 }, T0);
  assert.equal(d.name, 'LOUTRE MYSTÈRE');
  assert.match(d.lines[0], /0 poisson ·/);
  assert.match(d.lines[1], /0\/3/);
  assert.match(d.lines[2], /aventure/);
});

test('carte : tout le dessin tient dans 480x600, nom et url bien écrits', () => {
  const rects = [], texts = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: '',
    fillRect(x, y, w, h) { rects.push([x, y, w, h]); },
    fillText(str, x, y) { texts.push({ str, x, y }); }
  };
  const s = otter({ name: 'Perle', stage: 'adult', hat: 'couronne', fur: 'doree' });
  drawCard(ctx, s, { bestAge: 80 * 3600 * 1000 }, T0);
  assert.ok(rects.length > 200, 'la carte est richement peinte (' + rects.length + ' rects)');
  for (const [x, y, w, h] of rects) {
    assert.ok(x >= 0 && y >= 0 && x + w <= CARD_W && y + h <= CARD_H,
      'rect hors carte : ' + [x, y, w, h].join(','));
  }
  for (const t of texts) {
    assert.ok(t.x >= 0 && t.x <= CARD_W && t.y >= 0 && t.y <= CARD_H, 'texte hors carte : ' + t.str);
  }
  assert.ok(texts.some(t => t.str === 'PERLE'), 'le nom est sur la carte');
  assert.ok(texts.some(t => /petite-loutre/.test(t.str)), 'l\'invitation est sur la carte');
});

test('carte : makeCard fabrique un canvas aux bonnes dimensions (document injecté)', () => {
  const calls = [];
  const fakeDoc = {
    createElement() {
      return {
        width: 0, height: 0,
        getContext: () => ({ fillStyle: '', font: '', textAlign: '', fillRect() { calls.push(1); }, fillText() {} })
      };
    }
  };
  const cv2 = makeCard(otter(), { bestAge: 0 }, fakeDoc, T0);
  assert.equal(cv2.width, CARD_W);
  assert.equal(cv2.height, CARD_H);
  assert.ok(calls.length > 0, 'le dessin a bien eu lieu');
});

test('rendu : 1500 frames (manies, libellule, poissons sauteurs) sans erreur', () => {
  const rects = [];
  const R = makeRenderer(fakeCanvas(rects));
  const s = otter({ fun: 90, hunger: 80 });
  for (let f = 0; f < 1500; f++) {
    rects.length = 0;
    R.render(s, null, f, {});
  }
  assert.ok(rects.length > 50, 'la scène est bien peinte à la dernière frame');
});
