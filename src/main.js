// Orchestrateur : relie simulation, rendu, UI, audio et PWA.
import {
  SEC, MIN, clamp, TREAT_CD, DIVE_MS, GRUMPY_MS, WAKE_OK_ENERGY,
  WARM_BOOST, WARM_CD, SHAKE_BOOST, SHAKE_CD, SHAKE_G,
  AWAY_CARE_NEEDED, AWAY_CARE_CD, SEASON_FX, UNLOCK_LEVEL, GAME_VERSION
} from './constants.js';
import { touchStreak } from './streak.js';
import { greeting } from './mood.js';
import * as push from './push.js';
import { dailyShareText } from './share.js';
import { dailyEvent, butterflyPos } from './events.js';
import * as music from './music.js';
import * as ambient from './ambient.js';
import { XP, levelFromXp, titleFor } from './level.js';
import { bumpQuest, completedQuests, ensureDaily, dayKey } from './quests.js';

import {
  newState, saveState, loadState, clearSave,
  loadRecords, saveRecords, exportSave, importSave
} from './state.js';
import { stepSim, simulateOffline, ageMs } from './sim.js';
import { newGame, tickGame, clickGame } from './minigame.js';
import { newSlide, tickSlide, setSlideLane, laneAt } from './toboggan.js';
import { makeRenderer, OTTER_X, otterY } from './render.js';
import { sfx, vibrate, setMuted, setVolume, getVolume } from './audio.js';
import * as ui from './ui.js';
import { registerSW, setupInstall, requestPersistentStorage } from './pwa.js';
import { unlockedHats, hatById } from './accessories.js';
import { unlockedFurs, unlockedDecors } from './skins.js';
import { newAchievements } from './achievements.js';
import { encodeCard, decodeCard, newBattle, playTurn } from './battle.js';
import { makeCard, CARD_URL } from './photocard.js';
import { nextBeat, markSeen, coachStep } from './story.js';
import { seasonFor, seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { ITEMS, RARITIES, itemById, bonusOf, rollDrop, milestoneItem } from './items.js';
import { pickTrait, traitById, isFavorite, favoriteLine, bondGain, bondLevel } from './personality.js';

const $ = id => document.getElementById(id);
const now = () => Date.now();
const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();

let s = null;
let rec = null;               // records globaux (toutes loutres confondues)
let prevHats = new Set();     // pour détecter les nouveaux déblocages
let mg = null;
let battle = null;
let frame = 0;
let wobbleUntil = 0, lastWarm = 0, lastPet = 0, lastSave = 0, lastTickAt = now();
let storyOpen = false;        // une carte chapitre est à l'écran
let coachTarget = null;       // bouton actuellement surligné par le tutoriel
let lastSeasonHint = 0;       // throttle des rappels saisonniers (froid/chaud)

const cv = $('cv');
const R = makeRenderer(cv);

/* ---------------- Événements de simulation -> retours joueur ---------------- */
function applyEvents(events, offline = false) {
  for (const ev of events) {
    if (ev.type === 'hatch') {
      ui.showNaming();
      if (!offline) { sfx.hatch(); R.burst('confetti', 26, 'egg'); gainXp(XP.hatch); }
      continue;
    }
    if (ev.type === 'away') {
      rec.bestAge = Math.max(rec.bestAge, ageMs(s, s.awayAt || now()));
      checkUnlocks();
      if (!offline) { sfx.over(); ui.shake(); vibrate([30, 50, 30]); }
      ui.log((s.name || 'Ta loutre') + ' n\'allait pas bien du tout… elle est partie bouder chez le héron. Porte-lui des poissons pour la ramener ! 🪶');
      continue;
    }
    if (offline) continue; // le reste est résumé au retour
    const msg = ui.liveEventMessage(ev, s);
    if (msg) ui.log(msg);
    if (ev.type === 'evolve') {
      ui.toast('✨ ' + s.name + ' a grandi ! ✨');
      sfx.evolve();
      R.burst('confetti', 40, s.stage); // pluie de confettis d'évolution
      gainXp(XP.evolve);
    }
    if (ev.type === 'sick') sfx.sad();
  }
}

/* ---------------- Actions ---------------- */
function diving() { return s && (s.divingUntil || 0) > now(); }
function busy() { return !s || s.gameOver || s.away || s.stage === 'egg' || mg || diving(); }
function press() { vibrate(10); }
const curLevel = () => levelFromXp((rec && rec.xp) || 0).level;
const unlocked = (feat) => curLevel() >= UNLOCK_LEVEL[feat];
const UNLOCK_LABEL = { treat: '🍡 Friandise', slide: '🛝 Toboggan', battle: '⚔️ Combat', dive: '🤿 Plongée' };
/** Activités qui s'ouvrent en passant de `before` à `after` (annonce de palier). */
function featuresOpenedBetween(before, after) {
  return Object.keys(UNLOCK_LABEL)
    .filter(f => before < UNLOCK_LEVEL[f] && after >= UNLOCK_LEVEL[f])
    .map(f => UNLOCK_LABEL[f]);
}

function actTreat() {
  if (busy() || s.sleeping) return;
  if (!unlocked('treat')) { ui.log('🍡 La friandise s\'ouvre au niveau ' + UNLOCK_LEVEL.treat + ' ! Occupe-toi bien d\'elle pour monter. ⭐'); return; }
  const t = now();
  const CD = TREAT_CD;
  if (t - (s.lastTreat || 0) < CD) {
    const left = Math.ceil((CD - (t - s.lastTreat)) / MIN);
    ui.log('Plus de friandises pour l\'instant… (encore ' + left + ' min)');
    return;
  }
  press();
  s.lastTreat = t;
  s.hunger = clamp(s.hunger + 10, 0, 100);
  s.fun = clamp(s.fun + 8, 0, 100);
  s.grumpyUntil = 0; // une brochette de baies répare toutes les bouderies
  R.spawn('heart', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  R.burst('sparkle', 5, s.stage);
  sfx.happy();
  ui.log(s.name + ' savoure sa brochette de baies ! 🍡');
  gainXp(XP.treat);
  afterAct();
  quest('treats');
  careBond('treat');
}

function actDive() {
  if (busy() || s.sleeping) return;
  if (!unlocked('dive')) { ui.log('🤿 La plongée au trésor s\'ouvre au niveau ' + UNLOCK_LEVEL.dive + ' ! ⭐'); return; }
  press();
  s.divingUntil = now() + DIVE_MS;
  sfx.wash();
  ui.log(s.name + ' plonge chercher un trésor… retour dans 15 min ! 🤿');
  afterAct();
}

function resolveDive() {
  s.divingUntil = 0;
  rec.treasures++;
  s.fun = clamp(s.fun + 15, 0, 100);
  s.hunger = clamp(s.hunger - 8, 0, 100);
  const finds = ['une perle nacrée 🦪', 'un coquillage rare 🐚', 'une pièce ancienne 🪙', 'un caillou qui brille ✨'];
  ui.log(s.name + ' remonte avec ' + finds[Math.floor(Math.random() * finds.length)] + ' !');
  R.burst('sparkle', 10, s.stage);
  sfx.hatch(); vibrate([15, 30, 15]);
  gainXp(XP.dive);
  tryDrop(2.5); // la plongée est une vraie chasse au trésor : meilleure chance
  persist();
  checkUnlocks();
  careBond('dive');
}

function actFeed() {
  if (busy() || s.sleeping) return;
  press();
  if (s.hunger > 92) { ui.log(s.name + ' n\'a plus faim du tout !'); return; }
  s.hunger = clamp(s.hunger + 30, 0, 100);
  s.fun = clamp(s.fun + 2, 0, 100);
  s.fed++;
  rec.mealsTotal++;
  s.nextPoop = Math.min(s.nextPoop, now() + (2 + Math.random() * 2) * 60 * MIN);
  R.spawn('fish', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  sfx.eat();
  ui.log('Miam ! ' + s.name + ' dévore un poisson frais. 🐟');
  gainXp(XP.meal);
  afterAct();
  quest('meals');
  careBond('feed');
}

function actWash() {
  if (busy() || s.sleeping) return;
  press();
  const hadPoop = s.poops.length > 0;
  s.poops = [];
  s.clean = 100;
  s.washed++;
  rec.bathsTotal++;
  for (let i = 0; i < 10; i++) R.spawn('bubble', s.stage);
  R.burst('sparkle', 4, s.stage);
  sfx.wash();
  // été : le bain rafraîchit vraiment (contre la chaleur)
  const summer = seasonFor(new Date(now())) === 'ete';
  if (summer) { s.fun = clamp(s.fun + 10, 0, 100); s.energy = clamp(s.energy + 8, 0, 100); }
  ui.log(summer ? 'Plouf ! Ça rafraîchit — ' + s.name + ' souffle enfin. 💧'
    : hadPoop ? 'Grand nettoyage ! Tout est propre. ✨' : s.name + ' barbote dans son bain. 🫧');
  gainXp(XP.wash);
  afterAct();
  quest('washes');
  careBond('wash');
}

function actSleep() {
  if (busy()) return;
  press();
  s.sleeping = !s.sleeping;
  if (s.sleeping) {
    rec.sleepsTotal++;
    sfx.sleep(); ui.log(s.name + ' se blottit pour dormir… 💤');
    afterAct();
    quest('sleeps');
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

function actHeal() {
  if (busy()) return;
  if (!s.sick) { ui.log(s.name + ' n\'est pas malade.'); return; }
  press();
  s.sick = false;
  s.health = clamp(s.health + 20, 0, 100);
  s.healed++;
  R.spawn('heart', s.stage);
  R.burst('sparkle', 8, s.stage);
  R.squash();
  sfx.heal();
  ui.log('Le médicament fait effet. ' + s.name + ' va mieux ! 💊');
  afterAct();
  careBond('heal');
}

function actWarm() {
  if (!s || s.stage !== 'egg' || s.gameOver) return;
  const t = now();
  if (t - lastWarm < WARM_CD) return;
  lastWarm = t;
  press();
  s.born -= WARM_BOOST; // rapproche franchement l'éclosion
  wobbleUntil = t + 450;
  R.burst('sparkle', 2, 'egg');
  sfx.warm();
  ui.log('Tu réchauffes doucement l\'œuf… il frémit !');
}

/* ---------------- Secouer le téléphone berce l'œuf ---------------- */
// iOS 13+ exige une permission demandée pendant un geste utilisateur.
// v2.5 : on la demande au TOUT PREMIER toucher, où qu'il soit — sinon un joueur
// qui secoue sans avoir touché ADOPTER/RÉCHAUFFER n'obtenait jamais le popup.
let motionReady = !(typeof DeviceMotionEvent !== 'undefined'
  && typeof DeviceMotionEvent.requestPermission === 'function');
let motionAsked = false;
let lastShake = 0;

function enableMotion() {
  if (motionReady || motionAsked) return;
  motionAsked = true;
  try {
    DeviceMotionEvent.requestPermission()
      .then(st => { if (st === 'granted') motionReady = true; })
      .catch(() => { motionAsked = false; }); // pas un vrai geste ? on retentera
  } catch (e) { motionAsked = false; }
}

function onMotion(e) {
  if (!motionReady || !s || s.stage !== 'egg' || s.gameOver) return;
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
  const t = now();
  if (mag > SHAKE_G && t - lastShake > SHAKE_CD) {
    lastShake = t;
    s.born -= SHAKE_BOOST; // bercer l'œuf rapproche l'éclosion, et pas qu'un peu
    wobbleUntil = t + 450;
    R.burst('sparkle', 3, 'egg');
    sfx.warm(); vibrate(8);
    if (Math.random() < 0.18) ui.log('L\'œuf se balance joyeusement… ça lui plaît !');
  }
}

function pet() {
  if (busy() || s.sleeping) return;
  const t = now();
  R.squash(); // la loutre s'écrase puis rebondit sous la caresse
  R.spawn('heart', s.stage);
  if (s.grumpyUntil) {
    s.grumpyUntil = 0; // un câlin, et la bouderie s'envole
    ui.log(s.name + ' te pardonne… mais ne recommence pas ! 💛');
  }
  if (t - lastPet > 5 * SEC) {
    lastPet = t;
    s.fun = clamp(s.fun + 3, 0, 100);
    R.spawn('heart', s.stage);
    sfx.happy();
    ui.log(s.name + ' adore les caresses ! 💛');
    gainXp(XP.pet);
    quest('pets');
    careBond('pet');
  } else {
    sfx.press();
  }
}

function actPlay() {
  if (busy() || s.sleeping) return;
  if (s.energy < 12) { ui.log(s.name + ' est trop fatiguée pour jouer…'); return; }
  press();
  mg = newGame(now());
  sfx.press();
  ui.log('Partie de pêche ! Attrape les poissons en les touchant !');
  ui.updateHUD(s, mg, rec);
}

function endGame(res) {
  const sc = res.score, tot = res.total;
  s.fun = clamp(s.fun + 8 + sc * 5, 0, 100);
  s.energy = clamp(s.energy - 8, 0, 100);
  s.hunger = clamp(s.hunger - 4, 0, 100);
  s.played++;
  rec.gamesTotal++;
  rec.fishTotal += sc;
  if (sc >= tot && tot >= 5) rec.perfectGames++;
  mg = null;
  if (sc >= tot && tot >= 5) R.burst('confetti', 24, s.stage);       // partie parfaite !
  else if (sc >= tot - 1 && sc > 0) R.burst('sparkle', 8, s.stage);
  if (sc >= tot - 1) { sfx.happy(); ui.log('Pêche royale : ' + sc + ' poisson' + (sc > 1 ? 's' : '') + ' ! ' + s.name + ' est ravie ! 🎉'); }
  else if (sc > 0) { sfx.eat(); ui.log(sc + ' poisson' + (sc > 1 ? 's' : '') + ' attrapé' + (sc > 1 ? 's' : '') + ' ! Pas mal !'); }
  else { sfx.sad(); ui.log('Aucun poisson… ils étaient rusés aujourd\'hui.'); }
  gainXp(XP.game + sc * XP.fish);
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  if (sc > 0) quest('fish', sc);
  tryDrop();
  careBond('play');
}

/* ---------------- Toboggan de rivière (2e mini-jeu) ---------------- */
function actSlide() {
  if (busy() || s.sleeping) return;
  if (!unlocked('slide')) { ui.log('🛝 Le toboggan s\'ouvre au niveau ' + UNLOCK_LEVEL.slide + ' ! ⭐'); return; }
  if (s.energy < 14) { ui.log(s.name + ' est trop fatiguée pour le toboggan…'); return; }
  press();
  mg = newSlide(now());
  sfx.press();
  ui.log('Toboggan ! Tape le couloir pour gober les 🐟 et esquiver les 🪨 !');
  ui.updateHUD(s, mg, rec);
}

function endSlide(res) {
  const sc = res.score, bumps = res.bumps;
  s.fun = clamp(s.fun + 8 + sc * 4, 0, 100);
  s.energy = clamp(s.energy - 10, 0, 100);
  s.hunger = clamp(s.hunger - 5, 0, 100);
  s.played++;
  rec.gamesTotal++;
  rec.slidesTotal = (rec.slidesTotal || 0) + 1;
  rec.slideBest = Math.max(rec.slideBest || 0, sc);
  const clean = bumps === 0 && sc >= 5;
  if (clean) rec.perfectSlides = (rec.perfectSlides || 0) + 1;
  mg = null;
  if (clean) R.burst('confetti', 24, s.stage);
  else if (sc > 0) R.burst('sparkle', 8, s.stage);
  if (clean) { sfx.happy(); ui.log('Descente parfaite : ' + sc + ' poissons sans un rocher ! 🛝🎉'); }
  else if (sc > 0) {
    sfx.eat();
    ui.log(sc + ' poisson' + (sc > 1 ? 's' : '') + ' ramassé' + (sc > 1 ? 's' : '') +
      (bumps ? ' — aïe, ' + bumps + ' rocher' + (bumps > 1 ? 's' : '') + ' !' : ' !'));
  } else { sfx.sad(); ui.log('Quelle descente mouvementée ! Les rochers ont gagné. 🪨'); }
  gainXp(XP.game + sc * XP.fish);
  checkUnlocks();
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  if (sc > 0) quest('fish', sc);
  tryDrop(clean ? 1.8 : 1); // descente parfaite = meilleure chance de trésor
  careBond('play');
}

/* ---------------- Canvas (pêche, caresses, œuf) ---------------- */
function onCanvasPointer(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (cv.width / r.width);
  const y = (e.clientY - r.top) * (cv.height / r.height);
  const pad = e.pointerType === 'touch' ? 8 : 4; // hitbox élargie au doigt

  if (mg) {
    if (mg.mode === 'slide') { setSlideLane(mg, laneAt(x)); vibrate(6); }
    else if (clickGame(mg, x, y, pad)) { R.splashAt(x, y); sfx.catch(); vibrate(8); }
    return;
  }
  if (s && !s.gameOver) {
    if (s.stage === 'egg') { actWarm(); return; }
    if (s.away) return; // elle n'est pas là — le bouton du héron fait le travail

    // trésor de saison du jour : à récolter une fois (récompense thématique)
    const treat = seasonInfo().treat;
    if (treat && treatAvailable(s)) {
      const p = TREAT_POS;
      if (x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 6 && y <= p.y + p.h + 6) {
        ensureDaily(s, now());
        s.qDaily.progress.saison = 1;
        const g = treat.gain || {};
        if (g.hunger) s.hunger = clamp(s.hunger + g.hunger, 0, 100);
        if (g.fun) s.fun = clamp(s.fun + g.fun, 0, 100);
        if (g.energy) s.energy = clamp(s.energy + g.energy, 0, 100);
        rec.treatsTotal = (rec.treatsTotal || 0) + 1;
        R.spawn('heart', s.stage); R.burst('sparkle', 8, s.stage);
        sfx.happy(); vibrate(12);
        gainXp(XP.event);
        ui.log(treat.msg);
        persist(); persistRec();
        ui.updateHUD(s, mg, rec);
        tryDrop(1.3); // le trésor de saison peut cacher un objet rare
        return;
      }
    }

    // événement du jour : papillon rare à attraper (une fois, +10 XP)
    const evt = dailyEvent(dayKey());
    const caught = s.qDaily && s.qDaily.progress && s.qDaily.progress.papillon;
    if (evt.id === 'papillon' && !caught) {
      const b = butterflyPos(frame);
      if (Math.abs(x - b.x) < 10 && Math.abs(y - b.y) < 10) {
        ensureDaily(s, now());
        s.qDaily.progress.papillon = 1;
        R.splashAt(x, y);
        R.burst('sparkle', 8, s.stage);
        sfx.catch(); vibrate(12);
        gainXp(XP.event);
        ui.log('🦋 Attrapé ! Le papillon rare t\'offre son éclat.');
        persist();
        return;
      }
    }

    const ox = OTTER_X, oy = otterY(s.stage);
    if (x >= ox - 4 && x <= ox + 36 && y >= oy - 4 && y <= oy + 40) pet();
  }
}

/** Musique + ambiance jouent quand : loutre en vie, option activée, pas coupé, app visible. */
function syncMusic() {
  if (s) setVolume(s.volume ?? 0.7); // garde le volume maître en phase avec la préférence
  const on = !!(s && s.music !== false && !s.mute && !s.gameOver && !document.hidden);
  music.setActive(on);
  ambient.setActive(on);
}

/* ---------------- Accessibilité ---------------- */
const mediaReduce = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/** Applique les préférences d'accessibilité (classes CSS + rendu + secousses). */
function applyA11y() {
  if (!s) return;
  const root = document.documentElement;
  root.classList.toggle('big-text', !!s.bigText);
  const reduced = !!s.reduceMotion;
  root.classList.toggle('reduce-motion', reduced);
  R.setReduced(reduced);
  ui.setReduced(reduced);
}

function updateA11yLabels() {
  const bt = $('b-bigtext'); if (bt) bt.textContent = '🔠 GROS TEXTE : ' + (s && s.bigText ? 'OUI' : 'NON');
  const bm = $('b-motion'); if (bm) bm.textContent = '✨ ANIMATIONS : ' + (s && s.reduceMotion ? 'RÉDUITES' : 'NORMALES');
}

/** Bouton volume : 3 niveaux affichés en pastilles. */
function updateVolumeLabel() {
  const v = s ? (s.volume ?? 0.7) : getVolume();
  const dots = v >= 0.85 ? '●●●' : v >= 0.55 ? '●●○' : '●○○';
  const el = $('b-volume'); if (el) el.textContent = '🔊 VOLUME : ' + dots;
}

/* ---------------- Persistance ---------------- */
function persist() { saveState(s, storage, now()); }
function persistRec() { saveRecords(rec, storage); }
/** Après chaque action joueur : sauvegarde + HUD à jour immédiatement. */
function afterAct() { persist(); ui.updateHUD(s, mg, rec); updateCoach(); }

/**
 * Le LIEN grandit à chaque geste attentionné. Si c'est l'activité préférée de
 * sa personnalité : réaction spéciale + éclat de joie. Un palier franchi = fête.
 */
function careBond(actionKey) {
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

/* ---------------- Fil narratif + premiers pas guidés ---------------- */
/** Joue le prochain chapitre en attente (et enchaîne s'il y en a plusieurs). */
function maybeStory() {
  if (storyOpen || !s) return;
  const b = nextBeat(s);
  if (!b) return;
  storyOpen = true;
  ui.setCoach(null); // pas de surlignage sous l'overlay
  sfx.evolve();
  ui.showStory(b, () => {
    markSeen(s, b.id);
    storyOpen = false;
    persist();
    coachTarget = null;   // force la ré-annonce du geste guidé au retour
    updateCoach();
    maybeStory();          // un autre chapitre attend peut-être derrière
  });
}

/** Annonce un changement de saison (réutilise l'overlay d'histoire). */
function maybeSeasonCard() {
  if (storyOpen || !s || s.gameOver) return;
  const cur = seasonFor(new Date());
  if (s.season === cur) return;
  if (s.season == null) { s.season = cur; persist(); return; } // 1er lancement : silencieux
  storyOpen = true;
  ui.setCoach(null);
  sfx.evolve();
  ui.showStory(seasonInfo(new Date()).card, () => {
    s.season = cur;
    storyOpen = false;
    persist();
    coachTarget = null;
    updateCoach();
  });
}

/** Rappel doux (throttlé) du contre-geste quand la saison malmène la loutre. */
function seasonHint() {
  if (!s || s.coach || s.gameOver || s.away || s.stage === 'egg' || s.sleeping || mg || storyOpen) return;
  const t = now();
  if (t - lastSeasonHint < 110 * SEC) return;
  const season = seasonFor(new Date(t));
  let msg = null;
  if (season === 'ete' && s.clean < SEASON_FX.HEAT_OVERHEAT_CLEAN) {
    msg = s.name + ' a chaud… un bon bain la rafraîchirait ! 💧';
  } else if (season === 'hiver' && !s.sick && (s.energy < SEASON_FX.COLD_LOW_ENERGY || s.hunger < SEASON_FX.COLD_LOW_HUNGER)) {
    msg = s.name + ' grelotte… nourris-la et fais-lui un câlin pour la réchauffer. ❄️';
  }
  if (msg) { ui.log(msg); lastSeasonHint = t; }
}

/** Surligne/souffle le prochain geste du tutoriel, ou le clôt en beauté. */
function updateCoach() {
  if (!s || !s.coach) { if (coachTarget) { ui.setCoach(null); coachTarget = null; } return; }
  // tutoriel pas encore démarré (œuf, ou pas encore nommée) : on ne conclut rien
  if (s.stage === 'egg' || !s.name) { if (coachTarget) { ui.setCoach(null); coachTarget = null; } return; }
  const step = coachStep(s);
  if (!step) { // les trois bases sont acquises -> fin douce du tutoriel + révélation du caractère
    s.coach = false; coachTarget = null; ui.setCoach(null);
    const tr = traitById(s.trait);
    ui.toast('🎉 Tu sais tout !');
    ui.log(tr
      ? 'Bravo ! Tu apprends à connaître ' + (s.name || 'ta loutre') + ' : c\'est une petite ' + tr.name + ' ' + tr.emoji + ', elle ' + tr.desc + '. 💛'
      : 'Bravo ! 💡 Astuce : touche ta loutre pour la câliner. 💛');
    persist();
    return;
  }
  const blocked = s.sleeping || s.away || s.gameOver || storyOpen || !!mg || diving();
  ui.setCoach(blocked ? null : step);
  if (!blocked && step.target !== coachTarget) { coachTarget = step.target; ui.log(step.msg); }
  else if (blocked) coachTarget = null;
}

/** Détecte chapeaux et succès nouvellement débloqués -> toast + son. */
function checkUnlocks() {
  const nowUnlocked = unlockedHats(rec);
  for (const id of nowUnlocked) {
    if (!prevHats.has(id)) {
      const h = hatById(id);
      ui.toast('🎩 Débloqué : ' + h.name + ' !');
      if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
      sfx.evolve(); vibrate([15, 30, 15]);
    }
  }
  prevHats = new Set(nowUnlocked);

  const got = newAchievements(s, rec);
  for (const a of got) {
    ui.toast(a.icon + ' Succès : ' + a.name + ' !');
    if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
    sfx.happy(); vibrate(20);
  }
  persistRec();
}

/** XP du soigneur : chaque geste compte. Montée de niveau = fête + friandise rechargée. */
function gainXp(n) {
  if (!rec || !n) return;
  n = Math.round(n * (bonusOf(s && s.gear).xp || 1)); // bonus d'XP du trésor équipé
  const before = levelFromXp(rec.xp || 0).level;
  rec.xp = (rec.xp || 0) + n;
  const L = levelFromXp(rec.xp);
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
    ui.toast('⭐ NIVEAU ' + L.level + ' · ' + titleFor(L.level) + ' !');
    const opened = featuresOpenedBetween(before, L.level);
    if (gotItems.length) {
      const it = gotItems[gotItems.length - 1];
      ui.log('🏅 Niveau ' + L.level + ' ! Trésor ' + RARITIES[it.rarity].label.toLowerCase() + ' : ' + it.emoji + ' ' + it.name + ' ! Équipe-le dans 🎩.');
    } else if (opened.length) {
      ui.log('⭐ Niveau ' + L.level + ' ! Débloqué : ' + opened.join(' + ') + ' ! Va essayer !');
    } else {
      ui.log('Niveau ' + L.level + ' ! Récompense : friandise rechargée. 🍡');
    }
    sfx.levelup(); vibrate([20, 40, 20]);
  }
  ui.renderLevel(rec);
  persistRec();
}

/* ---------------- Trésors : drops dans les activités ---------------- */
/** Tente un drop aléatoire (chance boostée par le trésor équipé + le contexte). */
function tryDrop(boost = 1) {
  if (!s || s.gameOver || s.stage === 'egg') return;
  const id = rollDrop(Math.random, (bonusOf(s.gear).luck || 1) * boost);
  if (!id) return;
  const it = itemById(id);
  if (rec.items.includes(id)) { // déjà possédé -> petit lot de consolation
    ui.toast('✨ ' + it.emoji + ' encore un ' + it.name + ' !');
    gainXp(15);
    return;
  }
  rec.items.push(id);
  persistRec();
  const rar = RARITIES[it.rarity];
  ui.toast(it.emoji + ' ' + rar.label + ' : ' + it.name + ' !');
  ui.log('🎁 Trésor ' + rar.label.toLowerCase() + ' déniché : ' + it.emoji + ' ' + it.name + ' ! Équipe-le dans 🎩.');
  if (!s.gameOver && s.stage !== 'egg') R.burst('confetti', 24, s.stage);
  sfx.levelup(); vibrate([20, 40, 20]);
}

/** Progression de quête + récompense immédiate si terminée. */
function quest(key, n = 1) {
  if (!s || s.stage === 'egg' || s.gameOver) return;
  bumpQuest(s, key, n, now());
  for (const q of completedQuests(s, rec, now())) {
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

/* ---------------- Chez le héron : le rituel du retour ---------------- */
function actCare() {
  if (!s || !s.away || s.gameOver) return;
  const t = now();
  if (t < (s.awayNextCare || 0)) {
    ui.log('Le héron veille sur elle… reviens dans ' + ui.fmtDur(s.awayNextCare - t) + '.');
    return;
  }
  press();
  s.awayCare = (s.awayCare || 0) + 1;
  s.awayNextCare = t + AWAY_CARE_CD;
  R.burst('sparkle', 8, s.stage);
  if (s.awayCare >= AWAY_CARE_NEEDED) {
    // retrouvailles ! elle rentre — un peu vexée quand même
    s.away = false;
    s.awayAt = 0; s.awayCare = 0; s.awayNextCare = 0;
    s.health = 45; s.hunger = 55; s.clean = 70; s.energy = 60;
    s.grumpyUntil = t + GRUMPY_MS;
    R.burst('confetti', 30, s.stage);
    R.squash();
    sfx.hatch(); vibrate([20, 40, 20]);
    gainXp(XP.reunion);
    ui.toast('🦦 ' + (s.name || 'Elle') + ' est rentrée !');
    ui.log(s.name + ' est rentrée du héron… encore un peu vexée. Un câlin s\'impose.');
  } else {
    sfx.heal();
    ui.log('Tu portes un poisson frais chez le héron… ' + s.name + ' hésite encore. (' + s.awayCare + '/' + AWAY_CARE_NEEDED + ')');
  }
  persist();
  ui.updateHUD(s, mg, rec);
  careBond('care'); // ne compte qu'aux retrouvailles (garde-fou sur s.away)
}

/* ---------------- Série de jours (streak) ---------------- */
function checkStreak() {
  if (!rec) return;
  const st = touchStreak(rec, now());
  if (!st) return;
  persistRec();
  ui.renderLevel(rec);
  if (st.count >= 2) ui.toast('🔥 ' + st.count + ' jours d\'affilée !');
  if (st.xp) {
    gainXp(st.xp);
    ui.log('Palier de série : ' + st.count + ' jours d\'affilée ! Récompense : +' + st.xp + ' XP 🔥');
    checkUnlocks(); // pelage Braise, succès Fidèle…
  }
}

/* ---------------- Carte photo partageable ---------------- */
let cardCv = null; // canvas de la dernière carte générée

function openPhoto() {
  if (!s || s.gameOver) { ui.toast('📸 Pas de loutre à photographier…'); return; }
  if (s.stage === 'egg') { ui.toast('📸 Attends que ta loutre soit née !'); return; }
  sfx.press(); vibrate(10);
  cardCv = makeCard(s, rec, document);
  let url = '';
  try { url = cardCv && cardCv.toDataURL('image/png'); } catch (e) {}
  $('photo-img').src = url || '';
  // un seul bon chemin par plateforme :
  // - mobile (partage natif dispo) : PARTAGER — la feuille iOS/Android propose
  //   « Enregistrer l'image » ; le téléchargement direct est ignoré en PWA iOS
  // - desktop : ENREGISTRER (téléchargement classique)
  const hasShare = typeof navigator.share === 'function';
  $('btn-photo-share').classList.toggle('hidden', !hasShare);
  $('btn-photo-save').classList.toggle('hidden', hasShare);
  ui.showOverlay('ovl-photo');
}

async function sharePhoto() {
  if (!s) return;
  const text = 'Voici ' + (s.name || 'ma loutre') + ', ma petite loutre 🦦 Viens élever la tienne : ' + CARD_URL;
  try {
    let files = null;
    if (cardCv && cardCv.toBlob && typeof File === 'function') {
      const blob = await new Promise(res => { try { cardCv.toBlob(res, 'image/png'); } catch (e) { res(null); } });
      if (blob) files = [new File([blob], 'ma-petite-loutre.png', { type: 'image/png' })];
    }
    if (files && navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: 'Ma Petite Loutre', text });
    } else {
      await navigator.share({ title: 'Ma Petite Loutre', text, url: CARD_URL });
    }
    ui.toast('📸 Carte partagée !');
  } catch (e) { /* partage annulé par le joueur : silence */ }
}

function savePhoto() {
  const url = $('photo-img').src;
  if (!url || !url.startsWith('data:')) { ui.toast('Image indisponible sur cet appareil…'); return; }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loutre-' + (s && s.name ? s.name.toLowerCase() : 'souvenir') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    ui.toast('💾 Carte enregistrée !');
  } catch (e) { ui.toast('Enregistrement impossible ici — fais une capture d\'écran !'); }
}

/* ---------------- Cycle de vie ---------------- */
function startNew() {
  s = newState(now());
  s.reduceMotion = mediaReduce(); // nouvelle partie : suit la préférence système
  setMuted(s.mute);
  applyA11y();
  mg = null;
  ui.hideAllOverlays();
  ui.log('Garde l\'œuf au chaud : touche-le, réchauffe-le… ou secoue doucement ton téléphone pour le bercer !');
  persist();
  ui.updateHUD(s, mg, rec);
}

function tick() {
  if (!s) return;
  const t = now();
  const rawDt = t - lastTickAt;
  lastTickAt = t;
  if (rawDt > 30 * SEC) {
    // onglet en veille / app en arrière-plan -> rattrapage complet
    s.lastTick = t - rawDt;
    const { elapsed, events } = simulateOffline(s, t);
    applyEvents(events, true);
    const msg = ui.offlineSummary(s, elapsed, events);
    if (msg && elapsed > 10 * MIN) ui.log(msg);
  } else {
    applyEvents(stepSim(s, rawDt, { simNow: t }));
  }
  if (s.divingUntil && t >= s.divingUntil && !s.gameOver && !s.away) resolveDive();
  if (s.stage !== 'egg' && ensureDaily(s, t)) {
    // minuit vient de passer : nouvelles quêtes, série, surprise du jour
    persist();
    checkStreak();
    ui.log('✨ Nouveau jour ! ' + dailyEvent(dayKey(t)).label);
  }
  ui.updateHUD(s, mg, rec);
  maybeStory();      // un chapitre vient peut-être de se débloquer (évolution en direct/au retour)
  maybeSeasonCard(); // la saison a peut-être tourné (minuit / retour d'absence)
  updateCoach();     // garde le surlignage du tutoriel en phase (dodo, overlays…)
  seasonHint();      // rappelle le contre-geste si le froid/la chaleur la malmène
  syncMusic(); // (re)démarre dès que l'audio est débloqué, coupe si veille/fin
  if (t - lastSave > 5 * SEC) {
    lastSave = t;
    persist();
    // record de longévité mis à jour en continu
    if (s.stage !== 'egg' && !s.gameOver) {
      const a = ageMs(s, t);
      if (a > rec.bestAge) { rec.bestAge = a; checkUnlocks(); }
    }
  }
}

function loop() {
  frame++;
  if (mg) {
    const res = mg.mode === 'slide' ? tickSlide(mg, now()) : tickGame(mg, now());
    if (res) (mg.mode === 'slide' ? endSlide : endGame)(res);
  }
  R.render(s, mg, frame, {
    wobble: s && now() < wobbleUntil,
    diving: diving(),
    foe: battle ? battle.foe : null
  });
  requestAnimationFrame(loop);
}

/* ---------------- Boot ---------------- */
function boot() {
  registerSW();
  requestPersistentStorage();
  setupInstall($('b-install'), $('ios-hint'));
  $('ver').textContent = 'Ma Petite Loutre · v' + GAME_VERSION;

  rec = loadRecords(storage);
  prevHats = new Set(unlockedHats(rec));
  ui.renderLevel(rec);

  const prev = loadState(storage);
  if (prev) {
    s = prev;
    // migration : une loutre déjà nommée d'avant v3.10 reçoit un caractère (déterministe)
    if (s.name && s.stage !== 'egg' && !s.trait) s.trait = pickTrait(() => (s.born % 1000) / 1000);
    setMuted(s.mute);
    applyA11y();
    const { elapsed, events } = simulateOffline(s, now());
    applyEvents(events, true);
    if (s.gameOver) ui.showGameOver(s);
    else if (s.stage !== 'egg' && !s.name) ui.showNaming();
    else {
      const msg = ui.offlineSummary(s, elapsed, events);
      if (msg && elapsed > 10 * MIN) ui.log(msg);
      else if (s.stage === 'egg') ui.log('L\'œuf t\'attendait bien au chaud…');
      else if (s.away) ui.log(s.name + ' est chez le héron… porte-lui des poissons pour la ramener. 🪶');
      else {
        const warm = bondLevel(s.bond).level >= 4 ? 'Tu lui as tellement manqué ! ' : '';
        ui.log(warm + greeting(s, now()) + ' ✨ Aujourd\'hui : ' + dailyEvent(dayKey()).label);
      }
    }
    persist();
    // au retour : rejoue un chapitre débloqué hors-ligne, puis réarme le tutoriel
    if (!s.gameOver && s.name) { maybeStory(); maybeSeasonCard(); updateCoach(); }
    else if (!s.gameOver) maybeSeasonCard(); // œuf : au moins initialiser la saison
  } else {
    ui.showOverlay('ovl-intro');
  }
  ui.updateHUD(s, mg, rec);

  $('btn-start').addEventListener('click', () => { sfx.press(); vibrate(15); enableMotion(); startNew(); });
  window.addEventListener('devicemotion', onMotion);
  $('btn-name').addEventListener('click', () => {
    let n = $('name-input').value.trim();
    if (!n) n = 'Loutrette';
    s.name = n.slice(0, 12);
    if (!s.trait) s.trait = pickTrait(); // chaque loutre a son caractère
    ui.hideOverlay('ovl-name');
    ui.toast('💛 Bienvenue, ' + s.name + ' ! 💛');
    sfx.happy(); vibrate([15, 40, 15]);
    persist(); ui.updateHUD(s, mg, rec);
    maybeStory(); // Chapitre 1 — La rencontre, puis premiers pas guidés
  });
  $('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-name').click(); });
  $('btn-restart').addEventListener('click', () => { sfx.press(); startNew(); });

  $('b-feed').addEventListener('click', actFeed);
  $('b-play').addEventListener('click', actPlay);
  $('b-wash').addEventListener('click', actWash);
  $('b-sleep').addEventListener('click', actSleep);
  $('b-heal').addEventListener('click', actHeal);
  $('b-warm').addEventListener('click', actWarm);
  $('b-treat').addEventListener('click', actTreat);
  $('b-dive').addEventListener('click', actDive);
  $('b-slide').addEventListener('click', actSlide);
  $('b-care').addEventListener('click', actCare);

  // Combat de loutres (par code de défi)
  $('b-battle').addEventListener('click', () => {
    if (busy() || s.sleeping) return;
    if (!unlocked('battle')) { ui.log('⚔️ Les combats s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + ' ! ⭐'); return; }
    sfx.press();
    battle = null;
    ui.resetBattleUI(encodeCard(s));
    ui.showOverlay('ovl-battle');
  });
  $('bt-close').addEventListener('click', () => { battle = null; ui.hideOverlay('ovl-battle'); });
  $('bt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bt-mycode').value); ui.toast('📋 Code copié !'); }
    catch (e) { try { $('bt-mycode').select(); document.execCommand('copy'); ui.toast('📋 Code copié !'); } catch (e2) {} }
  });
  $('bt-start').addEventListener('click', () => {
    const card = decodeCard($('bt-foecode').value);
    if (!card) { ui.toast('❌ Code de combat invalide'); return; }
    battle = newBattle(s, card, encodeCard(s) + $('bt-foecode').value.trim());
    battle.log.push('Le combat commence ! ' + battle.me.name + ' vs ' + battle.foe.name);
    rec.battles++;
    persistRec();
    ui.shake(); // l'arène tremble !
    sfx.evolve(); vibrate([20, 40, 20]);
    ui.updateBattleUI(battle);
    gainXp(XP.battle);
    quest('battles');
  });
  const doMove = (id) => {
    if (!battle || battle.over) return;
    playTurn(battle, id);
    vibrate(8); sfx.press();
    ui.updateBattleUI(battle);
    if (battle.over) {
      if (battle.winner === 'me') {
        rec.wins++;
        s.fun = clamp(s.fun + 12, 0, 100);
        gainXp(XP.win);
        sfx.happy(); ui.toast('🏆 Victoire de ' + battle.me.name + ' !');
        tryDrop(1.5); // une victoire peut rapporter un trésor
      } else {
        s.fun = clamp(s.fun + 2, 0, 100);
        sfx.sad(); ui.toast('💔 Défaite… ça se rejouera !');
      }
      persist(); persistRec(); checkUnlocks();
    }
  };
  $('bt-splash').addEventListener('click', () => doMove('splash'));
  $('bt-roulade').addEventListener('click', () => doMove('roulade'));
  $('bt-calin').addEventListener('click', () => doMove('calin'));

  $('b-mute').addEventListener('click', () => {
    s.mute = !s.mute; setMuted(s.mute); syncMusic(); persist(); ui.updateHUD(s, mg, rec);
  });
  $('b-music').addEventListener('click', () => {
    s.music = s.music === false; // toggle
    $('b-music').textContent = '🎵 MUSIQUE : ' + (s.music ? 'OUI' : 'NON');
    syncMusic(); persist(); sfx.press();
  });
  $('b-volume').addEventListener('click', () => {
    const levels = [0.35, 0.7, 1.0];
    const i = levels.findIndex(v => Math.abs(v - (s.volume ?? 0.7)) < 0.01);
    s.volume = levels[(i + 1) % levels.length];
    setVolume(s.volume);
    updateVolumeLabel();
    persist(); sfx.press();
  });
  $('b-bigtext').addEventListener('click', () => {
    s.bigText = !s.bigText;
    applyA11y(); updateA11yLabels(); persist(); sfx.press();
  });
  $('b-motion').addEventListener('click', () => {
    s.reduceMotion = !s.reduceMotion;
    applyA11y(); updateA11yLabels(); persist(); sfx.press();
  });
  $('b-push').addEventListener('click', async () => {
    sfx.press();
    if (s.push) {
      s.push = false;
      $('b-push').textContent = '🔔 RAPPELS : NON';
      persist();
      push.disablePush();
      ui.toast('🔕 Rappels coupés.');
      return;
    }
    const res = await push.enablePush();
    if (res === 'ok') {
      s.push = true;
      $('b-push').textContent = '🔔 RAPPELS : OUI';
      persist();
      push.syncReminders(s);
      ui.toast('🔔 Rappels activés — elle saura te joindre !');
    } else if (res === 'refuse') {
      ui.toast('Notifications refusées — réactivable dans les réglages du navigateur.');
    } else {
      ui.toast('Rappels indisponibles ici (iPhone : app installée, iOS 16.4+).');
    }
  });
  $('b-reset').addEventListener('click', () => {
    ui.askConfirm('Recommencer avec un nouvel œuf ? La loutre actuelle sera perdue (chapeaux et succès conservés).', () => {
      clearSave(storage);
      startNew();
    });
  });

  // Garde-robe (chapeaux, pelages, décors)
  const wardrobeHandlers = {
    onHat(id) {
      if (!s || !unlockedHats(rec).includes(id)) return;
      s.hat = (s.hat === id ? null : id);
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    },
    onFur(id) {
      if (!s || !unlockedFurs(rec).includes(id)) return;
      s.fur = id;
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    },
    onDecor(id) {
      if (!s || !unlockedDecors(rec).includes(id)) return;
      s.decor = id;
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    },
    onGear(id) {
      if (!s || !rec.items.includes(id)) return;
      s.gear = (s.gear === id ? null : id); // touché à nouveau = retirer
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    }
  };
  $('b-hats').addEventListener('click', () => {
    sfx.press();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
    ui.showOverlay('ovl-hats');
  });
  $('btn-hats-close').addEventListener('click', () => ui.hideOverlay('ovl-hats'));

  // Carte photo
  $('b-photo').addEventListener('click', openPhoto);
  $('btn-photo-share').addEventListener('click', sharePhoto);
  $('btn-photo-save').addEventListener('click', savePhoto);
  $('btn-photo-close').addEventListener('click', () => { cardCv = null; ui.hideOverlay('ovl-photo'); });

  // Succès
  $('b-ach').addEventListener('click', () => {
    sfx.press();
    if (s && s.stage !== 'egg') ensureDaily(s, now());
    ui.renderAchievements(rec, s);
    ui.showOverlay('ovl-ach');
  });
  $('btn-ach-close').addEventListener('click', () => ui.hideOverlay('ovl-ach'));
  $('btn-day-share').addEventListener('click', async () => {
    if (!s) return;
    if (s.stage !== 'egg') ensureDaily(s, now());
    const text = dailyShareText(s, rec, now());
    sfx.press(); vibrate(10);
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text }); ui.toast('📣 Résultat partagé !'); } catch (e) { /* annulé */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('📋 Résultat copié — colle-le à tes amis !');
    } catch (e) {
      ui.toast('Partage indisponible sur cet appareil…');
    }
  });

  // Réglages : export / import / reset
  $('b-gear').addEventListener('click', () => {
    sfx.press();
    $('exp-code').value = s ? exportSave(s, rec) : '';
    $('imp-code').value = '';
    $('b-music').textContent = '🎵 MUSIQUE : ' + (s && s.music !== false ? 'OUI' : 'NON');
    updateVolumeLabel();
    updateA11yLabels();
    $('b-push').textContent = '🔔 RAPPELS : ' + (s && s.push ? 'OUI' : 'NON');
    ui.showOverlay('ovl-set');
  });
  $('btn-set-close').addEventListener('click', () => ui.hideOverlay('ovl-set'));
  $('btn-copy').addEventListener('click', async () => {
    const code = $('exp-code').value;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
      try { $('exp-code').select(); ok = document.execCommand('copy'); } catch (e2) {}
    }
    ui.toast(ok ? '📋 Code copié !' : 'Copie impossible — sélectionne le texte à la main.');
  });
  $('btn-import').addEventListener('click', () => {
    const r = importSave($('imp-code').value);
    if (!r) { ui.toast('❌ Code invalide'); return; }
    ui.askConfirm('Remplacer la partie actuelle par celle du code ?', () => {
      s = r.s;
      rec = r.rec;
      setMuted(s.mute);
      prevHats = new Set(unlockedHats(rec));
      const { events } = simulateOffline(s, now());
      applyEvents(events, true);
      persist(); persistRec();
      ui.renderLevel(rec);
      ui.hideAllOverlays();
      if (s.gameOver) ui.showGameOver(s);
      else if (s.stage !== 'egg' && !s.name) ui.showNaming();
      ui.updateHUD(s, mg, rec);
      ui.log('Sauvegarde importée. Re-bonjour, ' + (s.name || 'petit œuf') + ' ! 💛');
      sfx.happy();
    });
  });

  cv.addEventListener('pointerdown', onCanvasPointer);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persist();
      if (s && s.push) push.syncReminders(s); // on part : dépose les prochains rendez-vous
    }
    syncMusic();
  });
  // premier toucher, où qu'il soit : permission capteurs iOS + déblocage audio
  document.addEventListener('pointerdown', () => { enableMotion(); syncMusic(); });

  // Fermer un menu sans scroller : ✕ collant en haut, ou toucher à côté du contenu.
  // (le combat en cours ne se ferme pas sur un toucher malheureux — ✕ seulement)
  const overlayClosers = {
    'ovl-hats': () => ui.hideOverlay('ovl-hats'),
    'ovl-ach': () => ui.hideOverlay('ovl-ach'),
    'ovl-set': () => ui.hideOverlay('ovl-set'),
    'ovl-photo': () => { cardCv = null; ui.hideOverlay('ovl-photo'); },
    'ovl-battle': () => { battle = null; ui.hideOverlay('ovl-battle'); }
  };
  for (const [id, close] of Object.entries(overlayClosers)) {
    const el = $(id);
    el.addEventListener('click', (e) => {
      if (e.target !== el) return; // un vrai toucher "à côté", pas sur un bouton
      if (id === 'ovl-battle' && battle && !battle.over) return;
      sfx.press();
      close();
    });
    const x = el.querySelector('.ovl-x');
    if (x) x.addEventListener('click', () => { sfx.press(); close(); });
  }

  checkStreak(); // la visite du jour compte pour la série 🔥
  if (s && s.push) push.syncReminders(s); // rafraîchit les rappels dès l'ouverture

  setInterval(tick, 1000);
  requestAnimationFrame(loop);
}

// Hooks de debug / tests automatisés
window.__loutre = {
  get state() { return s; },
  get records() { return rec; },
  get minigame() { return mg; },
  forceHatch() {
    if (s && s.stage === 'egg') {
      s.born = now() - 3 * MIN;
      applyEvents(stepSim(s, 1000, { simNow: now() }));
      ui.updateHUD(s, mg, rec);
    }
  },
  step(ms) { applyEvents(stepSim(s, ms, { simNow: now() })); ui.updateHUD(s, mg, rec); },
  startNew, actFeed, actWash, actSleep, actHeal, actPlay, actTreat, actDive, actSlide, actCare, pet,
  get battle() { return battle; }
};

boot();
