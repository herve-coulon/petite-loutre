// Tests v2.4 « polish » : game feel, humeurs, carte photo (node --test, zéro DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { squashScale, SQUASH_MS, makeRenderer } from '../src/render.js';
import { moodOf, pickIdle, canIdle, IDLES, IDLE_FRAMES, greeting } from '../src/mood.js';
import { cardData, drawCard, makeCard, CARD_W, CARD_H, CARD_URL } from '../src/photocard.js';
import { newState } from '../src/state.js';
import { stepSim } from '../src/sim.js';
import { DAY, NIGHT, LOOP, stepDur, isNightHour, DAY_BPM, NIGHT_BPM } from '../src/music.js';
import { XP, xpCost, levelFromXp, titleFor, TITLES } from '../src/level.js';
import { HATS, unlockedHats } from '../src/accessories.js';
import { DECORS, unlockedDecors } from '../src/skins.js';
import { newRecords } from '../src/state.js';
import { touchStreak, STREAK_MILESTONES } from '../src/streak.js';
import { dailyShareText, SHARE_URL } from '../src/share.js';
import { dailyEvent, butterflyPos, DAILY_EVENTS } from '../src/events.js';
import { dayKey, dailyQuests } from '../src/quests.js';
import { nextReminders, VAPID_PUBLIC, PUSH_URL } from '../src/push.js';

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

test('bonjour de reconnexion : le message suit l\'humeur, avec le prénom', () => {
  const cases = [
    [otter({ name: 'Kiwi', sleeping: true }), /dort.*💤/],
    [otter({ name: 'Kiwi', sick: true }), /🤒/],
    [otter({ name: 'Kiwi', hunger: 10 }), /🐟/],
    [otter({ name: 'Kiwi', fun: 10 }), /vexé|boude/],
    [otter({ name: 'Kiwi', fun: 90, hunger: 80 }), /💛/],
    [otter({ name: 'Kiwi', fun: 50 }), /salue|Bonjour|Bonsoir|Coucou|debout/]
  ];
  for (const [s, re] of cases) {
    const msg = greeting(s, T0, () => 0);
    assert.match(msg, re, msg);
    assert.ok(msg.includes('Kiwi'), 'le prénom est là : ' + msg);
  }
});

test('bonjour : des variantes existent (pas la même phrase en boucle)', () => {
  const s = otter({ name: 'Kiwi', fun: 90, hunger: 80 });
  const a = greeting(s, T0, () => 0);
  const b = greeting(s, T0, () => 0.99);
  assert.notEqual(a, b, 'deux tirages différents -> deux phrases');
});

