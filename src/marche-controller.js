// Contrôleur du « Marché » (v3.96) — extrait de main.js (audit M5, tranche 8).
// Domaine ÉCONOMIQUE regroupé : le Troc quotidien (coquillages ↔ poissons/gemmes),
// l'Atelier (3 doublons → 1 trésor du palier supérieur) et le Marché-HUB qui
// rassemble tout (garde-robe/troc/atelier/recrutement). Les tables sont pures
// (economy.js, items.js) ; ici : l'orchestration UI via un contexte injecté.
// Le HUB délègue à des domaines encore dans main.js (garde-robe, gang) via hooks.
import { dailyBarter, canCraft, craftChoices, nextTier, TIERS, CRAFT_NEED } from './economy.js';
import { dayKey } from './quests.js';
import { ITEMS, itemById, RARITIES } from './items.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();
const mg = () => ctx && ctx.getMinigame();
const saveRec = () => ctx.persistRec();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupMarche(hooks) { ctx = hooks; }

/* ---------------- Troc quotidien (É5) : coquillages ↔ poissons/gemmes ---------------- */
const giveKindOf = (o) => (o.give.shells != null ? 'shells' : 'fish');
function barterData() {
  const r = rec();
  if (r.barterDay !== dayKey()) { r.barterDay = dayKey(); r.barterUsed = []; }
  const bal = { shells: r.shells || 0, fish: r.fish || 0, gems: r.gems || 0 };
  return {
    balances: bal,
    offers: dailyBarter(dayKey()).map(o => {
      const gk = giveKindOf(o), gn = o.give[gk];
      const afford = (bal[gk] || 0) >= gn;
      return {
        id: o.id, giveKind: gk, giveN: gn,
        getKind: o.get.fish != null ? 'fish' : 'gems',
        getN: o.get.fish != null ? o.get.fish : o.get.gems,
        used: (r.barterUsed || []).includes(o.id),
        afford, rest: (bal[gk] || 0) - gn        // solde APRÈS achat (négatif = manque)
      };
    })
  };
}
const barterHandlers = {
  trade: (id) => {
    const r = rec();
    if (r.barterDay !== dayKey()) { r.barterDay = dayKey(); r.barterUsed = []; }
    if ((r.barterUsed || []).includes(id)) return;
    const offer = dailyBarter(dayKey()).find(o => o.id === id);
    if (!offer) return;
    const gk = giveKindOf(offer), gn = offer.give[gk];
    if ((r[gk] || 0) < gn) { ui.toast((gk === 'shells' ? '🐚' : '🐟') + ' Pas assez pour cet échange.'); sfx.sad(); vibrate(20); return; }
    r[gk] -= gn;
    if (offer.get.fish != null) r.fish = (r.fish || 0) + offer.get.fish;
    else if (offer.get.gems != null) r.gems = (r.gems || 0) + offer.get.gems;
    else if (offer.get.shells != null) r.shells = (r.shells || 0) + offer.get.shells;
    (r.barterUsed = r.barterUsed || []).push(id);
    saveRec(); sfx.happy(); vibrate(10);
    ui.updateHUD(s(), mg(), r); refreshBarter();
  }
};
function refreshBarter() { ui.renderBarter(barterData(), barterHandlers); }
export function openBarter() { if (!rec()) return; sfx.press(); refreshBarter(); ui.showOverlay('ovl-barter'); }

