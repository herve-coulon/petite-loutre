// Skins : pelages (palette swap) et décors de berge, débloqués via les records.
import { H } from './constants.js';
import { bonusOf, mergeBonus } from './items.js';
import { levelFromXp } from './level.js';
import { hatById } from './accessories.js';

// Un pelage remplace des couleurs de la palette au dessin (B corps, C ventre, D contour).
export const FURS = [
  { id: 'roux', bonus: { }, icon: '🦦', name: 'Rousse classique', cond: 'Toujours disponible',
    test: () => true, map: null },
  { id: 'choco', bonus: { fun: 1.08 }, icon: '🍫', name: 'Chocolat', cond: 'Servir 20 repas',
    test: r => r.mealsTotal >= 20, map: { B: '#5d3a22', C: '#c9a06b', D: '#2a1a0e' } },
  { id: 'doree', bonus: { xp: 1.10 }, icon: '✨', name: 'Dorée', cond: 'Attraper 50 poissons',
    test: r => r.fishTotal >= 50, map: { B: '#c99a3d', C: '#f4e3b2', D: '#6b4e1a' } },
  { id: 'neige', bonus: { coldResist: 0.45 }, icon: '❄️', name: 'Neige', cond: 'Donner 25 bains',
    test: r => r.bathsTotal >= 25, map: { B: '#d3dfe9', C: '#ffffff', D: '#4f6170' } },
  { id: 'nuit', bonus: { energy: 1.12 }, icon: '🌙', name: 'Bleu nuit', cond: 'Dormir 20 fois',
    test: r => r.sleepsTotal >= 20, map: { B: '#3d4c6e', C: '#9fb0d0', D: '#1c2438' } },
  { id: 'bonbon', bonus: { luck: 1.18 }, icon: '🍬', name: 'Rose bonbon', cond: 'Gagner 3 combats',
    test: r => r.wins >= 3, map: { B: '#d97ba6', C: '#f7d4e3', D: '#7a3a58' } },
  { id: 'braise', bonus: { heatResist: 0.5 }, icon: '🔥', name: 'Braise', cond: 'Série de 7 jours d\'affilée',
    test: r => (r.streakBest || 0) >= 7, map: { B: '#b5502a', C: '#f2b28c', D: '#571d0c' } }
];

// Petits décors dessinés sur la berge.
export const DECORS = [
  { id: 'aucun', icon: '🌿', name: 'Berge nature', cond: 'Toujours disponible', test: () => true },
  { id: 'nenuphars', bonus: { luck: 1.15 }, icon: '🪷', name: 'Nénuphars', cond: 'Jouer 5 parties de pêche',
    test: r => r.gamesTotal >= 5 },
  { id: 'lanterne', bonus: { energy: 1.12 }, icon: '🏮', name: 'Lanterne', cond: 'Rapporter un trésor de plongée',
    test: r => r.treasures >= 1 },
  { id: 'fanions', bonus: { xp: 1.08 }, icon: '🎏', name: 'Fanions de combat', cond: 'Livrer 5 combats',
    test: r => r.battles >= 5 },
  { id: 'baies', bonus: { decay: 0.92 }, icon: '🫐', name: 'Bosquet à baies', cond: 'Vivre 5 jours',
    test: r => r.bestAge >= 5 * 24 * H },
  { id: 'feu', bonus: { coldResist: 0.5 }, icon: '🔥', name: 'Feu de camp', cond: 'Atteindre le niveau 3',
    test: r => levelFromXp(r.xp || 0).level >= 3 }
];

export const furById = id => FURS.find(f => f.id === id) || FURS[0];
export const decorById = id => DECORS.find(d => d.id === id) || DECORS[0];
export const unlockedFurs = rec => FURS.filter(f => f.test(rec)).map(f => f.id);
export const unlockedDecors = rec => DECORS.filter(d => d.test(rec)).map(d => d.id);

/**
 * Tous les bonus portés par la loutre : trésor équipé + chapeau + pelage.
 * Point d'entrée unique — le jeu ne doit interroger que celui-ci, sinon on
 * oublie fatalement une pièce d'équipement quelque part.
 */
export function equipBonus(s) {
  if (!s) return {};
  const hat = hatById(s.hat);
  const fur = furById(s.fur);
  // Le décor AMÉNAGE la berge : c'est un confort du foyer, pas un équipement
  // porté — il ne suit donc pas la loutre quand elle part explorer la vallée.
  const chezSoi = s.place !== 'monde';
  const dec = chezSoi ? decorById(s.decor) : null;
  return mergeBonus(bonusOf(s.gear), hat && hat.bonus, fur && fur.bonus, dec && dec.bonus);
}
