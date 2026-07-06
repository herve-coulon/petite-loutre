// Succès (globaux, conservés d'une loutre à l'autre via les records).
import { H } from './constants.js';
import { HATS, unlockedHats } from './accessories.js';
import { FURS, unlockedFurs } from './skins.js';

export const ACHIEVEMENTS = [
  { id: 'naissance', icon: '🥚', name: 'Première éclosion', desc: 'Faire éclore un œuf',
    test: (s, r) => (s && s.stage !== 'egg') || r.otters >= 1 || r.bestAge > 0 },
  { id: 'bain', icon: '🫧', name: 'Toute propre', desc: 'Donner un premier bain',
    test: (s, r) => r.bathsTotal >= 1 },
  { id: 'gourmande', icon: '🐟', name: 'Fine bouche', desc: 'Servir 10 repas',
    test: (s, r) => r.mealsTotal >= 10 },
  { id: 'jeune', icon: '🌱', name: 'Ça pousse !', desc: 'Atteindre le stade jeune loutre (1 jour)',
    test: (s, r) => r.bestAge >= 24 * H },
  { id: 'adulte', icon: '🦦', name: 'Grande demoiselle', desc: 'Atteindre le stade adulte (3 jours)',
    test: (s, r) => r.bestAge >= 72 * H },
  { id: 'parfaite', icon: '🎯', name: 'Pêche royale', desc: 'Réussir une pêche parfaite (5 poissons ou plus)',
    test: (s, r) => r.perfectGames >= 1 },
  { id: 'doyenne', icon: '🏵️', name: 'Doyenne de la rivière', desc: 'Garder une loutre en vie 5 jours',
    test: (s, r) => r.bestAge >= 5 * 24 * H },
  { id: 'fashion', icon: '🎩', name: 'Fashionista', desc: 'Débloquer tous les accessoires',
    test: (s, r) => unlockedHats(r).length === HATS.length },
  { id: 'combattante', icon: '⚔️', name: 'Première victoire', desc: 'Gagner un combat de loutres',
    test: (s, r) => r.wins >= 1 },
  { id: 'plongeuse', icon: '🤿', name: 'Chasseuse de trésors', desc: 'Rapporter un trésor de plongée',
    test: (s, r) => r.treasures >= 1 },
  { id: 'collection', icon: '🌈', name: 'Collectionneuse', desc: 'Débloquer tous les pelages',
    test: (s, r) => unlockedFurs(r).length === FURS.length }
];

/** Marque les succès nouvellement obtenus dans rec et les retourne. */
export function newAchievements(s, rec) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (!rec.achievements.includes(a.id) && a.test(s, rec)) {
      rec.achievements.push(a.id);
      got.push(a);
    }
  }
  return got;
}
