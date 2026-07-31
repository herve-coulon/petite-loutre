// Bestiaire : journal des créatures découvertes.
// État stocké dans rec.bestiary = { [creatureId]: { seen: count, caught: count, firstSeen: timestamp } }
import { CREATURES } from './creatures.js';

/** Marque une créature comme vue. */
export function seeCreature(rec, creatureId) {
  if (!rec.bestiary) rec.bestiary = {};
  const entry = rec.bestiary[creatureId];
  if (entry) { entry.seen++; return false; } // déjà vue
  rec.bestiary[creatureId] = { seen: 1, caught: 0, firstSeen: Date.now() };
  return true; // nouvelle découverte
}

/** Marque une créature comme attrapée. */
export function catchCreature(rec, creatureId) {
  if (!rec.bestiary) rec.bestiary = {};
  const entry = rec.bestiary[creatureId];
  if (entry) { entry.caught++; return; }
  rec.bestiary[creatureId] = { seen: 1, caught: 1, firstSeen: Date.now() };
}

/** Nombre total de créatures différentes découvertes. */
export function bestiaryCount(rec) {
  return rec.bestiary ? Object.keys(rec.bestiary).length : 0;
}

/** Nombre total de créatures dans le jeu. */
export function bestiaryTotal() { return CREATURES.length; }

/** Liste des créatures découvertes. */
export function bestiaryList(rec) {
  if (!rec.bestiary) return [];
  return CREATURES.filter(c => rec.bestiary[c.id]).map(c => ({
    ...c,
    ...rec.bestiary[c.id]
  }));
}

/** Pourcentage de complétion. */
export function bestiaryPercent(rec) {
  const total = bestiaryTotal();
  return total ? Math.round((bestiaryCount(rec) / total) * 100) : 0;
}
