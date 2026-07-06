// Accessoires (chapeaux) à débloquer — conditions basées sur les records GLOBAUX,
// donc un chapeau gagné reste acquis même après avoir recommencé avec un nouvel œuf.
import { H } from './constants.js';

export const HATS = [
  {
    id: 'noeud', icon: '🎀', name: 'Nœud rose',
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
    id: 'beret', icon: '🧢', name: 'Béret bleu',
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
    id: 'fleur', icon: '🌼', name: 'Marguerite',
    cond: 'Donner 10 bains',
    test: r => r.bathsTotal >= 10,
    rows: [
      '..W.W...........',
      '.WYYYW..........',
      '..WYW...........'
    ]
  },
  {
    id: 'couronne', icon: '👑', name: 'Couronne dorée',
    cond: 'Élever une loutre jusqu\'à l\'âge adulte',
    test: r => r.bestAge >= 72 * H,
    rows: [
      '....Y..Y..Y.....',
      '....YRYYYYRY....',
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
