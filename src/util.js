// Helpers génériques partagés — source unique pour ne plus dupliquer
// esc / clamp01 / fmtDur entre les modules (audit : 6 implémentations
// dupliquées dans main.js, ui.js, audio.js, minigame.js, toboggan.js,
// photocard.js). Aucune logique de jeu ici, aucun DOM.
import { H, MIN } from './constants.js';

/** Échappe les caractères HTML dangereux pour un usage sûr dans innerHTML. */
export function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Borne une valeur dans [0, 1]. */
export const clamp01 = v => Math.max(0, Math.min(1, v));

/** Formate une durée en ms en « d j h », « h min » ou « min » (compact, FR). */
export function fmtDur(ms) {
  const d = Math.floor(ms / (24 * H)), h = Math.floor((ms % (24 * H)) / H), m = Math.floor((ms % H) / MIN);
  if (d > 0) return d + ' j ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  return m + ' min';
}
