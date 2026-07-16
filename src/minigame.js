// Mini-jeu de pêche : logique pure, rendue par render.js, pilotée par main.js.
// Les poissons BONDISSENT hors de l'eau (arc de saut) : on les attrape en vol.
import { SEC } from './constants.js';

export const GAME_DURATION = 12 * SEC;
export const MAX_FISH = 8;
export const WATER_Y = 248;      // surface de l'eau (coords canvas) : les poissons en jaillissent

export function newGame(now = Date.now()) {
  return { mode: 'fish', score: 0, total: 0, endsAt: now + GAME_DURATION, fish: null, nextFish: now + 600, splash: null };
}

/** @returns {null | {type:'end', score:number, total:number}} */
export function tickGame(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;

  // le poisson a fini son saut sans être attrapé -> il replonge (éclaboussure)
  if (mg.fish && now > mg.fish.until) { mg.splash = { x: mg.fish.x + 5, t: now }; mg.fish = null; }

  // un nouveau poisson jaillit de l'eau
  if (!mg.fish && now >= mg.nextFish && mg.total < MAX_FISH && now < mg.endsAt - 900) {
    const x = 16 + rnd() * 128;
    mg.fish = {
      baseX: x, x, y: WATER_Y,
      start: now, until: now + 1200 + rnd() * 400,
      jumpH: 70 + rnd() * 46, dir: rnd() < 0.5 ? -1 : 1, p: 0
    };
    mg.splash = { x: x + 5, t: now };   // plouf au jaillissement
    mg.total++;
  }

  // position le long de l'arc de saut (eau -> sommet -> eau)
  if (mg.fish) {
    const f = mg.fish;
    f.p = (now - f.start) / (f.until - f.start);          // 0..1
    const s = Math.sin(Math.max(0, Math.min(1, f.p)) * Math.PI);
    f.y = WATER_Y - s * f.jumpH - 6;                       // au sommet : bien au-dessus de l'eau
    f.x = f.baseX + f.dir * s * 12;                        // petit déport horizontal
  }

  if (now >= mg.endsAt) return { type: 'end', score: mg.score, total: Math.max(mg.total, 1) };
  return null;
}

/** Tente d'attraper le poisson en (x,y) canvas. pad = tolérance (plus grand au doigt). */
export function clickGame(mg, x, y, pad = 4) {
  if (!mg || !mg.fish) return false;
  const f = mg.fish;
  if (x >= f.x - pad && x <= f.x + 10 + pad && y >= f.y - pad && y <= f.y + 6 + pad) {
    mg.score++;
    mg.splash = { x: f.x + 5, t: Date.now() };
    mg.fish = null;
    return true;
  }
  return false;
}
