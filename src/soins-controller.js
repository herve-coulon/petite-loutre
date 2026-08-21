// Contrôleur des « Soins » (gestes de base du soigneur) — extrait de main.js
// (audit M5, tranche 11). Regroupe les interactions quotidiennes : friandise,
// repas (poisson), bain, dodo, soin de la maladie / trousse premium, et la
// plongée au trésor. Rien de neuf : déplacement verbatim des corps de main.js.
// Les helpers partagés (careBond, afterAct, gainXp, quest, varietyBonus, feel,
// press, persist…) restent dans main.js et sont injectés par setupSoins — le
// contrôleur n'accède JAMAIS directement à la portée de main.js. Le renderer R
// et les getters d'état arrivent aussi par le contexte.
import {
  clamp, TREAT_CD, DIVE_MS, GEM_TREAT, GEM_HEAL, MIN, WAKE_OK_ENERGY, GRUMPY_MS, UNLOCK_LEVEL
} from './constants.js';
import { MEAL_HUNGER } from './economy.js';
import { XP } from './level.js';
import { seasonFor } from './seasons.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null, R = null;
let s = null, rec = null, mg = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame(); }

// Raccourcis vers les helpers restés dans main.js (partagés avec d'autres domaines).
const press = () => ctx.press();
const feel = (t) => ctx.feel(t);
const gainXp = (n) => ctx.gainXp(n);
const afterAct = () => ctx.afterAct();
const quest = (k, n) => ctx.quest(k, n);
const varietyBonus = (k) => ctx.varietyBonus(k);
const careBond = (k) => ctx.careBond(k);
const busy = () => ctx.busy();
const unlocked = (f) => ctx.unlocked(f);
const persist = () => ctx.persist();
const persistRec = () => ctx.persistRec();
const checkUnlocks = () => ctx.checkUnlocks();
const tryDrop = (b) => ctx.tryDrop(b);

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupSoins(hooks) { ctx = hooks; R = hooks.R; }

