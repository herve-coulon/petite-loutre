// Mini-jeu du jardin aquatique : logique pure.
// On plante des graines sur l'eau, on les arrose, et on récolte les fleurs.
// Les grenouilles sautent et rapportent des bonus si on les attrape ; les
// papillons (v4.6) dérivent dans l'air, et certaines fleurs rares valent plus.
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

// Nouveautés v4.6 : papillons, fleurs rares, bouquet bonus.
export const BUTTERFLY_INTERVAL = 4200; // ms entre deux papillons
export const BUTTERFLY_LIVE = 2800;     // ms de présence (ils dérivent)
export const BUTTERFLY_POINTS = 2;
export const RARE_CHANCE = 0.28;        // proportion de graines « rares »
export const RARE_FLOWER_POINTS = 3;    // une fleur rare vaut plus
export const BOUQUET_TARGET = 6;        // récolter autant de fleurs → bonus
export const BOUQUET_BONUS = 5;

export const INTRO_DURATION = 3200;  // ms d'affichage de l'overlay d'intro

export function newGame(now = Date.now()) {
  return {
    mode: 'garden',
    score: 0,
    flowers: [],      // {x, y, plantedAt, stage:'seed'|'sprout'|'bloom'|'wilted', rare?}
    frogs: [],        // {x, y, appearedAt}
    butterflies: [],  // {baseX, x, y, appearedAt} — dérivent horizontalement
    harvested: 0,     // fleurs récoltées (pour le bouquet bonus)
    lastTick: now,
    nextSeed: now + 600,
    nextFrog: now + 2000,
    nextButterfly: now + 2400,
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

/** @returns {null | {type:'end', score, flowers, frogs, butterflies, bonus}} */
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

  // Papillons : dérive horizontale (sinus) + disparition
  for (const b of mg.butterflies) {
    b.x = b.baseX + 26 * Math.sin((now - b.appearedAt) / 340);
  }
  mg.butterflies = mg.butterflies.filter(b => !b.caught && now - b.appearedAt < BUTTERFLY_LIVE);

  // Apparition de nouvelles graines (pas pendant l'intro)
  if (now >= mg.nextSeed && now < mg.endsAt - 1000 && now >= mg.startedAt + INTRO_DURATION) {
    const spots = waterSpots(mg);
    if (spots.length > 0) {
      const spot = spots[(rnd() * spots.length) | 0];
      mg.flowers.push({ x: spot.x, y: spot.y, plantedAt: now, stage: 'seed', rare: rnd() < RARE_CHANCE });
    }
    mg.nextSeed = now + SEED_INTERVAL + rnd() * 600;
  }

  // Apparition de grenouilles
  if (now >= mg.nextFrog && now < mg.endsAt - 800) {
    mg.frogs.push({ x: 16 + rnd() * 128, y: 200 + rnd() * 40, appearedAt: now });
    mg.nextFrog = now + FROG_INTERVAL + rnd() * 1000;
  }

  // Apparition de papillons (dans l'air, au-dessus de l'eau)
  if (now >= mg.nextButterfly && now < mg.endsAt - 800) {
    const baseX = 34 + rnd() * 92;
    mg.butterflies.push({ baseX, x: baseX, y: 96 + rnd() * 70, appearedAt: now });
    mg.nextButterfly = now + BUTTERFLY_INTERVAL + rnd() * 1200;
  }

  if (now >= mg.endsAt) {
    const bonus = mg.harvested >= BOUQUET_TARGET ? BOUQUET_BONUS : 0;
    mg.score += bonus;
    return {
      type: 'end',
      score: mg.score,
      flowers: mg.harvested,
      frogs: mg.frogs.filter(f => !f.caught).length,
      butterflies: (mg.butterfliesCaught || 0),
      bonus
    };
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

/** Récolte une fleur en bloom, ou attrape un papillon / une grenouille. */
export function harvestAt(mg, x, y, pad = 18) {
  if (!mg) return false;
  // Fleurs en fleur (rares = plus de points)
  for (const f of mg.flowers) {
    if (f.stage === 'bloom' && !f.harvested) {
      const dx = f.x - x, dy = f.y - y;
      if (Math.abs(dx) < pad && Math.abs(dy) < pad) {
        f.harvested = true;
        f.stage = 'wilted';
        mg.score += f.rare ? RARE_FLOWER_POINTS : FLOWER_POINTS;
        mg.harvested = (mg.harvested || 0) + 1;
        return { type: 'flower', rare: !!f.rare };
      }
    }
  }
  // Papillons (plus grand rayon : ils bougent)
  for (const b of mg.butterflies) {
    if (b.caught) continue;
    const dx = b.x - x, dy = b.y - y;
    if (Math.abs(dx) < pad + 4 && Math.abs(dy) < pad + 4) {
      b.caught = true;
      mg.score += BUTTERFLY_POINTS;
      mg.butterfliesCaught = (mg.butterfliesCaught || 0) + 1;
      return { type: 'butterfly' };
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
