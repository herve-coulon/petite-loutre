// Contrôleur du « Profil » (garde-robe + gang) — extrait de main.js (audit M5,
// tranche 15). Deux panneaux ouverts depuis l'écran Profil : la GARDE-ROBE
// (chapeaux/pelages/décors/trésors : équiper + acheter en gemmes) et le GANG
// (créer, recruter, livrer une bataille de gang). Déplacement verbatim : les
// corps sont ceux de main.js, seuls les accès globaux passent par le contexte.
// Les tables (skins/items/gang/economy) sont pures ; l'état s/rec, le renderer
// et les helpers (persist/gainXp/curLevel/isRecruited…) sont injectés.
import { unlockedHats, hatById } from './accessories.js';
import { unlockedFurs, unlockedDecors, furById, decorById } from './skins.js';
import { itemById, treasurePrice, cosmeticPrice } from './items.js';
import { recruitFishCost } from './economy.js';
import { makeGang, recruit, recruitBoard, gangPower, generateRival, resolveGangBattle, applyGangResult, MAX_MEMBERS } from './gang.js';
import { dayKey } from './quests.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const $ = (id) => document.getElementById(id);

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null, R = null;
let s = null, rec = null, mg = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame(); }

// Raccourcis vers les helpers restés dans main.js.
const persist = () => ctx.persist();
const persistRec = () => ctx.persistRec();
const gainXp = (n) => ctx.gainXp(n);
const curLevel = () => ctx.level();
const isRecruited = (id) => ctx.isRecruited(id);
const markRecruited = (id) => ctx.markRecruited(id);
const worldTravel = () => ctx.worldTravel();
// Réaligne les repères de déblocage : un cosmétique qu'on vient de PAYER ne doit
// pas être ré-annoncé comme un cadeau par checkUnlocks.
const syncUnlockBaselines = () => ctx.syncUnlockBaselines();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupProfil(hooks) { ctx = hooks; R = hooks.R; }

/* ---------------- Garde-robe (chapeaux, pelages, décors, trésors) ---------------- */
const wardrobeHandlers = {
  onHat(id) {
    sync();
    if (!s || !unlockedHats(rec).includes(id)) return;
    s.hat = (s.hat === id ? null : id);
    sfx.press(); vibrate(10); persist();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
  },
  onFur(id) {
    sync();
    if (!s || !unlockedFurs(rec).includes(id)) return;
    s.fur = id;
    sfx.press(); vibrate(10); persist();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
  },
  onDecor(id) {
    sync();
    if (!s || !unlockedDecors(rec).includes(id)) return;
    s.decor = id;
    sfx.press(); vibrate(10); persist();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
  },
  onGear(id) {
    sync();
    if (!s || !rec.items.includes(id)) return;
    s.gear = (s.gear === id ? null : id); // touché à nouveau = retirer
    sfx.press(); vibrate(10); persist();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
  },
  // Acheter un TRÉSOR avec des gemmes. Réservé aux trouvables (drop:true) :
  // les exclusifs de palier se gagnent en montant de niveau. On l'équipe.
  onBuyTresor(id) {
    sync();
    const it = itemById(id);
    if (!s || !rec || !it || !it.drop) return;         // milestone -> non vendable
    if ((rec.items || []).includes(id)) return;        // déjà à toi
    const prix = treasurePrice(it);
    if (prix <= 0) return;
    if ((rec.gems || 0) < prix) {
      ui.toast('💎 Pas assez de gemmes — il en faut ' + prix + '.'); sfx.sad(); vibrate(20);
      return;
    }
    ui.askConfirm('Acheter ' + it.emoji + ' ' + it.name + ' pour 💎 ' + prix + ' ?', () => {
      if ((rec.gems || 0) < prix) return;
      rec.gems -= prix;
      (rec.items = rec.items || []).push(id);
      s.gear = id;                                        // satisfaction immédiate
      persist(); persistRec();
      sfx.levelup(); vibrate([20, 40, 20]);
      if (s && !s.gameOver && s.stage !== 'egg') R.burst('confetti', 16, s.stage);
      ui.toast(it.emoji + ' Acheté : ' + it.name + ' ! (−' + prix + ' 💎)');
      ui.renderLevel(rec);
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    });
  },
  // Acheter un cosmétique avec des gemmes : la voie « impatiente », en plus de
  // l'exploit. On équipe dans la foulée — la récompense doit être immédiate.
  onBuyHat(id) { buyCosmetic(hatById(id), unlockedHats, (i) => { s.hat = i; }); },
  onBuyFur(id) { buyCosmetic(furById(id), unlockedFurs, (i) => { s.fur = i; }); },
  onBuyDecor(id) { buyCosmetic(decorById(id), unlockedDecors, (i) => { s.decor = i; }); }
};

/**
 * Achat d'un cosmétique en gemmes. Refuse les trophées (earnOnly) et les
 * emplettes déjà à soi ; débite, inscrit dans rec.bought, équipe aussitôt.
 * On réaligne prevHats/prevFurs pour que checkUnlocks ne le ré-annonce pas
 * comme un cadeau — on vient de le PAYER.
 */
