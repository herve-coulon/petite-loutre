// Économie circulaire (É5) — logique PURE (horloge/hasard injectés, testée node --test).
// Aucune dépendance au DOM. Les monnaies dépensables (poissons 🐟, coquillages 🐚)
// sont des portefeuilles séparés des compteurs À VIE (fishTotal, treatsTotal) : on
// dépense le portefeuille sans jamais fausser les records ni le cadeau de saison.
import { hashSeed, makeRng } from './battle.js';

// Échelle de rareté, du plus commun au plus rare — l'ordre EST l'échelle de fusion.
export const TIERS = ['commun', 'rare', 'epique', 'legendaire'];
export function nextTier(t) {
  const i = TIERS.indexOf(t);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

// ── Repas : un vrai poisson rassasie plus qu'une friandise gratuite. ──
export const MEAL_FISH_COST = 1;
export const MEAL_HUNGER = 34;   // vs +10 pour la friandise de secours

// ── Recrutement en POISSONS : doux et progressif selon la taille de l'escouade. ──
export function recruitFishCost(owned) {
  return 6 + Math.max(0, owned | 0) * 6;   // 6, 12, 18, 24, 30…
}

// ── Troc quotidien chez un habitant : deux offres seedées par le jour. ──
// Retourne [{ id, give:{shells}, get:{fish|gems} }] — coquillages ↔ poissons/gemmes.
export function dailyBarter(dayKey) {
  const rng = makeRng(hashSeed('barter|' + dayKey));
  const shellsF = 2 + Math.floor(rng() * 3);   // 2..4 coquillages
  const fishGet = 5 + Math.floor(rng() * 6);   // → 5..10 poissons
  const shellsG = 3 + Math.floor(rng() * 3);   // 3..5 coquillages
  const gemsGet = 1 + Math.floor(rng() * 2);   // → 1..2 gemmes
  return [
    { id: 'fish', give: { shells: shellsF }, get: { fish: fishGet } },
    { id: 'gems', give: { shells: shellsG }, get: { gems: gemsGet } }
  ];
}

// ── Atelier : 3 doublons d'un tier → 1 trésor du tier supérieur (choix parmi 2). ──
export const CRAFT_NEED = 3;
export function canCraft(dupes, tier) {
  return !!nextTier(tier) && (((dupes && dupes[tier]) || 0) >= CRAFT_NEED);
}
// Deux candidats du tier supérieur, seedés par (jour, tier, n° de fusion) — choix stable.
// poolByTier : { tier: [ids…] }. Retourne 0..2 ids déterministes.
export function craftChoices(tier, poolByTier, dayKey, n = 0) {
  const up = nextTier(tier);
  if (!up) return [];
  const pool = ((poolByTier && poolByTier[up]) || []).slice();
  if (pool.length <= 2) return pool;
  const rng = makeRng(hashSeed('craft|' + dayKey + '|' + tier + '|' + n));
  const out = [];
  while (out.length < 2 && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}
