// Constantes de jeu — ajuster ici pour équilibrer.
// ⚠️ GAME_VERSION : à incrémenter avec package.json et sw.js à chaque release
// (affichée dans ⚙️ Réglages pour vérifier ce que le téléphone exécute).
export const GAME_VERSION = '3.16.0';
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

// v3.4 — les saisons pèsent sur la santé (« marqué » mais toujours télégraphié).
// Été : la chaleur donne soif (faim ↑) et fatigue (humeur/énergie ↑) ; si elle
// n'est pas rafraîchie (propreté basse), elle surchauffe et perd de la santé.
// Hiver : le froid fait attraper froid — risque de maladie accru, pire si elle
// est affaiblie (peu d'énergie/de nourriture). On contre avec les gestes
// existants : Laver rafraîchit l'été, Manger/Dodo/câlins réchauffent l'hiver.
export const SEASON_FX = {
  HEAT_MULT: { hunger: 1.4, fun: 1.3, energy: 1.3 }, // décroissance ×… en été
  HEAT_OVERHEAT_HP: 3,      // santé/h perdue si elle surchauffe (propreté < seuil)
  HEAT_OVERHEAT_CLEAN: 30,
  COLD_SICK: 0.02,          // maladie/h en plus l'hiver
  COLD_SICK_TIRED: 0.03,    // … encore plus si énergie basse
  COLD_SICK_HUNGRY: 0.02,   // … et si elle a faim
  COLD_LOW_ENERGY: 40,
  COLD_LOW_HUNGER: 40
};
// Pendant le sommeil — v2.4.1 : sieste vraiment réparatrice (0 -> 100 en 2 h 30,
// la jauge bouge à vue d'œil) ; réveil auto à 100
export const RS = { hunger: 2, fun: 0.5, energyGain: 40, clean: 1 };
export const TREAT_CD = 45 * 60 * 1000;   // friandise : 45 min
export const DIVE_MS = 15 * 60 * 1000;    // plongée : 15 min
export const GRUMPY_MS = 10 * MIN;        // bouderie après un réveil forcé
export const WAKE_OK_ENERGY = 60;         // en-dessous : réveillée trop tôt -> elle boude

// v3.6 — les activités se débloquent au fil des NIVEAUX du soigneur (plus par
// stade de vie) : chaque montée de niveau offre une nouvelle chose à faire.
export const UNLOCK_LEVEL = { treat: 2, slide: 3, dive: 6, battle: 10 };

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
