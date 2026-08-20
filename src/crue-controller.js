// Contrôleur de « La Crue » (É5b) — extrait de main.js (audit M5, tranche 1).
// Domaine : le rendez-vous HEBDOMADAIRE (championne, médailles, matériaux).
// La logique pure reste dans crue.js ; ici : orchestration UI/duel via un
// contexte injecté par main.js — AUCUN état global partagé, aucun accès à la
// portée de l'orchestrateur.
import { isoWeekKey, crueOfWeek, medalFor, claimCrueRewards } from './crue.js';
import { UNLOCK_LEVEL } from './constants.js';
import { ZONES, zoneById } from './tilemap.js';
import { PASSIVE_TECHNIQUES } from './skills.js';
import { wildFoe, makeFighter } from './battle.js';
import * as ui from './ui.js';
import { sfx } from './audio.js';

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();
const battle = () => ctx && ctx.getBattle();
const mg = () => ctx && ctx.getMinigame();
const level = () => ctx.level();
const canFight = () => ctx.canFight();
const launchBattle = (foe, seed, mult) => ctx.launchBattle(foe, seed, mult);
const saveRec = () => ctx.persistRec();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupCrue(hooks) { ctx = hooks; }

let crueEnCours = null;        // la Crue dont on affronte la championne, s'il y a lieu
let crueBannerShown = false;   // bannière d'entrée de vallée montrée une fois par session
const MEDAL_EMOJI = { bronze: '🥉', argent: '🥈', or: '🥇' };

// La Crue de la semaine, déterministe (lieu + météo + championne + talents visibles).
export function currentCrue() {
  return crueOfWeek(isoWeekKey(new Date()), Object.keys(ZONES), PASSIVE_TECHNIQUES.map(t => t.id));
}
// Progrès de la SEMAINE courante — remis à zéro dès qu'on change de semaine ISO.
function crueProgress() {
  const wk = isoWeekKey(new Date());
  if (!rec().crue || rec().crue.week !== wk) rec().crue = { week: wk, best: 'none', claimed: [] };
  return rec().crue;
}
// La carte de la championne : calée sur la loutre NUE (duel serré), renforcée par
// powerMult au lancement (comme l'épreuve, mais seedée par la SEMAINE, pas le lieu).
function carteChampionne(cr) {
  const base = wildFoe(level(), cr.seed, makeFighter(s()));
  return { ...base, name: cr.name, hat: null };
}
function defierCrue() {
  if (!canFight()) { ui.toast('🌊 Reviens quand ta loutre pourra se battre.'); return; }
  if (level() < UNLOCK_LEVEL.battle) {
    ui.log('🌊 La Crue et sa championne s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + '.'); return;
  }
  if (!ctx || !ctx.launchBattle) return;
  const cr = currentCrue();
  crueProgress();               // aligne rec.crue sur la bonne semaine avant le duel
  crueEnCours = cr;
  ui.hideOverlay('ovl-crue');
  ui.showOverlay('ovl-battle');
  launchBattle(carteChampionne(cr), cr.seed, cr.powerMult);
}
// Victoire sur la championne : médaille selon les PV restants, la MEILLEURE est
// gardée, et chaque palier atteint se réclame UNE fois par semaine (matériaux + gemmes).
function gagnerCrue(cr) {
  const prog = crueProgress();
  const hpFrac = (battle() && battle().me && battle().me.maxHp) ? battle().me.hp / battle().me.maxHp : 0;
  const medal = medalFor(true, hpFrac);
  const res = claimCrueRewards(prog, rec(), medal);   // logique pure & testée
  saveRec(); ui.updateHUD(s(), mg(), rec());
  if (res.granted.length) {
    ui.celebrate({ kicker: 'LA CRUE', big: MEDAL_EMOJI[medal] || '🌊',
      title: cr.name + ' vaincue', reward: '💎 +' + res.gems + ' · matériaux d\'atelier 🛠️' });
    ui.log('🌊 Crue : ' + cr.name + ' vaincue — médaille ' + medal + ' ' + (MEDAL_EMOJI[medal] || '') + ' !');
  } else {
    ui.toast('🌊 ' + cr.name + ' s\'incline encore (' + medal + ' déjà obtenu)');
  }
}
function crueData() {
  const cr = currentCrue();
  const prog = crueProgress();
  const z = zoneById(cr.zone);
  const talents = cr.talents.map(id => {
    const t = PASSIVE_TECHNIQUES.find(x => x.id === id);
    return t ? { icon: t.icon, name: t.name } : { icon: '✨', name: id };
  });
  return {
    weatherLabel: cr.weatherLabel,
    zoneName: z ? z.name : cr.zone,
    name: cr.name,
    powerMult: cr.powerMult,
    talents,
    best: prog.best, bestEmoji: MEDAL_EMOJI[prog.best] || '',
    tiers: cr.tiers.map(t => ({ desc: t.desc, emoji: MEDAL_EMOJI[t.medal], got: prog.claimed.includes(t.medal) })),
    locked: level() < UNLOCK_LEVEL.battle,
    lockLevel: UNLOCK_LEVEL.battle
  };
}
export function openCrue() {
  if (!rec()) return;
  sfx.press(); ui.hideOverlay('ovl-menu');
  ui.renderCrue(crueData(), { defy: defierCrue });
  ui.showOverlay('ovl-crue');
}
// Notification optionnelle « la Crue est arrivée » — gated sur l'opt-in existant
// (s.push + permission accordée). Une seule fois par semaine, en local (best-effort).
export function maybeNotifyCrue() {
  try {
    const st = s();
    if (!st || !st.push || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const wk = isoWeekKey(new Date());
    if (rec().crueNotified === wk) return;
    rec().crueNotified = wk; saveRec();
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification('🌊 La Crue est arrivée !', {
          body: 'Une championne rôde dans la vallée cette semaine.', tag: 'crue', icon: './icons/icon-192.png'
        }))
        .catch(() => {});
    }
  } catch (_) { /* le banner en jeu reste le canal principal */ }
}

/* ---------------- Ponts vers l'orchestrateur (main.js) ---------------- */

/** Vrai si la Crue est en cours (le duel contre la championne n'est pas fini). */
export function crueDuelActive() { return !!crueEnCours; }

/** Dénoue le duel de Crue : victoire -> récompenses, défaite -> message. Nettoie l'état. */
export function resolveCrueDuel(won) {
  if (!crueEnCours) return;
  const cr = crueEnCours;
  crueEnCours = null;
  if (won) gagnerCrue(cr);
  else ui.log('🌊 La championne tient bon — la Crue t\'attend encore.');
}

/** Bannière d'entrée de vallée : vraie une seule fois par session, puis fausse. */
export function crueBannerOnce() {
  if (crueBannerShown) return false;
  crueBannerShown = true;
  return true;
}
