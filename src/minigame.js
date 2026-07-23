// Mini-jeu de pêche : logique pure, rendue par render.js, pilotée par main.js.
// Les poissons BONDISSENT hors de l'eau (arc de saut) : on les attrape en vol.
//
// Ce qui fait le sel de la pêche :
//  - une ONDULATION annonce le saut à venir : on peut se préparer, donc rater
//    est une erreur du joueur et non un coup du sort ;
//  - PLUSIEURS poissons peuvent être en l'air à la fois, et le rythme s'accélère ;
//  - un COMBO récompense les prises enchaînées, un poisson manqué le brise ;
//  - les poissons DORÉS valent gros mais sautent plus vite et moins haut.
import { SEC } from './constants.js';

export const GAME_DURATION = 20 * SEC;
export const WATER_Y = 248;      // surface de l'eau (coords canvas) : les poissons en jaillissent
export const TELL_MS = 520;      // durée de l'ondulation d'annonce
export const COMBO_STEP = 3;     // un point bonus toutes les 3 prises d'affilée
export const GOLD_POINTS = 5;
export const MAX_IN_AIR = 3;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function newGame(now = Date.now()) {
  return {
    mode: 'fish',
    score: 0, total: 0, caught: 0, missed: 0,
    combo: 0, bestCombo: 0,
    fishes: [],                  // poissons en l'air
    tells: [],                   // ondulations d'annonce {x, at, kind}
    splash: null, goldAt: 0, missAt: 0,
    startedAt: now,
    endsAt: now + GAME_DURATION,
    nextTell: now + 400,
    lastTick: now
  };
}

/** Avancement de la partie : 0 au début -> 1 à la fin. PUR. */
export function fishProgress(mg, now) {
  return mg ? clamp01((now - mg.startedAt) / GAME_DURATION) : 0;
}

/** Le premier poisson encore en l'air (pratique pour le rendu et les tests). */
export function firstFish(mg) {
  return (mg && mg.fishes && mg.fishes.length) ? mg.fishes[0] : null;
}

/** Fait jaillir un poisson à l'endroit annoncé. */
function launch(mg, tell, now, rnd) {
  const gold = tell.kind === 'gold';
  mg.fishes.push({
    kind: tell.kind,
    baseX: tell.x, x: tell.x, y: WATER_Y,
    start: now,
    until: now + (gold ? 900 + rnd() * 200 : 1150 + rnd() * 420),
    jumpH: gold ? 52 + rnd() * 24 : 68 + rnd() * 48,
    dir: rnd() < 0.5 ? -1 : 1,
    p: 0
  });
  mg.splash = { x: tell.x + 5, t: now };
  mg.total++;
}

/** @returns {null | {type:'end', score, total, caught, bestCombo}} */
export function tickGame(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;
  mg.lastTick = now;

  // les ondulations mûrissent : à échéance, le poisson jaillit
  const ready = mg.tells.filter(t => now >= t.at + TELL_MS);
  for (const t of ready) launch(mg, t, now, rnd);
  if (ready.length) mg.tells = mg.tells.filter(t => now < t.at + TELL_MS);

  // arc de saut ; un poisson qui retombe sans être pris brise l'élan
  for (const f of mg.fishes) {
    f.p = (now - f.start) / (f.until - f.start);
    const s = Math.sin(clamp01(f.p) * Math.PI);
    f.y = WATER_Y - s * f.jumpH - 6;
    f.x = f.baseX + f.dir * s * 12;
  }
  const escaped = mg.fishes.filter(f => now > f.until);
  if (escaped.length) {
    mg.splash = { x: escaped[0].x + 5, t: now };
    mg.missed += escaped.length;
    mg.combo = 0;
    mg.missAt = now;
    mg.fishes = mg.fishes.filter(f => now <= f.until);
  }

  // le rythme se resserre au fil de la partie
  if (now >= mg.nextTell && now < mg.endsAt - 900
    && mg.fishes.length + mg.tells.length < MAX_IN_AIR) {
    const p = fishProgress(mg, now);
    const kind = rnd() < 0.12 ? 'gold' : 'fish';
    mg.tells.push({ x: 16 + rnd() * 128, at: now, kind });
    mg.nextTell = now + (980 - 520 * p) + rnd() * 320;
  }

  if (now >= mg.endsAt) {
    return {
      type: 'end', score: mg.score, total: Math.max(mg.total, 1),
      caught: mg.caught, bestCombo: mg.bestCombo
    };
  }
  return null;
}

/** Tente d'attraper un poisson en (x,y) canvas. pad = tolérance (plus grand au doigt). */
export function clickGame(mg, x, y, pad = 4) {
  if (!mg || !mg.fishes || !mg.fishes.length) return false;
  for (let i = 0; i < mg.fishes.length; i++) {
    const f = mg.fishes[i];
    if (x >= f.x - pad && x <= f.x + 10 + pad && y >= f.y - pad && y <= f.y + 6 + pad) {
      mg.caught++;
      mg.combo++;
      mg.bestCombo = Math.max(mg.bestCombo, mg.combo);
      if (f.kind === 'gold') { mg.score += GOLD_POINTS; mg.goldAt = Date.now(); }
      else mg.score += 1 + Math.floor(mg.combo / COMBO_STEP);
      mg.splash = { x: f.x + 5, t: Date.now() };
      mg.fishes.splice(i, 1);
      return true;
    }
  }
  return false;
}
