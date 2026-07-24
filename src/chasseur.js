// LE CHASSEUR — le seul vrai prédateur de la loutre : l'homme.
//
// Jusqu'ici la vallée était sans danger : on s'y promenait, on ramassait, on
// défiait des championnes qui ne mordaient pas vraiment. Le chasseur change la
// nature de la promenade — il faut désormais REGARDER autour de soi.
//
// Trois principes, pour qu'il fasse peur sans être injuste :
//   • il se VOIT venir : il patrouille à découvert, et son alerte est
//     télégraphiée (un « ! ») avant qu'il ne s'élance ;
//   • il est SEMÉ : il court moins vite qu'une loutre lancée, et il perd sa
//     trace si on le distance ;
//   • il ne va JAMAIS dans la clairière : le carrefour reste un refuge.
//
// Module PUR : ni DOM, ni horloge, ni hasard non injecté. Les collisions sont
// passées en paramètre pour qu'il ne connaisse pas la carte.

export const VUE = 92;           // portée de vision, en pixels
export const OUBLI = 190;        // au-delà, il perd la trace
export const PRISE = 13;         // à cette distance, il l'attrape
export const PAS_PATROUILLE = 0.32;
export const PAS_POURSUITE = 0.98;   // la loutre lancée va à 1,4 : on peut le semer
export const ALERTE_MS = 620;    // le temps qu'il met à réagir — la fenêtre pour fuir
export const DEGATS_CAPTURE = 25;

/** Générateur seedé (mêmes traces pour tout le monde, le même jour). */
function rngFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

/**
 * Rôde-t-il dans ce lieu aujourd'hui ? Déterminé par la date : la vallée est la
 * même pour tout le monde ce jour-là, et l'on peut apprendre où ne pas aller.
 * @param refuge zone où il ne vient jamais (le carrefour)
 */
export function chasseurRode(zone, dayKey, refuge) {
  if (zone === refuge) return false;
  return rngFrom('chasseur|' + zone + '|' + dayKey)() < 0.45;
}

/**
 * Le chasseur du jour pour ce lieu, avec sa ronde. Les points de passage sont
 * seedés : sa ronde est la même toute la journée, donc observable.
 * @param libre (cx,cy) -> vrai si la case est praticable
 */
export function newChasseur(zone, dayKey, mapW, mapH, tile, libre) {
  const rnd = rngFrom('ronde|' + zone + '|' + dayKey);
  const points = [];
  for (let i = 0; i < 40 && points.length < 4; i++) {
    const cx = Math.floor(rnd() * mapW), cy = Math.floor(rnd() * mapH);
    if (!libre(cx, cy)) continue;
    points.push({ x: cx * tile + tile / 2, y: cy * tile + tile - 2 });
  }
  if (!points.length) return null;
  return {
    zone,
    x: points[0].x, y: points[0].y,
    points, cible: 1 % points.length,
    etat: 'patrouille',        // patrouille | alerte | poursuite
    alerteA: 0,                // horodatage du repérage
    facing: 1
  };
}

/** Distance à la loutre. */
const dist = (ch, px, py) => Math.hypot(px - ch.x, py - ch.y);

/**
 * Avance d'un pas. Renvoie l'ÉVÉNEMENT survenu, à l'orchestrateur d'agir :
 * 'repere' (il vient de la voir), 'capture', ou null.
 * @param bouge (x,y,dx,dy) -> nouvelle position en tenant compte des obstacles
 */
export function stepChasseur(ch, px, py, now, bouge) {
  if (!ch) return null;
  const d = dist(ch, px, py);
  let evt = null;

  if (ch.etat === 'patrouille') {
    if (d < VUE) { ch.etat = 'alerte'; ch.alerteA = now; evt = 'repere'; }
  } else if (ch.etat === 'alerte') {
    // il s'immobilise, épaule son arme : c'est LA fenêtre pour détaler
    if (now - ch.alerteA >= ALERTE_MS) ch.etat = d < OUBLI ? 'poursuite' : 'patrouille';
  } else if (ch.etat === 'poursuite') {
    if (d > OUBLI) ch.etat = 'patrouille';           // semé
  }

  if (ch.etat === 'alerte') return evt;              // il ne bouge pas pendant l'alerte

  if (ch.etat === 'poursuite') {
    const k = PAS_POURSUITE / (d || 1);
    const p = bouge(ch.x, ch.y, (px - ch.x) * k, (py - ch.y) * k);
    ch.facing = px < ch.x ? -1 : 1;
    ch.x = p.x; ch.y = p.y;
    if (dist(ch, px, py) < PRISE) return 'capture';
    return evt;
  }

  // ronde : il rejoint son point de passage, puis passe au suivant
  const c = ch.points[ch.cible];
  const dx = c.x - ch.x, dy = c.y - ch.y, dd = Math.hypot(dx, dy);
  if (dd < 4) { ch.cible = (ch.cible + 1) % ch.points.length; return evt; }
  const k = PAS_PATROUILLE / dd;
  const p = bouge(ch.x, ch.y, dx * k, dy * k);
  if (p.x === ch.x && p.y === ch.y) {                // coincé : il change de cap
    ch.cible = (ch.cible + 1) % ch.points.length;
  } else {
    ch.facing = dx < 0 ? -1 : 1;
    ch.x = p.x; ch.y = p.y;
  }
  return evt;
}
