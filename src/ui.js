// Couche DOM : HUD, jauges, overlays, messages. Aucune logique de jeu ici.
import { STAGES, H, MIN, clamp } from './constants.js';
import { ageMs } from './sim.js';
import { levelFromXp, titleFor } from './level.js';
import { HATS, unlockedHats } from './accessories.js';
import { FURS, DECORS, unlockedFurs, unlockedDecors } from './skins.js';
import { ACHIEVEMENTS } from './achievements.js';
import { dailyQuests, dayKey } from './quests.js';
import { dailyEvent } from './events.js';

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

const barPrev = {}; // dernière valeur par jauge -> détection des remontées
function setBar(id, v) {
  const el = $(id);
  el.style.width = clamp(v, 0, 100) + '%';
  el.classList.toggle('low', v < 20);
  const prev = barPrev[id];
  if (prev !== undefined && v > prev + 0.5) {
    el.classList.remove('up');
    void el.offsetWidth; // relance l'animation CSS
    el.classList.add('up');
    clearTimeout(el._up);
    el._up = setTimeout(() => el.classList.remove('up'), 700);
  }
  barPrev[id] = v;
}

/** Bandeau de niveau : NIV, titre honorifique, progression vers le suivant. */
export function renderLevel(rec) {
  const L = levelFromXp((rec && rec.xp) || 0);
  $('lvl-label').textContent = 'NIV ' + L.level + ' · ' + titleFor(L.level);
  $('lvl-fill').style.width = Math.round(L.cur / L.next * 100) + '%';
  $('lvl-num').textContent = L.cur + '/' + L.next + ' XP';
  const st = (rec && rec.streakCount) || 0;
  $('streak').textContent = st >= 2 ? '🔥' + st : '';
}

/** Micro-tremblement de l'écran de jeu (début de combat…). */
export function shake() {
  const el = $('screenwrap');
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  clearTimeout(el._sh);
  el._sh = setTimeout(() => el.classList.remove('shake'), 450);
}

export function updateHUD(s, mg) {
  if (!s) return;
  $('hud-name').textContent = s.name ? s.name.toUpperCase() : '???';
  const grumpy = !s.sick && !s.sleeping && (s.grumpyUntil || 0) > Date.now();
  $('hud-stage').textContent = s.away
    ? 'CHEZ LE HÉRON 🪶'
    : STAGES[s.stage] + (s.sick ? ' 🤒' : '') + (s.sleeping ? ' 💤' : '') + (grumpy ? ' 😾' : '');
  $('hud-age').textContent = fmtAge(s);

  const isEgg = s.stage === 'egg';
  const isAway = !!s.away && !s.gameOver;
  $('bars').style.visibility = isEgg ? 'hidden' : 'visible';
  $('btnrow-egg').classList.toggle('hidden', !isEgg || s.gameOver);
  $('buttons').classList.toggle('hidden', isEgg || s.gameOver || isAway);
  $('btnrow-away').classList.toggle('hidden', !isAway);
  if (isAway) {
    const b = $('b-care');
    const wait = (s.awayNextCare || 0) - Date.now();
    if (wait > 0) {
      b.disabled = true;
      b.innerHTML = '<span class="ic">🪶</span>Elle hésite… reviens dans ' + fmtDur(wait);
    } else {
      b.disabled = false;
      b.innerHTML = '<span class="ic">🐟</span>Lui porter un poisson (' + (s.awayCare || 0) + '/3)';
    }
  }

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

    // actions à débloquer avec la progression
    const child = s.stage === 'child' || s.stage === 'adult';
    const adult = s.stage === 'adult';
    const diving = (s.divingUntil || 0) > Date.now();
    const lock = (id, locked, label, html) => {
      const b = $(id);
      const want = locked ? '<span class="ic">🔒</span>' + label : html;
      if (b.innerHTML !== want) b.innerHTML = want;
    };
    lock('b-treat', !child, 'Jeune', '<span class="ic">🍡</span>Friandise');
    lock('b-dive', !adult, 'Adulte', '<span class="ic">🤿</span>Plongée');
    lock('b-battle', !child, 'Jeune', '<span class="ic">⚔️</span>Combat');
    $('b-treat').disabled = dis || s.sleeping || !child || diving;
    $('b-dive').disabled = dis || s.sleeping || !adult || diving;
    $('b-battle').disabled = dis || s.sleeping || !child || diving;
    if (diving) {
      ['b-feed', 'b-play', 'b-wash', 'b-sleep', 'b-heal'].forEach(id => { $(id).disabled = true; });
    }
  }
  $('b-mute').textContent = s.mute ? '🔇' : '🔊';
}

export function showOverlay(id) { $(id).classList.remove('hidden'); }
export function hideOverlay(id) { $(id).classList.add('hidden'); }
export function hideAllOverlays() {
  ['ovl-intro', 'ovl-name', 'ovl-over', 'ovl-confirm', 'ovl-hats', 'ovl-ach', 'ovl-set', 'ovl-battle', 'ovl-photo']
    .forEach(hideOverlay);
}

/** Durée en clair : "2 j 5 h", "3 h 12 min", "8 min". */
export function fmtDur(ms) {
  const d = Math.floor(ms / (24 * H)), h = Math.floor((ms % (24 * H)) / H), m = Math.floor((ms % H) / MIN);
  if (d > 0) return d + ' j ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  return m + ' min';
}

