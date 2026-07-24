// Accessoires (chapeaux) à débloquer — conditions basées sur les records GLOBAUX,
// donc un chapeau gagné reste acquis même après avoir recommencé avec un nouvel œuf.
import { H } from './constants.js';
import { levelFromXp } from './level.js';

export const HATS = [
  {
    id: 'noeud', bonus: { fun: 1.10 }, icon: '🎀', name: 'Nœud rose',
    cond: 'Servir 5 repas',
    test: r => r.mealsTotal >= 5,
    rows: [
      '..........PP.PP.',
      '.........PPPPPP.',
      '..........PKKP..',
      '.........PPPPPP.',
      '..........PP.PP.'
    ]
  },
  {
    id: 'beret', bonus: { xp: 1.05 }, icon: '🧢', name: 'Béret bleu',
    cond: 'Jouer 10 parties de pêche',
    test: r => r.gamesTotal >= 10,
    rows: [
      '.......KK.......',
      '......UUUU......',
      '...UUUUUUUUUU...',
      '..UUUUUUUUUUUU..'
    ]
  },
  {
    id: 'fleur', bonus: { luck: 1.15 }, icon: '🌼', name: 'Marguerite',
    cond: 'Donner 10 bains',
    test: r => r.bathsTotal >= 10,
    rows: [
      '..W.W...........',
      '.WYYYW..........',
      '..WYW...........'
    ]
  },
  {
    id: 'couronne', bonus: { xp: 1.12, luck: 1.10 }, icon: '👑', name: 'Couronne dorée',
    cond: 'Élever une loutre jusqu\'à l\'âge adulte',
    test: r => r.bestAge >= 72 * H,
    rows: [
      '....Y..Y..Y.....',
      '....YRYYYYRY....',
      '....YYYYYYYY....'
    ]
  },
  {
    id: 'bonnet', bonus: { energy: 1.15 }, icon: '🌙', name: 'Bonnet de nuit',
    cond: 'Border la loutre 10 fois',
    test: r => r.sleepsTotal >= 10,
    rows: [
      '...........WW...',
      '.....UUUUUW.....',
      '....UUUUUUU.....',
      '...UUUUUUUUU....'
    ]
  },
  {
    id: 'hautform', bonus: { luck: 1.20 }, icon: '🎩', name: 'Haut-de-forme',
    cond: 'Gagner 5 combats',
    test: r => r.wins >= 5,
    rows: [
      '.....KKKKKK.....',
      '.....KKKKKK.....',
      '.....KRRRRK.....',
      '...KKKKKKKKKK...'
    ]
  },
  {
    id: 'etoile', icon: '⭐', name: 'Étoile dorée',
    cond: 'Atteindre le niveau 5',
    test: r => levelFromXp(r.xp || 0).level >= 5,
    rows: [
      '.......YY.......',
      '......YYYY......',
      '....YYYYYYYY....',
      '......YYYY......',
      '.....YY..YY.....'
    ]
  },
  {
    id: 'aureole', icon: '😇', name: 'Auréole',
    cond: 'Atteindre le niveau 10',
    test: r => levelFromXp(r.xp || 0).level >= 10,
    rows: [
      '....YYYYYYYY....',
      '...Y........Y...',
      '....YYYYYYYY....'
    ]
  }
];

export function hatById(id) {
  return HATS.find(h => h.id === id) || null;
}

export function unlockedHats(rec) {
  return HATS.filter(h => h.test(rec)).map(h => h.id);
}
