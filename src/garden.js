// Le jardin (v4.9) — un jeu de RÉCOLTE AU BON MOMENT, distinct de la pêche.
// Aucune cible mobile à taper : des parterres FIXES où les fleurs poussent sur
// place (graine → pousse → bouton → PLEINE FLORAISON → fané). Tout le sel est
// dans le TIMING — récolter chaque fleur pile à sa pleine floraison. Arroser une
// pousse la fait mûrir plus vite (pour étaler les floraisons). Logique pure.
import { SEC, clamp } from './constants.js';

export const GAME_DURATION = 25 * SEC;
export const GROW_TIME = 3600;       // ms : graine → début de floraison
export const BLOOM_WINDOW = 2400;    // ms : durée de la pleine floraison (fenêtre de récolte)
export const WILT_TIME = 1600;       // ms : temps fané avant que le parterre se libère
export const SOW_INTERVAL = 1300;    // ms entre deux semis automatiques
export const WATER_BOOST = 750;      // ms gagnés en arrosant une pousse

// Fenêtre « parfaite » : le tiers central de la floraison (0.33..0.67).
export const PEAK_LO = 0.34, PEAK_HI = 0.66;

export const RARE_CHANCE = 0.26;     // proportion de graines « rares » (dorées)
export const EDGE_POINTS = 1;        // récolte en début/fin de floraison
export const PEAK_POINTS = 3;        // récolte pile à la pleine floraison
export const RARE_MULT = 2;          // une fleur rare vaut le double
export const BOUQUET_TARGET = 6;     // récolter autant de fleurs → bonus de fin
export const BOUQUET_BONUS = 5;

export const INTRO_DURATION = 3200;

// 6 parterres fixes, en grille 3×2 (canvas 160 de large).
const PLOT_XS = [32, 80, 128];
const PLOT_YS = [206, 274];

export function newGame(now = Date.now()) {
  const plots = [];
  for (const y of PLOT_YS) for (const x of PLOT_XS) {
    plots.push({ x, y, stage: 'empty', plantedAt: 0, rare: false });
  }
  return {
    mode: 'garden',
    score: 0,
    plots,
    harvested: 0,
    perfects: 0,
    lastTick: now,
    nextSow: now + 500,
    startedAt: now,
    introUntil: now + INTRO_DURATION,
    duree: GAME_DURATION,
    endsAt: now + GAME_DURATION
  };
}

export function gardenProgress(mg, now) {
  return mg ? clamp((now - mg.startedAt) / (mg.duree || GAME_DURATION), 0, 1) : 0;
}

// L'état d'un parterre à l'instant `now` : phase de croissance + « maturité »
// (bloomT ∈ [0,1] pendant la floraison, -1 sinon). Sert au rendu ET au score.
export function plotState(p, now) {
  if (p.stage === 'empty') return { phase: 'empty', bloomT: -1 };
  const age = now - p.plantedAt;
  if (age < GROW_TIME) {
    const g = age / GROW_TIME;
    const phase = g < 0.34 ? 'seed' : g < 0.7 ? 'sprout' : 'bud';
    return { phase, bloomT: -1, grow: g };
  }
  const bloomAge = age - GROW_TIME;
  if (bloomAge < BLOOM_WINDOW) return { phase: 'bloom', bloomT: bloomAge / BLOOM_WINDOW };
  return { phase: 'wilt', bloomT: -1 };
}

/** @returns {null | {type:'end', score, flowers, perfects, bonus}} */
export function tickGame(mg, now = Date.now(), rnd = Math.random) {
  if (!mg) return null;
  mg.lastTick = now;

  // Parterres fanés depuis assez longtemps → se libèrent (re-semables)
  for (const p of mg.plots) {
    if (p.stage !== 'empty') {
      const age = now - p.plantedAt;
      if (age >= GROW_TIME + BLOOM_WINDOW + WILT_TIME) { p.stage = 'empty'; p.rare = false; }
      else if (age >= GROW_TIME + BLOOM_WINDOW) p.stage = 'wilt';
      else if (age >= GROW_TIME) p.stage = 'bloom';
      else p.stage = 'growing';
    }
  }

  // Semis automatique dans un parterre libre (pas pendant l'intro)
  if (now >= mg.nextSow && now < mg.endsAt - 1200 && now >= mg.startedAt + INTRO_DURATION) {
    const free = mg.plots.filter(p => p.stage === 'empty');
    if (free.length) {
      const p = free[(rnd() * free.length) | 0];
      p.stage = 'growing'; p.plantedAt = now; p.rare = rnd() < RARE_CHANCE;
    }
    mg.nextSow = now + SOW_INTERVAL + rnd() * 500;
  }

  if (now >= mg.endsAt) {
    const bonus = mg.harvested >= BOUQUET_TARGET ? BOUQUET_BONUS : 0;
    mg.score += bonus;
    return { type: 'end', score: mg.score, flowers: mg.harvested, perfects: mg.perfects, bonus };
  }
  return null;
}

// Arrose une POUSSE (avant floraison) pour la faire mûrir plus vite — utile pour
// étaler des floraisons qui arriveraient toutes en même temps.
export function waterAt(mg, x, y, pad = 22) {
  if (!mg) return false;
  for (const p of mg.plots) {
    if (p.stage === 'growing' && Math.abs(p.x - x) < pad && Math.abs(p.y - y) < pad) {
      p.plantedAt -= WATER_BOOST;    // avance la maturité
      return true;
    }
  }
  return false;
}

// Récolte un parterre EN FLORAISON. Les points dépendent du TIMING :
// pile à la pleine floraison (fenêtre « parfaite ») = max ; en bordure = peu.
// @returns {null | {type:'flower', rare, perfect, points}}
export function harvestAt(mg, x, y, pad = 22, now = Date.now()) {
  if (!mg) return false;
  for (const p of mg.plots) {
    if (p.stage !== 'bloom') continue;
    if (Math.abs(p.x - x) >= pad || Math.abs(p.y - y) >= pad) continue;
    const st = plotState(p, now);
    const perfect = st.bloomT >= PEAK_LO && st.bloomT <= PEAK_HI;
    let points = perfect ? PEAK_POINTS : EDGE_POINTS;
    if (p.rare) points *= RARE_MULT;
    mg.score += points;
    mg.harvested += 1;
    if (perfect) mg.perfects += 1;
    const rare = p.rare;
    p.stage = 'empty'; p.rare = false;   // le parterre se libère aussitôt
    return { type: 'flower', rare, perfect, points };
  }
  return false;
}
