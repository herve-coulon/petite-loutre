// La lignée (v4.1) — « le fil des vies ». Logique PURE : la fiche d'un ancêtre
// qui rejoint le mémorial, et l'héritage du trait d'une génération à la suivante.
// Aucune mort ici : Phase 1 se déclenche au passage à une nouvelle loutre. Le reste
// (attribution concrète, portraits, tanière) est fait par l'orchestrateur.

/** Fabrique la fiche mémorial d'une loutre qui passe le relais. */
export function makeAncestor(s, ageMs, generation) {
  s = s || {};
  return {
    name: s.name || 'Loutre',
    trait: s.trait || null,
    fur: s.fur || 'roux',
    hat: s.hat || null,
    ageMs: Math.max(0, Math.round(ageMs || 0)),
    generation: Math.max(1, generation || 1),
  };
}

/**
 * L'héritage du trait : 70 % la personnalité de la lignée se transmet, 30 % une
 * personnalité neuve (retour `null` → la nouvelle loutre tirera son trait au baptême).
 */
export function inheritTrait(prevTrait, rng = Math.random) {
  if (!prevTrait) return null;
  return rng() < 0.7 ? prevTrait : null;
}

/** Un aïeul est-il une vraie loutre qui a vécu (nommée, éclose) ? */
export function isRealOtter(s) {
  return !!(s && s.name && s.stage && s.stage !== 'egg');
}
