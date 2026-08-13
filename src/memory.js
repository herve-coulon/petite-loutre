/* Le souvenir jouable (v4.3) — quand on rejoue le rêve d'une loutre passée.
   Rien de mécanique ici : juste une phrase tendre, STABLE pour une même loutre
   (déterministe via son nom + son caractère), teintée par sa personnalité. */

import { hashSeed } from './battle.js';

// De petits riens qu'on garde de toutes les loutres.
const DETAILS = [
  'ses siestes au soleil, le museau posé contre le tien',
  'sa manière de filer sous l’eau puis de remonter, ravie',
  'ce petit cri de joie quand tu approchais',
  'ses roulades dans l’herbe, encore trempée après le bain',
  'la façon dont elle s’endormait, une patte sur le cœur',
  'ses yeux tout ronds devant la première neige',
  'ses éclaboussures du matin, rien que pour te réveiller',
  'sa petite danse, les jours de grand soleil'
];

// Un souvenir coloré par le caractère (cf. TRAITS dans personality.js).
const BY_TRAIT = {
  gourmande:   'ses yeux immenses devant un poisson bien frais',
  joueuse:     'ce toboggan qu’elle ne voulait jamais quitter',
  dormeuse:    'ses siestes interminables, en petit tas de bonheur',
  caline:      'ses câlins sans fin — toujours un de plus',
  coquette:    'ses bains soignés, jusqu’au dernier poil qui brille',
  aventuriere: 'sa curiosité sans limite, ce museau fourré partout'
};

// Une phrase de souvenir pour une aïeule {name, trait, …}.
// Déterministe : la même loutre évoque toujours le même souvenir.
export function remembrance(anc) {
  const a = anc || {};
  const name = a.name || 'Elle';
  const seed = hashSeed(name + '|' + (a.trait || ''));
  const detail = BY_TRAIT[a.trait] || DETAILS[seed % DETAILS.length];
  return {
    intro: 'Tu te souviens de ' + name + '…',
    detail: detail + '.',
    close: 'Elle veille sur la lignée, à sa façon.'
  };
}
