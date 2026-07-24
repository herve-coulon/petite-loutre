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
import { ITEMS, RARITIES, MILESTONES, describeBonus, itemById } from './items.js';
import { traitById, bondLevel } from './personality.js';
import { gangPower, fighterPower, MAX_MEMBERS } from './gang.js';
import { makeFighter, encodeCard, ELAN_MAX } from './battle.js';
import { TECHNIQUES, unlockedTechniques } from './skills.js';
import { equipBonus } from './skins.js';
import { paintOtter } from './render.js';
import { ZONES, ZONE_INTRO, FIND_ICON, SPECIALITE, COFFRE_ZONES, EPREUVE_ZONES, zoneDuJour, zoneLayout } from './tilemap.js';

const $ = id => document.getElementById(id);
const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };
const fmtNum = n => (n || 0).toLocaleString('fr-FR');   // « 2 340 » (espace fine)

export function log(msg) { const e = $('log'); if (e) e.textContent = msg; }

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
  const bar = el.closest && (el.closest('.mg') || el.closest('.bar'));
  if (bar) bar.classList.toggle('crit', v < 20);       // alerte : glow
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

/** Barre du haut : niveau (badge + XP), série, compteurs, badges. */
export function renderLevel(rec) {
  const L = levelFromXp((rec && rec.xp) || 0);
  setTxt('lvl-badge', L.level);
  const f = $('lvl-fill'); if (f) f.style.width = Math.round(L.cur / L.next * 100) + '%';
  setTxt('lvl-label', 'NIV ' + L.level + ' · ' + titleFor(L.level)); // (si présent)
  setTxt('lvl-num', L.cur + '/' + L.next + ' XP');

  const st = (rec && rec.streakCount) || 0;
  setTxt('streak-num', st);
  const streakEl = $('streak'); if (streakEl) streakEl.classList.toggle('hidden', st < 2); // flamme dès 2 jours

  // Compteurs (poissons réels ; coquillages/gemmes mappés sur des stats existantes)
  setTxt('fish-num', fmtNum(rec && rec.fishTotal));
  setTxt('shell-num', fmtNum(rec && rec.treatsTotal));
  setTxt('gem-num', fmtNum(rec && rec.gems));

  // Badge Succès : nombre de succès débloqués (caché si 0)
  // Badge de notif Succès : uniquement les succès NON encore consultés.
  const ab = $('ach-badge');
  if (ab) {
    const total = rec && rec.achievements ? rec.achievements.length : 0;
    const unseen = Math.max(0, total - ((rec && rec.achSeen) || 0));
    ab.textContent = unseen; ab.classList.toggle('hidden', unseen <= 0);
  }
}


/** Résumé court d'un bonus, pour tenir dans un slot : « +12% XP · +10% chance ». */
function shortBonus(b) {
  if (!b) return '';
  const out = [];
  const pct = (v) => Math.round(Math.abs(v - 1) * 100);
  if (b.xp) out.push('+' + pct(b.xp) + '% XP');
  if (b.luck) out.push('+' + pct(b.luck) + '% chance');
  if (b.fun) out.push('+' + pct(b.fun) + '% joie');
  if (b.energy) out.push('+' + pct(b.energy) + '% énergie');
  if (b.decay) out.push('jauges -' + pct(b.decay) + '%');
  if (b.coldResist) out.push('froid -' + Math.round(b.coldResist * 100) + '%');
  if (b.heatResist) out.push('chaud -' + Math.round(b.heatResist * 100) + '%');
  return out.join(' · ');
}

