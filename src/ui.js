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
import { ITEMS, RARITIES, MILESTONES, describeBonus, itemById, cosmeticPrice, treasurePrice } from './items.js';
import { traitById, bondLevel } from './personality.js';
import { gangPower, fighterPower, MAX_MEMBERS } from './gang.js';
import { makeFighter, encodeCard, TECHNIQUES, techniqueById, playerTechniques } from './battle.js';
import { PASSIVE_TECHNIQUES, unlockedTechniques } from './skills.js';

/** Échappe les caractères HTML dangereux pour un usage sûr dans innerHTML. */
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
import { equipBonus } from './skins.js';
import { paintOtter, paintBadge, paintDream } from './render.js';
import { ZONES, ZONE_INTRO, FIND_ICON, FIND_NAME, SPECIALITE, COFFRE_ZONES, EPREUVE_ZONES, zoneDuJour, zoneLayout, zoneUnlocked, zoneReq } from './tilemap.js';
import { CREATURES } from './creatures.js';

const $ = id => document.getElementById(id);
const setTxt = (id, v) => { const e = $(id); if (e) e.textContent = v; };
const fmtNum = n => (n || 0).toLocaleString('fr-FR');   // « 2 340 » (espace fine)

export function log(msg) { const e = $('log'); if (e) e.textContent = msg; }

