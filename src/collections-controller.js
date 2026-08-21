// Contrôleur des « Collections » (Almanach de saison, Succès, Carnet du
// naturaliste) — extrait de main.js (audit M5, tranche 16). Trois panneaux en
// lecture/réclamation, ouverts depuis le profil ou le HUD : l'Almanach (piste de
// 8 paliers de saison à réclamer), les Succès (consultation + extinction du
// badge) et le Carnet (bestiaire + trouvailles + records, onglets). Déplacement
// verbatim : les tables (almanach/seasons/quests) sont pures, l'état s/rec et
// les helpers (persistRec/refreshGift/openSouvenir) sont injectés par setup.
import { ALMANACH_TIERS, tierState, almanachProgress, almanachCompletion, claimTier } from './almanach.js';
import { seasonInfo, seasonFor } from './seasons.js';
import { ensureDaily } from './quests.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();
const $ = (id) => document.getElementById(id);

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, rec = null, mg = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame(); }

const persistRec = () => ctx.persistRec();
const refreshGift = () => ctx.refreshGift();
const openSouvenir = (anc) => ctx.openSouvenir(anc);

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupCollections(hooks) { ctx = hooks; }

/* ---------------- Almanach de saison (v3.99) : piste de 8 paliers ---------------- */
const REWARD_ICON = { gems: '💎', fish: '🐟', shells: '🐚' };
function rewardLabel(r) {
  if (r.gift) return '🎁 Cadeau : 💎 ' + r.gems + ' + 🐟 ' + r.fish;
  if (r.dupes && r.dupesTier) return '🛠️ ' + r.dupes + ' matériaux d\'atelier';
  for (const k of ['gems', 'fish', 'shells']) if (r[k]) return REWARD_ICON[k] + ' ' + r[k];
  return '✨';
}
function almanachData() {
  const info = seasonInfo(new Date());
  const label = (info && info.label) ? info.label : (seasonFor(new Date()) || 'Saison');
  return {
    seasonEmoji: (info && info.emoji) || '📅',
    seasonLabel: label + ' ' + new Date().getFullYear(),
    progress: almanachProgress(rec),
    completion: almanachCompletion(rec),
    tiers: ALMANACH_TIERS.map((t, i) => ({ need: t.need, rewardLabel: rewardLabel(t.reward), state: tierState(rec, i) }))
  };
}
const almanachHandlers = {
  claim: (i) => {
    const r = claimTier(rec, i);
    if (!r) return;
    persistRec(); ui.renderLevel(rec); ui.updateHUD(s, mg, rec); refreshGift();
    vibrate([15, 30, 15]); sfx.happy();
    refreshAlmanach();
    if (r.gift) ui.celebrate({ kicker: 'Almanach — palier final', big: '🎁', title: 'Cadeau de saison', reward: '+' + r.gems + ' 💎    +' + r.fish + ' 🐟', rewardColor: 'var(--teal)' });
    else ui.toast('📅 Palier ' + (i + 1) + ' réclamé — ' + rewardLabel(r).replace(/^🛠️ /, '+') + ' !');
  }
};
const refreshAlmanach = () => ui.renderAlmanach(almanachData(), almanachHandlers);
function openAlmanach() { sync(); if (!rec) return; sfx.press(); refreshAlmanach(); ui.showOverlay('ovl-almanach'); }

/* ---------------- Succès ---------------- */
function openAch() {
  sync();
  sfx.press();
  ui.hideOverlay('ovl-menu');
  if (s && s.stage !== 'egg') ensureDaily(s, now());
  ui.renderAchievements(rec, s);
  // Succès consultés : on éteint le badge de notif jusqu'aux prochains débloqués.
  if (rec) { rec.achSeen = (rec.achievements || []).length; persistRec(); ui.renderLevel(rec); }
  ui.showOverlay('ovl-ach');
}

/* ---------------- Le Carnet du naturaliste (v3.98) ---------------- */
let carnetSection = 'bestiaire';
const refreshCarnet = () => ui.renderCarnet(rec, s, carnetSection, { onSouvenir: openSouvenir });
function openCarnet() {
  sync();
  if (!rec) return;
  sfx.press(); ui.hideOverlay('ovl-menu');
  carnetSection = 'bestiaire';
  refreshCarnet();
  ui.showOverlay('ovl-carnet');
}

/** Câble les boutons des trois panneaux — appelé une fois au boot par main.js. */
export function wireCollections() {
  $('b-gift').addEventListener('click', openAlmanach);
  $('b-ach').addEventListener('click', openAch);
  { const el = $('ps-ach'); if (el) el.addEventListener('click', openAch); }
  $('btn-ach-close').addEventListener('click', () => ui.hideOverlay('ovl-ach'));
  $('pt-carnet').addEventListener('click', openCarnet);
  document.querySelectorAll('#carnet-tabs .carnet-tab').forEach(tab => {
    tab.addEventListener('click', () => { carnetSection = tab.getAttribute('data-sec'); sfx.press(); refreshCarnet(); });
  });
}
