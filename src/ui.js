// Couche DOM : HUD, jauges, overlays, messages. Aucune logique de jeu ici.
import { STAGES, H, MIN, clamp, UNLOCK_LEVEL, TREAT_CD, DIVE_MS } from './constants.js';
import { ageMs } from './sim.js';
import { levelFromXp, titleFor } from './level.js';
import { HATS, unlockedHats } from './accessories.js';
import { FURS, DECORS, unlockedFurs, unlockedDecors } from './skins.js';
import { ACHIEVEMENTS } from './achievements.js';
import { dailyQuests, dayKey } from './quests.js';
import { dailyEvent } from './events.js';
import { seasonInfo } from './seasons.js';
import { ITEMS, RARITIES, MILESTONES, describeBonus } from './items.js';
import { traitById, bondLevel } from './personality.js';

const $ = id => document.getElementById(id);

export function log(msg) { $('log').textContent = msg; }

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/**
 * Bannière de célébration plein-écran (montée de niveau, trésor…) : rayons +
 * gros chiffre qui pop + récompense. Auto-disparaît, ou se ferme au toucher.
 */
export function celebrate({ kicker, big, title, reward, rewardColor }) {
  $('cheer-kicker').textContent = kicker || '';
  $('cheer-big').textContent = big != null ? big : '';
  $('cheer-title').textContent = title || '';
  const r = $('cheer-reward');
  r.innerHTML = reward || '';
  r.style.color = rewardColor || 'var(--dim)';
  const el = $('ovl-cheer');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); // relance l'anim
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove('show'), 2900);
}
export function closeCheer() { $('ovl-cheer').classList.remove('show'); }

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
  const val = clamp(v, 0, 100);
  el.style.width = val + '%';
  el.classList.toggle('low', v < 20);
  const bar = el.closest && el.closest('.bar');
  if (bar) bar.classList.toggle('crit', v < 20);       // alerte : glow + valeur rouge
  const vEl = $('v-' + id.slice(2));
  if (vEl) vEl.textContent = Math.round(val);
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

/** Recharge d'un bouton : voile radial (--cd) + compte à rebours ; frac=0 -> prêt. */
function setCooldown(id, frac, icon, totalMs) {
  const b = $(id); if (!b) return;
  if (frac > 0) {
    b.classList.add('cooling');
    b.style.setProperty('--cd', frac.toFixed(3));
    b.innerHTML = '<span class="ic">' + icon + '</span>' + Math.ceil(frac * totalMs / 60000) + ' min';
  } else {
    b.classList.remove('cooling');
    b.style.setProperty('--cd', '0');
  }
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

/** Bandeau « objectifs du jour » : les 3 quêtes en un coup d'œil + la série. */
export function renderDailies(s, rec) {
  const el = $('dailies');
  if (!el) return;
  if (!s || s.stage === 'egg' || s.gameOver || !s.qDaily) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  let html = '';
  for (const q of dailyQuests(s.qDaily.date)) {
    const done = s.qDaily.done.includes(q.id);
    const prog = Math.min(s.qDaily.progress[q.key] || 0, q.target);
    html += '<span class="daily' + (done ? ' done' : '') + '">' + q.icon + ' ' +
      (done ? '✓' : prog + '/' + q.target) + '</span>';
  }
  const st = Math.max((rec && rec.streakCount) || 0, 1);
  html += '<span class="daily flame">🔥' + st + '</span>';
  el.innerHTML = html;
}

let reducedMotion = false;
/** Accessibilité : couper les mouvements pilotés par le JS (secousses…). */
export function setReduced(b) { reducedMotion = !!b; }

/** Micro-tremblement de l'écran de jeu (début de combat…). */
export function shake() {
  if (reducedMotion) return;
  const el = $('screenwrap');
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  clearTimeout(el._sh);
  el._sh = setTimeout(() => el.classList.remove('shake'), 450);
}

export function updateHUD(s, mg, rec) {
  if (!s) return;
  const level = levelFromXp((rec && rec.xp) || 0).level;
  const tr = traitById(s.trait);
  $('hud-name').textContent = (s.name ? s.name.toUpperCase() : '???') + (tr && s.stage !== 'egg' ? ' ' + tr.emoji : '');
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

    // actions à débloquer au fil des NIVEAUX du soigneur
    const diving = (s.divingUntil || 0) > Date.now();
    // Verrouillé = grisé (classe .locked) mais TOUJOURS tapable : le geste
    // explique alors comment le débloquer (bien plus clair qu'un bouton mort).
    const lock = (id, need, html) => {
      const b = $(id);
      const locked = level < need;
      const want = locked ? '<span class="ic">🔒</span>Niv ' + need : html;
      if (b.innerHTML !== want) b.innerHTML = want;
      b.classList.toggle('locked', locked);
    };
    lock('b-treat', UNLOCK_LEVEL.treat, '<span class="ic">🍡</span>Friandise');
    lock('b-dive', UNLOCK_LEVEL.dive, '<span class="ic">🤿</span>Plongée');
    lock('b-battle', UNLOCK_LEVEL.battle, '<span class="ic">⚔️</span>Combat');
    lock('b-slide', UNLOCK_LEVEL.slide, '<span class="ic">🛝</span>Toboggan');
    $('b-treat').disabled = dis || s.sleeping || diving;
    $('b-dive').disabled = dis || s.sleeping || diving;
    $('b-battle').disabled = dis || s.sleeping || diving;
    $('b-slide').disabled = dis || s.sleeping || diving;

    // recharge visible : voile radial + compte à rebours (game feel de cooldown)
    setCooldown('b-treat', level >= UNLOCK_LEVEL.treat && !diving
      ? Math.max(0, (s.lastTreat || 0) + TREAT_CD - Date.now()) / TREAT_CD : 0, '🍡', TREAT_CD);
    setCooldown('b-dive', diving
      ? Math.max(0, (s.divingUntil || 0) - Date.now()) / DIVE_MS : 0, '🤿', DIVE_MS);
    if (diving) {
      ['b-feed', 'b-play', 'b-wash', 'b-sleep', 'b-heal'].forEach(id => { $(id).disabled = true; });
    }
  }
  const muteIc = $('b-mute').querySelector('.mi') || $('b-mute');
  muteIc.textContent = s.mute ? '🔇' : '🔊';
  renderDailies(s, rec);
}

