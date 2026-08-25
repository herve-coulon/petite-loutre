// Contrôleur de la « Progression » (glue partagée) — extrait de main.js (audit
// M5, tranche 19). Regroupe les récompenses transversales appelées par presque
// tous les domaines : l'XP du soigneur et les montées de niveau (`gainXp`), les
// quêtes du jour (`quest`), le bonus de variété (`varietyBonus`) et le lien avec
// la loutre (`careBond`). Déplacement verbatim ; les tables (level/items/quests/
// personality/skins) sont pures, l'état et les quelques helpers restés dans main
// (checkUnlocks — qui possède les repères de déblocage —, persist, feel, R,
// niveau) sont injectés par setupProgress. Aucun accès direct à main.js.
import { clamp, UNLOCK_LEVEL } from './constants.js';
import { equipBonus } from './skins.js';
import { levelFromXp, titleFor, levelUpGems, XP } from './level.js';
import { milestoneItem, itemById, RARITIES } from './items.js';
import { esc } from './util.js';
import { bondLevel, bondGain, isFavorite, favoriteLine } from './personality.js';
import { bumpQuest, completedQuests, questContext, dayKey } from './quests.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null, R = null;
let s = null, rec = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); }

const level = () => ctx.level();
const persist = () => ctx.persist();
const persistRec = () => ctx.persistRec();
const feel = (t) => ctx.feel(t);
const checkUnlocks = () => ctx.checkUnlocks();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupProgress(hooks) { ctx = hooks; R = hooks.R; }

const UNLOCK_LABEL = { treat: '🍡 Friandise', slide: '🛝 Toboggan', battle: '⚔️ Combat', dive: '🤿 Plongée' };
/** Activités qui s'ouvrent en passant de `before` à `after` (annonce de palier). */
function featuresOpenedBetween(before, after) {
  return Object.keys(UNLOCK_LABEL)
    .filter(f => before < UNLOCK_LEVEL[f] && after >= UNLOCK_LEVEL[f])
    .map(f => UNLOCK_LABEL[f]);
}

function questCtx() {
  return questContext(level(), s && s.place === 'monde');
}

/**
 * Le LIEN grandit à chaque geste attentionné. Si c'est l'activité préférée de
 * sa personnalité : réaction spéciale + éclat de joie. Un palier franchi = fête.
 */
export function careBond(actionKey) {
  sync();
  if (!s || s.stage === 'egg' || s.gameOver || s.away) return;
  const before = bondLevel(s.bond);
  s.bond = (s.bond || 0) + bondGain(actionKey, s.trait);
  const after = bondLevel(s.bond);
  if (isFavorite(s.trait, actionKey)) { // c'est ce qu'ELLE préfère
    s.fun = clamp(s.fun + 5, 0, 100);
    ui.log(favoriteLine(s.trait, s.name));
    R.spawn('heart', s.stage);
  }
  if (after.level > before.level) { // nouveau palier de lien
    ui.toast('💛 Lien : ' + after.name + ' !');
    R.burst('sparkle', 12, s.stage);
    sfx.happy(); vibrate([15, 30, 15]);
  }
  persist();
}

