// Constantes de jeu — ajuster ici pour équilibrer.
// ⚠️ GAME_VERSION : à incrémenter avec package.json et sw.js à chaque release
// (affichée dans ⚙️ Réglages pour vérifier ce que le téléphone exécute).
export const GAME_VERSION = '3.0.0';
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
// Pendant le sommeil — v2.4.1 : sieste vraiment réparatrice (0 -> 100 en 2 h 30,
// la jauge bouge à vue d'œil) ; réveil auto à 100
export const RS = { hunger: 2, fun: 0.5, energyGain: 40, clean: 1 };
export const TREAT_CD = 45 * 60 * 1000;   // friandise : 45 min
export const DIVE_MS = 15 * 60 * 1000;    // plongée : 15 min
export const GRUMPY_MS = 10 * MIN;        // bouderie après un réveil forcé
export const WAKE_OK_ENERGY = 60;         // en-dessous : réveillée trop tôt -> elle boude

// Chez le héron (v2.7) : plus de mort — un rituel de retour en 3 soins espacés
export const AWAY_CARE_NEEDED = 3;
export const AWAY_CARE_CD = 3 * H;

// Éclosion active — v2.5 : s'occuper de l'œuf doit VRAIMENT payer
export const WARM_BOOST = 10 * SEC;       // par réchauffage (bouton ou toucher)
export const WARM_CD = 500;               // délai entre deux réchauffages (ms)
export const SHAKE_BOOST = 8 * SEC;       // par secousse du téléphone
export const SHAKE_CD = 250;              // délai entre deux secousses comptées (ms)
export const SHAKE_G = 16;                // m/s² : au-delà, c'est une vraie secousse (~9.8 au repos)

export const STAGES = { egg: 'ŒUF', baby: 'BÉBÉ', child: 'JEUNE LOUTRE', adult: 'LOUTRE ADULTE' };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