export function showOverlay(id) { $(id).classList.remove('hidden'); }
export function hideOverlay(id) { $(id).classList.add('hidden'); }
export function hideAllOverlays() {
  ['ovl-intro', 'ovl-name', 'ovl-story', 'ovl-over', 'ovl-confirm', 'ovl-hats', 'ovl-ach', 'ovl-set', 'ovl-battle', 'ovl-photo']
    .forEach(hideOverlay);
}

/** Carte d'histoire (chapitre) : emoji, titre, texte, bouton de suite. */
export function showStory(beat, onDone) {
  $('story-emoji').textContent = beat.emoji || '✨';
  $('story-title').textContent = beat.title || '';
  $('story-body').innerHTML = (beat.lines || []).map(l => '<p>' + l + '</p>').join('');
  $('story-body').scrollTop = 0;
  const btn = $('btn-story-next');
  btn.textContent = beat.cta || 'CONTINUER';
  showOverlay('ovl-story');
  btn.onclick = () => { hideOverlay('ovl-story'); btn.onclick = null; if (onDone) onDone(); };
}

/** Surligne le bouton du prochain geste guidé (ou retire tout surlignage). */
export function setCoach(step) {
  const prev = document.querySelector('.coach-target');
  if (prev) prev.classList.remove('coach-target');
  if (step) { const b = $(step.target); if (b) b.classList.add('coach-target'); }
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

/** Section « Trésors » : objets rares équipables (bonus de jeu). */
function milestoneLevelOf(id) {
  for (const [lv, mid] of Object.entries(MILESTONES)) if (mid === id) return +lv;
  return null;
}
function treasureRows(list, s, rec, onGear) {
  const owned = rec.items || [];
  for (const it of ITEMS) {
    const ok = owned.includes(it.id);
    const on = s && s.gear === it.id;
    const rar = RARITIES[it.rarity];
    const btn = document.createElement('button');
    btn.className = 'row-item' + (ok ? '' : ' locked') + (on ? ' equipped' : '');
    let sub;
    if (ok) sub = describeBonus(it.bonus) + (on ? ' · touché pour retirer' : ' · touché pour équiper');
    else { const ml = milestoneLevelOf(it.id); sub = rar.label + ' — ' + (ml ? 'palier Niv ' + ml : 'à dénicher dans les activités'); }
    btn.innerHTML =
      '<span class="ic2">' + (ok ? it.emoji : '🔒') + '</span>' +
      '<div><b style="color:' + rar.color + '">' + it.name + '</b><small>' + sub + '</small></div>' +
      (on ? '<span class="tag">✓</span>' : '');
    if (ok) btn.addEventListener('click', () => onGear(it.id));
    list.appendChild(btn);
  }
}

let wardrobeTab = 'tresors';
const WARDROBE_TABS = [
  { id: 'tresors', label: '💎' }, { id: 'hats', label: '🎩' },
  { id: 'furs', label: '🦦' }, { id: 'decors', label: '🌿' }
];

export function renderWardrobe(s, rec, h) {
  const tabsEl = $('hat-tabs');
  const list = $('hat-list');
  tabsEl.innerHTML = '';
  list.innerHTML = '';
  for (const t of WARDROBE_TABS) {
    const b = document.createElement('button');
    b.className = 'tab' + (wardrobeTab === t.id ? ' on' : '');
    b.textContent = t.label;
    b.addEventListener('click', () => { wardrobeTab = t.id; renderWardrobe(s, rec, h); });
    tabsEl.appendChild(b);
  }
  const caption = (t) => {
    const p = document.createElement('p'); p.className = 'small'; p.textContent = t;
    list.appendChild(p);
  };
  if (wardrobeTab === 'tresors') {
    caption('Trésors trouvés : ' + ((rec.items || []).length) + ' / ' + ITEMS.length);
    treasureRows(list, s, rec, h.onGear);
  } else if (wardrobeTab === 'hats') {
    caption('Chapeaux — débloqués par tes exploits');
    sectionRows(list, HATS, unlockedHats(rec), s && s.hat, h.onHat, true);
  } else if (wardrobeTab === 'furs') {
    caption('Pelages');
    sectionRows(list, FURS, unlockedFurs(rec), s && s.fur, h.onFur, false);
  } else {
    caption('Décor de berge');
    sectionRows(list, DECORS, unlockedDecors(rec), s && s.decor, h.onDecor, false);
  }
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

  // caractère + lien de la loutre, en tête
  const tr = s && traitById(s.trait);
  if (tr) {
    const bl = bondLevel(s.bond);
    const prog = bl.max ? '❤️' : ' (' + bl.cur + '/' + bl.next + ')';
    const cLine = document.createElement('p');
    cLine.className = 'small'; cLine.id = 'char-line';
    cLine.innerHTML = '🦦 <b>' + (s.name || 'Ta loutre') + '</b> · ' + tr.name + ' ' + tr.emoji +
      ' · Lien : ' + bl.name + ' 💛' + prog;
    list.appendChild(cLine);
  }

  // saison en cours + événement du jour, en tête d'affiche
  const se = seasonInfo();
  const seLine = document.createElement('p');
  seLine.className = 'small'; seLine.id = 'season-line';
  seLine.textContent = se.emoji + ' Saison : ' + se.label;
  list.appendChild(seLine);

  const evt = dailyEvent(dayKey());
  const evLine = document.createElement('p');
  evLine.className = 'small';
  evLine.id = 'event-line';
  evLine.textContent = '✨ Aujourd\'hui : ' + evt.label;
  list.appendChild(evLine);

  // Quêtes du jour en tête
  if (s && s.qDaily) {
    const t = document.createElement('p');
    t.className = 'set-section'; t.textContent = '— 🎯 Quêtes du jour —';
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
    t2.className = 'set-section'; t2.textContent = '— 🏆 Succès —';
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
    (rec.slideBest > 0 ? ' · Toboggan : ' + rec.slideBest : '') +
    (rec.treatsTotal > 0 ? ' · Trésors de saison : ' + rec.treatsTotal : '') +
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
    case 'sick': return seasonInfo().key === 'hiver'
      ? 'Brrr… ' + s.name + ' a attrapé froid ! 🤒❄️ Garde-la au chaud (nourris-la, câline-la).'
      : 'Oh non… ' + s.name + ' est malade ! 🤒';
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
