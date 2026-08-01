// Techniques passives : déblocage par progression + buffs de combat.
// Les techniques d'ATTAQUE sont dans battle.js ; celles-ci sont des
// talents passifs qui modifient les formules du nouveau duel tour-par-tour.
import { COFFRE_ZONES, EPREUVE_ZONES } from './tilemap.js';
import { levelFromXp } from './level.js';

export const PASSIVE_TECHNIQUES = [
  {
    id: 'riposte', icon: '↩️', name: 'Riposte affûtée',
    cond: 'Remporter 5 duels',
    desc: 'Tes attaques font 20% de dégâts en plus.',
    test: r => (r.wins || 0) >= 5,
    effet: { force: 1.2 }
  },
  {
    id: 'cuirasse', icon: '🛡️', name: 'Cuirasse',
    cond: 'Remporter 20 duels',
    desc: 'Tu encaisses 15% de dégâts en moins.',
    test: r => (r.wins || 0) >= 20,
    effet: { encaisse: 0.85 }
  },
  {
    id: 'souffle', icon: '🌬️', name: 'Second souffle',
    cond: 'Ouvrir 4 coffres',
    desc: 'Sous 25% PV, un coup fatal est encaissé une fois par duel.',
    test: r => (r.chests || []).length >= 4,
    effet: { secondSouffle: true }
  },
  {
    id: 'oeil', icon: '🎣', name: 'Œil de pêcheuse',
    cond: 'Jouer 20 parties de pêche',
    desc: 'Tu attrapes les poissons de plus loin.',
    test: r => (r.gamesTotal || 0) >= 20,
    effet: { pad: 4 }
  },
  {
    id: 'piedmarin', icon: '🛶', name: 'Pied marin',
    cond: 'Dévaler 20 descentes',
    desc: 'Le premier rocher de chaque descente ne te fait rien.',
    test: r => (r.slidesTotal || 0) >= 20,
    effet: { amorti: true }
  },
  {
    id: 'endurance', icon: '⏳', name: 'Endurance',
    cond: 'Jouer 60 parties (pêche et toboggan)',
    desc: 'Tes mini-jeux durent 20% plus longtemps.',
    test: r => ((r.gamesTotal || 0) + (r.slidesTotal || 0)) >= 60,
    effet: { duree: 1.2 }
  },
  {
    id: 'veterane', icon: '🎖️', name: 'Vétérane',
    cond: 'Atteindre le niveau 20',
    desc: 'Tes coups frappent 10% plus fort.',
    test: r => levelFromXp(r.xp || 0).level >= 20,
    effet: { force: 1.1 }
  }
];

export const techniqueById = id => PASSIVE_TECHNIQUES.find(t => t.id === id) || null;

/** Les techniques acquises, dans l'ordre. */
export function unlockedTechniques(rec) {
  const r = rec || {};
  return PASSIVE_TECHNIQUES.filter(t => t.test(r)).map(t => t.id);
}

/**
 * Effets cumulés pour les mini-jeux.
 */
export function jeuBuffs(rec, equip) {
  const out = { pad: 0, duree: 1, amorti: false, chance: (equip && equip.luck) || 1 };
  for (const id of unlockedTechniques(rec)) {
    const e = techniqueById(id).effet;
    if (e.pad) out.pad += e.pad;
    if (e.duree) out.duree *= e.duree;
    if (e.amorti) out.amorti = true;
  }
  return out;
}

/**
 * Effets cumulés pour le duel (multiplicateurs, protections, etc.).
 */
export function combatBuffs(rec) {
  const out = {};
  for (const id of unlockedTechniques(rec)) {
    const e = techniqueById(id).effet;
    if (e.force) out.force = (out.force || 1) * e.force;
    if (e.encaisse) out.encaisse = (out.encaisse || 1) * e.encaisse;
    if (e.secondSouffle) out.secondSouffle = true;
  }
  return out;
}
