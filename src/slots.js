/* Les slots de sauvegarde (v4.4) — plusieurs loutres en parallèle, chacune dans
   son monde complet et ISOLÉ (sa loutre, sa lignée, sa collection). On segmente
   simplement le localStorage par slot : le Slot 1 garde les clés d'origine (donc
   la sauvegarde existante DEVIENT le Slot 1, sans migration), les suivants sont
   suffixés. Tout reste synchrone — aucun changement du chemin chaud. */

export const SLOT_COUNT = 3;

// La clé de stockage d'un slot. Le slot 1 = clé d'origine (compatibilité totale).
export function slotKey(base, slot) {
  const n = Math.max(1, slot | 0);
  return n === 1 ? base : base + '::' + n;
}

// Ramène un numéro de slot dans [1..SLOT_COUNT] (1 par défaut si hors bornes).
export function clampSlot(slot) {
  const n = slot | 0;
  return (n >= 1 && n <= SLOT_COUNT) ? n : 1;
}

// Résumé d'affichage d'un slot à partir de son état chargé (null/vide → { empty:true }).
// Ne dépend d'aucune horloge : purement dérivé des champs stockés.
export function summarize(s) {
  if (!s || !s.stage) return { empty: true };
  return {
    empty: false,
    egg: s.stage === 'egg',
    gameOver: !!s.gameOver,
    away: !!s.away,
    name: s.name || null,
    stage: s.stage,
    generation: s.generation || 1,
    heirOf: s.heirOf || null,
    fur: s.fur || 'roux',
    hat: s.hat || null,
    born: s.born || 0,
    hatchedAt: s.hatchedAt || 0,
    diedAt: s.diedAt || null
  };
}
