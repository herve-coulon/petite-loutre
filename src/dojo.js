// Le Dojo de parade (v4.0) — un entraînement QUOTIDIEN à la parade. Logique PURE,
// seedée par le jour (même enchaînement pour tous), jugée au temps réel (Date.now
// injecté par l'orchestrateur). Aucune dépendance au DOM ni au rendu canvas.
import { hashSeed, makeRng } from './battle.js';

export const DOJO_STRIKES = 8;   // assauts par séance

/**
 * L'enchaînement du jour : une liste d'assauts, chacun avec un temps d'annonce
 * (windup) puis une fenêtre de parade (window) — de plus en plus serrée. Seedé
 * par la date → identique pour deux joueurs le même jour.
 */
export function dailyDojo(dayKey) {
  const rng = makeRng(hashSeed('dojo|' + dayKey));
  const strikes = [];
  for (let i = 0; i < DOJO_STRIKES; i++) {
    const t = i / (DOJO_STRIKES - 1);                         // 0 → 1 : ça se durcit
    const windup = Math.round(1100 - t * 450 + rng() * 300);  // 1100 → 650 ms (+ jitter)
    const window = Math.round(760 - t * 320 + rng() * 120);   // 760 → 440 ms (+ jitter)
    strikes.push({ windup, window });
  }
  return { strikes };
}

/**
 * Juge une parade : `elapsed` = ms écoulées DEPUIS l'ouverture de la fenêtre
 * (négatif = touché pendant l'annonce = trop tôt). Retourne 'perfect'|'good'|'miss'.
 * Parfait au centre de la fenêtre (le vrai temps de la parade).
 */
export function judgeParry(windowMs, elapsed) {
  if (elapsed == null || elapsed < 0 || elapsed > windowMs) return 'miss';
  const center = windowMs / 2;
  return Math.abs(elapsed - center) <= windowMs * 0.2 ? 'perfect' : 'good';
}

/** Points d'une parade selon la qualité et le combo courant (parades enchaînées). */
export function parryScore(quality, combo = 0) {
  if (quality === 'perfect') return 10 + Math.min(10, combo * 2);   // le combo récompense la régularité
  if (quality === 'good') return 5;
  return 0;
}

/** Le combo suivant : +1 sur parfait/bien, remis à 0 sur raté. */
export function nextCombo(quality, combo = 0) {
  return quality === 'miss' ? 0 : combo + 1;
}

/** Score MAX théorique d'une séance (8 parfaits enchaînés) — pour les rangs. */
export function dojoMaxScore() {
  let s = 0, combo = 0;
  for (let i = 0; i < DOJO_STRIKES; i++) { s += parryScore('perfect', combo); combo = nextCombo('perfect', combo); }
  return s;
}

// Ceintures selon la fraction du score max atteinte (flavor du dojo).
const BELTS = [
  { min: 0, name: 'blanche', emoji: '⚪' },
  { min: 0.35, name: 'jaune', emoji: '🟡' },
  { min: 0.55, name: 'orange', emoji: '🟠' },
  { min: 0.72, name: 'verte', emoji: '🟢' },
  { min: 0.86, name: 'bleue', emoji: '🔵' },
  { min: 0.97, name: 'noire', emoji: '⚫' },
];
export function beltFor(score) {
  const frac = score / Math.max(1, dojoMaxScore());
  let belt = BELTS[0];
  for (const b of BELTS) if (frac >= b.min) belt = b;
  return belt;
}

/** Récompense du jour, dosée au score — NON-puissance (gemmes + poissons + XP). */
export function dojoReward(score) {
  const max = dojoMaxScore();
  const frac = Math.max(0, Math.min(1, score / Math.max(1, max)));
  return {
    gems: Math.round(1 + frac * 4),    // 1..5 gemmes
    fish: Math.round(6 + frac * 24),   // 6..30 poissons
    xp: Math.round(20 + frac * 60),    // 20..80 XP
  };
}