function paintFace(span, o, sc) {
  if (!span || !o || !document) return;
  let cv = span.querySelector('canvas');
  if (!cv) { cv = document.createElement('canvas'); span.textContent = ''; span.appendChild(cv); }
  paintOtter(cv, o, sc, true);
}

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
  r.innerHTML = reward || '';  // reward est contrôlé (items.js, constants), pas de risque XSS
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
  const gauge = el.closest && el.closest('.gauge');
  if (gauge) gauge.setAttribute('aria-valuenow', Math.round(val));
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
  const effLevel = Math.max(L.level, (rec && rec.levelReached) || 1);
  setTxt('lvl-badge', effLevel);
  const f = $('lvl-fill'); if (f) f.style.width = Math.round(L.cur / L.next * 100) + '%';
  setTxt('lvl-label', 'NIV ' + effLevel + ' · ' + titleFor(effLevel)); // (si présent)
  setTxt('lvl-num', L.cur + '/' + L.next + ' XP');

  const st = (rec && rec.streakCount) || 0;
  setTxt('streak-num', st);
  const streakEl = $('streak'); if (streakEl) streakEl.classList.toggle('hidden', st < 2); // flamme dès 2 jours

  // Compteurs (poissons réels ; coquillages/gemmes mappés sur des stats existantes)
  setTxt('fish-num', fmtNum(rec && rec.fish));      // 🐟 portefeuille dépensable (repas/recrutement/troc)
  setTxt('shell-num', fmtNum(rec && rec.shells));   // 🐚 portefeuille dépensable (troc)
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
  const baseL = levelFromXp(rec.xp || 0);
  const effLevel = Math.max(baseL.level, rec.levelReached || 1);
  const L = { ...baseL, level: effLevel };
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
  setTxt('prof-fish', fmtNum(rec.fish));       // réserve dépensable (cohérent avec le HUD)
  setTxt('prof-shell', fmtNum(rec.shells));
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
  const niveau = Math.max(levelFromXp((rec && rec.xp) || 0).level, (rec && rec.levelReached) || 1);
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
      // un lieu encore trop haut pour le niveau du joueur reste CADENASSÉ : on
      // en montre le seuil, pas le contenu — c'est le fil du déblocage.
      const verrou = !zoneUnlocked(id, niveau);
      // un lieu connu, déverrouillé, et pas celui où l'on est : bouton de voyage
      const jouable = !!onTravel && connu && !ici && !verrou;
      const cell = document.createElement(jouable ? 'button' : 'div');
      cell.className = 'pm-cell';
      if (!connu) cell.classList.add('unknown');
      if (verrou) cell.classList.add('locked');
      if (ici) cell.classList.add('here');
      if (jouable) {
        cell.classList.add('go');
        cell.type = 'button';
        cell.setAttribute('aria-label', 'Aller à ' + ZONES[id].name);
        cell.addEventListener('click', () => onTravel(id));
      }
      const ic = document.createElement('span'); ic.className = 'pm-ic';
      ic.textContent = verrou ? '🔒' : connu ? ((ZONE_INTRO[id] && ZONE_INTRO[id].emoji) || '📍') : '❔';
      const nm = document.createElement('span'); nm.className = 'pm-nm';
      nm.textContent = verrou ? ('Niv. ' + zoneReq(id)) : connu ? ZONES[id].name : '???';
      cell.appendChild(ic); cell.appendChild(nm);
      if (verrou) { cell.title = 'Se débloque au niveau ' + zoneReq(id); grid.appendChild(cell); continue; }
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
  const fishNow = rec.fish || 0;   // le recrutement se paie en poissons 🐟 (É5)
  (board || []).forEach(c => {
    const card = document.createElement('div'); card.className = 'rec-card';
    const fur = FURS.find(f => f.id === c.fur) || FURS[0];
    const ic = document.createElement('span'); ic.className = 'rc-ic'; ic.textContent = fur.icon;
    const col = document.createElement('div'); col.className = 'rc-col';
    const nm = document.createElement('span'); nm.className = 'rc-nm'; nm.textContent = c.name;
    const pw = document.createElement('span'); pw.className = 'rc-pw'; pw.textContent = '💪 ' + fmtNum(c.power);
    const afford = fishNow >= c.cost;
    const sub = document.createElement('span'); sub.className = 'rc-sub';
    sub.textContent = afford
      ? 'Tu as ' + fmtNum(fishNow) + ' 🐟 — il en reste ' + fmtNum(fishNow - c.cost)
      : 'Tu as ' + fmtNum(fishNow) + ' 🐟 — il en manque ' + fmtNum(c.cost - fishNow);
    col.appendChild(nm); col.appendChild(pw); col.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'act';
    if (c.recruited) { btn.textContent = 'Recrutée ✓'; btn.disabled = true; }
    else if (full) { btn.textContent = 'Complet'; btn.disabled = true; }
    else { btn.textContent = c.cost + ' 🐟'; btn.disabled = !afford; }
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

/** Le troc du jour (É5) : échanger des coquillages contre poissons/gemmes. */
export function renderBarter(data, h) {
  data = data || {}; h = h || {};
  const host = $('barter-body'); if (!host) return;
  host.innerHTML = '';
  const ICON = { shells: '🐚', fish: '🐟', gems: '💎' };
  const intro = document.createElement('p'); intro.className = 'small';
  intro.textContent = 'Échange du jour : tes coquillages 🐚 et ton trop-plein de poissons 🐟 contre ce qui te manque. Une fois par offre et par jour.';
  host.appendChild(intro);
  const bal = data.balances || {};
  const have = document.createElement('p'); have.className = 'g-section';
  have.textContent = 'Ta bourse : ' + fmtNum(bal.fish || 0) + ' 🐟 · ' + fmtNum(bal.shells || 0) + ' 🐚 · ' + fmtNum(bal.gems || 0) + ' 💎';
  host.appendChild(have);
  (data.offers || []).forEach(o => {
    const card = document.createElement('div'); card.className = 'rec-card';
    const col = document.createElement('div'); col.className = 'rc-col';
    const nm = document.createElement('span'); nm.className = 'rc-nm';
    nm.textContent = o.giveN + ' ' + ICON[o.giveKind] + ' → ' + o.getN + ' ' + ICON[o.getKind];
    const sub = document.createElement('span'); sub.className = 'rc-sub';
    sub.textContent = o.used ? 'Déjà échangé aujourd\'hui'
      : (o.afford ? ('il te restera ' + o.rest + ' ' + ICON[o.giveKind])
        : ('il te manque ' + (-o.rest) + ' ' + ICON[o.giveKind]));
    col.appendChild(nm); col.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'act';
    if (o.used) { btn.textContent = 'Fait ✓'; btn.disabled = true; }
    else { btn.textContent = 'Échanger'; btn.disabled = !o.afford; }
    btn.addEventListener('click', () => h.trade && h.trade(o.id));
    card.appendChild(col); card.appendChild(btn);
    host.appendChild(card);
  });
}

/** L'atelier de trésors (É5) : 3 doublons d'un palier → 1 trésor du palier au-dessus. */
export function renderWorkshop(data, h) {
  data = data || {}; h = h || {};
  const host = $('workshop-body'); if (!host) return;
  host.innerHTML = '';
  if (data.choice) {                       // vue CHOIX du trésor à forger
    const t = document.createElement('p'); t.className = 'small';
    t.textContent = 'Choisis ton trésor ' + (data.choice.upLabel || '').toLowerCase() + ' :';
    host.appendChild(t);
    (data.choice.items || []).forEach(it => {
      const btn = document.createElement('button'); btn.className = 'act';
      btn.textContent = it.emoji + ' ' + it.name + (it.label ? ' (' + it.label + ')' : '');
      btn.addEventListener('click', () => h.pick && h.pick(data.choice.tier, it.id));
      host.appendChild(btn);
    });
    const back = document.createElement('button'); back.className = 'act'; back.textContent = '← Retour';
    back.addEventListener('click', () => h.cancel && h.cancel());
    host.appendChild(back);
    return;
  }
  const intro = document.createElement('p'); intro.className = 'small';
  intro.textContent = '3 doublons d\'un même palier se fondent en 1 trésor du palier supérieur (choix parmi 2).';
  host.appendChild(intro);
  let any = false;
  (data.rows || []).forEach(r => {
    const card = document.createElement('div'); card.className = 'rec-card';
    const col = document.createElement('div'); col.className = 'rc-col';
    const nm = document.createElement('span'); nm.className = 'rc-nm';
    nm.textContent = r.label + ' — ' + r.count + '/' + r.need + ' doublons';
    if (r.color) nm.style.color = r.color;
    const sub = document.createElement('span'); sub.className = 'rc-sub';
    sub.textContent = r.can ? ('→ 1 trésor ' + r.upLabel.toLowerCase()) : ('encore ' + Math.max(0, r.need - r.count) + ' doublon(s)');
    col.appendChild(nm); col.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'act';
    btn.textContent = r.can ? 'Fusionner' : '—';
    btn.disabled = !r.can;
    if (r.can) any = true;
    btn.addEventListener('click', () => h.begin && h.begin(r.tier));
    card.appendChild(col); card.appendChild(btn);
    host.appendChild(card);
  });
  if (!any) {
    const hint = document.createElement('p'); hint.className = 'rc-sub';
    hint.textContent = 'Les trésors en double (plongée, pêche, coffres…) atterrissent ici. Reviens quand tu en as 3 d\'un même palier.';
    host.appendChild(hint);
  }
}

/** La Crue de la semaine (É5b) : championne renforcée + talents visibles + défis. */
export function renderCrue(data, h) {
  data = data || {}; h = h || {};
  const host = $('crue-body'); if (!host) return;
  host.innerHTML = '';
  const intro = document.createElement('p'); intro.className = 'small';
  intro.textContent = data.weatherLabel + ' — la championne a envahi ' + data.zoneName + ' cette semaine.';
  host.appendChild(intro);

  const champ = document.createElement('div'); champ.className = 'rec-card';
  const col = document.createElement('div'); col.className = 'rc-col';
  const nm = document.createElement('span'); nm.className = 'rc-nm'; nm.textContent = '🏆 ' + data.name;
  const pw = document.createElement('span'); pw.className = 'rc-pw'; pw.textContent = '💪 ×' + data.powerMult + ' — renforcée';
  const tl = document.createElement('span'); tl.className = 'rc-sub';
  tl.textContent = 'Talents : ' + ((data.talents && data.talents.length) ? data.talents.map(t => t.icon + ' ' + t.name).join(', ') : 'aucun');
  col.appendChild(nm); col.appendChild(pw); col.appendChild(tl);
  champ.appendChild(col);
  host.appendChild(champ);

  const secT = document.createElement('p'); secT.className = 'g-section'; secT.textContent = 'Défis de la semaine';
  host.appendChild(secT);
  (data.tiers || []).forEach(t => {
    const row = document.createElement('div'); row.className = 'rec-card';
    const c2 = document.createElement('div'); c2.className = 'rc-col';
    const n2 = document.createElement('span'); n2.className = 'rc-nm'; n2.textContent = t.emoji + ' ' + t.desc;
    c2.appendChild(n2);
    const badge = document.createElement('button'); badge.className = 'act'; badge.disabled = true;
    badge.textContent = t.got ? 'Obtenu ✓' : '—';
    row.appendChild(c2); row.appendChild(badge);
    host.appendChild(row);
  });

  const act = document.createElement('div'); act.className = 'gang-actions';
  const btn = document.createElement('button'); btn.className = 'act';
  if (data.locked) { btn.textContent = '🔒 Niveau ' + data.lockLevel; btn.disabled = true; }
  else { btn.textContent = '🌊 Défier ' + data.name; }
  btn.addEventListener('click', () => h.defy && h.defy());
  act.appendChild(btn);
  host.appendChild(act);

  if (data.best && data.best !== 'none') {
    const b = document.createElement('p'); b.className = 'rc-sub';
    b.textContent = 'Ta meilleure médaille cette semaine : ' + data.bestEmoji + ' ' + data.best;
    host.appendChild(b);
  }
}

/** L'Almanach de saison (v3.99) : la piste de 8 paliers gratuits de la saison. */
export function renderAlmanach(data, h) {
  data = data || {}; h = h || {};
  const host = $('almanach-body'); if (!host) return;
  host.innerHTML = '';
  const p = data.progress || 0, comp = data.completion || { claimed: 0, total: 8 };
  const intro = document.createElement('p'); intro.className = 'small';
  intro.textContent = (data.seasonEmoji || '📅') + ' ' + (data.seasonLabel || 'Saison') + ' — ' + p + ' trésor' +
    (p > 1 ? 's' : '') + ' de saison récolté' + (p > 1 ? 's' : '') + '. Paliers : ' + comp.claimed + '/' + comp.total + '.';
  host.appendChild(intro);
  const note = document.createElement('p'); note.className = 'g-section';
  note.textContent = 'Récolte les trésors de saison (berge & vallée) pour dérouler la piste — elle repart à chaque saison.';
  host.appendChild(note);
  (data.tiers || []).forEach((t, i) => {
    const card = document.createElement('div'); card.className = 'alm-tier ' + (t.state || 'locked');
    const num = document.createElement('span'); num.className = 'alm-num'; num.textContent = String(i + 1);
    const col = document.createElement('div'); col.className = 'rc-col';
    const nm = document.createElement('span'); nm.className = 'rc-nm'; nm.textContent = t.rewardLabel;
    const sub = document.createElement('span'); sub.className = 'rc-sub'; sub.textContent = t.need + ' trésor' + (t.need > 1 ? 's' : '') + ' de saison';
    col.appendChild(nm); col.appendChild(sub);
    const btn = document.createElement('button'); btn.className = 'act';
    if (t.state === 'claimed') { btn.textContent = 'Obtenu ✓'; btn.disabled = true; }
    else if (t.state === 'claimable') { btn.textContent = 'Réclamer'; }
    else { btn.textContent = '🔒'; btn.disabled = true; }
    btn.addEventListener('click', () => h.claim && h.claim(i));
    card.appendChild(num); card.appendChild(col); card.appendChild(btn);
    host.appendChild(card);
  });
}

/** Le Marché (v3.96) : le HUB économique — la bourse + tout ce qu'on peut dépenser. */
export function renderMarche(data, h) {
  data = data || {}; h = h || {};
  const host = $('marche-body'); if (!host) return;
  host.innerHTML = '';
  const intro = document.createElement('p'); intro.className = 'small';
  intro.textContent = 'Ta bourse — dépense-la ici. La pêche et les trouvailles la remplissent.';
  host.appendChild(intro);

  const purse = document.createElement('div'); purse.className = 'marche-purse';
  [['fish', '🐟', data.fish], ['shell', '🐚', data.shells], ['gem', '💎', data.gems]].forEach(([key, ic, val]) => {
    const c = document.createElement('div'); c.className = 'mp-coin' + (data.focus === key ? ' on' : '');
    const i = document.createElement('span'); i.className = 'mp-ic'; i.textContent = ic;
    const b = document.createElement('b'); b.textContent = fmtNum(val || 0);
    c.appendChild(i); c.appendChild(b); purse.appendChild(c);
  });
  host.appendChild(purse);

  const tiles = [
    { ic: '🛍️', title: 'Cosmétiques', sub: 'Chapeaux, pelages, décors, trésors — en 💎', fn: h.cosmetics },
    { ic: '🐚', title: 'Troc du jour', sub: 'Échange tes coquillages contre poissons ou gemmes', fn: h.troc },
    { ic: '🛠️', title: 'Atelier', sub: 'Fusionne 3 doublons en un trésor supérieur', fn: h.atelier },
    { ic: '🦦', title: 'Recrutement', sub: 'Enrôle des loutres dans ton escouade — en 🐟', fn: h.recrutement },
  ];
  const grid = document.createElement('div'); grid.className = 'marche-grid';
  tiles.forEach(t => {
    const btn = document.createElement('button'); btn.className = 'marche-tile';
    const ic = document.createElement('span'); ic.className = 'mt-ic'; ic.textContent = t.ic;
    const tx = document.createElement('span'); tx.className = 'mt-tx';
    const nm = document.createElement('b'); nm.textContent = t.title;
    const sub = document.createElement('span'); sub.className = 'mt-sub'; sub.textContent = t.sub;
    tx.appendChild(nm); tx.appendChild(sub);
    const go = document.createElement('span'); go.className = 'mt-go'; go.textContent = '›';
    btn.appendChild(ic); btn.appendChild(tx); btn.appendChild(go);
    btn.addEventListener('click', () => t.fn && t.fn());
    grid.appendChild(btn);
  });
  host.appendChild(grid);
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
  paintFace($('enc-face'), o, 4);
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
  const zh = $('zone-hint');
  if (!el) return;
  if (!s || s.stage === 'egg' || s.gameOver || !s.qDaily) {
    el.classList.add('hidden');
    if (zh) zh.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  // Repli persisté (É4) : replié, la bannière tient sur une ligne discrète.
  el.classList.toggle('collapsed', !!s.questCollapsed);
  const tg = $('quest-toggle');
  if (tg) {
    tg.textContent = s.questCollapsed ? '▸' : '▾';
    tg.setAttribute('aria-label', s.questCollapsed ? 'Déplier les objectifs' : 'Replier les objectifs');
  }
  // Contexte de filtrage : même logique que questCtx() dans main.js
  const niveau = Math.max(levelFromXp((rec && rec.xp) || 0).level, (rec && rec.levelReached) || 1);
  const unlocked2 = [];
  if (niveau >= UNLOCK_LEVEL.treat) unlocked2.push('treat');
  if (niveau >= UNLOCK_LEVEL.slide) unlocked2.push('slide');
  if (niveau >= UNLOCK_LEVEL.dive) unlocked2.push('dive');
  if (niveau >= UNLOCK_LEVEL.battle) unlocked2.push('battle');
  const ctx = { level: niveau, unlocked: unlocked2, world: s.place === 'monde' };
  const qs = dailyQuests(s.qDaily.date, ctx);
  const q = qs.find(q => !s.qDaily.done.includes(q.id)) || qs[qs.length - 1];
  const done = s.qDaily.done.includes(q.id);
  const prog = Math.min(s.qDaily.progress[q.key] || 0, q.target);
  setTxt('quest-text', q.icon + ' ' + (q.label || q.name || ''));
  const f = $('quest-fill'); if (f) f.style.width = Math.round(prog / q.target * 100) + '%';
  setTxt('quest-prog', done ? '✓' : prog + '/' + q.target);
  el.classList.toggle('done', done);
  // Bandeau « lieu du jour » : visible quand le monde est ouvert
  if (zh) {
    if (s.place === 'monde') {
      const jour = zoneDuJour(dayKey());
      const z = ZONES[jour];
      zh.textContent = '★ ' + z.name.toLowerCase() + ' : trouvailles ×2';
      zh.classList.remove('hidden');
    } else {
      zh.classList.add('hidden');
    }
  }
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
  if (s.stage !== 'egg') paintBadge($('av-face-hud'), s, 58);
  const grumpy = !s.sick && !s.sleeping && (s.grumpyUntil || 0) > Date.now();

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
  ['ovl-intro', 'ovl-name', 'ovl-story', 'ovl-over', 'ovl-confirm', 'ovl-hats', 'ovl-ach', 'ovl-set', 'ovl-battle', 'ovl-photo', 'ovl-carnet', 'ovl-souvenir']
    .forEach(hideOverlay);
  closeSouvenir();
}

/* ---------------- Le souvenir jouable (v4.3) ----------------
   Un moment contemplatif : une aïeule qui dort et rêve (anim `dream`, dans son
   pelage), sa phrase de souvenir. Boucle rAF autonome, coupée à la fermeture. */
let souvenirRAF = 0;
let souvenirAnc = null;
const _raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (fn) => setTimeout(() => fn(Date.now()), 120);
const _caf = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : clearTimeout;

// anc : l'aïeule {name, trait, fur, generation, ageMs}. mem : {intro, detail, close}.
export function openSouvenir(anc, mem) {
  if (!anc) return;
  souvenirAnc = anc;
  const t = traitById(anc.trait);
  $('souvenir-name').textContent = (anc.name || 'Elle') + ' — génération ' + (anc.generation || 1);
  $('souvenir-meta').textContent = 'a vécu ' + fmtDur(anc.ageMs || 0) + (t ? ' · ' + t.emoji + ' ' + t.name : '');
  $('souvenir-intro').textContent = (mem && mem.intro) || '';
  $('souvenir-line').textContent = (mem && mem.detail) || '';
  $('souvenir-close-line').textContent = (mem && mem.close) || '';
  const cv = $('souvenir-cv');
  _caf(souvenirRAF);
  const step = (ts) => {
    if (!souvenirAnc) return;
    paintDream(cv, { fur: souvenirAnc.fur || 'roux', stage: 'adult' }, ts || 0, 3);
    souvenirRAF = _raf(step);
  };
  showOverlay('ovl-souvenir');
  step(0);
}

export function closeSouvenir() {
  souvenirAnc = null;
  _caf(souvenirRAF);
  souvenirRAF = 0;
  hideOverlay('ovl-souvenir');
}

/* ---------------- Les slots de sauvegarde (v4.4) ----------------
   list : [{slot, active, sum}] (sum = résumé de slots.summarize).
   h    : { onPick(slot), onDelete(slot) }. */
export function renderSlots(list, h) {
  const box = $('slots-list');
  if (!box) return;
  let html = '';
  for (const it of list) {
    const sum = it.sum || { empty: true };
    if (sum.empty) {
      html += '<div class="slot-card slot-empty" role="button" tabindex="0" data-slot="' + it.slot + '">' +
        '<div class="slot-egg">🥚</div>' +
        '<div class="rc-col"><span class="rc-nm">Emplacement ' + it.slot + ' · libre</span>' +
        '<span class="rc-sub">Toucher pour commencer une nouvelle loutre</span></div></div>';
      continue;
    }
    const etat = sum.egg ? 'un œuf au chaud' : sum.away ? 'chez le héron 🪶' : ('génération ' + sum.generation);
    const sub = (sum.heirOf ? 'de la lignée de ' + esc(sum.heirOf) + ' · ' : '') + etat;
    const nm = esc(sum.name || (sum.egg ? 'Un œuf' : 'Ta loutre'));
    const portrait = sum.egg
      ? '<div class="slot-egg">🥚</div>'
      : '<canvas class="lin-portrait slot-portrait" width="52" height="52" data-fur="' + esc(sum.fur) + '" data-hat="' + esc(sum.hat || '') + '"></canvas>';
    html += '<div class="slot-card' + (it.active ? ' slot-active' : '') + '" role="button" tabindex="0" data-slot="' + it.slot + '">' +
      portrait +
      '<div class="rc-col"><span class="rc-nm">' + nm + (it.active ? ' <span class="slot-badge">ACTUELLE</span>' : '') + '</span>' +
      '<span class="rc-sub">' + sub + '</span></div>' +
      (!it.active ? '<button class="slot-del" data-del="' + it.slot + '" aria-label="Effacer cet emplacement">🗑️</button>' : '') +
      '</div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.slot-portrait').forEach(cv =>
    paintBadge(cv, { fur: cv.dataset.fur || 'roux', hat: cv.dataset.hat || null, stage: 'adult' }, 52));
  if (h && typeof h.onPick === 'function') {
    box.querySelectorAll('.slot-card[data-slot]').forEach(card => {
      const go = () => h.onPick(+card.dataset.slot);
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  if (h && typeof h.onDelete === 'function') {
    box.querySelectorAll('.slot-del').forEach(btn =>
      btn.addEventListener('click', (e) => { e.stopPropagation(); h.onDelete(+btn.dataset.del); }));
  }
}

/** Bestiaire : affiche les créatures découvertes (fiches en emoji — design
 *  préféré d'Hervé ; le pixel avait été jugé trop laid). */
/**
 * Le Carnet du naturaliste (v3.98) : UNIFIE le bestiaire, l'album des trouvailles
 * et les records en un seul carnet à trois sections. `section` = l'onglet actif.
 */
export function renderCarnet(rec, s, section, h) {
  rec = rec || {}; s = s || {}; h = h || {};
  const body = $('carnet-body'); if (!body) return;
  section = section || 'bestiaire';

  // Compteurs pour l'en-tête de complétion globale (bestiaire + trouvailles).
  const seen = rec.bestiary || {};
  const bCount = Object.keys(seen).length, bTotal = CREATURES.length;
  const kinds = Object.keys(FIND_ICON);
  const tCount = (rec.foundKinds || []).filter(k => kinds.includes(k)).length, tTotal = kinds.length;
  const globalPct = Math.round(((bCount + tCount) / Math.max(1, bTotal + tTotal)) * 100);
  setTxt('carnet-global', 'Carnet rempli à ' + globalPct + '% · 🐾 ' + bCount + '/' + bTotal + ' · 🍄 ' + tCount + '/' + tTotal);

  // Onglet actif
  document.querySelectorAll('#carnet-tabs .carnet-tab').forEach(t =>
    t.classList.toggle('on', t.getAttribute('data-sec') === section));

  let html = '';
  if (section === 'bestiaire') {
    html += '<p class="small">' + bCount + '/' + bTotal + ' créatures rencontrées dans la vallée.</p>';
    for (const c of CREATURES) {
      const entry = seen[c.id];
      if (!entry) {
        html += '<div class="best-entry best-unknown"><span class="best-emoji">❓</span><span class="best-name">???</span></div>';
      } else {
        html += '<div class="best-entry"><span class="best-emoji">' + c.emoji + '</span>' +
          '<div class="best-info"><b>' + esc(c.name) + '</b>' +
          '<span class="best-desc">' + esc(c.desc) + '</span>' +
          '<span class="best-stats">Vu ' + entry.seen + ' fois' + (entry.caught ? ' · Attrapé ' + entry.caught + 'x' : '') +
          (c.aggressive ? ' · ⚠️ Agressif' : '') + '</span></div></div>';
      }
    }
  } else if (section === 'trouvailles') {
    html += '<p class="small">' + tCount + '/' + tTotal + ' sortes de trouvailles découvertes en explorant la vallée.</p>';
    html += '<div class="carnet-grid">';
    for (const k of kinds) {
      const got = (rec.foundKinds || []).includes(k);
      html += '<div class="carnet-cell' + (got ? '' : ' locked') + '">' +
        '<span class="cc-ic">' + (got ? FIND_ICON[k] : '❓') + '</span>' +
        '<span class="cc-nm">' + (got ? esc(FIND_NAME[k] || k) : '???') + '</span></div>';
    }
    html += '</div>';
  } else if (section === 'lignee') {
    const mem = (rec.memorial || []).slice().reverse();   // le plus récent d'abord
    const curTrait = traitById(s.trait);
    html += '<p class="small">Le fil des vies. Chaque nouvelle loutre hérite souvent du caractère de la précédente.</p>';
    html += '<div class="lin-card lin-current">' +
      '<canvas class="lin-portrait" width="52" height="52" data-fur="' + esc(s.fur || 'roux') + '" data-hat="' + esc(s.hat || '') + '"></canvas>' +
      '<div class="rc-col"><span class="rc-nm">🌱 ' + esc(s.name || 'Ta loutre') + ' — génération ' + (s.generation || 1) + '</span>' +
      '<span class="rc-sub">' + (s.heirOf ? 'de la lignée de ' + esc(s.heirOf) : 'la fondatrice de la lignée') +
      (curTrait ? ' · ' + curTrait.emoji + ' ' + esc(curTrait.name) : '') + '</span></div></div>';
    if (mem.length) {
      html += '<p class="g-section">Mémorial (' + mem.length + ')</p>';
      const canDream = h && typeof h.onSouvenir === 'function';
      mem.forEach((a, i) => {
        const t = traitById(a.trait);
        html += '<div class="lin-card' + (canDream ? ' lin-tappable' : '') + '"' +
          (canDream ? ' role="button" tabindex="0" data-mem="' + i + '"' : '') + '>' +
          '<canvas class="lin-portrait" width="52" height="52" data-fur="' + esc(a.fur || 'roux') + '" data-hat="' + esc(a.hat || '') + '"></canvas>' +
          '<div class="rc-col"><span class="rc-nm">' + esc(a.name) + ' — génération ' + a.generation + '</span>' +
          '<span class="rc-sub">a vécu ' + fmtDur(a.ageMs) + (t ? ' · ' + t.emoji + ' ' + esc(t.name) : '') + '</span>' +
          (canDream ? '<span class="lin-dream">🌙 revivre un souvenir</span>' : '') +
          '</div></div>';
      });
    } else {
      html += '<p class="rc-sub">Aucun aïeul encore. Quand une loutre passera le relais (⚙️ → Recommencer), elle prendra place ici.</p>';
    }
  } else { // records
    const rows = [
      ['Plus longue vie', rec.bestAge > 0 ? fmtDur(rec.bestAge) : '—'],
      ['Loutres élevées', Math.max(rec.otters || 0, rec.bestAge > 0 ? 1 : 0)],
      ['Poissons pêchés (à vie)', fmtNum(rec.fishTotal || 0)],
      ['Repas servis', fmtNum(rec.mealsTotal || 0)],
      ['Bains donnés', fmtNum(rec.bathsTotal || 0)],
      ['Parties de pêche', fmtNum(rec.gamesTotal || 0)],
      ['Trésors de saison', fmtNum(rec.treatsTotal || 0)],
      ['Trésors collectionnés', fmtNum((rec.items || []).length)],
      ['Meilleur toboggan', fmtNum(rec.slideBest || 0)],
      ['Meilleure parade (dojo)', fmtNum(rec.dojoBest || 0)],
      ['Combats gagnés', fmtNum(rec.wins || 0)],
      ['Quêtes accomplies', fmtNum(rec.questsDone || 0)],
    ];
    html += '<div class="carnet-records">';
    for (const [label, val] of rows) {
      html += '<div class="cr-row"><span class="cr-l">' + esc(label) + '</span><b class="cr-v">' + esc(String(val)) + '</b></div>';
    }
    html += '</div>';
  }
  body.innerHTML = html;
  // Portraits de la lignée : peints APRÈS insertion (paintBadge a besoin du canvas réel).
  if (section === 'lignee') {
    body.querySelectorAll('.lin-portrait').forEach(cv =>
      paintBadge(cv, { fur: cv.dataset.fur || 'roux', hat: cv.dataset.hat || null, stage: 'adult' }, 52));
    // Chaque aïeule tappable → rejouer son souvenir (le mémorial est affiché du plus récent au plus ancien).
    if (h && typeof h.onSouvenir === 'function') {
      const mem = (rec.memorial || []).slice().reverse();
      body.querySelectorAll('.lin-card[data-mem]').forEach(card => {
        const anc = mem[+card.dataset.mem];
        if (!anc) return;
        const go = () => h.onSouvenir(anc);
        card.addEventListener('click', go);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
    }
  }
}

/** Carte d'histoire (chapitre) : emoji, titre, texte, bouton de suite. */
export function showStory(beat, onDone) {
  $('story-emoji').textContent = beat.emoji || '✨';
  $('story-title').textContent = beat.title || '';
  $('story-body').innerHTML = (beat.lines || []).map(l => '<p>' + esc(l) + '</p>').join('');
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
function sectionRows(list, items, unlocked, currentId, onPick, removable, rec, onBuy) {
  const gems = (rec && rec.gems) || 0;
  for (const it of items) {
    const ok = unlocked.includes(it.id);
    const on = currentId === it.id;
    // un cosmétique verrouillé et non-trophée peut s'ACHETER avec des gemmes
    const prix = (!ok && !it.earnOnly) ? cosmeticPrice(it.bonus) : 0;
    const achetable = !ok && !it.earnOnly && prix > 0;
    const abordable = achetable && gems >= prix;

    const btn = document.createElement('button');
    btn.className = 'row-item' + (ok ? '' : ' locked') + (abordable ? ' buyable' : '') + (on ? ' equipped' : '');
    let sub;
    if (ok) sub = on ? (removable ? 'Touché pour retirer' : 'Actuel') : 'Touché pour choisir';
    else if (achetable) sub = it.cond + ' — ou ' + (abordable ? 'touche pour acheter' : 'gemmes manquantes');
    else sub = it.cond;                                   // trophée : se mérite, point
    const tag = on ? '<span class="tag">✓</span>'
      : achetable ? '<span class="tag price' + (abordable ? '' : ' short') + '">💎 ' + prix + '</span>' : '';
    btn.innerHTML =
      '<span class="ic2">' + (ok ? it.icon : '🔒') + '</span>' +
      '<div>' + esc(it.name) + '<small>' + esc(sub) + '</small></div>' + tag;
    if (ok) btn.addEventListener('click', () => onPick(it.id));
    else if (abordable && onBuy) btn.addEventListener('click', () => onBuy(it.id));
    list.appendChild(btn);
  }
}

/** Section « Trésors » : objets rares équipables (bonus de jeu). */
function milestoneLevelOf(id) {
  for (const [lv, mid] of Object.entries(MILESTONES)) if (mid === id) return +lv;
  return null;
}
function treasureRows(list, s, rec, onGear, onBuy) {
  const owned = rec.items || [];
  const gems = (rec && rec.gems) || 0;
  for (const it of ITEMS) {
    const ok = owned.includes(it.id);
    const on = s && s.gear === it.id;
    const rar = RARITIES[it.rarity];
    // seuls les trésors qu'on peut TROUVER (drop:true) s'achètent aussi ;
    // les exclusifs de palier se gagnent en montant de niveau, point.
    const prix = (!ok && it.drop) ? treasurePrice(it) : 0;
    const abordable = prix > 0 && gems >= prix;

    const btn = document.createElement('button');
    btn.className = 'row-item' + (ok ? '' : ' locked') + (abordable ? ' buyable' : '') + (on ? ' equipped' : '');
    let sub;
    if (ok) sub = describeBonus(it.bonus) + (on ? ' · touché pour retirer' : ' · touché pour équiper');
    else {
      const ml = milestoneLevelOf(it.id);
      if (ml) sub = rar.label + ' — palier Niv ' + ml;                    // exclusif de palier : pas à vendre
      else sub = rar.label + ' — à dénicher, ou ' + (abordable ? 'touche pour acheter' : 'gemmes manquantes');
    }
    const tag = on ? '<span class="tag">✓</span>'
      : prix > 0 ? '<span class="tag price' + (abordable ? '' : ' short') + '">💎 ' + prix + '</span>' : '';
    btn.innerHTML =
      '<span class="ic2">' + (ok ? it.emoji : '🔒') + '</span>' +
      '<div><b style="color:' + esc(rar.color) + '">' + esc(it.name) + '</b><small>' + esc(sub) + '</small></div>' + tag;
    if (ok) btn.addEventListener('click', () => onGear(it.id));
    else if (abordable && onBuy) btn.addEventListener('click', () => onBuy(it.id));
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
  const solde = '   ·   💎 ' + ((rec && rec.gems) || 0);
  if (wardrobeTab === 'tresors') {
    caption('Trésors : ' + ((rec.items || []).length) + ' / ' + ITEMS.length + solde);
    treasureRows(list, s, rec, h.onGear, h.onBuyTresor);
  } else if (wardrobeTab === 'hats') {
    caption('Chapeaux — mérités par tes exploits, ou achetés en gemmes' + solde);
    sectionRows(list, HATS, unlockedHats(rec), s && s.hat, h.onHat, true, rec, h.onBuyHat);
  } else if (wardrobeTab === 'furs') {
    caption('Pelages' + solde);
    sectionRows(list, FURS, unlockedFurs(rec), s && s.fur, h.onFur, false, rec, h.onBuyFur);
  } else {
    caption('Décor de berge' + solde);
    sectionRows(list, DECORS, unlockedDecors(rec), s && s.decor, h.onDecor, false, rec, h.onBuyDecor);
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
    ? '💪 Toi : ' + mien.maxHp + ' PV · force ' + mien.atk + ' · vitesse ' + mien.spd
    : '';
  box.appendChild(ligne);

  const acq = document.createElement('div');
  acq.className = 'bt-tech-list';
  acq.textContent = acquises.length
    ? acquises.map(id => PASSIVE_TECHNIQUES.find(t => t.id === id).icon).join(' ') +
      '  ' + acquises.length + '/' + PASSIVE_TECHNIQUES.length + ' talents passifs'
    : 'Aucun talent — ils s\'acquièrent en jouant.';
  box.appendChild(acq);

  const suivante = PASSIVE_TECHNIQUES.find(t => !acquises.includes(t.id));
  if (suivante) {
    const nx = document.createElement('div');
    nx.className = 'bt-tech-next';
    nx.textContent = '→ ' + suivante.icon + ' ' + suivante.name + ' : ' + suivante.cond;
    nx.title = suivante.desc;
    box.appendChild(nx);
  }

  // Afficher les techniques d'attaque disponibles
  const atkDiv = document.createElement('div');
  atkDiv.className = 'bt-tech-list';
  atkDiv.style.marginTop = '6px';
  const atkIds = playerTechniques(rec || {});
  atkDiv.textContent = '⚔️ Attaques : ' + atkIds.map(id => {
    const t = techniqueById(id);
    return t ? t.icon + t.name : '';
  }).join(' · ');
  box.appendChild(atkDiv);
}

/** Jauge de combo avec indicateur de risque. */
const comboTxt = (n) => {
  if (n <= 0) return '';
  const benefit = Math.round(n * 15);
  const risk = Math.round(n * 10);
  return '🔥 combo ×' + n + '  ▸+' + benefit + '% dég  ⚠️+' + risk + '% reçu';
};

let _duelAct = null;
/** Enregistre le callback de sélection de technique (appelé par main.js). */
export function setDuelAct(fn) { _duelAct = fn; }

/**
 * Rend l'arène du duel tour-par-tour. Appelée à chaque changement d'état.
 */
export function updateBattleUI(b, now) {
  $('bt-setup').classList.add('hidden');
  $('bt-arena').classList.remove('hidden');
  setTxt('bt-mename', b.me.name + ' ' + b.me.hp + '/' + b.me.maxHp);
  setTxt('bt-foename', b.foe.name + ' ' + b.foe.hp + '/' + b.foe.maxHp);
  $('bt-mehp').style.width = (b.me.hp / b.me.maxHp * 100) + '%';
  $('bt-foehp').style.width = (b.foe.hp / b.foe.maxHp * 100) + '%';
  setTxt('bt-combo', comboTxt(b.combo));

  // Intention de l'ennemi
  const intentEl = $('bt-intent');
  if (!b.over && b.intent) {
    intentEl.classList.remove('hidden');
    setTxt('bt-intent-icon', b.intent.icon);
    setTxt('bt-intent-label', b.intent.label);
  } else {
    intentEl.classList.add('hidden');
  }

  const fb = b.feedback || { text: '', kind: '' };
  const log = $('bt-log');
  log.textContent = fb.text || '';
  log.className = 'small bt-feedback ' + (fb.kind || '');

  // Grille de techniques
  const grid = $('bt-techgrid');
  grid.innerHTML = '';
  if (!b.over && b.phase === 'choose') {
    const atkIds = playerTechniques({});
    // On utilise les IDs des techniques du combat (pas du rec, car les PP sont dans b.pp)
    const allTechIds = Object.keys(b.pp);
    for (const id of allTechIds) {
      const t = techniqueById(id);
      if (!t) continue;
      const remaining = b.pp[id];
      const btn = document.createElement('button');
      btn.className = 'bt-tech-btn' + (remaining <= 0 ? ' empty' : '');
      const minOk = !t.minCombo || b.combo >= t.minCombo;
      btn.disabled = remaining <= 0 || !minOk;
      btn.innerHTML = '<span class="bt-tech-icon">' + t.icon + '</span>' +
        '<span class="bt-tech-name">' + t.name + '</span>' +
        '<span class="bt-tech-pp">' + (t.cost > 0 ? remaining + ' PP' : '∞') + '</span>';
      if (t.minCombo && !minOk) {
        btn.innerHTML += '<span class="bt-tech-req">combo≥' + t.minCombo + '</span>';
      }
      btn.addEventListener('click', () => { if (_duelAct) _duelAct(id); });
      grid.appendChild(btn);
    }
  } else if (b.over) {
    grid.innerHTML = '';
  } else {
    // Phase intent/resolve : afficher "Tour en cours..."
    grid.innerHTML = '<p class="small" style="text-align:center;opacity:.6">Tour en cours…</p>';
  }

  setTxt('bt-tip', b.over
    ? (b.winner === 'me' ? '🏆 Victoire !' : '💔 Défaite…')
    : b.phase === 'choose' ? 'Choisis ta technique — l\'ennemi montre ' + (b.intent ? b.intent.icon + b.intent.label : '') : '');
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
    cLine.innerHTML = '🦦 <b>' + esc(s.name || 'Ta loutre') + '</b> · ' + tr.name + ' ' + tr.emoji +
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
    const niveau = Math.max(levelFromXp((rec && rec.xp) || 0).level, (rec && rec.levelReached) || 1);
    const unlocked2 = [];
    if (niveau >= UNLOCK_LEVEL.treat) unlocked2.push('treat');
    if (niveau >= UNLOCK_LEVEL.slide) unlocked2.push('slide');
    if (niveau >= UNLOCK_LEVEL.dive) unlocked2.push('dive');
    if (niveau >= UNLOCK_LEVEL.battle) unlocked2.push('battle');
    const ctx = { level: niveau, unlocked: unlocked2, world: s.place === 'monde' };
    for (const q of dailyQuests(s.qDaily.date, ctx)) {
      const done = s.qDaily.done.includes(q.id);
      const prog = Math.min(s.qDaily.progress[q.key] || 0, q.target);
      const div = document.createElement('div');
      div.className = 'row-item' + (done ? ' equipped' : '');
      div.style.cursor = 'default';
      div.innerHTML = '<span class="ic2">' + q.icon + '</span><div>' + esc(q.label) +
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
      '<div>' + esc(a.name) + '<small>' + esc(a.desc) + '</small></div>' +
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