/** XP du soigneur : chaque geste compte. Montée de niveau = fête + friandise rechargée. */
export function gainXp(n) {
  sync();
  if (!rec || !n) return;
  n = Math.round(n * (equipBonus(s).xp || 1)); // bonus d'XP de tout l'équipement porté
  const before = levelFromXp(rec.xp || 0).level;
  rec.xp = (rec.xp || 0) + n;
  const L = levelFromXp(rec.xp);
  rec.levelReached = Math.max(rec.levelReached || 0, L.level);
  if (s && !s.gameOver && s.stage !== 'egg') R.xpText('+' + n, s.stage);
  if (L.level > before) {
    if (s) {
      s.lastTreat = 0; // récompense immédiate : friandise rechargée
      s.fun = clamp(s.fun + 15, 0, 100);
      if (!s.gameOver && s.stage !== 'egg') R.burst('confetti', 30, s.stage);
      persist();
    }
    checkUnlocks(); // cosmétiques et succès de palier viennent d'apparaître
    // trésors de palier garantis (un ou plusieurs niveaux franchis)
    const gotItems = [];
    for (let lv = before + 1; lv <= L.level; lv++) {
      const mid = milestoneItem(lv);
      if (mid && !rec.items.includes(mid)) { rec.items.push(mid); gotItems.push(itemById(mid)); }
    }
    // Gemmes de montée (v4.7) : chaque niveau franchi en donne — le level-up
    // redonne toujours quelque chose, et le Marché a de quoi tourner.
    let gemsWon = 0;
    for (let lv = before + 1; lv <= L.level; lv++) gemsWon += levelUpGems(lv);
    if (gemsWon > 0) rec.gems = (rec.gems || 0) + gemsWon;
    const gemLine = gemsWon > 0 ? '💎 +' + gemsWon + ' gemme' + (gemsWon > 1 ? 's' : '') : '';
    const gemLog = gemsWon > 0 ? ' (+' + gemsWon + ' 💎)' : '';
    const opened = featuresOpenedBetween(before, L.level);
    let reward, rewardColor;
    if (gotItems.length) {
      const it = gotItems[gotItems.length - 1];
      reward = '🎁 Trésor ' + RARITIES[it.rarity].label.toLowerCase() + '<br>' + it.emoji + ' <b>' + esc(it.name) + '</b>' + (gemLine ? '<br>' + gemLine : '');
      rewardColor = RARITIES[it.rarity].color;
      ui.log('🏅 Niveau ' + L.level + ' ! Trésor ' + RARITIES[it.rarity].label.toLowerCase() + ' : ' + it.emoji + ' ' + it.name + ' ! Équipe-le dans 🎩.' + gemLog);
    } else if (opened.length) {
      reward = '🔓 Débloqué<br><b>' + opened.join(' + ') + '</b>' + (gemLine ? '<br>' + gemLine : '');
      ui.log('⭐ Niveau ' + L.level + ' ! Débloqué : ' + opened.join(' + ') + ' ! Va essayer !' + gemLog);
    } else if (gemLine) {
      reward = gemLine + '<br>🍡 Friandise rechargée';
      ui.log('Niveau ' + L.level + ' ! Récompense : ' + gemsWon + ' 💎 + friandise rechargée. 🍡');
    } else {
      reward = '🍡 Friandise rechargée';
      ui.log('Niveau ' + L.level + ' ! Récompense : friandise rechargée. 🍡');
    }
    ui.celebrate({ kicker: 'Niveau', big: L.level, title: titleFor(L.level), reward, rewardColor });
    sfx.levelup(); vibrate([20, 40, 20]); feel('big');
  }
  ui.renderLevel(rec);
  persistRec();
}

const VARIETY_XP = 5;
const VARIETY_LABEL = { feed: 'repas', wash: 'bain', sleep: 'sieste', treat: 'friandise', play: 'pêche', dive: 'plongée', slide: 'toboggan', garden: 'jardin', battle: 'combat' };
export function varietyBonus(key) {
  sync();
  if (!s || s.gameOver || s.stage === 'egg') return;
  const d = dayKey(now());
  if (!s.dayActs || s.dayActs.date !== d) s.dayActs = { date: d, done: [] };
  if (s.dayActs.done.includes(key)) return;   // déjà fait aujourd'hui → pas de bonus
  s.dayActs.done.push(key);
  ui.toast('✨ 1re ' + (VARIETY_LABEL[key] || 'activité') + ' du jour — variété +' + VARIETY_XP + ' XP');
  gainXp(VARIETY_XP);
}

export function quest(key, n = 1) {
  sync();
  if (!s || s.stage === 'egg' || s.gameOver) return;
  bumpQuest(s, key, n, now());
  for (const q of completedQuests(s, rec, now(), questCtx())) {
    s.fun = clamp(s.fun + 10, 0, 100);
    R.spawn('heart', s.stage);
    R.burst('sparkle', 10, s.stage);
    gainXp(XP.quest);
    ui.toast(q.icon + ' Quête du jour réussie : ' + q.label + ' !');
    sfx.hatch(); vibrate([10, 30, 10]);
  }
  persistRec();
  checkUnlocks();
}