/* ---------------- Garde-robe (chapeaux, pelages, décors) ---------------- */
function sectionRows(list, items, unlocked, currentId, onPick, removable) {
  for (const it of items) {
    const ok = unlocked.includes(it.id);
    const on = currentId === it.id;
    const btn = document.createElement('button');
    btn.className = 'row-item' + (ok ? '' : ' locked') + (on ? ' equipped' : '');
    btn.innerHTML =
      '<span class="ic2">' + (ok ? it.icon : '🔒') + '</span>' +
      '<div>' + it.name + '<small>' + (ok ? (on ? (removable ? 'Touché pour retirer' : 'Actuel') : 'Touché pour choisir') : it.cond) + '</small></div>' +
      (on ? '<span class="tag">✓</span>' : '');
    if (ok) btn.addEventListener('click', () => onPick(it.id));
    list.appendChild(btn);
  }
}

export function renderWardrobe(s, rec, h) {
  const list = $('hat-list');
  list.innerHTML = '';
  const title = (t) => {
    const p = document.createElement('p');
    p.className = 'small'; p.style.marginTop = '4px'; p.textContent = t;
    list.appendChild(p);
  };
  title('— Chapeaux —');
  sectionRows(list, HATS, unlockedHats(rec), s && s.hat, h.onHat, true);
  title('— Pelages —');
  sectionRows(list, FURS, unlockedFurs(rec), s && s.fur, h.onFur, false);
  title('— Décor de berge —');
  sectionRows(list, DECORS, unlockedDecors(rec), s && s.decor, h.onDecor, false);
}

/* ---------------- Combat ---------------- */
export function resetBattleUI(myCode) {
  $('bt-setup').classList.remove('hidden');
  $('bt-arena').classList.add('hidden');
  $('bt-mycode').value = myCode;
  $('bt-foecode').value = '';
}

export function updateBattleUI(b) {
  $('bt-setup').classList.add('hidden');
  $('bt-arena').classList.remove('hidden');
  $('bt-mename').textContent = b.me.name + ' ' + b.me.hp + '/' + b.me.maxHp;
  $('bt-foename').textContent = b.foe.name + ' ' + b.foe.hp + '/' + b.foe.maxHp;
  $('bt-mehp').style.width = (b.me.hp / b.me.maxHp * 100) + '%';
  $('bt-foehp').style.width = (b.foe.hp / b.foe.maxHp * 100) + '%';
  $('bt-log').innerHTML = b.log.slice(-4).join('<br>');
  ['bt-splash', 'bt-roulade', 'bt-calin'].forEach(id => { $(id).disabled = b.over; });
}

/* ---------------- Succès & records ---------------- */
export function renderAchievements(rec, s) {
  const list = $('ach-list');
  list.innerHTML = '';

  // l'événement du jour, en tête d'affiche
  const evt = dailyEvent(dayKey());
  const evLine = document.createElement('p');
  evLine.className = 'small';
  evLine.id = 'event-line';
  evLine.textContent = '✨ Aujourd\'hui : ' + evt.label;
  list.appendChild(evLine);

  // Quêtes du jour en tête
  if (s && s.qDaily) {
    const t = document.createElement('p');
    t.className = 'small'; t.textContent = '— Quêtes du jour —';
    list.appendChild(t);
    for (const q of dailyQuests(s.qDaily.date)) {
      const done = s.qDaily.done.includes(q.id);
      const prog = Math.min(s.qDaily.progress[q.key] || 0, q.target);
      const div = document.createElement('div');
      div.className = 'row-item' + (done ? ' equipped' : '');
      div.style.cursor = 'default';
      div.innerHTML = '<span class="ic2">' + q.icon + '</span><div>' + q.label +
        '<small>' + (done ? 'Terminée ! +10 humeur' : prog + ' / ' + q.target) + '</small></div>' +
        (done ? '<span class="tag">✓</span>' : '');
      list.appendChild(div);
    }
    const t2 = document.createElement('p');
    t2.className = 'small'; t2.textContent = '— Succès —';
    list.appendChild(t2);
  }
  for (const a of ACHIEVEMENTS) {
    const ok = rec.achievements.includes(a.id);
    const div = document.createElement('div');
    div.className = 'row-item' + (ok ? '' : ' locked');
    div.style.cursor = 'default';
    div.innerHTML =
      '<span class="ic2">' + (ok ? a.icon : '🔒') + '</span>' +
      '<div>' + a.name + '<small>' + a.desc + '</small></div>' +
      (ok ? '<span class="tag">✓</span>' : '');
    list.appendChild(div);
  }
  $('rec-line').textContent =
    'Records — Plus longue vie : ' + (rec.bestAge > 0 ? fmtDur(rec.bestAge) : '—') +
    ' · Poissons : ' + rec.fishTotal +
    ' · Repas : ' + rec.mealsTotal +
    ' · Loutres élevées : ' + Math.max(rec.otters, rec.bestAge > 0 ? 1 : 0);
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
  if (s.gameOver) return null; // sauvegardes d'avant v2.7
  if (s.away) return 'Oh non… pendant ton absence, ' + (s.name || 'ta loutre') + ' est partie bouder chez le héron. Porte-lui des poissons pour la ramener ! 🪶';
  if (events.some(e => e.type === 'evolve')) msg += ' — ' + (s.name || 'ta loutre') + ' a grandi pendant ton absence ! ✨';
  else if (s.sick) msg += ' — ' + s.name + ' est tombée malade ! 🤒';
  else if (s.poops.length) msg += ' — il y a du nettoyage à faire…';
  else if (s.sleeping) msg += ' — chut, elle dort. 💤';
  return msg;
}
