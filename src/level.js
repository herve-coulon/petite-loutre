// Niveaux du soigneur : chaque geste pour la loutre rapporte de l'XP.
// Le niveau est GLOBAL (records) — il survit aux loutres, comme les chapeaux.
// Module PUR, aucune dépendance.

/** Barème : XP gagnée par action (jouer doit payer, s'occuper aussi). */
export const XP = {
  meal: 5,      // servir un repas
  wash: 5,      // donner un bain
  game: 8,      // jouer une partie de pêche…
  fish: 2,      // …+ bonus par poisson attrapé
  pet: 3,       // câlin (au plus toutes les 20 s)
  treat: 6,     // friandise
  dive: 15,     // trésor remonté de plongée
  battle: 10,   // livrer un combat…
  win: 20,      // …le gagner
  quest: 25,    // quête du jour réussie
  evolve: 50,   // la loutre grandit
  hatch: 10,    // éclosion
  reunion: 20,  // la ramener de chez le héron
  event: 10     // surprise du jour (papillon attrapé…)
};

/** Coût pour passer du niveau n au suivant (croissance douce mais réelle). */
export function xpCost(level) {
  return 40 + (level - 1) * 25;
}

/**
 * Niveau atteint pour un total d'XP.
 * @returns {{level:number, cur:number, next:number}} cur/next = progression dans le niveau
 */
export function levelFromXp(xp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp || 0));
  while (rest >= xpCost(level) && level < 99) {
    rest -= xpCost(level);
    level++;
  }
  return { level, cur: rest, next: xpCost(level) };
}

/** Titres honorifiques, par palier (affichés dans le bandeau et sur la carte photo). */
export const TITLES = [
  [1, 'Apprenti soigneur'],
  [3, 'Ami des loutres'],
  [5, 'Gardien de la rivière'],
  [8, 'Grand soigneur'],
  [12, 'Murmureur de loutres'],
  [16, 'Légende de la berge']
];

export function titleFor(level) {
  let t = TITLES[0][1];
  for (const [l, name] of TITLES) if (level >= l) t = name;
  return t;
}
