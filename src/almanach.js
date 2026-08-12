// L'Almanach de saison (v3.99) — 8 paliers GRATUITS par saison, débloqués au fil
// des trésors de saison récoltés. Il « s'appuie » sur l'É3 : la progression EST
// rec.treatsBySeason[saison-année] (déjà renseignée par addSeasonTreat), et le
// dernier palier est le cadeau exclusif de la saison. Module PUR : la logique de
// déblocage/réclamation et l'attribution des lots (mutation de rec) sont testables.
import { seasonGiftKey, seasonGift } from './seasonpass.js';

// Récompenses NON-PUISSANCE (gemmes/poissons/coquillages/matériaux d'atelier),
// cadence douce, réinitialisées chaque saison. Palier 8 = le cadeau de la saison.
export const ALMANACH_TIERS = [
  { need: 1, reward: { gems: 5 } },
  { need: 3, reward: { fish: 25 } },
  { need: 6, reward: { shells: 4 } },
  { need: 10, reward: { dupes: 2, dupesTier: 'commun' } },
  { need: 15, reward: { gems: 10 } },
  { need: 22, reward: { fish: 50 } },
  { need: 30, reward: { gems: 18 } },
  { need: 38, reward: { gems: 15, fish: 60, gift: true } },
];

/** Trésors de saison récoltés SOUS LA CLÉ COURANTE (la progression de la piste). */
export function almanachProgress(rec, date = new Date()) {
  const by = rec && rec.treatsBySeason;
  return (by && by[seasonGiftKey(date)]) || 0;
}

/** Palier i déjà réclamé cette (saison, année) ? */
export function tierClaimed(rec, i, date = new Date()) {
  const list = rec && rec.almanach && rec.almanach[seasonGiftKey(date)];
  return !!(Array.isArray(list) && list.includes(i));
}

/** État d'un palier : 'claimed' | 'claimable' | 'locked'. */
export function tierState(rec, i, date = new Date()) {
  const tier = ALMANACH_TIERS[i];
  if (!tier) return 'locked';
  if (tierClaimed(rec, i, date)) return 'claimed';
  return almanachProgress(rec, date) >= tier.need ? 'claimable' : 'locked';
}

/** Un palier au moins est réclamable ? (pour le badge « ! » du bouton 🎁). */
export function almanachHasClaimable(rec, date = new Date()) {
  return ALMANACH_TIERS.some((_, i) => tierState(rec, i, date) === 'claimable');
}

/** Combien de paliers réclamés cette saison (pour l'affichage). */
export function almanachCompletion(rec, date = new Date()) {
  const list = (rec && rec.almanach && rec.almanach[seasonGiftKey(date)]) || [];
  return { claimed: list.length, total: ALMANACH_TIERS.length };
}

/**
 * Réclame le palier i : marque comme pris et crédite le lot (mutation de rec).
 * Retourne la récompense accordée, ou null si le palier n'est pas réclamable.
 * fish crédite le portefeuille ET le compteur à vie ; le palier-cadeau (gift)
 * marque aussi rec.seasonGifts (compat « cadeaux collectionnés »).
 */
export function claimTier(rec, i, date = new Date()) {
  if (!rec || tierState(rec, i, date) !== 'claimable') return null;
  const k = seasonGiftKey(date);
  if (!rec.almanach) rec.almanach = {};
  (rec.almanach[k] = rec.almanach[k] || []).push(i);
  const r = ALMANACH_TIERS[i].reward;
  if (r.gems) rec.gems = (rec.gems || 0) + r.gems;
  if (r.fish) { rec.fish = (rec.fish || 0) + r.fish; rec.fishTotal = (rec.fishTotal || 0) + r.fish; }
  if (r.shells) rec.shells = (rec.shells || 0) + r.shells;
  if (r.dupes && r.dupesTier) { rec.dupes = rec.dupes || {}; rec.dupes[r.dupesTier] = (rec.dupes[r.dupesTier] || 0) + r.dupes; }
  if (r.gift) { rec.seasonGifts = rec.seasonGifts || {}; rec.seasonGifts[k] = true; }
  return r;
}

/** Le cadeau de la saison courante (pour l'en-tête / palier 8). */
export { seasonGift };