function servirFriandise(t) {
  press();
  s.lastTreat = t;
  s.hunger = clamp(s.hunger + 10, 0, 100);
  s.fun = clamp(s.fun + 8, 0, 100);
  s.grumpyUntil = 0; // une brochette de baies répare toutes les bouderies
  R.spawn('heart', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  R.burst('sparkle', 5, s.stage); R.ring(s.stage);
  sfx.happy(); feel('med');
  ui.log(s.name + ' savoure sa brochette de baies ! 🍡');
  gainXp(XP.treat);
  afterAct();
  quest('treats');
  varietyBonus('treat');
  careBond('treat');
}

export function actTreat() {
  sync();
  if (busy() || s.sleeping) return;
  if (!unlocked('treat')) { ui.log('🍡 La friandise s\'ouvre au niveau ' + UNLOCK_LEVEL.treat + ' ! Occupe-toi bien d\'elle pour monter. ⭐'); return; }
  const t = now();
  const CD = TREAT_CD;
  if (t - (s.lastTreat || 0) < CD) {
    const left = Math.ceil((CD - (t - s.lastTreat)) / MIN);
    // le délai gratuit court encore : on PEUT en offrir une tout de suite en gemmes
    if ((rec.gems || 0) >= GEM_TREAT) {
      ui.askConfirm('Plus de friandises avant ' + left + ' min.\nEn offrir une tout de suite pour 💎 ' + GEM_TREAT + ' ? (il te restera ' + ((rec.gems || 0) - GEM_TREAT) + ' 💎)', () => {
        if ((rec.gems || 0) < GEM_TREAT) return;   // garde-fou : solde revérifié à la validation
        rec.gems -= GEM_TREAT; persistRec(); ui.renderLevel(rec);
        servirFriandise(now());
        ui.toast('🍡 Friandise express ! (−' + GEM_TREAT + ' 💎)');
      });
    } else {
      ui.log('Plus de friandises pour l\'instant… (encore ' + left + ' min)');
    }
    return;
  }
  servirFriandise(t);
}

export function actDive() {
  sync();
  if (busy() || s.sleeping) return;
  if (!unlocked('dive')) { ui.log('🤿 La plongée au trésor s\'ouvre au niveau ' + UNLOCK_LEVEL.dive + ' ! ⭐'); return; }
  press();
  s.divingUntil = now() + DIVE_MS;
  sfx.wash();
  ui.log(s.name + ' plonge chercher un trésor… retour dans 15 min ! 🤿');
  afterAct();
}

export function resolveDive() {
  sync();
  s.divingUntil = 0;
  rec.treasures++;
  s.fun = clamp(s.fun + 15, 0, 100);
  s.hunger = clamp(s.hunger - 8, 0, 100);
  const finds = ['une perle nacrée 🦪', 'un coquillage rare 🐚', 'une pièce ancienne 🪙', 'un caillou qui brille ✨'];
  ui.log(s.name + ' remonte avec ' + finds[Math.floor(Math.random() * finds.length)] + ' !');
  R.burst('sparkle', 10, s.stage); R.ring(s.stage);
  sfx.hatch(); vibrate([15, 30, 15]); feel('med');
  gainXp(XP.dive);
  tryDrop(2.5); // la plongée est une vraie chasse au trésor : meilleure chance
  persist();
  checkUnlocks();
  careBond('dive');
  quest('dives');
  varietyBonus('dive');
}

export function actFeed() {
  sync();
  if (busy() || s.sleeping) return;
  if (s.hunger > 92) { press(); ui.log(s.name + ' n\'a plus faim du tout !'); return; }
  // Le repas se paie désormais en POISSON pêché — un vrai poisson rassasie mieux
  // qu'une friandise. À sec, on se rabat sur la friandise gratuite (actTreat).
  if ((rec.fish || 0) <= 0) {
    ui.log('🐟 Plus de poisson en réserve — pêche-en (Jouer 🎣), ou une friandise fera l\'affaire.');
    actTreat();
    return;
  }
  press();
  rec.fish -= 1;
  s.hunger = clamp(s.hunger + MEAL_HUNGER, 0, 100);
  s.fun = clamp(s.fun + 2, 0, 100);
  s.fed++;
  rec.mealsTotal++;
  s.nextPoop = Math.min(s.nextPoop, now() + (2 + Math.random() * 2) * 60 * MIN);
  R.spawn('fish', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  R.ring(s.stage); sfx.eat(); feel('soft');
  ui.log('Miam ! ' + s.name + ' dévore un poisson frais 🐟 (−1, réserve : ' + rec.fish + ').');
  gainXp(XP.meal);
  afterAct();
  quest('meals');
  varietyBonus('feed');
  careBond('feed');
  persistRec(); ui.updateHUD(s, mg, rec);
}

export function actWash() {
  sync();
  if (busy() || s.sleeping) return;
  press();
  const hadPoop = s.poops.length > 0;
  s.poops = [];
  s.clean = 100;
  s.washed++;
  rec.bathsTotal++;
  for (let i = 0; i < 10; i++) R.spawn('bubble', s.stage);
  R.burst('sparkle', 4, s.stage); R.ring(s.stage);
  sfx.wash(); feel('soft');
  // été : le bain rafraîchit vraiment (contre la chaleur)
  const summer = seasonFor(new Date(now())) === 'ete';
  if (summer) { s.fun = clamp(s.fun + 10, 0, 100); s.energy = clamp(s.energy + 8, 0, 100); }
  ui.log(summer ? 'Plouf ! Ça rafraîchit — ' + s.name + ' souffle enfin. 💧'
    : hadPoop ? 'Grand nettoyage ! Tout est propre. ✨' : s.name + ' barbote dans son bain. 🫧');
  gainXp(XP.wash);
  afterAct();
  quest('washes');
  varietyBonus('wash');
  careBond('wash');
}

export function actSleep() {
  sync();
  if (busy()) return;
  press();
  s.sleeping = !s.sleeping;
  if (s.sleeping) {
    rec.sleepsTotal++;
    sfx.sleep(); ui.log(s.name + ' se blottit pour dormir… 💤');
    afterAct();
    quest('sleeps');
    varietyBonus('sleep');
    careBond('sleep');
    return;
  }
  if (s.energy < WAKE_OK_ENERGY) {
    // réveillée en plein rêve : elle boude (un câlin ou une friandise la déride)
    s.grumpyUntil = now() + GRUMPY_MS;
    s.fun = clamp(s.fun - 8, 0, 100);
    sfx.sad();
    ui.log(s.name + ' est réveillée en plein rêve… elle boude ! 😾');
  } else {
    sfx.press(); ui.log(s.name + ' se réveille et s\'étire.');
  }
  afterAct();
  checkUnlocks();
}

export function actHeal() {
  sync();
  if (busy()) return;
  if (!s.sick) { offrirTrousse(); return; }   // pas malade : voie premium en gemmes
  press();
  s.sick = false;
  s.health = clamp(s.health + 20, 0, 100);
  s.healed++;
  R.spawn('heart', s.stage);
  R.burst('sparkle', 8, s.stage); R.ring(s.stage);
  R.squash();
  sfx.heal(); feel('med');
  ui.log('Le médicament fait effet. ' + s.name + ' va mieux ! 💊');
  afterAct();
  careBond('heal');
}

/**
 * Loutre pas malade : soigner la maladie n'a pas lieu d'être (gratuit de toute
 * façon), mais on peut acheter une TROUSSE DE SOINS qui remet la santé au
 * maximum sur-le-champ — utile avant un duel ou une virée aux confins. La santé
 * remonte aussi d'elle-même quand la loutre va bien : la trousse n'est qu'un
 * raccourci payant, jamais la seule issue.
 */
function offrirTrousse() {
  if (s.health >= 100) { ui.log(s.name + ' est déjà en pleine forme. 💪'); return; }
  if ((rec.gems || 0) < GEM_HEAL) {
    ui.log(s.name + ' n\'est pas malade — sa santé remonte doucement d\'elle-même.');
    return;
  }
  ui.askConfirm('Une trousse de soins remet la santé au maximum tout de suite, pour 💎 ' + GEM_HEAL + ' ? (il te restera ' + ((rec.gems || 0) - GEM_HEAL) + ' 💎)', () => {
    if ((rec.gems || 0) < GEM_HEAL || s.health >= 100) return;  // solde/état revérifiés à la validation
    rec.gems -= GEM_HEAL;
    s.health = 100;
    persist(); persistRec(); ui.renderLevel(rec); ui.updateHUD(s, mg, rec);
    R.spawn('heart', s.stage); R.burst('sparkle', 8, s.stage); R.ring(s.stage); R.squash();
    sfx.heal(); feel('med'); vibrate([15, 30, 15]);
    ui.toast('💊 Trousse de soins ! Santé au max. (−' + GEM_HEAL + ' 💎)');
    ui.log(s.name + ' retrouve toute sa forme grâce à la trousse de soins. 💊');
  });
}
