// Couche DOM : HUD, jauges, overlays, messages. Aucune logique de jeu ici.
import { STAGES, H, MIN, clamp } from './constants.js';
import { ageMs } from './sim.js';

const $ = id => document.getElementById(id);

export function log(msg) { $('log').textContent = msg; }

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

export function fmtAge(s, now = Date.now()) {
  if (s.stage === 'egg') return 'bientôt là…';
  const a = ageMs(s, now);
  const d = Math.floor(a / (24 * H)), h = Math.floor((a % (24 * H)) / H), m = Math.floor((a % H) / MIN);
  if (d > 0) return d + ' j ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  return m + ' min';
}

function setBar(id, v) {
  const el = $(id);
  el.style.width = clamp(v, 0, 100) + '%';
  el.classList.toggle('low', v < 20);
}

export function updateHUD(s, mg) {
  if (!s) return;
  $('hud-name').textContent = s.name ? s.name.toUpperCase() : '???';
  $('hud-stage').textContent = STAGES[s.stage] + (s.sick ? ' 🤒' : '') + (s.sleeping ? ' 💤' : '');
  $('hud-age').textContent = fmtAge(s);

  const isEgg = s.stage === 'egg';
  $('bars').style.visibility = isEgg ? 'hidden' : 'visible';
  $('btnrow-egg').classList.toggle('hidden', !isEgg || s.gameOver);
  $('buttons').classList.toggle('hidden', isEgg || s.gameOver);

  if (!isEgg) {
    setBar('f-hunger', s.hunger);
    setBar('f-fun', s.fun);
    setBar('f-energy', s.energy);
    setBar('f-clean', s.clean);
    setBar('f-health', s.health);
    const dis = s.gameOver || !!mg;
    $('b-feed').disabled = dis || s.sleeping;
    $('b-play').disabled = dis || s.sleeping;
    $('b-wash').disabled = dis || s.sleeping;
    $('b-sleep').disabled = dis;
    $('b-heal').disabled = dis || !s.sick;
    $('b-sleep').innerHTML = s.sleeping
      ? '<span class="ic">☀️</span>Réveil'
      : '<span class="ic">💤</span>Dodo';
  }
  $('b-mute').textContent = s.mute ? '🔇' : '🔊';
}

export function showOverlay(id) { $(id).classList.remove('hidden'); }
export function hideOverlay(id) { $(id).classList.add('hidden'); }
export function hideAllOverlays() {
  ['ovl-intro', 'ovl-name', 'ovl-over', 'ovl-confirm'].forEach(hideOverlay);
}

export function showNaming() {
  showOverlay('ovl-name');
  setTimeout(() => { try { $('name-input').focus(); } catch (e) {} }, 80);
}

export function showGameOver(s) {
  const a = ageMs(s);
  const days = Math.floor(a / (24 * H)), hrs = Math.floor((a % (24 * H)) / H);
  const nm = s.name || 'Ta loutre';
  $('over-text').innerText =
    nm + ' n\'allait pas bien du tout…\nElle est partie nager vers d\'autres rivières. 🌊\n\n' +
    'Elle a vécu ' + (days > 0 ? days + ' jour' + (days > 1 ? 's' : '') + ' et ' : '') + hrs + ' h à tes côtés.\n' +
    'Repas : ' + s.fed + ' · Parties : ' + s.played + ' · Bains : ' + s.washed;
  showOverlay('ovl-over');
}

/** Confirmation maison (pas de confirm() moche sur mobile). */
export function askConfirm(text, onYes) {
  $('confirm-text').textContent = text;
  showOverlay('ovl-confirm');
  const yes = $('btn-confirm-yes'), no = $('btn-confirm-no');
  const clean = () => {
    hideOverlay('ovl-confirm');
    yes.onclick = null; no.onclick = null;
  };
  yes.onclick = () => { clean(); onYes(); };
  no.onclick = clean;
}

/** Messages liés aux événements de simulation (en direct). */
export function liveEventMessage(ev, s) {
  switch (ev.type) {
    case 'wake': return s.name + ' se réveille en pleine forme !';
    case 'autosleep': return s.name + ' s\'endort, épuisée… 💤';
    case 'sick': return 'Oh non… ' + s.name + ' est malade ! 🤒';
    case 'evolve': return s.name + ' est devenue une ' + (ev.stage === 'child' ? 'jeune loutre' : 'loutre adulte') + ' !';
    default: return null;
  }
}

/** Résumé après une absence. */
export function offlineSummary(s, elapsed, events) {
  const hh = Math.floor(elapsed / H), mm = Math.floor((elapsed % H) / MIN);
  let msg = 'Te revoilà ! (absent ' + (hh > 0 ? hh + ' h ' : '') + mm + ' min)';
  if (s.gameOver) return null; // géré par l'écran de fin
  if (events.some(e => e.type === 'evolve')) msg += ' — ' + (s.name || 'ta loutre') + ' a grandi pendant ton absence ! ✨';
  else if (s.sick) msg += ' — ' + s.name + ' est tombée malade ! 🤒';
  else if (s.poops.length) msg += ' — il y a du nettoyage à faire…';
  else if (s.sleeping) msg += ' — chut, elle dort. 💤';
  return msg;
}
