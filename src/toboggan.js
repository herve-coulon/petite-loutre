// Second mini-jeu : le toboggan de rivière. La loutre dévale les rapides sur
// 3 couloirs ; on tape le couloir voulu pour gober les poissons 🐟 et esquiver
// les rochers 🪨. Logique PURE (horloge + hasard injectés), rendue par render.js.
//
// Ce qui fait le sel de la descente :
//  - la vitesse MONTE du début à la fin (tension croissante) ;
//  - les apparitions suivent des MOTIFS lisibles (mur de rochers à une trouée,
//    chapelet de poissons…) plutôt qu'un hasard plat qui ne raconte rien ;
//  - un COMBO récompense les enchaînements et se brise sur un rocher, ce qui
//    crée un vrai choix : tenter le chapelet ou jouer la sécurité.
import { SEC } from './constants.js';

export const SLIDE_DURATION = 20 * SEC;
export const LANES = 3;
export const LANE_X = [40, 80, 120];   // centre x de chaque couloir (canvas 160)
export const SLIDE_OTTER_Y = 276;      // ligne de la loutre, bas de l'écran plein format
export const SLIDE_BOTTOM = 360;       // au-delà, l'item est sorti de l'écran
// Difficulté (v3.64). Mesuré au banc : l'ancienne descente ne faisait encaisser
// AUCUN rocher, même à 480 ms de réaction — le courant laissait près de 3 s pour
// changer de couloir. La fin de descente est maintenant réellement tendue.
export const SPEED_START = 0.11;       // descente en px/ms, au départ
export const SPEED_END = 0.62;         // …et à la fin
export const COMBO_STEP = 3;           // un point bonus tous les 3 poissons d'affilée
export const GOLD_POINTS = 8;
export const ROCK_MALUS = 2;           // un choc coûte des POINTS, pas seulement la série

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function newSlide(now = Date.now(), opts = {}) {
  const duree = Math.round(SLIDE_DURATION * (opts.duree || 1));
  return {
    mode: 'slide',
    score: 0, bumps: 0, lane: 1,
    // « Pied marin » : le premier choc de la descente est absorbé
    amorti: opts.amorti ? 1 : 0,
    duree,
    combo: 0, bestCombo: 0,
    items: [],                 // {lane, y, kind:'fish'|'rock'|'gold', done, got, hit}
    startedAt: now,
    endsAt: now + duree,
    nextItem: now + 600,
    lastTick: now,
    bumpAt: 0, goldAt: 0
  };
}

/** Avancement de la descente : 0 au départ -> 1 à l'arrivée. PUR. */
export function slideProgress(mg, now) {
  return mg ? clamp01((now - mg.startedAt) / (mg.duree || SLIDE_DURATION)) : 0;
}

/** La vitesse du courant à cet instant : elle accélère tout du long. PUR. */
export function slideSpeed(mg, now) {
  return SPEED_START + (SPEED_END - SPEED_START) * slideProgress(mg, now);
}

/** Place la loutre dans le couloir voulu (0..2). PUR. */
export function setSlideLane(mg, lane) {
  if (!mg) return;
  mg.lane = Math.max(0, Math.min(LANES - 1, lane | 0));
}

/** Couloir le plus proche d'une abscisse canvas (pour un toucher). */
export function laneAt(x) {
  return x < LANE_X[0] + 20 ? 0 : x < LANE_X[1] + 20 ? 1 : 2;
}

/**
 * Fait apparaître un MOTIF. Toujours franchissable : un mur de rochers laisse
 * une trouée. Retourne les items créés (pratique pour les tests). PUR.
 */