/** Écran « Profil de la loutre » : portrait + slots, carte d'identité, onglets. */
export function renderProfile(s, rec, onTravel) {
  s = s || {}; rec = rec || {};
  const L = levelFromXp(rec.xp || 0);
  const hat = HATS.find(h => h.id === s.hat);
  const fur = FURS.find(f => f.id === s.fur) || FURS[0];
  const decor = DECORS.find(d => d.id === s.decor) || DECORS[0];
  const owned = Array.isArray(rec.items) ? rec.items.length : 0;
  const achN = rec.achievements ? rec.achievements.length : 0;
  const streak = rec.streakCount || 0;

  // Portrait : loutre + chapeau équipé + titre de niveau
  setTxt('prof-hat', hat ? hat.icon : '');
  setTxt('prof-title', 'Niv ' + L.level + ' · ' + titleFor(L.level));

  // Slots d'ÉQUIPEMENT : on affiche l'effet porté, pas seulement le nom —
  // sinon rien ne dit que ces objets servent à quelque chose.
  // GAUCHE : ce que la loutre porte (la suit partout).
  const gearIt = itemById(s.gear);
  setTxt('ps-hat-v', hat ? (shortBonus(hat.bonus) || hat.name) : 'Sans chapeau');
  setTxt('ps-fur-v', shortBonus(fur.bonus) || fur.name);
  setTxt('ps-gear-v', gearIt ? (shortBonus(gearIt.bonus) || gearIt.name) : 'Sans trésor');
  setTxt('ps-hat-ic', hat ? hat.icon : '🎩');
  setTxt('ps-fur-ic', fur.icon || '🎨');
  setTxt('ps-gear-ic', gearIt ? gearIt.emoji : '💎');
  // DROITE : le foyer et le palmarès. Le décor n'agit qu'à la berge : on le dit.
  setTxt('ps-ach-v', achN + ' succès');
  setTxt('ps-decor2-ic', decor.icon || '🌿');
  setTxt('ps-decor2-v', shortBonus(decor.bonus) ? (shortBonus(decor.bonus) + ' (au foyer)') : decor.name);
  setTxt('ps-streak-v', streak + ' j');

  // Carte d'identité
  setTxt('prof-name', s.name || 'Petite loutre');
  const gang = rec.gang;
  // Puissance : celle du gang (somme des combattants) ou, en solo, celle de la
  // loutre seule — même échelle, donc une escouade fait *monter* la puissance.
  const power = (gang && Array.isArray(gang.members) && gang.members.length)
    ? gangPower(gang)
    : fighterPower(makeFighter(s));
  setTxt('prof-power', fmtNum(power));
  setTxt('prof-lvl', L.level);
  setTxt('prof-fish', fmtNum(rec.fishTotal));
  setTxt('prof-shell', fmtNum(rec.treatsTotal));
  setTxt('prof-gang', (gang && gang.name) ? ((gang.emblem || '🦦') + ' ' + gang.name) : 'Aucune');
  setTxt('prof-streak', streak);
  // la collection de coffres : sans compteur visible, on ne la poursuit pas
  setTxt('prof-chests', ((rec.chests || []).length) + '/' + COFFRE_ZONES.length);
  setTxt('prof-trials', ((rec.epreuves || []).length) + '/' + EPREUVE_ZONES.length);
  // la carte de la vallée fait partie du profil : un seul point d'appel
  renderValleyMap(rec, s.place === 'monde' ? (s.worldZone || null) : null, onTravel);
}

/**
 * Carte de la vallée : la disposition vient des liaisons réelles (zoneLayout),
 * donc elle ne peut pas mentir sur la géographie. Les lieux non découverts
 * restent des points d'interrogation — il reste quelque chose à trouver.
 */
