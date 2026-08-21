// Contrôleur du « Combat » (moteur de duel tour-par-tour) — extrait de main.js
// (audit M5, tranche 10). L'arène, le tirage de l'adversaire sauvage, la
// préparation et la sélection des techniques vivent ici. L'état runtime `battle`
// (non persisté) vit ICI : lu à chaque image par la boucle de rendu de main.js
// via getBattle(), et par le Monde / la Crue via ce même getBattle injecté.
// Tout le reste (état, records, niveau, XP, quêtes, persistance, et les ponts de
// résultat de duel restés côté Monde) est injecté par setupCombat — AUCUN accès
// direct à la portée de main.js. Déplacement verbatim : les corps sont ceux de
// main.js, seuls les accès globaux passent par le contexte injecté.
import { encodeCard, decodeCard, newBattle, stepBattle, duelInput, wildFoe, makeFighter, playerTechniques } from './battle.js';
import { combatBuffs } from './skills.js';
import { equipBonus } from './skins.js';
import { dayKey } from './quests.js';
import { XP } from './level.js';
import { UNLOCK_LEVEL } from './constants.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, rec = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); }

// État runtime du duel (non persisté) — vit ici, lu par la boucle via getBattle().
let battle = null;
let wildRoll = 0;   // change d'adversaire sans quitter l'écran

// Raccourcis vers les helpers restés dans main.js ou le contrôleur du Monde.
const curLevel = () => ctx.level();
const unlocked = (f) => ctx.unlocked(f);
const busy = () => ctx.busy();
const gainXp = (n) => ctx.gainXp(n);
const quest = (k, n) => ctx.quest(k, n);
const varietyBonus = (k) => ctx.varietyBonus(k);
const feel = (t) => ctx.feel(t);
const persistRec = () => ctx.persistRec();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupCombat(hooks) { ctx = hooks; }

/** État du duel courant — lu par la boucle de rendu, le Monde et la Crue. */
export function getBattle() { return battle; }
/** Un duel est en cours et pas terminé (garde de fermeture d'overlay). */
export function battleActive() { return !!(battle && !battle.over); }

// Combat de loutres : une sauvage à défier tout de suite (ou le code d'un ami)
// l'adversaire se cale sur la forme réelle de la loutre -> duels serrés
const rollWildFoe = () => wildFoe(curLevel(), 'wild|' + dayKey() + '|' + wildRoll, makeFighter(s, equipBonus(s)));

/** Lance un combat contre la carte donnée. */
export function startBattle(card, seed, foeMult) {
  sync();
  if (!card) return;
  const techIds = playerTechniques(rec);
  battle = newBattle(s, card, seed,
    { bonus: equipBonus(s), buffs: combatBuffs(rec), foeMult: foeMult || 1, level: curLevel(), now: now(), techIds });
  ctx.resetBattleDone();
  rec.battles++;
  persistRec();
  ui.shake();
  sfx.evolve(); vibrate([20, 40, 20]);
  ui.updateBattleUI(battle, now());
  gainXp(XP.battle);
  quest('battles');
  varietyBonus('battle');
}

/** Ouvre l'arène sur l'écran de préparation (adversaire sauvage proposé). */
function openBattle() {
  sync();
  if (!unlocked('battle')) { ui.log('⚔️ Les combats s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + ' ! ⭐'); return; }
  sfx.press();
  battle = null;
  ui.renderBattleSetup(rollWildFoe(), s, rec);
  ui.showOverlay('ovl-battle');
}

// Sélection d'une technique dans le duel tour-par-tour.
function duelAct(techId) {
  if (!battle || battle.over) return;
  duelInput(battle, techId, now());
  vibrate(6);
  const fk = battle.feedback && battle.feedback.kind;
  if (fk === 'strike') { sfx.catch(); feel('soft'); }
  else if (fk === 'hurt') { sfx.sad(); ui.shake(); }
  else sfx.press();
  ui.updateBattleUI(battle, now());
  if (battle.over) ctx.onDuelOver();
}

/** Fait avancer le duel en temps réel (appelé chaque image par la boucle de
 *  main.js). Renvoie vrai quand le duel vient de se terminer -> main.js déclenche
 *  le résultat via le pont du Monde. */
export function stepCombat(nowMs) {
  if (battle && !battle.over) {
    stepBattle(battle, nowMs);
    ui.updateBattleUI(battle, nowMs);
  }
  return !!(battle && battle.over);
}

/** Ferme l'arène et oublie le duel (bouton ✕, « Fermer », backdrop, Échap). */
export function closeBattle() { battle = null; ctx.clearEpreuve(); ui.hideOverlay('ovl-battle'); }

/** Câble les boutons de l'arène (appelé une fois au boot par main.js). */
export function wireCombat() {
  const $ = (id) => document.getElementById(id);
  $('b-battle').addEventListener('click', () => {
    sync();
    if (busy() || s.sleeping) return;
    openBattle();
  });
  $('bt-wild').addEventListener('click', () => { sync(); startBattle(rollWildFoe(), 'wild|' + dayKey() + '|' + wildRoll); });
  $('bt-reroll').addEventListener('click', () => { sync(); wildRoll++; sfx.press(); ui.renderBattleSetup(rollWildFoe(), s, rec); });
  $('bt-again').addEventListener('click', () => { sync(); wildRoll++; ui.renderBattleSetup(rollWildFoe(), s, rec); });
  $('bt-close').addEventListener('click', () => closeBattle());
  $('bt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bt-mycode').value); ui.toast('📋 Code copié !'); }
    catch (e) { try { $('bt-mycode').select(); document.execCommand('copy'); ui.toast('📋 Code copié !'); } catch (e2) {} }
  });
  $('bt-start').addEventListener('click', () => {
    sync();
    const card = decodeCard($('bt-foecode').value);
    if (!card) { ui.toast('❌ Code de combat invalide'); return; }
    startBattle(card, encodeCard(s) + $('bt-foecode').value.trim());
  });
  // Les boutons de technique sont créés dynamiquement par updateBattleUI
  ui.setDuelAct(duelAct);
}
