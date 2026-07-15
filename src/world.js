// L'aventure à trois échelles emboîtées : MONDE (carte de la vallée) →
// BERGE (le foyer de la loutre, cœur du soin) → TANIÈRE (l'intérieur, la
// collection). La tanière est un « zoom » interne à la berge, pas un lieu de
// la carte. Les AUTRES lieux du Monde s'ouvrent au fil des niveaux et auront
// chacun leur mini-scène à terme (amont, cascade, forêt…).
//
// Module PUR (aucune dépendance au DOM) : tout est testable.

/** Les échelles de navigation. `place` de l'état vaut l'une de ces valeurs. */
export const SCALES = ['monde', 'berge', 'taniere'];

/**
 * Les lieux de la carte du Monde. `unlockLevel` = niveau du soigneur requis.
 * `x`/`y` = position sur la carte (coords logiques, indépendantes du rendu).
 * `scale` = l'échelle où l'on atterrit en entrant (aujourd'hui seule la berge
 * a une vraie scène ; les autres sont `null` -> « à venir »).
 * `home:true` = le foyer de la loutre (contient la tanière).
 */
export const LOCATIONS = [
  { id: 'berge',   name: 'La berge',      emoji: '🦦', unlockLevel: 1,  x: 50, y: 55, scale: 'berge', home: true },
  { id: 'amont',   name: "L'amont",       emoji: '🎣', unlockLevel: 6,  x: 76, y: 34, scale: null },
  { id: 'cascade', name: 'La cascade',    emoji: '💧', unlockLevel: 12, x: 28, y: 26, scale: null },
  { id: 'foret',   name: 'La forêt',      emoji: '🌲', unlockLevel: 20, x: 82, y: 72, scale: null },
  { id: 'lac',     name: 'Le grand lac',  emoji: '🏞️', unlockLevel: 32, x: 22, y: 80, scale: null }
];

export const locationById = id => LOCATIONS.find(l => l.id === id) || LOCATIONS[0];

/** Un lieu est-il ouvert au niveau donné ? */
export const locationUnlocked = (loc, level) => !!loc && (level || 0) >= (loc.unlockLevel || 1);

/** Les lieux accessibles au niveau donné (au moins la berge). */
export function unlockedLocations(level) {
  return LOCATIONS.filter(l => locationUnlocked(l, level));
}

/** Le prochain lieu à débloquer (pour téléguider la progression), ou null. */
export function nextLocation(level) {
  return LOCATIONS
    .filter(l => !locationUnlocked(l, level))
    .sort((a, b) => a.unlockLevel - b.unlockLevel)[0] || null;
}

/**
 * Une échelle est-elle accessible dans l'état courant ?
 * - monde : toujours (vue d'ensemble).
 * - berge : toujours (le foyer).
 * - taniere : seulement depuis la berge, quand la loutre est là (pas œuf/héron).
 */
export function canEnter(scale, s) {
  if (!SCALES.includes(scale)) return false;
  if (scale === 'monde' || scale === 'berge') return true;
  if (scale === 'taniere') return !!s && !s.gameOver && !s.away && s.stage !== 'egg';
  return false;
}

/** Échelle normalisée valide (repli sur 'berge' si inconnue). */
export function normalizeScale(scale) {
  return SCALES.includes(scale) ? scale : 'berge';
}
