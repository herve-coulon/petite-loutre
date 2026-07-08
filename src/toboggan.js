// Second mini-jeu : le toboggan de rivière. La loutre dévale les rapides sur
// 3 couloirs ; on tape le couloir voulu pour gober les poissons 🐟 et esquiver
// les rochers 🪨. Logique PURE (horloge + hasard injectés), rendue par render.js.
import { SEC } from './constants.js';

export const SLIDE_DURATION = 14 * SEC;
export const LANES = 3;
export const LANE_X = [40, 80, 120];   // centre x de chaque couloir (canvas 160)
export const SLIDE_OTTER_Y = 90;       // ligne de la loutre (bas de l'écran)
export const SPEED = 0.058;            // descente en px/ms
const SPAWN_MIN = 460, SPAWN_VAR = 360;
const ROCK_P = 0.42;                   // proportion de rochers

export function newSlide(now = Date.now()) {
  return {
    mode: 'slide',
    score: 0, bumps: 0, lane: 1,
    items: [],                 // {lane, y, kind:'fish'|'rock', done, got, hit}
    endsAt: now + SLIDE_DURATION,
    nextItem: now + 500,
    lastTick: now,
    bumpAt: 0
  };
}

/** Place la loutre dans le couloir voulu (0..2). PUR. */
export function setSlideLane(mg, lane) {
  if (!mg) return;
  mg.lane = Math.max(0, Math.min(LANES - 1, lane | 0));
}

/** Couloir le plus proche d'une abscisse canvas (pour un toucher). */
export function laneAt(x) {
  return x < LANE_X[0] + 20 ? 0 : x < LANE_X[1] + 20 ? 1 : 2;
}

/**
 * Fait défiler d'un pas (appelé à chaque frame). Déplace les obstacles, résout
 * les collisions au passage de la loutre, fait apparaître de nouveaux items.
 * @returns {null | {type:'end', score:number, bumps:number}}
 */
export function tickSlide(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;
  const dt = Math.min(50, Math.max(0, now - mg.lastTick)); // borne le dt (veille)
  mg.lastTick = now;

  for (const it of mg.items) it.y += SPEED * dt;

  // collision quand un item franchit la ligne de la loutre (une seule fois)
  for (const it of mg.items) {
    if (!it.done && it.y >= SLIDE_OTTER_Y) {
      it.done = true;
      if (it.lane === mg.lane) {
        if (it.kind === 'fish') { mg.score++; it.got = true; }
        else { mg.bumps++; mg.bumpAt = now; it.hit = true; }
      }
    }
  }
  mg.items = mg.items.filter(it => it.y < 132);

  if (now >= mg.nextItem && now < mg.endsAt - 700) {
    const kind = rnd() < ROCK_P ? 'rock' : 'fish';
    mg.items.push({ lane: Math.floor(rnd() * LANES), y: -8, kind, done: false });
    mg.nextItem = now + SPAWN_MIN + rnd() * SPAWN_VAR;
  }

  if (now >= mg.endsAt) return { type: 'end', score: mg.score, bumps: mg.bumps };
  return null;
}