export function renderValleyMap(rec, currentZone, onTravel) {
  const grid = $('pm-grid'); if (!grid) return;
  const layout = zoneLayout();
  const vus = (rec && rec.visited) || [];
  const ids = Object.keys(ZONES);
  const cols = Math.max(...Object.values(layout).map(p => p.col)) + 1;
  const rows = Math.max(...Object.values(layout).map(p => p.row)) + 1;
  const jour = zoneDuJour(dayKey());
  const jourConnu = vus.includes(jour);
  setTxt('pm-count', vus.length + '/' + ids.length);
  setTxt('pm-hint', jourConnu
    ? '★ Aujourd\'hui, ' + ZONES[jour].name.toLowerCase() + ' : plus de trouvailles, et elles paient double.'
    : (onTravel ? 'Touche un lieu connu pour t\'y rendre.' : ''));
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = ids.find(k => layout[k] && layout[k].col === c && layout[k].row === r);
      if (!id) {
        const vide = document.createElement('div');
        vide.className = 'pm-cell empty';
        grid.appendChild(vide);
        continue;
      }
      const connu = vus.includes(id);
      const ici = id === currentZone;
      // un lieu connu (et pas celui où l'on est) devient un vrai bouton de voyage
      const jouable = !!onTravel && connu && !ici;
      const cell = document.createElement(jouable ? 'button' : 'div');
      cell.className = 'pm-cell';
      if (!connu) cell.classList.add('unknown');
      if (ici) cell.classList.add('here');
      if (jouable) {
        cell.classList.add('go');
        cell.type = 'button';
        cell.setAttribute('aria-label', 'Aller à ' + ZONES[id].name);
        cell.addEventListener('click', () => onTravel(id));
      }
      const ic = document.createElement('span'); ic.className = 'pm-ic';
      ic.textContent = connu ? ((ZONE_INTRO[id] && ZONE_INTRO[id].emoji) || '📍') : '❔';
      const nm = document.createElement('span'); nm.className = 'pm-nm';
      nm.textContent = connu ? ZONES[id].name : '???';
      cell.appendChild(ic); cell.appendChild(nm);
      // à quoi sert le lieu : c'est ICI qu'on choisit où aller, l'info doit y être
      const sp = connu && SPECIALITE[id];
      if (sp) {
        const sub = document.createElement('span'); sub.className = 'pm-sp';
        sub.textContent = sp.icon + ' ' + sp.nom;
        cell.appendChild(sub);
        if (jouable || ici) cell.title = sp.nom + ' — ' + sp.effet;
      }
      // ce qu'on y trouve : aide à choisir où aller
      if (connu && ZONES[id].find) {
        const f = document.createElement('span'); f.className = 'pm-find';
        f.textContent = FIND_ICON[ZONES[id].find.kind] || '';
        cell.appendChild(f);
      }
      // le lieu à l'honneur : plus de trouvailles, et elles paient double
      if (connu && id === jour) {
        cell.classList.add('jour');
        const et = document.createElement('span'); et.className = 'pm-jour';
        et.textContent = '★ ×2';
        cell.appendChild(et);
      }
      grid.appendChild(cell);
    }
  }
}

/** Écran Escouade : création du gang, ou gestion (membres, recrues, combat).
 *  h = { create(name,emblem), recruit(candidate), battle(), back() }. */