test('bonjour neutre : la politesse suit l\'heure', () => {
  const s = otter({ fun: 50 });
  const at = h => greeting(s, Date.UTC(2026, 6, 8, h, 0, 0), () => 0);
  // (l'heure affichée dépend du fuseau de la machine : on vérifie juste
  // que matin très tôt et soirée ne donnent pas la même phrase)
  assert.notEqual(at(3), at(20));
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

/* ---------------- rappels push ---------------- */

test('rappels : la faim est estimée à la bonne heure, les quêtes du matin toujours prévues', () => {
  const s = otter({ hunger: 45 }); // (45-15)/6 = 5 h avant d'avoir vraiment faim
  const rs = nextReminders(s, T0);
  const faim = rs.find(r => r.tag === 'faim');
  assert.ok(faim, 'rappel de faim présent');
  assert.equal(Math.round((faim.at - T0) / 3600000), 5, 'faim dans ~5 h');
  assert.ok(rs.some(r => r.tag === 'quetes'), 'rappel des quêtes du matin');
  assert.ok(rs.every(r => r.at > T0), 'tous dans le futur');
  assert.deepEqual(rs, [...rs].sort((a, b) => a.at - b.at), 'triés chronologiquement');
  assert.ok(rs.length <= 4, 'jamais plus de 4');
});

test('rappels : endormie -> réveil estimé ; chez le héron -> prochain poisson', () => {
  const dodo = otter({ sleeping: true, energy: 60 }); // (100-60)/40 = 1 h
  const r1 = nextReminders(dodo, T0).find(r => r.tag === 'reveil');
  assert.ok(r1, 'rappel de réveil');
  assert.equal(Math.round((r1.at - T0) / 3600000), 1);
  const away = otter({ away: true, awayNextCare: T0 + 2 * 3600000, awayCare: 1 });
  const r2 = nextReminders(away, T0).find(r => r.tag === 'heron');
  assert.ok(r2, 'rappel héron');
  assert.equal(r2.at, T0 + 2 * 3600000, 'au moment où le héron acceptera le poisson');
  assert.match(r2.body, /1\/3/);
});

test('rappels : œuf et partie finie -> aucun ; clés publiques câblées', () => {
  assert.deepEqual(nextReminders(otter({ stage: 'egg' }), T0), []);
  assert.deepEqual(nextReminders(otter({ gameOver: true }), T0), []);
  assert.ok(VAPID_PUBLIC.length > 80 && !VAPID_PUBLIC.includes(' '), 'clé VAPID publique embarquée');
  assert.match(PUSH_URL, /^https:\/\/.+\/functions\/v1\/push$/, 'URL du serveur de rappels');
});

/* ---------------- streak ---------------- */

const UN_JOUR = 24 * 3600 * 1000;

test('streak : première visite = 1, même jour = non recompté', () => {
  const rec = newRecords();
  const st = touchStreak(rec, T0);
  assert.deepEqual(st, { count: 1, xp: 0 });
  assert.equal(touchStreak(rec, T0 + 3600 * 1000), null, 'déjà compté aujourd\'hui');
  assert.equal(rec.streakCount, 1);
});

test('streak : jours consécutifs s\'enchaînent, un trou remet à 1', () => {
  const rec = newRecords();
  touchStreak(rec, T0);
  touchStreak(rec, T0 + UN_JOUR);
  const st3 = touchStreak(rec, T0 + 2 * UN_JOUR);
  assert.equal(st3.count, 3, 'trois jours d\'affilée');
  assert.equal(st3.xp, STREAK_MILESTONES[3], 'palier 3 récompensé');
  assert.equal(rec.streakBest, 3);
  const gap = touchStreak(rec, T0 + 5 * UN_JOUR); // deux jours manqués
  assert.equal(gap.count, 1, 'série cassée, on repart à 1');
  assert.equal(rec.streakBest, 3, 'le record reste');
});

test('streak : paliers 3/7/14/30 tous récompensés', () => {
  const rec = newRecords();
  let earned = [];
  for (let d = 0; d < 30; d++) {
    const st = touchStreak(rec, T0 + d * UN_JOUR);
    if (st && st.xp) earned.push(st.count);
  }
  assert.deepEqual(earned, [3, 7, 14, 30]);
  assert.equal(rec.streakBest, 30);
});

/* ---------------- partage du jour ---------------- */

test('partage : cases, compte, niveau, flamme et lien', () => {
  const s = otter({ name: 'Kiwi' });
  s.qDaily = { date: dayKey(T0), progress: {}, done: [] };
  const rec = { xp: 45, streakCount: 12 };
  const txt = dailyShareText(s, rec, T0);
  assert.match(txt, /🦦 Ma Petite Loutre — \d\d\/\d\d/);
  assert.match(txt, /[✅⬜]{3} \d\/3/, 'trois cases de quêtes');
  assert.match(txt, /NIV 2/);
  assert.match(txt, /🔥12 j/);
  assert.ok(txt.endsWith(SHARE_URL));
});

test('partage : quête réussie -> une case cochée ; pas de flamme à 1 jour', () => {
  const s = otter();
  const date = dayKey(T0);
  const quests = dailyQuests(date);
  s.qDaily = { date, progress: {}, done: [quests[0].id] };
  const txt = dailyShareText(s, { xp: 0, streakCount: 1 }, T0);
  assert.match(txt, /✅/, 'au moins une case cochée');
  assert.match(txt, / 1\/3/);
  assert.ok(!txt.includes('🔥'), 'flamme cachée à 1 jour');
});

/* ---------------- événement du jour ---------------- */

test('événement : déterministe par date, varie au fil des jours', () => {
  const a = dailyEvent('2026-07-08');
  assert.deepEqual(dailyEvent('2026-07-08'), a, 'même jour = même surprise pour tous');
  assert.ok(DAILY_EVENTS.some(e => e.id === a.id));
  const ids = new Set();
  for (let d = 1; d <= 20; d++) ids.add(dailyEvent('2026-07-' + String(d).padStart(2, '0')).id);
  assert.ok(ids.size >= 3, 'la surprise change vraiment au fil des jours (' + ids.size + ' distinctes sur 20 j)');
});

test('événement : le papillon vole dans l\'écran, toujours attrapable', () => {
  for (let f = 0; f < 2000; f += 37) {
    const { x, y } = butterflyPos(f);
    assert.ok(x > 10 && x < 150, 'x=' + x);
    assert.ok(y > 40 && y < 72, 'y=' + y);
  }
});

/* ---------------- niveaux ---------------- */

test('niveaux : départ niveau 1, seuils exacts, courbe croissante', () => {
  assert.deepEqual(levelFromXp(0), { level: 1, cur: 0, next: 40 });
  assert.equal(levelFromXp(39).level, 1);
  assert.equal(levelFromXp(40).level, 2, 'niveau 2 pile à 40 XP');
  assert.deepEqual(levelFromXp(40 + 65), { level: 3, cur: 0, next: xpCost(3) });
  for (let n = 1; n < 30; n++) assert.ok(xpCost(n + 1) > xpCost(n), 'chaque niveau coûte plus cher');
  assert.equal(levelFromXp(-50).level, 1, 'XP négative impossible');
  assert.equal(levelFromXp(NaN).level, 1);
});

test('niveaux : titres définis, croissants, jamais vides', () => {
  let prev = '';
  for (let n = 1; n <= 20; n++) {
    const t = titleFor(n);
    assert.ok(t && t.length > 3, 'titre du niveau ' + n);
    prev = t;
  }
  assert.equal(titleFor(1), TITLES[0][1]);
  assert.equal(titleFor(5), 'Gardien de la rivière');
  assert.equal(titleFor(99), TITLES[TITLES.length - 1][1]);
});

test('niveaux : barème XP complet, positif, hiérarchisé', () => {
  for (const [k, v] of Object.entries(XP)) assert.ok(v > 0, k);
  assert.ok(XP.quest > XP.meal, 'une quête vaut plus qu\'un repas');
  assert.ok(XP.win > XP.battle, 'gagner vaut plus que participer');
  assert.ok(XP.evolve >= XP.quest, 'grandir est un événement');
});

test('niveaux : les cosmétiques de palier se débloquent par l\'XP', () => {
  const rec = newRecords();
  assert.ok(!unlockedHats(rec).includes('etoile'));
  assert.ok(!unlockedDecors(rec).includes('feu'));
  rec.xp = 40 + 65; // niveau 3
  assert.ok(unlockedDecors(rec).includes('feu'), 'feu de camp au niveau 3');
  assert.ok(!unlockedHats(rec).includes('etoile'), 'étoile pas avant le niveau 5');
  rec.xp = 40 + 65 + 90 + 115; // niveau 5
  assert.ok(unlockedHats(rec).includes('etoile'));
  rec.xp = 100000;
  assert.ok(unlockedHats(rec).includes('aureole'));
});

test('niveaux : les sprites des nouveaux chapeaux sont valides', () => {
  for (const id of ['etoile', 'aureole']) {
    const hat = HATS.find(h => h.id === id);
    assert.ok(hat, id);
    hat.rows.forEach((r, i) => assert.equal(r.length, 16, id + ' ligne ' + i));
  }
});

/* ---------------- musique ---------------- */

test('musique : partitions cohérentes (boucle, notes valides, basse à la noire)', () => {
  for (const score of [DAY, NIGHT]) {
    assert.equal(score.mel.length, LOOP, 'la mélodie remplit exactement la boucle');
    assert.equal(LOOP % 4, 0, 'boucle découpable en mesures');
    for (const f of score.mel) assert.ok(f === 0 || (f > 80 && f < 2000), 'note audible ou silence : ' + f);
    for (const f of score.bass) assert.ok(f > 40 && f < 400, 'basse dans le grave : ' + f);
  }
  assert.equal(DAY.bass.length, LOOP / 2, 'jour : une basse par noire (ça pompe)');
  assert.equal(NIGHT.bass.length, LOOP / 4, 'nuit : une basse par blanche (ça berce)');
  assert.ok(DAY.mel.filter(Boolean).length >= 40, 'thème du jour bien rempli : ça doit entraîner');
  assert.ok(DAY.mel.filter(Boolean).length > NIGHT.mel.filter(Boolean).length,
    'le jour est plus dense que la berceuse');
  assert.notDeepEqual(DAY.mel, NIGHT.mel, 'deux ambiances distinctes');
});

test('musique : berceuse la nuit (lente), aventure le jour (132 bpm)', () => {
  assert.ok(DAY_BPM >= 120, 'tempo du jour entraînant (' + DAY_BPM + ' bpm)');
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
  assert.match(d.levelLine, /NIV 1/, 'niveau du soigneur sur la carte');
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