function buyCosmetic(item, unlockedFn, equip) {
  sync();
  if (!s || !rec || !item || item.earnOnly) return;
  if (item.id && unlockedFn(rec).includes(item.id)) return;   // déjà débloqué
  const prix = cosmeticPrice(item.bonus);
  if (prix <= 0) return;
  if ((rec.gems || 0) < prix) {
    ui.toast('💎 Pas assez de gemmes — il en faut ' + prix + '.'); sfx.sad(); vibrate(20);
    return;
  }
  ui.askConfirm('Acheter ' + item.icon + ' ' + item.name + ' pour 💎 ' + prix + ' ?', () => {
    if ((rec.gems || 0) < prix) return;
    rec.gems -= prix;
    (rec.bought = rec.bought || []).push(item.id);
    equip(item.id);                                             // satisfaction immédiate
    syncUnlockBaselines();
    persist(); persistRec();
    sfx.levelup(); vibrate([20, 40, 20]);
    if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
    ui.toast(item.icon + ' Acheté : ' + item.name + ' ! (−' + prix + ' 💎)');
    ui.renderLevel(rec);
    ui.renderWardrobe(s, rec, wardrobeHandlers);
  });
}

/** Ouvre la garde-robe SUR L'ONGLET voulu (chaque slot du profil est distinct). */
export function openWardrobe(tab) {
  sync();
  sfx.press();
  ui.hideOverlay('ovl-menu');
  ui.renderWardrobe(s, rec, wardrobeHandlers, tab);
  ui.showOverlay('ovl-hats');
}

/* ---------------- Gang (créer, recruter, batailles de gang) ---------------- */
const gangBoard = () => {
  const cost = recruitFishCost((rec.gang && rec.gang.members.length) || 0);
  return recruitBoard(curLevel(), dayKey(), 3)
    .map(c => ({ ...c, cost, recruited: isRecruited(c.id) }));
};
const refreshGang = () => ui.renderGang(rec, s, gangHandlers, gangBoard());
const gangHandlers = {
  create: (name, emblem) => {
    sync();
    rec.gang = makeGang(name, emblem, s);
    persistRec(); sfx.happy(); vibrate(12);
    ui.renderProfile(s, rec, worldTravel()); refreshGang();
  },
  recruit: (c) => {
    sync();
    if (!rec.gang || rec.gang.members.length >= MAX_MEMBERS) return;
    const cost = recruitFishCost(rec.gang.members.length);
    if ((rec.fish || 0) < cost) { ui.toast('🐟 Pas assez de poissons — il en faut ' + cost + '.'); sfx.sad(); vibrate(20); return; }
    if (recruit(rec.gang, c)) {
      rec.fish -= cost; markRecruited(c.id);
      persistRec(); sfx.happy(); vibrate(12);
      ui.renderProfile(s, rec, worldTravel()); refreshGang();
      ui.updateHUD(s, mg, rec);
    }
  },
  battle: () => {
    sync();
    if (!rec.gang || !rec.gang.members.length) return;
    const seed = 'gb|' + dayKey() + '|' + ((rec.gang.wins || 0) + (rec.gang.losses || 0));
    const rival = generateRival(gangPower(rec.gang), curLevel(), 'rv|' + seed);
    const res = resolveGangBattle(rec.gang, rival, seed);
    applyGangResult(rec.gang, rival, res.winner);
    rec.battles = (rec.battles || 0) + 1;
    if (res.winner === 'a') {
      rec.wins = (rec.wins || 0) + 1;
      rec.gems = (rec.gems || 0) + 2;
      res.reward = '+20 XP · +2 💎';
      gainXp(20);
    } else {
      res.reward = '+5 XP';
      gainXp(5);
    }
    persistRec();
    if (res.winner === 'a') { sfx.happy(); vibrate([15, 30, 15]); } else { sfx.press(); vibrate(20); }
    ui.renderProfile(s, rec, worldTravel());
    ui.renderGangResult(res, rival, rec.gang, gangHandlers);
  },
  back: () => refreshGang()
};

export function openGang() {
  sync();
  sfx.press();
  ui.hideOverlay('ovl-menu');
  refreshGang();
  ui.showOverlay('ovl-gang');
}

/** Câble les boutons du Profil (garde-robe + gang) — appelé une fois au boot. */
export function wireProfil() {
  // exposé pour les tests (le banc jsdom pilote l'achat via ces gestionnaires)
  if (window.__loutre) window.__loutre.__wardrobeHandlers = wardrobeHandlers;
  // La garde-robe s'ouvre SUR L'ONGLET voulu : chaque slot du profil est un
  // raccourci distinct (chapeau, pelage, décor, trésors) — plus un doublon.
  const SLOT_TAB = { 'ps-hat': 'hats', 'ps-fur': 'furs', 'ps-gear': 'tresors', 'ps-decor2': 'decors' };
  for (const [id, tab] of Object.entries(SLOT_TAB)) {
    const el = $(id); if (el) el.addEventListener('click', () => openWardrobe(tab));
  }
  $('btn-hats-close').addEventListener('click', () => ui.hideOverlay('ovl-hats'));
  $('pt-gang').addEventListener('click', openGang);
}
