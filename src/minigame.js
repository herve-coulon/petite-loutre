// Mini-jeu de pêche : logique pure, rendue par render.js, pilotée par main.js.
import { SEC } from './constants.js';

export const GAME_DURATION = 12 * SEC;
export const MAX_FISH = 8;

export function newGame(now = Date.now()) {
  return { mode: 'fish', score: 0, total: 0, endsAt: now + GAME_DURATION, fish: null, nextFish: now + 600 };
}

/** @returns {null | {type:'end', score:number, total:number}} */
export function tickGame(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;
  if (mg.fish && now > mg.fish.until) mg.fish = null;
  if (!mg.fish && now >= mg.nextFish && mg.total < MAX_FISH && now < mg.endsAt - 900) {
    mg.fish = {
      x: 12 + rnd() * 120,
      y: 24 + rnd() * 74,
      until: now + 950 + rnd() * 300
    };
    mg.total++;
  }
  if (now >= mg.endsAt) {
    return { type: 'end', score: mg.score, total: Math.max(mg.total, 1) };
  }
  return null;
}

/** Tente d'attraper le poisson en (x,y) canvas. pad = tolérance (plus grand au doigt). */
export function clickGame(mg, x, y, pad = 4) {
  if (!mg || !mg.fish) return false;
  const f = mg.fish;
  if (x >= f.x - pad && x <= f.x + 10 + pad && y >= f.y - pad && y <= f.y + 5 + pad) {
    mg.score++;
    mg.fish = null;
    return true;
  }
  return false;
}
