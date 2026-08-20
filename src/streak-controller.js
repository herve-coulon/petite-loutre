// Contrôleur de la « Série de jours » (streak 🔥) — extrait de main.js (audit M5,
// tranche 4). Domaine : compter les visites quotidiennes consécutives, récompenser
// les paliers. La logique pure reste dans streak.js ; ici : l'orchestration
// (persistance, XP, unlocks, UI) via un contexte injecté par main.js.
import { touchStreak } from './streak.js';
import * as ui from './ui.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const rec = () => ctx && ctx.getRecords();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupStreak(hooks) { ctx = hooks; }

/** La visite du jour compte pour la série ; récompense les paliers atteints. */
export function checkStreak() {
  const r = rec();
  if (!r) return;
  const st = touchStreak(r, now());
  if (!st) return;
  ctx.persistRec();
  ui.renderLevel(r);
  if (st.count >= 2) ui.toast('🔥 ' + st.count + ' jours d\'affilée !');
  if (st.xp) {
    ctx.gainXp(st.xp);
    ui.log('Palier de série : ' + st.count + ' jours d\'affilée ! Récompense : +' + st.xp + ' XP 🔥');
    ctx.checkUnlocks(); // pelage Braise, succès Fidèle…
  }
}