export function spawnPattern(mg, rnd, opts = {}) {
  const pick = () => Math.floor(rnd() * LANES);
  const add = (lane, kind, y = -8) => {
    const it = { lane, y, kind, done: false };
    mg.items.push(it);
    return it;
  };
  const made = [];
  const r = rnd();
  if (r < 0.20) {                       // mur de rochers avec UNE trouée
    const gap = pick();
    for (let l = 0; l < LANES; l++) if (l !== gap) made.push(add(l, 'rock'));
  } else if (r < 0.40) {                // chapelet de poissons dans un couloir
    const l = pick();
    for (let k = 0; k < 3; k++) made.push(add(l, 'fish', -8 - k * 15));
  } else if (r < 0.56) {
    // CHAPELET PIÉGÉ : un rocher au milieu du chapelet. Tout rafler coûte un
    // choc ; se dérober coûte la série. Sans motifs de ce genre, jouer la
    // sécurité donnait exactement le même score que tout tenter — mesuré au
    // banc : prudent, équilibré et gourmand marquaient tous pareil.
    const l = pick();
    made.push(add(l, 'fish', -8));
    made.push(add(l, 'rock', -8 - 15));
    made.push(add(l, 'fish', -8 - 30));
    made.push(add(l, 'fish', -8 - 45));
  } else if (r < 0.68) {
    // DORÉ GARDÉ : le gros lot juste derrière un rocher, dans le même couloir.
    const l = pick();
    made.push(add(l, 'rock', -8));
    made.push(add(l, 'gold', -8 - 17));
  } else if (r < 0.84) {                // un rocher isolé
    made.push(add(pick(), 'rock'));
  } else if (r < 0.96) {                // un poisson isolé
    made.push(add(pick(), 'fish'));
  } else {                              // poisson doré : gros bonus
    made.push(add(pick(), 'gold'));
  }
  // la chance portée transforme parfois un poisson ordinaire en doré
  if (opts.chance > 1) {
    for (const it of made) {
      if (it.kind === 'fish' && rnd() < Math.min(0.3, 0.1 * (opts.chance - 1) * 10)) it.kind = 'gold';
    }
  }
  return made;
}

/**
 * Fait défiler d'un pas (appelé à chaque frame). Déplace les obstacles, résout
 * les collisions au passage de la loutre, fait apparaître de nouveaux motifs.
 * @returns {null | {type:'end', score, bumps, bestCombo}}
 */
export function tickSlide(mg, now = Date.now(), rnd = Math.random, opts = {}) {
  if (!mg) return null;
  const dt = Math.min(50, Math.max(0, now - mg.lastTick)); // borne le dt (veille)
  mg.lastTick = now;

  const speed = slideSpeed(mg, now);
  for (const it of mg.items) it.y += speed * dt;

  // collision quand un item franchit la ligne de la loutre (une seule fois)
  for (const it of mg.items) {
    if (it.done || it.y < SLIDE_OTTER_Y) continue;
    it.done = true;
    if (it.lane !== mg.lane) continue;
    if (it.kind === 'rock') {
      if (mg.amorti > 0) {                            // pied marin : encaissé sans dommage
        mg.amorti--; it.amorti = true; mg.bumpAt = now;
      } else {
        mg.bumps++; mg.bumpAt = now; it.hit = true;
        mg.combo = 0;                                 // le choc brise l'élan
        // …et coûte des points : sans cela, foncer dans un rocher pour rafler
        // le poisson d'après ne coûtait rien, et la prudence gagnait toujours.
        mg.score = Math.max(0, mg.score - ROCK_MALUS);
      }
    } else {
      mg.combo++;
      mg.bestCombo = Math.max(mg.bestCombo, mg.combo);
      it.got = true;
      if (it.kind === 'gold') { mg.score += GOLD_POINTS; mg.goldAt = now; }
      else mg.score += 1 + Math.floor(mg.combo / COMBO_STEP); // l'élan paie
    }
  }
  mg.items = mg.items.filter(it => it.y < SLIDE_BOTTOM);

  // les motifs se resserrent avec la vitesse, sans voler le temps de réaction
  if (now >= mg.nextItem && now < mg.endsAt - 700) {
    spawnPattern(mg, rnd, opts);
    const p = slideProgress(mg, now);
    mg.nextItem = now + (820 - 520 * p) + rnd() * 180;
  }

  if (now >= mg.endsAt) {
    return { type: 'end', score: mg.score, bumps: mg.bumps, bestCombo: mg.bestCombo };
  }
  return null;
}
