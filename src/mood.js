// Humeurs et petites manies de la loutre — module PUR (aucune dépendance DOM).
// Le rendu s'appuie dessus pour choisir yeux, bouche et animations d'attente.

/**
 * Humeur affichée, par priorité décroissante.
 * @returns {'dodo'|'malade'|'affamee'|'boudeuse'|'contente'|'neutre'|null}
 */
export function moodOf(s) {
  if (!s || s.stage === 'egg' || s.gameOver) return null;
  if (s.sleeping) return 'dodo';
  if (s.sick) return 'malade';
  if (s.hunger < 30) return 'affamee';
  if (s.fun < 30) return 'boudeuse';
  if (s.fun >= 70 && s.hunger >= 45 && s.health >= 60) return 'contente';
  return 'neutre';
}

/* ---------------- Animations d'attente (idle) ---------------- */

export const IDLES = ['gratte', 'baille', 'caillou'];

/** Durées en frames (~60 fps). */
export const IDLE_FRAMES = { gratte: 72, baille: 84, caillou: 108 };

/** Tire une animation d'attente (RNG injectable pour les tests). */
export function pickIdle(rnd = Math.random) {
  return IDLES[Math.min(IDLES.length - 1, Math.floor(rnd() * IDLES.length))];
}

/** La loutre est-elle assez tranquille pour une petite manie ? */
export function canIdle(mood) {
  return mood === 'neutre' || mood === 'contente';
}
