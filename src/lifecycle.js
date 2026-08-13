/* Le cycle de vie complet (v4.2) — la mortalité douce, en opt-in.
   Rien ici n'est un échec : une loutre bien aimée vit une longue vie, devient
   aînée, puis s'en va paisiblement — et la lignée reprend le fil (voir
   lineage.js + startNew). Tout est réglable par les trois seuils ci-dessous. */

import { H } from './constants.js';

const DAY = 24 * H;

// Trois seuils, réglables d'une ligne :
export const ELDER_AT  = 7  * DAY;  // devient aînée après ~7 jours de vie
export const LIFE_MAX  = 10 * DAY;  // s'en va paisiblement de vieillesse (~10 j)
export const HERON_MAX = 3  * DAY;  // s'en va du héron si on ne la ramène pas (~3 j)

// Le poil argenté des belles histoires : entre l'âge d'aînée et le grand départ.
export function isElder(ageMs) {
  return ageMs >= ELDER_AT && ageMs < LIFE_MAX;
}

// Elle a vécu une vie pleine — le grand départ de vieillesse.
export function passesOfAge(ageMs) {
  return ageMs >= LIFE_MAX;
}

// Trop longtemps chez le héron, sans qu'on la ramène.
export function passesAtHeron(awayMs) {
  return awayMs >= HERON_MAX;
}

// Le motif du grand départ, ou null si elle reste parmi nous.
//  - lifecycle : le mode « cycle de vie complet » est-il activé ? (sinon jamais)
//  - awayMs    : temps passé chez le héron (null si elle n'y est pas)
//  - ageMs     : âge de la loutre
// Le héron passe avant la vieillesse : une longue absence prime sur l'âge.
export function endOfLife({ ageMs = 0, awayMs = null, lifecycle = false } = {}) {
  if (!lifecycle) return null;
  if (awayMs != null && passesAtHeron(awayMs)) return 'heron';
  if (passesOfAge(ageMs)) return 'age';
  return null;
}