/* ---------------- Atelier (É5) : 3 doublons → 1 trésor du palier supérieur ---------------- */
let workshopChoice = null;   // { tier, ids } quand on choisit le trésor à forger
function workshopData() {
  const r = rec();
  return TIERS.slice(0, -1).map(t => ({
    tier: t,
    label: RARITIES[t].label,
    color: RARITIES[t].color,
    count: (r.dupes && r.dupes[t]) || 0,
    need: CRAFT_NEED,
    can: canCraft(r.dupes, t),
    upLabel: RARITIES[nextTier(t)].label
  }));
}
function itemPoolByTier(preferUnowned) {
  const r = rec();
  const pool = {};
  for (const it of ITEMS) {
    if (preferUnowned && r.items.includes(it.id)) continue;
    (pool[it.rarity] = pool[it.rarity] || []).push(it.id);
  }
  return pool;
}
const workshopHandlers = {
  begin: (tier) => {
    const r = rec();
    if (!canCraft(r.dupes, tier)) return;
    const up = nextTier(tier);
    let pool = itemPoolByTier(true);
    if (!(pool[up] || []).length) pool = itemPoolByTier(false);   // tout possédé : on rejoue quand même
    const ids = craftChoices(tier, pool, dayKey(), (r.dupes[tier] || 0));
    if (!ids.length) { ui.toast('Rien à forger pour ce palier.'); return; }
    workshopChoice = { tier, ids };
    refreshWorkshop();
  },
  pick: (tier, id) => {
    const r = rec();
    if (!canCraft(r.dupes, tier)) { workshopChoice = null; refreshWorkshop(); return; }
    r.dupes[tier] = (r.dupes[tier] || 0) - CRAFT_NEED;
    const it = itemById(id);
    if (it && !r.items.includes(id)) {
      r.items.push(id);
      ui.toast(it.emoji + ' ' + it.name + ' forgé !');
      ui.log('🛠️ Atelier : 3 doublons ' + RARITIES[tier].label.toLowerCase() + ' fondus en ' + it.emoji + ' ' + it.name + ' (' + RARITIES[it.rarity].label + ') !');
    } else if (it) {                       // déjà possédé : devient un doublon du palier sup + gemmes
      r.dupes[it.rarity] = (r.dupes[it.rarity] || 0) + 1;
      r.gems = (r.gems || 0) + 3;
      ui.toast(it.emoji + ' doublon rangé + 3 💎');
    }
    workshopChoice = null;
    saveRec(); sfx.levelup(); vibrate([15, 30, 15]);
    ui.updateHUD(s(), mg(), r); refreshWorkshop();
  },
  cancel: () => { workshopChoice = null; refreshWorkshop(); }
};
function refreshWorkshop() {
  let choice = null;
  if (workshopChoice) {
    choice = {
      tier: workshopChoice.tier,
      upLabel: RARITIES[nextTier(workshopChoice.tier)].label,
      items: workshopChoice.ids.map(id => {
        const it = itemById(id);
        return it ? { id, emoji: it.emoji, name: it.name, label: RARITIES[it.rarity].label } : { id, emoji: '❔', name: id, label: '' };
      })
    };
  }
  ui.renderWorkshop({ rows: workshopData(), choice }, workshopHandlers);
}
export function openWorkshop() { if (!rec()) return; workshopChoice = null; sfx.press(); ui.hideOverlay('ovl-menu'); refreshWorkshop(); ui.showOverlay('ovl-workshop'); }
/** Ferme l'atelier et oublie le choix en cours (backdrop / Échap / ✕). */
export function closeWorkshop() { workshopChoice = null; ui.hideOverlay('ovl-workshop'); }

/* ---------------- Le Marché (v3.96) : le HUB économique ----------------
   Il ne réinvente rien — il RASSEMBLE ce qui existait, éparpillé (garde-robe,
   troc, atelier, recrutement), et rend le troc atteignable sans marcher au lac.
   Garde-robe et gang vivent encore dans main.js : injectés via hooks. */
const marcheHandlers = {
  cosmetics: () => { ui.hideOverlay('ovl-marche'); ctx.openWardrobe('hats'); },
  troc: () => { ui.hideOverlay('ovl-marche'); openBarter(); },
  atelier: () => { ui.hideOverlay('ovl-marche'); openWorkshop(); },
  recrutement: () => { ui.hideOverlay('ovl-marche'); ctx.openGang(); }
};
export function openMarche(focus) {
  const r = rec();
  if (!r) return;
  sfx.press(); ui.hideOverlay('ovl-menu');
  ui.renderMarche({ fish: r.fish, shells: r.shells, gems: r.gems, focus: focus || null }, marcheHandlers);
  ui.showOverlay('ovl-marche');
  if (!r.marcheSeen) { r.marcheSeen = true; saveRec(); ui.toast('🪙 Voici ta bourse — dépense 🐟 🐚 💎 ici !'); }
}