export function renderGang(rec, s, h, board) {
  rec = rec || {}; h = h || {};
  const host = $('gang-body'); if (!host) return;
  host.innerHTML = '';
  const g = rec.gang;

  // ── Vue création ─────────────────────────────────────────────
  if (!g || !Array.isArray(g.members) || !g.members.length) {
    const intro = document.createElement('p'); intro.className = 'small';
    intro.textContent = 'Fonde ton escouade : un nom, un emblème. Ta loutre en devient le chef 👑.';
    host.appendChild(intro);

    const name = document.createElement('input');
    name.className = 'gang-name-in'; name.maxLength = 18; name.placeholder = 'Nom de l\'escouade';
    host.appendChild(name);

    const emblems = ['🦦', '🌊', '⚔️', '🔱', '🐾', '🏴'];
    let chosen = emblems[0];
    const row = document.createElement('div'); row.className = 'g-emblems';
    emblems.forEach(e => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'g-emblem'; b.textContent = e;
      if (e === chosen) b.classList.add('on');
      b.addEventListener('click', () => {
        chosen = e;
        for (const c of row.children) c.classList.remove('on');
        b.classList.add('on');
      });
      row.appendChild(b);
    });
    host.appendChild(row);

    const create = document.createElement('button'); create.className = 'act'; create.textContent = 'Fonder l\'escouade';
    create.addEventListener('click', () => h.create && h.create((name.value || '').trim() || 'Mon escouade', chosen));
    host.appendChild(create);
    return;
  }

  // ── Vue gestion ──────────────────────────────────────────────
  const hdr = document.createElement('div'); hdr.className = 'gang-hdr';
  const em = document.createElement('span'); em.className = 'gh-em'; em.textContent = g.emblem || '🦦';
  const gi = document.createElement('div'); gi.className = 'gh-info';
  const gn = document.createElement('b'); gn.textContent = g.name || 'Mon escouade';
  const gs = document.createElement('span'); gs.className = 'gh-sub';
  gs.textContent = '💪 ' + fmtNum(gangPower(g)) + ' · ⚔️ ' + (g.wins || 0) + 'V · ' + (g.losses || 0) + 'D';
  gi.appendChild(gn); gi.appendChild(gs);
  hdr.appendChild(em); hdr.appendChild(gi);
  host.appendChild(hdr);

  const mT = document.createElement('p'); mT.className = 'g-section';
  mT.textContent = 'Membres (' + g.members.length + '/' + MAX_MEMBERS + ')';
  host.appendChild(mT);
  const grid = document.createElement('div'); grid.className = 'gang-members';
  for (let i = 0; i < MAX_MEMBERS; i++) {
    const cell = document.createElement('div'); cell.className = 'gang-slot';
    const m = g.members[i];
    if (m) {
      const fur = FURS.find(f => f.id === m.fur) || FURS[0];
      const ic = document.createElement('span'); ic.className = 'gm-ic'; ic.textContent = fur.icon;
      const nm = document.createElement('span'); nm.className = 'gm-nm'; nm.textContent = (i === 0 ? '👑 ' : '') + m.name;
      const pw = document.createElement('span'); pw.className = 'gm-pw'; pw.textContent = '💪 ' + fmtNum(fighterPower(makeFighter(m)));
      cell.appendChild(ic); cell.appendChild(nm); cell.appendChild(pw);
    } else {
      cell.classList.add('empty'); cell.textContent = '＋';
    }
    grid.appendChild(cell);
  }
  host.appendChild(grid);

  const full = g.members.length >= MAX_MEMBERS;
  const rT = document.createElement('p'); rT.className = 'g-section'; rT.textContent = 'Recrues du jour';
  host.appendChild(rT);
  const recWrap = document.createElement('div'); recWrap.className = 'gang-recruit';
  (board || []).forEach(c => {
    const card = document.createElement('div'); card.className = 'rec-card';
    const fur = FURS.find(f => f.id === c.fur) || FURS[0];
    const ic = document.createElement('span'); ic.className = 'rc-ic'; ic.textContent = fur.icon;
    const col = document.createElement('div'); col.className = 'rc-col';
    const nm = document.createElement('span'); nm.className = 'rc-nm'; nm.textContent = c.name;
    const pw = document.createElement('span'); pw.className = 'rc-pw'; pw.textContent = '💪 ' + fmtNum(c.power);
    col.appendChild(nm); col.appendChild(pw);
    const btn = document.createElement('button'); btn.className = 'act';
    if (c.recruited) { btn.textContent = 'Recrutée ✓'; btn.disabled = true; }
    else if (full) { btn.textContent = 'Complet'; btn.disabled = true; }
    else { btn.textContent = c.cost + ' XP'; btn.disabled = (rec.xp || 0) < c.cost; }
    btn.addEventListener('click', () => h.recruit && h.recruit(c));
    card.appendChild(ic); card.appendChild(col); card.appendChild(btn);
    recWrap.appendChild(card);
  });
  host.appendChild(recWrap);

  const actions = document.createElement('div'); actions.className = 'gang-actions';
  const fight = document.createElement('button'); fight.className = 'act'; fight.textContent = '⚔️ Chercher un rival';
  fight.addEventListener('click', () => h.battle && h.battle());
  actions.appendChild(fight);
  host.appendChild(actions);
}

/** Résultat d'un combat de bande : bannière, récompense, journal du relais. */
export function renderGangResult(res, rival, gang, h) {
  const host = $('gang-body'); if (!host) return;
  host.innerHTML = '';
  const win = res.winner === 'a';
  const banner = document.createElement('p'); banner.className = 'g-result ' + (win ? 'win' : 'lose');
  banner.textContent = win ? ('🏆 Victoire contre ' + rival.name + ' !') : ('💥 Défaite contre ' + rival.name + '…');
  host.appendChild(banner);

  if (res.reward) { const r = document.createElement('p'); r.className = 'small'; r.textContent = 'Récompense : ' + res.reward; host.appendChild(r); }

  const logBox = document.createElement('div'); logBox.className = 'g-log';
  (res.log || []).forEach(line => { const p = document.createElement('div'); p.textContent = line; logBox.appendChild(p); });
  host.appendChild(logBox);

  const back = document.createElement('button'); back.className = 'act'; back.textContent = 'Retour à l\'escouade';
  back.addEventListener('click', () => h.back && h.back());
  host.appendChild(back);
}

