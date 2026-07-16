// Récompenses de saison : un cadeau exclusif par saison, à réclamer une fois
// par (saison, année). Rythme l'aventure sur le vrai calendrier — comme la
// berge saisonnière et la surprise du jour. Module PUR : la logique de
// déblocage/réclamation est testable, l'attribution concrète (au vestiaire,
// à l'inventaire) est faite par l'orchestrateur via l'`id` du cadeau.
import { seasonFor } from './seasons.js';

/** Le cadeau exclusif de chaque saison (id abstrait -> mappé par l'orchestrateur). */
// Chaque saison offre un « cadeau » à réclamer une fois : un lot de gemmes 💎 +
// poissons 🐟 (source concrète de gemmes). id/emoji/name conservés (feature +
// tests) ; gems/fish = la récompense octroyée par l'orchestrateur.
export const SEASON_GIFTS = {
  printemps: { id: 'cadeau_printemps', emoji: '🌸', name: 'Cadeau du printemps', gems: 15, fish: 60 },
  ete:       { id: 'cadeau_ete',       emoji: '🌞', name: "Cadeau d'été",         gems: 15, fish: 60 },
  automne:   { id: 'cadeau_automne',   emoji: '🍂', name: "Cadeau d'automne",     gems: 15, fish: 60 },
  hiver:     { id: 'cadeau_hiver',     emoji: '❄️', name: "Cadeau d'hiver",       gems: 15, fish: 60 }
};

/** Combien de trésors de saison récoltés prouvent qu'on a joué cette saison. */
export const GIFT_NEED_TREATS = 1;

/** Clé unique du cadeau courant : saison + année (ex. 'ete-2026'). */
export function seasonGiftKey(date = new Date()) {
  return seasonFor(date) + '-' + date.getFullYear();
}

/** Le cadeau de la saison courante. */
export function seasonGift(date = new Date()) {
  return SEASON_GIFTS[seasonFor(date)];
}

/** Déjà réclamé pour cette (saison, année) ? (`rec.seasonGifts` = map des clés). */
export function giftClaimed(rec, date = new Date()) {
  return !!(rec && rec.seasonGifts && rec.seasonGifts[seasonGiftKey(date)]);
}

/**
 * Réclamable si : pas encore pris cette saison ET la preuve de jeu est là
 * (au moins `GIFT_NEED_TREATS` trésor de saison récolté). Simple et tolérant.
 */
export function giftClaimable(rec, date = new Date()) {
  if (!rec || giftClaimed(rec, date)) return false;
  return (rec.treatsTotal || 0) >= GIFT_NEED_TREATS;
}

/**
 * Réclame le cadeau de la saison (mutation de `rec`). Retourne le cadeau
 * (id/emoji/name/kind) si accordé, ou null s'il n'est pas disponible.
 */
export function claimSeasonGift(rec, date = new Date()) {
  if (!giftClaimable(rec, date)) return null;
  if (!rec.seasonGifts) rec.seasonGifts = {};
  rec.seasonGifts[seasonGiftKey(date)] = true;
  return seasonGift(date);
}

/** Nombre de cadeaux de saison déjà collectionnés (pour l'affichage/les succès). */
export function giftsCollected(rec) {
  return rec && rec.seasonGifts ? Object.keys(rec.seasonGifts).length : 0;
}
