// Événement du jour : une petite surprise sur la berge, tirée de la date
// (déterministe -> identique pour tous les joueurs, comme les quêtes).
// Module PUR ; le rendu et l'interaction vivent dans render.js / main.js.
import { hashSeed, makeRng } from './battle.js';

export const DAILY_EVENTS = [
  { id: 'papillon', icon: '🦋', label: 'Un papillon rare visite la berge — attrape-le !' },
  { id: 'pluie', icon: '🌦️', label: 'Petite pluie douce : des champignons ont poussé' },
  { id: 'heron', icon: '🪶', label: 'Un héron pêche au bord de l\'eau' },
  { id: 'canetons', icon: '🐤', label: 'Des canetons traversent la rivière' },
  { id: 'arcenciel', icon: '🌈', label: 'Un arc-en-ciel enjambe la rivière' }
];

/** L'événement d'une date (YYYY-MM-DD). */
export function dailyEvent(date) {
  const rng = makeRng(hashSeed('event-' + date));
  return DAILY_EVENTS[Math.floor(rng() * DAILY_EVENTS.length)];
}

/** Position du papillon à la frame donnée (partagée entre rendu et hitbox). */
export function butterflyPos(frame) {
  return {
    x: 80 + Math.sin(frame / 29) * 50 + Math.sin(frame / 9) * 6,
    y: 56 + Math.sin(frame / 11) * 10
  };
}
