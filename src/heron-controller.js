// Contrôleur « Chez le héron » (v2.7) — extrait de main.js (audit M5, tranche 5).
// Domaine : le RITUEL DU RETOUR quand la loutre est partie bouder chez le héron —
// on lui porte un poisson en 3 visites espacées (AWAY_CARE_CD), puis elle rentre.
// Aucun accès à la portée de main.js : état et helpers (press, effets, careBond,
// gainXp, persist) passent par un contexte injecté par setupHeron.
import { AWAY_CARE_CD, AWAY_CARE_NEEDED, GRUMPY_MS } from './constants.js';
import { XP } from './level.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();
const mg = () => ctx && ctx.getMinigame();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupHeron(hooks) { ctx = hooks; }

/** Une visite du rituel de retour : on porte un poisson au héron. À la 3e, elle rentre. */
export function actCare() {
  const st = s();
  if (!st || !st.away || st.gameOver) return;
  const t = now();
  if (t < (st.awayNextCare || 0)) {
    ui.log('Le héron veille sur elle… reviens dans ' + ui.fmtDur(st.awayNextCare - t) + '.');
    return;
  }
  ctx.press();
  st.awayCare = (st.awayCare || 0) + 1;
  st.awayNextCare = t + AWAY_CARE_CD;
  ctx.burst('sparkle', 8, st.stage);
  if (st.awayCare >= AWAY_CARE_NEEDED) {
    // retrouvailles ! elle rentre — un peu vexée quand même
    st.away = false;
    st.awayAt = 0; st.awayCare = 0; st.awayNextCare = 0;
    st.health = 45; st.hunger = 55; st.clean = 70; st.energy = 60;
    st.grumpyUntil = t + GRUMPY_MS;
    ctx.burst('confetti', 30, st.stage);
    ctx.squash();
    sfx.hatch(); vibrate([20, 40, 20]);
    ctx.gainXp(XP.reunion);
    ui.toast('🦦 ' + (st.name || 'Elle') + ' est rentrée !');
    ui.log(st.name + ' est rentrée du héron… encore un peu vexée. Un câlin s\'impose.');
  } else {
    sfx.heal();
    ui.log('Tu portes un poisson frais chez le héron… ' + st.name + ' hésite encore. (' + st.awayCare + '/' + AWAY_CARE_NEEDED + ')');
  }
  ctx.persist();
  ui.updateHUD(st, mg(), rec());
  ctx.careBond('care'); // ne compte qu'aux retrouvailles (garde-fou sur s.away)
}
