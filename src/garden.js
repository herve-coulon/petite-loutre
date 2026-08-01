// Mini-jeu du jardin aquatique : logique pure.
// On plante des graines sur l'eau, on les arrose, et on récolte les fleurs.
// Les grenouilles sautent et rapportent des bonus si on les attrape.
import { SEC, clamp } from './constants.js';

export const GAME_DURATION = 25 * SEC;
export const SEED_INTERVAL = 1800;   // ms entre deux graines
export const GROW_TIME = 2200;       // ms pour qu'une graine devienne une fleur
export const FLOWER_LIVE = 4000;     // ms avant qu'une fleur fanee ne disparaisse
export const FROG_INTERVAL = 3500;   // ms entre deux grenouilles
export const FROG_LIVE = 1200;       // ms pendant laquelle une grenouille est visible
export const FROG_POINTS = 3;
export const FLOWER_POINTS = 1;
export const WATER_DROP_POINTS = 1;

export const INTRO_DURATION = 3200;  // ms d'affichage de l'overlay d'intro

export function newGame(now = Date.now()) {
  return {
    mode: 'garden',
    score: 0,
    flowers: [],    // {x, y, plantedAt, stage: 'seed'|'sprout'|'bloom'|'wilted'}
    frogs: [],      // {x, y, appearedAt}
    lastTick: now,
    nextSeed: now + 600,
    nextFrog: now + 2000,
    startedAt: now,
    introUntil: now + INTRO_DURATION,
    duree: GAME_DURATION,
    endsAt: now + GAME_DURATION,
    waterDrops: 0   // eau dépensée (score de précision)
  };
}

export function gardenProgress(mg, now) {
  return mg ? clamp((now - mg.startedAt) / (mg.duree || GAME_DURATION), 0, 1) : 0;
}

/** @returns {null | {type:'end', score, flowers, frogs}} */
export function tickGame(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;
  mg.lastTick = now;

  // Mise à jour des graines → pousse
  for (const f of mg.flowers) {
    if (f.stage === 'seed' && now >= f.plantedAt + GROW_TIME) f.stage = 'sprout';
    else if (f.stage === 'sprout' && now >= f.plantedAt + GROW_TIME * 1.8) f.stage = 'bloom';
    else if (f.stage === 'bloom' && now >= f.plantedAt + GROW_TIME * 3.2) f.stage = 'wilted';
  }
  // Fleurs fanées : supprimées après un moment
  mg.flowers = mg.flowers.filter(f => f.stage !== 'wilted' || now < f.plantedAt + FLOWER_LIVE + GROW_TIME * 3.2);

  // Grenouilles qui disparaissent
  mg.frogs = mg.frogs.filter(f => now - f.appearedAt < FROG_LIVE);

  // Apparition de nouvelles graines (pas pendant l'intro)
  if (now >= mg.nextSeed && now < mg.endsAt - 1000 && now >= mg.startedAt + INTRO_DURATION) {
    const spots = waterSpots(mg);
    if (spots.length > 0) {
      const spot = spots[(rnd() * spots.length) | 0];
      mg.flowers.push({ x: spot.x, y: spot.y, plantedAt: now, stage: 'seed' });
    }
    mg.nextSeed = now + SEED_INTERVAL + rnd() * 600;
  }

  // Apparition de grenouilles
  if (now >= mg.nextFrog && now < mg.endsAt - 800) {
    mg.frogs.push({ x: 16 + rnd() * 128, y: 200 + rnd() * 40, appearedAt: now });
    mg.nextFrog = now + FROG_INTERVAL + rnd() * 1000;
  }

  if (now >= mg.endsAt) {
    const harvested = mg.flowers.filter(f => f.harvested).length;
    return { type: 'end', score: mg.score, flowers: harvested, frogs: mg.frogs.filter(f => !f.caught).length };
  }
  return null;
}

/** Crée une flaque d'eau au clic — arrose une graine proche. */
export function waterAt(mg, x, y) {
  if (!mg) return false;
  for (const f of mg.flowers) {
    if (f.stage === 'seed' || f.stage === 'sprout') {
      const dx = f.x - x, dy = f.y - y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        // Arrosage : avance la pousse
        f.plantedAt -= 600;
        mg.waterDrops++;
        return true;
      }
    }
  }
  return false;
}

/** Récolte une fleur en bloom ou une grenouille. */
export function harvestAt(mg, x, y, pad = 18) {
  if (!mg) return false;
  // Fleurs en fleur
  for (const f of mg.flowers) {
    if (f.stage === 'bloom' && !f.harvested) {
      const dx = f.x - x, dy = f.y - y;
      if (Math.abs(dx) < pad && Math.abs(dy) < pad) {
        f.harvested = true;
        f.stage = 'wilted';
        mg.score += FLOWER_POINTS;
        return { type: 'flower' };
      }
    }
  }
  // Grenouilles
  for (const f of mg.frogs) {
    const dx = f.x - x, dy = f.y - y;
    if (Math.abs(dx) < pad && Math.abs(dy) < pad) {
      mg.score += FROG_POINTS;
      f.caught = true;
      return { type: 'frog' };
    }
  }
  mg.frogs = mg.frogs.filter(f => !f.caught);
  return false;
}

/** Cases d'eau disponibles (pas trop proches des graines existantes). */
function waterSpots(mg) {
  const spots = [];
  for (let x = 16; x < 144; x += 20) {
    for (let y = 180; y < 260; y += 20) {
      const tooClose = mg.flowers.some(f => Math.abs(f.x - x) < 18 && Math.abs(f.y - y) < 18);
      if (!tooClose) spots.push({ x, y });
    }
  }
  return spots;
}
