// Skins : pelages (palette swap) et décors de berge, débloqués via les records.
import { H } from './constants.js';
import { levelFromXp } from './level.js';

// Un pelage remplace des couleurs de la palette au dessin (B corps, C ventre, D contour).
export const FURS = [
  { id: 'roux', icon: '🦦', name: 'Rousse classique', cond: 'Toujours disponible',
    test: () => true, map: null },
  { id: 'choco', icon: '🍫', name: 'Chocolat', cond: 'Servir 20 repas',
    test: r => r.mealsTotal >= 20, map: { B: '#5d3a22', C: '#c9a06b', D: '#2a1a0e' } },
  { id: 'doree', icon: '✨', name: 'Dorée', cond: 'Attraper 50 poissons',
    test: r => r.fishTotal >= 50, map: { B: '#c99a3d', C: '#f4e3b2', D: '#6b4e1a' } },
  { id: 'neige', icon: '❄️', name: 'Neige', cond: 'Donner 25 bains',
    test: r => r.bathsTotal >= 25, map: { B: '#e8e4dc', C: '#ffffff', D: '#8a8578' } },
  { id: 'nuit', icon: '🌙', name: 'Bleu nuit', cond: 'Dormir 20 fois',
    test: r => r.sleepsTotal >= 20, map: { B: '#3d4c6e', C: '#9fb0d0', D: '#1c2438' } },
  { id: 'bonbon', icon: '🍬', name: 'Rose bonbon', cond: 'Gagner 3 combats',
    test: r => r.wins >= 3, map: { B: '#d97ba6', C: '#f7d4e3', D: '#7a3a58' } },
  { id: 'braise', icon: '🔥', name: 'Braise', cond: 'Série de 7 jours d\'affilée',
    test: r => (r.streakBest || 0) >= 7, map: { B: '#b5502a', C: '#f2b28c', D: '#571d0c' } }
];

// Petits décors dessinés sur la berge.
export const DECORS = [
  { id: 'aucun', icon: '🌿', name: 'Berge nature', cond: 'Toujours disponible', test: () => true },
  { id: 'nenuphars', icon: '🪷', name: 'Nénuphars', cond: 'Jouer 5 parties de pêche',
    test: r => r.gamesTotal >= 5 },
  { id: 'lanterne', icon: '🏮', name: 'Lanterne', cond: 'Rapporter un trésor de plongée',
    test: r => r.treasures >= 1 },
  { id: 'fanions', icon: '🎏', name: 'Fanions de combat', cond: 'Livrer 5 combats',
    test: r => r.battles >= 5 },
  { id: 'baies', icon: '🫐', name: 'Bosquet à baies', cond: 'Vivre 5 jours',
    test: r => r.bestAge >= 5 * 24 * H },
  { id: 'feu', icon: '🔥', name: 'Feu de camp', cond: 'Atteindre le niveau 3',
    test: r => levelFromXp(r.xp || 0).level >= 3 }
];

export const furById = id => FURS.find(f => f.id === id) || FURS[0];
export const decorById = id => DECORS.find(d => d.id === id) || DECORS[0];
export const unlockedFurs = rec => FURS.filter(f => f.test(rec)).map(f => f.id);
export const unlockedDecors = rec => DECORS.filter(d => d.test(rec)).map(d => d.id);
