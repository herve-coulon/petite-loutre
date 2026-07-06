// Constantes de jeu — ajuster ici pour équilibrer.
export const SEC = 1000;
export const MIN = 60 * SEC;
export const H = 60 * MIN;

export const SAVE_KEY = 'petite_loutre_v2';
export const HATCH_MS = 2 * MIN;        // éclosion 2 min après adoption
export const CHILD_AT = 24 * H;         // bébé -> jeune loutre à J+1
export const ADULT_AT = 72 * H;         // jeune -> adulte à J+3
export const MAX_OFFLINE = 7 * 24 * H;  // rattrapage hors-ligne plafonné

// Décroissance par heure (éveillée) — v2.3 : rythme plus nerveux
export const R = { hunger: 6, fun: 5, energy: 3, clean: 2.5 };
// Pendant le sommeil (récupération plus rapide -> on revient vite jouer)
export const RS = { hunger: 2, fun: 0.5, energyGain: 22, clean: 1 };
export const TREAT_CD = 45 * 60 * 1000;   // friandise : 45 min
export const DIVE_MS = 15 * 60 * 1000;    // plongée : 15 min

export const STAGES = { egg: 'ŒUF', baby: 'BÉBÉ', child: 'JEUNE LOUTRE', adult: 'LOUTRE ADULTE' };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
