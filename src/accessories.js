// Accessoires (chapeaux) à débloquer — conditions basées sur les records GLOBAUX,
// donc un chapeau gagné reste acquis même après avoir recommencé avec un nouvel œuf.
import { H } from './constants.js';
import { levelFromXp } from './level.js';
import { EPREUVE_ZONES } from './tilemap.js';

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
    // Récompense de collection : on ne l'obtient qu'en battant les six
    // championnes de la vallée. Le laurier se voit sur la tête, partout —
    // c'est le trophée qu'on porte plutôt qu'on range.
    id: 'laurier', bonus: { xp: 1.18, fun: 1.10 }, icon: '🥇', name: 'Laurier des épreuves',
    cond: 'Battre les ' + EPREUVE_ZONES.length + ' championnes de la vallée',
    test: r => (r.epreuves || []).length >= EPREUVE_ZONES.length,
    // laurier DORÉ : la palette des sprites n'a pas de vert (G y est un gris
    // bleuté), et un laurier grisâtre n'aurait rien d'un trophée
    // Couronne BASSE et large : deux branches montantes se lisaient comme des
    // bois de cerf. Les feuilles restent près du bandeau, qui ceint la tête.
    rows: [
      '..Y.Y......Y.Y..',
      '.YOYOY....YOYOY.',
      '..YYYYYYYYYYYY..'
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