/** Rencontre d'une loutre sauvage : jauge d'amitié + offrande de poisson. */
export function renderEncounter(o, gang, need, h) {
  if (!o) return;
  const fur = FURS.find(f => f.id === o.fur) || FURS[0];
  setTxt('enc-face', fur.icon);
  setTxt('enc-name', o.name + ' t\'observe…');
  const stage = { baby: 'bébé', child: 'jeune', adult: 'adulte' }[o.stage] || '';
  setTxt('enc-sub', '💪 ' + fmtNum(o.power) + (stage ? ' · ' + stage : ''));
  const done = o.friend || 0;
  const fill = $('enc-fill'); if (fill) fill.style.width = Math.min(100, Math.round(done / need * 100)) + '%';
  const full = gang && Array.isArray(gang.members) && gang.members.length >= MAX_MEMBERS;
  const btn = $('enc-fish'); if (btn) btn.disabled = !!full;
  const left = Math.max(0, need - done);
  setTxt('enc-hint', full
    ? 'Ton escouade est déjà complète (5 loutres).'
    : (left === 0 ? 'Elle te fait confiance ! 🤝'
      : 'Offre-lui ' + left + ' poisson' + (left > 1 ? 's' : '') + ' pour gagner son amitié.'));
}

/** Bannière de quête : la première quête du jour non terminée + sa progression. */
export function renderDailies(s, rec) {
  const el = $('quest');
  if (!el) return;
  if (!s || s.stage === 'egg' || s.gameOver || !s.qDaily) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const qs = dailyQuests(s.qDaily.date);
  const q = qs.find(q => !s.qDaily.done.includes(q.id)) || qs[qs.length - 1];
  const done = s.qDaily.done.includes(q.id);
  const prog = Math.min(s.qDaily.progress[q.key] || 0, q.target);
  setTxt('quest-text', q.icon + ' ' + (q.label || q.name || ''));
  const f = $('quest-fill'); if (f) f.style.width = Math.round(prog / q.target * 100) + '%';
  setTxt('quest-prog', done ? '✓' : prog + '/' + q.target);
  el.classList.toggle('done', done);
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
  setTxt('hud-name', (s.name ? s.name.toUpperCase() : '???') + (tr && s.stage !== 'egg' ? ' ' + tr.emoji : ''));
  const grumpy = !s.sick && !s.sleeping && (s.grumpyUntil || 0) > Date.now();
  // stage/âge : plus affichés dans la barre du haut (maquette) mais gardés si présents
  setTxt('hud-stage', s.away
    ? 'CHEZ LE HÉRON 🪶'
    : STAGES[s.stage] + (s.sick ? ' 🤒' : '') + (s.sleeping ? ' 💤' : '') + (grumpy ? ' 😾' : ''));
  setTxt('hud-age', fmtAge(s));

  const isEgg = s.stage === 'egg';
  const isAway = !!s.away && !s.gameOver;
  const playing = !isEgg && !s.gameOver && !isAway;
  $('actionbar').classList.toggle('hidden', !playing);
  $('gauges').classList.toggle('hidden', !playing);
  $('btnrow-egg').classList.toggle('hidden', !isEgg || s.gameOver);
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
  const mb = $('b-mute');
  if (mb) mb.innerHTML = s.mute ? '<span class="mi">🔇</span> SON : COUPÉ' : '<span class="mi">🔊</span> SON : ACTIVÉ';
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

export function renderWardrobe(s, rec, h, tab) {
  if (tab) wardrobeTab = tab;   // ouverture directe sur un onglet (depuis les slots du profil)
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
/** Écran de préparation : la loutre sauvage proposée du moment. */
export function renderBattleSetup(foe, s, rec) {
  $('bt-setup').classList.remove('hidden');
  $('bt-arena').classList.add('hidden');
  const fc = $('bt-foecode'); if (fc) fc.value = '';
  if (!foe) return;
  setTxt('bt-wildname', foe.name);
  const stage = { baby: 'jeune pousse', child: 'jeune', adult: 'adulte' }[foe.stage] || '';
  const f = makeFighter(foe);
  setTxt('bt-wildinfo', stage + ' · ' + f.maxHp + ' PV · force ' + f.atk);
  paintOtter($('bt-wildpic'), foe, 3, true);
  const code = $('bt-mycode');
  if (code && s) code.value = encodeCard(s);
  renderTechniques(rec, s);
}

/**
 * Les techniques acquises, et LA PROCHAINE à décrocher. Sans cette dernière
 * ligne, rien ne dirait au joueur que le duel s'adoucit à mesure qu'il joue —
 * il croirait seulement le combat trop dur.
 */
function renderTechniques(rec, s) {
  const box = $('bt-tech'); if (!box) return;
  const acquises = unlockedTechniques(rec || {});
  box.innerHTML = '';
  const mien = s ? makeFighter(s, equipBonus(s)) : null;
  const ligne = document.createElement('div');
  ligne.className = 'bt-tech-mine';
  ligne.textContent = mien
    ? '💪 Toi : ' + mien.maxHp + ' PV · force ' + mien.atk + ' (équipement compris)'
    : '';
  box.appendChild(ligne);

  const acq = document.createElement('div');
  acq.className = 'bt-tech-list';
  acq.textContent = acquises.length
    ? acquises.map(id => TECHNIQUES.find(t => t.id === id).icon).join(' ') +
      '  ' + acquises.length + '/' + TECHNIQUES.length + ' techniques'
    : 'Aucune technique — elles s\'acquièrent en jouant.';
  box.appendChild(acq);

  const suivante = TECHNIQUES.find(t => !acquises.includes(t.id));
  if (suivante) {
    const nx = document.createElement('div');
    nx.className = 'bt-tech-next';
    nx.textContent = '→ ' + suivante.icon + ' ' + suivante.name + ' : ' + suivante.cond;
    nx.title = suivante.desc;
    box.appendChild(nx);
  }
}

/** Jauge d'élan : « ⚡⚡· » — la ressource doit se LIRE, sinon on choisit à l'aveugle. */
const elanTxt = (n) => '⚡'.repeat(n || 0) + '·'.repeat(Math.max(0, ELAN_MAX - (n || 0)));

export function updateBattleUI(b) {
  $('bt-setup').classList.add('hidden');
  $('bt-arena').classList.remove('hidden');
  setTxt('bt-mename', b.me.name + ' ' + b.me.hp + '/' + b.me.maxHp);
  setTxt('bt-foename', b.foe.name + ' ' + b.foe.hp + '/' + b.foe.maxHp);
  $('bt-mehp').style.width = (b.me.hp / b.me.maxHp * 100) + '%';
  $('bt-foehp').style.width = (b.foe.hp / b.foe.maxHp * 100) + '%';
  setTxt('bt-meelan', elanTxt(b.me.elan));
  setTxt('bt-foeelan', elanTxt(b.foe.elan));
  $('bt-log').innerHTML = b.log.slice(-4).join('<br>');
  // Le triangle ET le fait qu'elle observe : sans cette dernière information,
  // se faire contrer en boucle passerait pour de l'arbitraire alors que c'est
  // la règle du jeu. Rien n'est tiré au sort, tout se lit.
  setTxt('bt-tip', b.over ? ''
    : '🌊 punit 🔥 · 💨 punit 🌊 · 🔥 punit 💨 — elle contre tes habitudes');
  ['bt-frappe', 'bt-esquive', 'bt-elan'].forEach(id => { $(id).disabled = b.over; });
  const again = $('bt-again'); if (again) again.classList.toggle('hidden', !b.over);
  paintOtter($('bt-mepic'), b.me, 3, false);
  paintOtter($('bt-foepic'), b.foe, 3, true);
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
