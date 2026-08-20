// Contrôleur des « Slots de sauvegarde » (v4.4) — extrait de main.js (audit M5,
// tranche 7). Domaine : l'ÉCRAN de gestion des emplacements (lister, basculer,
// effacer). Le CŒUR de persistance (makeSlotStorage, activeSlot, storage,
// switching, commitSlot) reste dans main.js — c'est de l'infrastructure de boot,
// réservée à la tranche Boot. Ici, seule l'UI ; tout passe par des hooks injectés.
import { SLOT_COUNT, clampSlot, summarize } from './slots.js';
import * as ui from './ui.js';
import { sfx } from './audio.js';

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx.getState();
const activeSlot = () => ctx.getActiveSlot();
const loadSlot = (slot) => ctx.loadSlot(slot);

/** À appeler au boot (main.js) avec les accès au cœur de persistance. */
export function setupSlots(hooks) { ctx = hooks; }

function slotSummaries() {
  const list = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const st = (i === activeSlot()) ? s() : loadSlot(i);
    list.push({ slot: i, active: i === activeSlot(), sum: summarize(st) });
  }
  return list;
}

function refreshSlots() { ui.renderSlots(slotSummaries(), { onPick: pickSlot, onDelete: askDeleteSlot }); }

export function openSlots() { sfx.press(); ui.hideOverlay('ovl-set'); refreshSlots(); ui.showOverlay('ovl-slots'); }

function pickSlot(target) {
  target = clampSlot(target);
  if (target === activeSlot()) { ui.hideOverlay('ovl-slots'); return; }
  const st = loadSlot(target);
  const occupied = !summarize(st).empty;
  const msg = occupied
    ? 'Passer à cette loutre ?\nTa loutre actuelle est sauvegardée dans son emplacement — tu la retrouveras intacte.'
    : 'Commencer une nouvelle loutre dans cet emplacement libre ?\nTa loutre actuelle est sauvegardée et t\'attendra ici.';
  ui.askConfirm(msg, () => ctx.switchTo(target)); // main.js : commitSlot + reload
}

// On n'efface que les AUTRES emplacements. La loutre active se gère en jeu
// (⚙️ Recommencer) — ça évite de re-sauver par mégarde ce qu'on vient d'effacer.
function askDeleteSlot(target) {
  target = clampSlot(target);
  if (target === activeSlot()) return;
  const sum = summarize(loadSlot(target));
  if (sum.empty) return;
  const who = sum.name || 'cette loutre';
  ui.askConfirm('Effacer définitivement l\'emplacement de ' + who + ' ?\nToute sa lignée et sa collection seront perdues. (Sans effet sur ta loutre actuelle.)', () => {
    ctx.deleteSlot(target);
    sfx.press(); refreshSlots();
  });
}
