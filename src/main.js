// Orchestrateur : relie simulation, rendu, UI, audio et PWA.
import {
  SEC, MIN, clamp, TREAT_CD, DIVE_MS, GRUMPY_MS, WAKE_OK_ENERGY, GEM_TREAT, GEM_HEAL,
  WARM_BOOST, WARM_CD, SHAKE_BOOST, SHAKE_CD, SHAKE_G,
  AWAY_CARE_NEEDED, AWAY_CARE_CD, SEASON_FX, UNLOCK_LEVEL, GAME_VERSION, STAGES
} from './constants.js';
import { touchStreak } from './streak.js';
import { greeting } from './mood.js';
import * as push from './push.js';
import { canSendTelemetry, sendTelemetry, newTelemetryId } from './telemetry.js';
import { dailyShareText } from './share.js';
import { dailyEvent, butterflyPos } from './events.js';
import * as music from './music.js';
import * as ambient from './ambient.js';
import { XP, levelFromXp, titleFor } from './level.js';
import { bumpQuest, completedQuests, ensureDaily, dayKey, isEligible } from './quests.js';
import { addSeasonTreat } from './seasonpass.js';
import { ALMANACH_TIERS, tierState, almanachProgress, almanachCompletion, almanachHasClaimable, claimTier } from './almanach.js';
import { dailyDojo, judgeParry, parryScore, nextCombo, beltFor, dojoReward } from './dojo.js';

import {
  newState, saveState, loadState, clearSave,
  loadRecords, saveRecords, exportSave, importSave
} from './state.js';
import { stepSim, simulateOffline, ageMs } from './sim.js';
import { newGame, tickGame, clickGame, WATER_Y } from './minigame.js';
import { recruitFishCost, dailyBarter, canCraft, craftChoices, nextTier, TIERS, MEAL_HUNGER, CRAFT_NEED } from './economy.js';
import { newSlide, tickSlide, setSlideLane, laneAt, DEGATS_EJECTION } from './toboggan.js';
import { newGame as newGarden, tickGame as tickGarden, waterAt, harvestAt } from './garden.js';
import { spawnCreatures, tickCreatures, checkAttack } from './creatures.js';
import { seeCreature, catchCreature } from './bestiary.js';
import { makeRenderer, FOOD_POS, BALL_HOME, denItemAt, CANVAS_W, CANVAS_H } from './render.js';
import { sfx, vibrate, setMuted, setVolume, getVolume } from './audio.js';
import * as ui from './ui.js';
import { registerSW, setupInstall, requestPersistentStorage, isIOS, isStandalone } from './pwa.js';
import { unlockedHats, hatById } from './accessories.js';
import { unlockedFurs, unlockedDecors, equipBonus, furById, decorById } from './skins.js';
import { newAchievements } from './achievements.js';
import { encodeCard, decodeCard, newBattle, stepBattle, duelInput, wildFoe, makeFighter, playerTechniques, techniqueById } from './battle.js';
import { combatBuffs, jeuBuffs, unlockedTechniques, PASSIVE_TECHNIQUES } from './skills.js';
import { isoWeekKey, crueOfWeek, medalFor, claimCrueRewards } from './crue.js';
import { livingLine } from './dialogue.js';
import { chasseurRode, newChasseur, stepChasseur, DEGATS_CAPTURE } from './chasseur.js';
import { makeGang, recruit, recruitBoard, gangPower, generateRival, resolveGangBattle, applyGangResult, MAX_MEMBERS } from './gang.js';
import {
  TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, START_ZONE, ZONES, zoneById, zoneFinds, ZONE_INTRO, isSolid,
  SPECIALITE, zoneDuJour, HABITANT, COFFRE, COFFRE_ZONES, habitantAt, coffreAt,
  EPREUVE, EPREUVE_ZONES, epreuveAt,
  moveWithCollision, spawnPoint, zoneExit, safeEntry, nearestFree, findPath, zoneGates,
  zoneUnlocked, zoneReq
} from './tilemap.js';
import { makeCard, CARD_URL } from './photocard.js';
import { nextBeat, markSeen, coachStep } from './story.js';
import { seasonFor, seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { weatherFor, sicknessBonus, WEATHER_LABELS } from './weather.js';
import { ITEMS, RARITIES, itemById, bonusOf, rollDrop, milestoneItem, describeBonus, cosmeticPrice, treasurePrice } from './items.js';
import { pickTrait, traitById, isFavorite, favoriteLine, bondGain, bondLevel } from './personality.js';
import { makeAncestor, inheritTrait, isRealOtter } from './lineage.js';

const $ = id => document.getElementById(id);
const now = () => Date.now();
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();

let s = null;
let rec = null;               // records globaux (toutes loutres confondues)
let prevHats = new Set();     // pour détecter les nouveaux déblocages
let prevFurs = new Set();     // idem pour les pelages, qu'on n'annonçait pas
let mg = null;
let berCreatures = []; // créatures vivantes sur la berge
let battle = null;
let battleDone = false;      // le dénouement (récompenses) ne se joue qu'une fois
let frame = 0;
let dragFood = null;          // {x,y} quand on glisse le poisson vers la loutre (px canvas)
let draggingBall = false;     // vrai pendant qu'on tient la balle pour la lancer
let wobbleUntil = 0, lastWarm = 0, lastPet = 0, lastSave = 0, lastTickAt = now();
let storyOpen = false;        // une carte chapitre est à l'écran
let coachTarget = null;       // bouton actuellement surligné par le tutoriel
let activeHint = null, hintAt = 0, hintCooldown = 0; // astuce de geste en cours (onboarding)
let lastSeasonHint = 0;       // throttle des rappels saisonniers (froid/chaud)
let world = null;             // état runtime du Monde (balade libre) — non persisté
let encounterOtter = null;    // loutre sauvage dont la rencontre est ouverte
const isRecruited = id => !!rec && Array.isArray(rec.recruited) && rec.recruited.includes(id);
const markRecruited = id => { if (rec && !isRecruited(id)) (rec.recruited = rec.recruited || []).push(id); };
const BEFRIEND_NEED = 3;      // nombre d'attentions pour amadouer une loutre sauvage

const cv = $('cv');
const R = makeRenderer(cv);

/* ---------------- Événements de simulation -> retours joueur ---------------- */
function applyEvents(events, offline = false) {
  for (const ev of events) {
    if (ev.type === 'hatch') {
      ui.showNaming();
      if (!offline) { sfx.hatch(); R.burst('confetti', 26, 'egg'); feel('big'); gainXp(XP.hatch); }
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
      ui.celebrate({ kicker: 'Évolution', big: '🦦', title: s.name + ' a grandi !', reward: STAGES[s.stage], rewardColor: 'var(--accent)' });
      sfx.evolve();
      R.burst('confetti', 40, s.stage); feel('big'); // pluie de confettis d'évolution
      gainXp(XP.evolve);
    }
    if (ev.type === 'sick') sfx.sad();
  }
}

/* ---------------- Actions ---------------- */
function diving() { return s && (s.divingUntil || 0) > now(); }
function busy() { return !s || s.gameOver || s.away || s.stage === 'egg' || mg || diving(); }
function press() { vibrate(10); }
const curLevel = () => Math.max(levelFromXp((rec && rec.xp) || 0).level, (rec && rec.levelReached) || 1);
const unlocked = (feat) => curLevel() >= UNLOCK_LEVEL[feat];

/** Contexte de filtrage des quêtes : level, features débloquées, monde ouvert. */
function questCtx() {
  const unlocked2 = [];
  if (unlocked('treat')) unlocked2.push('treat');
  if (unlocked('slide')) unlocked2.push('slide');
  if (unlocked('dive')) unlocked2.push('dive');
  if (unlocked('battle')) unlocked2.push('battle');
  return { level: curLevel(), unlocked: unlocked2, world: !!(s && s.place === 'monde') };
}
const UNLOCK_LABEL = { treat: '🍡 Friandise', slide: '🛝 Toboggan', battle: '⚔️ Combat', dive: '🤿 Plongée' };
/** Activités qui s'ouvrent en passant de `before` à `after` (annonce de palier). */
function featuresOpenedBetween(before, after) {
  return Object.keys(UNLOCK_LABEL)
    .filter(f => before < UNLOCK_LEVEL[f] && after >= UNLOCK_LEVEL[f])
    .map(f => UNLOCK_LABEL[f]);
}

/** L'effet d'une friandise (gratuite ou express) : redémarre le délai, régale. */
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
  careBond('treat');
}

function actTreat() {
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
  R.burst('sparkle', 10, s.stage); R.ring(s.stage);
  sfx.hatch(); vibrate([15, 30, 15]); feel('med');
  gainXp(XP.dive);
  tryDrop(2.5); // la plongée est une vraie chasse au trésor : meilleure chance
  persist();
  checkUnlocks();
  careBond('dive');
  quest('dives');
}

function actFeed() {
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
  careBond('feed');
  persistRec(); ui.updateHUD(s, mg, rec);
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
    R.spawn('heart', s.stage); R.ring(s.stage);
    sfx.happy(); sfx.chirpHappy(); vibrate(10); feel('soft'); // elle couine de plaisir
    ui.log(s.name + ' adore les caresses ! 💛');
    gainXp(XP.pet);
    quest('pets');
    careBond('pet');
    hintDone('pet');
  } else {
    sfx.press(); sfx.chirp();
  }
}

function actPlay() {
  if (busy() || s.sleeping) return;
  if (s.energy < 12) { ui.log(s.name + ' est trop fatiguée pour jouer…'); return; }
  press();
  mg = newGame(now(), jeuBuffs(rec, equipBonus(s)));
  sfx.press();
  ui.log('Partie de pêche ! Attrape les poissons en les touchant !');
  ui.updateHUD(s, mg, rec);
}

function endGame(res) {
  // score = POINTS (combos et dorés compris) ; caught = nombre de POISSONS pris
  const sc = res.score, tot = res.total, got = res.caught || 0, best = res.bestCombo || 0;
  s.fun = clamp(s.fun + 8 + got * 5, 0, 100);
  s.energy = clamp(s.energy - 8, 0, 100);
  s.hunger = clamp(s.hunger - 4, 0, 100);
  s.played++;
  rec.gamesTotal++;
  rec.fishTotal += got;
  rec.fish = (rec.fish || 0) + got;          // portefeuille dépensable (repas/recrutement/troc)
  const perfect = got >= tot && tot >= 5;   // aucun poisson manqué
  if (perfect) rec.perfectGames++;
  mg = null;
  if (perfect) { R.burst('confetti', 24, s.stage); feel('big'); }
  else if (got >= tot - 1 && got > 0) { R.burst('sparkle', 8, s.stage); feel('med'); }
  const combo = best >= 3 ? ' Plus belle série : x' + best + ' !' : '';
  if (perfect) { sfx.happy(); ui.log('Pêche royale : ' + got + ' poissons, aucun manqué — ' + sc + ' points ! 🎉' + combo); }
  else if (got > 0) { sfx.eat(); ui.log(got + ' poisson' + (got > 1 ? 's' : '') + ' sur ' + tot + ' — ' + sc + ' points !' + combo); }
  else { sfx.sad(); ui.log('Aucun poisson… ils étaient rusés aujourd\'hui.'); }
  gainXp(XP.game + sc * XP.fish);
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  if (got > 0) quest('fish', got);
  tryDrop();
  careBond('play');
}

/* ---------------- Toboggan de rivière (2e mini-jeu) ---------------- */
function actSlide() {
  if (busy() || s.sleeping) return;
  if (!unlocked('slide')) { ui.log('🛝 Le toboggan s\'ouvre au niveau ' + UNLOCK_LEVEL.slide + ' ! ⭐'); return; }
  if (s.energy < 14) { ui.log(s.name + ' est trop fatiguée pour le toboggan…'); return; }
  press();
  mg = newSlide(now(), jeuBuffs(rec, equipBonus(s)));
  sfx.press();
  ui.log('Toboggan ! Tape le couloir pour gober les 🐟 et esquiver les 🪨 !');
  ui.updateHUD(s, mg, rec);
}

function endSlide(res) {
  const sc = res.score, bumps = res.bumps, best = res.bestCombo || 0;
  // Éjectée du torrent : la descente s'arrête net et la loutre en garde des
  // bleus. C'est ce qui donne un enjeu à la prudence — jusqu'ici on encaissait
  // les rochers sans fin, la descente n'était qu'un chronomètre.
  const ejectee = !!res.ejectee;
  if (ejectee) { s.health = clamp(s.health - DEGATS_EJECTION, 0, 100); R.hurtOtter(); }
  s.fun = clamp(s.fun + (ejectee ? 2 : 8) + sc * 4, 0, 100);
  s.energy = clamp(s.energy - 10, 0, 100);
  s.hunger = clamp(s.hunger - 5, 0, 100);
  s.played++;
  rec.gamesTotal++;
  rec.slidesTotal = (rec.slidesTotal || 0) + 1;
  rec.slideBest = Math.max(rec.slideBest || 0, sc);
  const clean = !ejectee && bumps === 0 && sc >= 5;
  if (clean) rec.perfectSlides = (rec.perfectSlides || 0) + 1;
  mg = null;
  if (clean) R.burst('confetti', 24, s.stage);
  else if (!ejectee && sc > 0) R.burst('sparkle', 8, s.stage);
  const combo = best >= 3 ? ' Plus bel enchaînement : x' + best + ' !' : '';
  if (ejectee) {
    sfx.sad(); ui.shake(); vibrate([30, 60, 30]);
    messageImportant('🪨 Trois rochers… ' + (s.name || 'La loutre') +
      ' est éjectée du torrent ! (-' + DEGATS_EJECTION + ' santé) — ' + sc + ' points tout de même.');
  }
  else if (clean) { sfx.happy(); ui.log('Descente parfaite : ' + sc + ' points sans un rocher ! 🛝🎉' + combo); }
  else if (sc > 0) {
    sfx.eat();
    ui.log(sc + ' point' + (sc > 1 ? 's' : '') + ' ramassé' + (sc > 1 ? 's' : '') +
      (bumps ? ' — aïe, ' + bumps + ' rocher' + (bumps > 1 ? 's' : '') + ' !' : ' !') + combo);
  } else { sfx.sad(); ui.log('Quelle descente mouvementée ! Les rochers ont gagné. 🪨'); }
  gainXp(XP.game + sc * XP.fish);
  checkUnlocks();
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  quest('slides');
  if (sc > 0) quest('fish', sc);
  tryDrop(clean ? 1.8 : 1); // descente parfaite = meilleure chance de trésor
  careBond('play');
}

/* ---------------- Jardin aquatique (3e mini-jeu) ---------------- */
// actGarden supprimé — le jardin se lance automatiquement en entrant dans la zone jardin

function endGarden(res) {
  const sc = res.score;
  ambient.stopGardenAmbient();
  s.fun = clamp(s.fun + 6 + sc * 3, 0, 100);
  s.energy = clamp(s.energy - 6, 0, 100);
  s.hunger = clamp(s.hunger - 3, 0, 100);
  s.played++;
  rec.gamesTotal++;
  mg = null;
  if (sc >= 8) R.burst('confetti', 20, s.stage);
  else if (sc > 0) R.burst('sparkle', 6, s.stage);
  if (sc >= 8) { sfx.happy(); ui.log('Magnifique jardin ! ' + sc + ' points de récolte ! 🌸🎉'); }
  else if (sc > 0) { sfx.eat(); ui.log(sc + ' point' + (sc > 1 ? 's' : '') + ' de jardin ! 🌿'); }
  else { sfx.sad(); ui.log('Les graines n\'ont pas poussé… il faudra réessayer ! 🌱'); }
  gainXp(XP.game + sc * XP.fish);
  checkUnlocks();
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  if (sc > 0) quest('fish', sc);
  tryDrop();
  careBond('play');
}

/* ---------------- Lieux : berge <-> tanière ---------------- */
// La tanière est accessible quand la loutre est là, disponible et hors mini-jeu.
function denAvailable() {
  return s && !s.gameOver && !s.away && s.stage !== 'egg' && !mg;
}
function updatePlaceBtn() {
  const inWorld = !!(s && s.place === 'monde');
  const overlayOpen = !!document.querySelector('.ovl:not(.hidden)');
  const b = $('b-place');
  if (b) {
    const show = !!denAvailable() && !overlayOpen && !inWorld;
    b.classList.toggle('hidden', !show);
    const inDen = show && s.place === 'taniere';
    b.textContent = inDen ? '🌊' : '🏠';
    b.title = inDen ? 'Retourner à la rivière' : 'Aller à la tanière';
  }
  // Commandes de lieu, dans la colonne de gauche : « Explorer » depuis la berge,
  // « Rentrer » depuis la vallée. Jamais les deux, jamais l'une sur l'avatar.
  const bw = $('b-world');
  if (bw) bw.classList.toggle('hidden', !(denAvailable() && !overlayOpen && s.place === 'berge'));
  const bb = $('b-world-back');
  if (bb) bb.classList.toggle('hidden', !(inWorld && !overlayOpen));
  // Séparation des écrans, pilotée en CSS (robuste face à updateHUD chaque frame) :
  //   • BERGE  = vie active   • TANIÈRE = repos/collection   • MONDE = balade/rencontres
  const app = $('app');
  if (app) {
    app.classList.toggle('in-den', !!(s && s.place === 'taniere') && !overlayOpen);
    app.classList.toggle('in-world', inWorld);
    // un mini-jeu prend tout l'écran : le HUD de la berge s'efface
    app.classList.toggle('in-game', !!mg);
    // plongée : on la regarde nager au large. Les deux panneaux du bas
    // recouvraient justement la rivière ; les actions sont bloquées de toute
    // façon pendant la plongée, mais on garde la barre du haut pour naviguer.
    app.classList.toggle('in-dive', diving() && !mg && !overlayOpen);
  }
}
function togglePlace() {
  if (!denAvailable()) return;
  s.place = s.place === 'taniere' ? 'berge' : 'taniere';
  sfx.press(); vibrate(8);
  if (s.place === 'taniere') { sfx.chirp(); ui.log(s.name + ' rentre dans sa tanière douillette. 🏠'); }
  else ui.log(s.name + ' retourne au bord de la rivière. 🌊');
  updatePlaceBtn();
  hintDone('den');
  persist();
}

/* ---------------- Le Monde : balade libre, rencontres, recrutement ---------------- */
const clampN = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

const isFound = id => !!rec && Array.isArray(rec.found) && rec.found.includes(id);

/** Les loutres sauvages d'une zone. Plus on s'éloigne du foyer, plus elles sont fortes. */
function wildOttersFor(zoneId) {
  const anchors = {
    clairiere: [[5, 22], [20, 15], [4, 8]], foret: [[5, 12], [24, 20], [14, 4]],
    cascade: [[20, 12], [25, 20], [16, 26]], roseaux: [[6, 6], [22, 16], [10, 24]],
    lac: [[3, 24], [26, 3], [2, 12]], vallon: [[6, 10], [24, 18], [8, 25]],
    delta: [[6, 7], [22, 13], [10, 26]], gorge: [[8, 10], [22, 18], [6, 24]],
    sapiniere: [[6, 8], [22, 12], [12, 24]],
    lagon: [[6, 6], [23, 8], [8, 23]], large: [[7, 7], [22, 22], [23, 7]],
    caverne: [[6, 8], [23, 10], [9, 22]], mine: [[7, 6], [22, 9], [8, 24]],
    glacier: [[6, 7], [23, 8], [10, 23]], cimes: [[7, 6], [22, 10], [9, 23]]
  };
  const spots = anchors[zoneId] || anchors.clairiere;
  const z = zoneById(zoneId);
  return recruitBoard(curLevel() + (z.boost || 0), dayKey() + '|' + zoneId, 3)
    .filter(c => !isRecruited(c.id))
    .map((c, i) => {
      const p = nearestFree(zoneId, spots[i % spots.length][0], spots[i % spots.length][1]);
      return { ...c, x: p.x, y: p.y, wx: p.x, phase: i * 60, facing: 1, friend: 0, cooldown: 0 };
    });
}

/** Les trouvailles encore au sol dans la zone (celles du jour non ramassées). */
function findsFor(zoneId) {
  return zoneFinds(zoneId, dayKey()).filter(f => !isFound(f.id));
}

/**
 * Le chasseur qui rôde ici aujourd'hui, s'il y en a un. La clairière reste un
 * refuge : sans lieu sûr, la vallée deviendrait invivable plutôt que tendue.
 */
function chasseurFor(zoneId) {
  if (!chasseurRode(zoneId, dayKey(), START_ZONE)) return null;
  return newChasseur(zoneId, dayKey(), MAP_W, MAP_H, TILE,
    (cx, cy) => !isSolid(zoneId, cx, cy));
}

/** L'habitant du lieu, posté à sa place habituelle. */
function habitantFor(zoneId) {
  const h = HABITANT[zoneId];
  if (!h) return null;
  return { ...h, ...habitantAt(zoneId), zone: zoneId };
}

/** Le coffre du lieu — plus rien à voir une fois ouvert. */
function coffreFor(zoneId) {
  if (!COFFRE[zoneId] || coffreOuvert(zoneId)) return null;
  return { zone: zoneId, item: COFFRE[zoneId], ...coffreAt(zoneId) };
}

/**
 * La championne du lieu. Elle RESTE une fois vaincue : c'est le repère du lieu,
 * et on doit pouvoir la redéfier. Seul le trophée ne se gagne qu'une fois.
 */
function epreuveFor(zoneId) {
  const e = EPREUVE[zoneId];
  if (!e) return null;
  return { ...e, zone: zoneId, vaincue: epreuveGagnee(zoneId), ...epreuveAt(zoneId) };
}

const epreuveGagnee = (zoneId) => !!(rec && (rec.epreuves || []).includes(zoneId));
/** Combien d'épreuves de la vallée sont remportées (pour le profil). */
function epreuvesGagnees() {
  return EPREUVE_ZONES.filter(epreuveGagnee).length;
}

/**
 * La carte de la championne : on part d'une sauvage calée sur la forme réelle
 * de la loutre (duels serrés), puis on la muscle de `force`. La graine ne
 * contient PAS le jour : la championne d'un lieu est toujours la même.
 */
function carteGardienne(e) {
  // La championne se cale sur la loutre NUE, jamais sur son équipement : sinon
  // elle monterait avec lui et chaque trésor gagné ne servirait à rien. C'est
  // précisément l'écart entre elle et la loutre équipée qui rend l'épreuve
  // franchissable à force de jouer.
  const base = wildFoe(curLevel(), 'gardienne|' + e.zone, makeFighter(s));
  const up = (v) => Math.max(1, Math.min(100, Math.round(v * e.force)));
  return { ...base, name: e.nom, fur: e.fur, hat: null,
    health: up(base.health), fun: up(base.fun), energy: up(base.energy) };
}

/** Proposer l'épreuve : on ne l'impose pas, on peut passer son chemin. */
function proposerEpreuve(e) {
  const dejaVaincue = epreuveGagnee(e.zone);
  const intro = '⚔️ ' + e.nom + ', ' + e.titre + '.\n« ' + e.defi + ' »\n' +
    (dejaVaincue ? 'Tu l\'as déjà battue. La redéfier ?' : 'Relever le défi ?');
  ui.askConfirm(intro, () => {
    if (!battleStarter) return;
    epreuveEnCours = e.zone;
    ui.showOverlay('ovl-battle');
    battleStarter(carteGardienne(e), 'gardienne|' + e.zone);
  });
}

/** Victoire sur une championne : trophée (une fois) et récompense du lieu. */
function gagnerEpreuve(zoneId) {
  const e = EPREUVE[zoneId];
  if (!e || !rec) return;
  if (epreuveGagnee(zoneId)) {                    // redéfi : pas de second trophée
    ui.toast('⚔️ ' + e.nom + ' s\'incline encore !');
    return;
  }
  (rec.epreuves = rec.epreuves || []).push(zoneId);
  // le repère passe à la médaille tout de suite : l'objet monde a été bâti
  // AVANT le duel, sans quoi elle garderait ses épées après sa défaite
  if (world && world.epreuve && world.epreuve.zone === zoneId) world.epreuve.vaincue = true;
  const gemmes = Math.round(4 * e.force);
  rec.gems = (rec.gems || 0) + gemmes;
  gainXp(Math.round(60 * e.force));
  persistRec();
  ui.celebrate({
    kicker: 'ÉPREUVE REMPORTÉE', big: epreuvesGagnees() + '/' + EPREUVE_ZONES.length,
    title: e.nom + ' — ' + e.titre,
    reward: '💎 +' + gemmes + ' gemmes'
  });
  ui.log('⚔️ ' + e.nom + ' est battue ! Épreuves de la vallée : ' +
    epreuvesGagnees() + '/' + EPREUVE_ZONES.length + '.');
  verifierMaitriseVallee();
}

const coffreOuvert = (zoneId) => !!(rec && (rec.chests || []).includes(zoneId));
/** Combien de coffres de la vallée ont été ouverts (pour le profil). */
function coffresOuverts() {
  return COFFRE_ZONES.filter(coffreOuvert).length;
}

/** L'habitant n'offre son service qu'UNE FOIS PAR JOUR, et par lieu. */
function donDispo(zoneId) {
  return !rec || ((rec.pnjDon || {})[zoneId] !== dayKey());
}

/**
 * Parler à l'habitant. S'il a encore son service du jour, il le rend et on
 * met la rencontre en scène ; sinon il jette juste un mot au passage.
 */
function parlerAuPnj(pnj) {
  // Le troqueur ouvre son étal chaque visite (le troc lui-même est limité à une
  // fois par offre et par jour — cf. openBarter) : pas de porte fermée du jour.
  if (pnj.don === 'troc') { openBarter(); return; }
  const lignes = [...pnj.mots];
  if (!donDispo(pnj.zone)) {                       // déjà vu aujourd'hui
    ui.toast(pnj.emoji + ' ' + lignes[0]);
    return;
  }
  (rec.pnjDon = rec.pnjDon || {})[pnj.zone] = dayKey();
  const nom = s.name || 'La loutre';
  // chaque habitant rend LE service de son lieu, poussé plus loin qu'une trouvaille
  if (pnj.don === 'piste') {
    const j = zoneById(zoneDuJour(dayKey()));
    lignes.push('« Aujourd\'hui, c\'est du côté de ' + j.name.toLowerCase() +
      ' que ça remue. Va donc y faire un tour. »');
  } else if (pnj.don === 'provisions') {
    s.hunger = clamp(s.hunger + 30, 0, 100);
    gainXp(20);
    lignes.push('🍄 ' + nom + ' repart le ventre plein. (+30 faim, +20 XP)');
  } else if (pnj.don === 'rincage') {
    s.clean = 100;
    lignes.push('🚿 Sous la chute, ' + nom + ' ressort impeccable. (propreté au maximum)');
  } else if (pnj.don === 'friandise') {
    s.lastTreat = 0;
    lignes.push('🍬 La friandise est de nouveau prête !');
  } else if (pnj.don === 'gemme') {
    rec.gems = (rec.gems || 0) + 3;
    lignes.push('💎 ' + pnj.nom + ' glisse trois gemmes dans la patte de ' + nom + '.');
  } else if (pnj.don === 'repos') {
    s.energy = clamp(s.energy + 25, 0, 100);
    s.fun = clamp(s.fun + 15, 0, 100);
    lignes.push('😌 ' + nom + ' souffle un bon coup. (+25 énergie, +15 entrain)');
  } else if (pnj.don === 'remede') {
    s.health = clamp(s.health + 30, 0, 100);
    lignes.push('🩹 ' + pnj.nom + ' recoud, panse, tapote. ' + nom + ' repart d\'aplomb. (+30 santé)');
  } else if (pnj.don === 'lecon') {
    gainXp(60);
    lignes.push('📚 Une leçon d\'ombre et de silence. (+60 XP)');
  } else if (pnj.don === 'guet') {
    // Le service le plus précieux depuis que l'homme rôde : savoir où NE PAS aller.
    const jour = dayKey();
    const dangers = Object.keys(ZONES).filter(z => chasseurRode(z, jour, START_ZONE));
    lignes.push(dangers.length
      ? '🔭 « Aujourd\'hui, le chapeau et le fusil sont du côté de ' +
        dangers.map(z => zoneById(z).name.toLowerCase()).join(', ') + '. Évite. »'
      : '🔭 « Rien à signaler aujourd\'hui. La vallée est tranquille. »');
  }
  sfx.chirp(); vibrate(10);
  quest('habitantTalk');
  persist(); persistRec();
  ui.updateHUD(s, mg, rec);
  presentPnj(pnj, lignes, pnj.mots.length);
}

/**
 * Présente l'habitant. Si « Dialogues vivants » est activé (ON par défaut), on
 * génère LOCALEMENT une salutation vivante (voix de l'habitant + remarque de
 * l'instant, seedée par le jour+lieu) qui remplace la seule accroche — jamais les
 * lignes de gain/conseil (on ne perd aucune info utile). Coupé : dialogues écrits.
 * Tout est local : gratuit, hors-ligne, instantané, déterministe.
 */
function presentPnj(pnj, lignes, flavorCount) {
  let lines = lignes;
  if (s && s.livingDialogues !== false) {
    const gen = livingLine(pnj, dialogueContext(pnj), dayKey() + '|' + pnj.zone);
    if (gen && gen.length) lines = gen.concat(lignes.slice(flavorCount));   // garde gains/conseils
  }
  ui.showStory({ emoji: pnj.emoji, title: pnj.nom + ' — ' + pnj.role, lines, cta: 'MERCI !' });
}
function dialogueContext(pnj) {
  const w = weatherFor(new Date());
  return {
    otterName: s.name || 'la loutre',
    trait: s.trait || null,
    season: seasonFor(new Date()),
    weather: w ? w.type : null,
    zoneName: (zoneById(s.worldZone || pnj.zone || START_ZONE) || {}).name || null,
    level: curLevel()
  };
}

/**
 * Les DEUX collections bouclées : c'est le bout du chemin d'exploration de la
 * vallée. Un légendaire qu'on ne peut obtenir autrement, octroyé une seule
 * fois — le drapeau évite de le redonner si le joueur l'avait déjà déniché.
 */
function verifierMaitriseVallee() {
  if (!rec || rec.maitrise) return;
  if (coffresOuverts() < COFFRE_ZONES.length) return;
  if (epreuvesGagnees() < EPREUVE_ZONES.length) return;
  rec.maitrise = true;
  const it = itemById('coeur');
  const neuf = it && !rec.items.includes(it.id);
  if (neuf) rec.items.push(it.id);
  rec.gems = (rec.gems || 0) + 25;
  gainXp(300);
  persistRec();
  sfx.levelup(); vibrate([25, 50, 25, 50, 25]);
  if (!s.gameOver && s.stage !== 'egg') R.burst('confetti', 40, s.stage);
  ui.showStory({
    emoji: '🏞️', title: 'Maîtresse de la vallée',
    lines: [
      'Les ' + COFFRE_ZONES.length + ' coffres ouverts, les ' + EPREUVE_ZONES.length +
        ' championnes battues : plus un recoin de la vallée ne t\'est étranger.',
      it ? (it.emoji + ' ' + it.name + ' — ' + RARITIES[it.rarity].label.toLowerCase() +
        (neuf ? ', à toi.' : ', un second n\'est pas de trop.')) : '',
      '💎 +25 gemmes · +300 XP'
    ].filter(Boolean),
    cta: 'RIEN NE ME RÉSISTE'
  });
}

/**
 * Prise par le chasseur. Le jeu ne tue pas (cf. v2.7 : l'irréversible faisait
 * désinstaller) — mais il fallait que ça coûte VRAIMENT, sinon le prédateur ne
 * serait qu'un décor mouvant. Elle s'échappe, blessée, et rentre à la berge.
 */
function capturee() {
  s.health = clamp(s.health - DEGATS_CAPTURE, 0, 100);
  R.hurtOtter();
  s.fun = clamp(s.fun - 20, 0, 100);
  rec.captures = (rec.captures || 0) + 1;
  const nom = s.name || 'La loutre';
  exitWorld();
  sfx.sad(); vibrate([40, 80, 40, 80, 40]);
  persist(); persistRec();
  ui.showStory({
    emoji: '🪤', title: 'Le chasseur !',
    lines: [
      'Une main se referme sur la peau du cou. ' + nom + ' se débat, mord, glisse — et file.',
      'Elle rentre à la berge le souffle court, le flanc entamé.',
      '❤️ −' + DEGATS_CAPTURE + ' santé · 😊 −20 entrain'
    ],
    cta: 'PLUS JAMAIS ÇA'
  });
  ui.updateHUD(s, mg, rec);
}

/** Ouvrir le coffre d'un lieu : un trésor garanti, une seule fois. */
function ouvrirCoffre(c) {
  if (!rec || coffreOuvert(c.zone)) return;
  (rec.chests = rec.chests || []).push(c.zone);
  const it = itemById(c.item);
  const neuf = it && !rec.items.includes(it.id);
  if (neuf) rec.items.push(it.id);
  persistRec();
  const lieu = zoneById(c.zone).name;
  const lignes = ['Sous les feuilles, un coffre patiné attend depuis longtemps.'];
  if (it) {
    lignes.push(it.emoji + ' ' + it.name + ' — ' + RARITIES[it.rarity].label.toLowerCase() + '.');
    lignes.push(neuf ? 'Un trésor de plus pour la collection ! Équipe-le dans 🎩.'
      : 'Tu en avais déjà un… mais celui-ci a du cachet.');
  }
  lignes.push('Coffres de la vallée : ' + coffresOuverts() + '/' + COFFRE_ZONES.length + '.');
  if (!neuf) gainXp(25);
  sfx.levelup(); vibrate([20, 40, 20]);
  if (!s.gameOver && s.stage !== 'egg') R.burst('confetti', 24, s.stage);
  // « Le coffre du » + « La forêt » donnait « du la forêt » : on met le lieu
  // en tête, la seule tournure juste pour les six noms (Le/La/Les)
  ui.showStory({ emoji: '🧰', title: lieu + ' — un coffre oublié', lines: lignes, cta: 'SUPERBE !' },
    verifierMaitriseVallee);   // enchaîné : sinon l'écran de maîtrise l'écraserait
  ui.updateHUD(s, mg, rec);
}

/**
 * Ramasser une trouvaille. Chaque zone sert un besoin PRÉCIS du jeu — c'est ce
 * qui la rend utile plutôt que décorative — et le lieu du jour paie double.
 */
function collectFind(f) {
  if (!rec) return;
  (rec.found = rec.found || []).push(f.id);
  // Album du Carnet : on note la SORTE découverte (une première fois marque la page).
  rec.foundKinds = rec.foundKinds || [];
  if (f.kind && !rec.foundKinds.includes(f.kind)) rec.foundKinds.push(f.kind);
  quest('finds');
  const name = s.name || 'La loutre';
  const honneur = zoneDuJour(dayKey()) === (s.worldZone || START_ZONE);
  const x2 = honneur ? 2 : 1;
  const bis = honneur ? ' (lieu du jour ×2 !)' : '';
  // Avant/après : on diffe les gains concrets pour afficher « +points » sur place,
  // pile là où la loutre a ramassé l'asset (cf. world.floats plus bas).
  const snap = {
    xp: rec.xp || 0, gems: rec.gems || 0, fish: rec.fishTotal || 0, treat: rec.treatsTotal || 0,
    hunger: s.hunger, fun: s.fun, energy: s.energy, clean: s.clean, health: s.health
  };
  if (f.kind === 'poisson') {
    rec.fishTotal = (rec.fishTotal || 0) + x2;
    rec.fish = (rec.fish || 0) + x2;               // portefeuille dépensable
    quest('fish', x2);
    s.hunger = clamp(s.hunger + 6 * x2, 0, 100);
    ui.log('🐟 ' + name + ' déniche un poisson frais !' + bis);
  } else if (f.kind === 'champignon') {
    gainXp(10 * x2);
    s.hunger = clamp(s.hunger + 8 * x2, 0, 100);   // le garde-manger de la vallée
    ui.log('🍄 Un champignon rare sous les fougères — de quoi grandir !' + bis);
  } else if (f.kind === 'gemme') {
    rec.gems = (rec.gems || 0) + x2;
    s.clean = clamp(s.clean + 10 * x2, 0, 100);    // l'écume de la cascade décrasse
    ui.log('💎 Une gemme dans l\'écume, et un bon rinçage au passage !' + bis);
  } else if (f.kind === 'coquillage') {
    addSeasonTreat(rec, x2);                        // total à vie + preuve de la saison courante
    s.lastTreat = 0;                               // la réserve recharge la friandise
    ui.log('🐚 Un beau coquillage : la friandise est de nouveau prête !' + bis);
  } else if (f.kind === 'tresor') {
    ui.log('🎁 ' + name + ' plonge et remonte quelque chose du lac…' + bis);
    tryDrop(2.5 * x2);                  // le lac est le meilleur endroit pour les trésors
  } else if (f.kind === 'fleur') {
    s.fun = clamp(s.fun + 10 * x2, 0, 100);
    s.energy = clamp(s.energy + 6 * x2, 0, 100);   // le pré du repos
    ui.log('🌼 Une fleur du vallon — ' + name + ' souffle un bon coup.' + bis);
  } else if (f.kind === 'crabe') {
    rec.gems = (rec.gems || 0) + x2;
    s.health = clamp(s.health + 6 * x2, 0, 100);   // le grand large remet d'aplomb
    ui.log('🦀 Un crabe des bancs de sable — ça pince, mais ça vaut cher !' + bis);
  } else if (f.kind === 'silex') {
    gainXp(14 * x2);
    rec.gems = (rec.gems || 0) + x2;
    ui.log('🪨 Un silex poli par le torrent — la faille forme le caractère.' + bis);
  } else if (f.kind === 'baie') {
    s.hunger = clamp(s.hunger + 10 * x2, 0, 100);
    s.energy = clamp(s.energy + 5 * x2, 0, 100);
    ui.log('🫐 Des baies sous les aiguilles — de quoi tenir longtemps.' + bis);
  // ── Les CONFINS : gated haut, dangereux, loin de la tanière — donc les
  //    trouvailles y paient nettement plus, et de plus en plus au fil du chemin.
  //    Sans quoi ces lieux ne valaient pas le détour (ils ne rendaient RIEN). ──
  } else if (f.kind === 'corail') {
    rec.gems = (rec.gems || 0) + 2 * x2;               // le lagon : coraux monnayables
    s.fun = clamp(s.fun + 10 * x2, 0, 100);
    s.energy = clamp(s.energy + 8 * x2, 0, 100);       // …et l'eau tiède ravigote
    ui.log('🪸 Un corail du lagon — ça vaut cher, et l\'eau tiède délasse.' + bis);
  } else if (f.kind === 'cristal') {
    gainXp(18 * x2);                                   // la caverne : ça affûte l'esprit
    rec.gems = (rec.gems || 0) + 2 * x2;
    ui.log('🔮 Un cristal des galeries — il aiguise l\'œil et la bourse.' + bis);
  } else if (f.kind === 'glacon') {
    rec.gems = (rec.gems || 0) + 2 * x2;
    tryDrop(2.5 * x2);                                 // la glace garde des trésors
    ui.log('🧊 Pris dans la glace du glacier, quelque chose brille…' + bis);
  } else if (f.kind === 'nacre') {
    rec.gems = (rec.gems || 0) + 4 * x2;               // le grand large : une fortune
    gainXp(14 * x2);
    ui.log('🦪 De la nacre du grand large — une petite fortune ramenée de loin.' + bis);
  } else if (f.kind === 'pepite') {
    rec.gems = (rec.gems || 0) + 6 * x2;               // la mine : le meilleur butin en gemmes
    ui.log('🪙 Une pépite du filon — le plus beau butin de toute la vallée !' + bis);
  } else if (f.kind === 'etoile') {
    gainXp(25 * x2);                                   // les cimes : le pinacle
    rec.gems = (rec.gems || 0) + 3 * x2;
    tryDrop(3.5 * x2);                                 // …et les meilleures chances de trésor
    ui.log('⭐ ' + name + ' cueille une étoile au toit du monde !' + bis);
  }
  // « +points gagnés » qui s'envole depuis l'asset ramassé : on lit les deltas
  // réels (jamais deux chiffres qui divergeraient des vrais gains).
  const parts = [];
  const dxp = (rec.xp || 0) - snap.xp;               if (dxp > 0) parts.push('+' + dxp + ' XP');
  const dgem = (rec.gems || 0) - snap.gems;          if (dgem > 0) parts.push('+' + dgem + ' 💎');
  const dfish = (rec.fishTotal || 0) - snap.fish;    if (dfish > 0) parts.push('+' + dfish + ' 🐟');
  const dtreat = (rec.treatsTotal || 0) - snap.treat; if (dtreat > 0) parts.push('+' + dtreat + ' 🐚');
  const dhun = Math.round(s.hunger - snap.hunger);   if (dhun > 0) parts.push('+' + dhun + ' 🍖');
  const dfun = Math.round(s.fun - snap.fun);         if (dfun > 0) parts.push('+' + dfun + ' 😊');
  const dene = Math.round(s.energy - snap.energy);   if (dene > 0) parts.push('+' + dene + ' ⚡');
  const dcln = Math.round(s.clean - snap.clean);     if (dcln > 0) parts.push('+' + dcln + ' 🫧');
  const dhp = Math.round(s.health - snap.health);    if (dhp > 0) parts.push('+' + dhp + ' ❤️');
  if (world) {
    (world.floats = world.floats || []).push({
      x: f.x, y: f.y, txt: parts.join('  ') || '✨', born: frame
    });
    if (world.floats.length > 8) world.floats.shift();   // garde-fou : jamais d'accumulation
  }
  R.spawn && R.spawn('sparkle', s.stage);
  sfx.eat(); vibrate(10);
  persist(); persistRec();
  ui.renderLevel(rec);
  ui.updateHUD(s, mg, rec);
}

const isVisited = id => !!rec && Array.isArray(rec.visited) && rec.visited.includes(id);

/** Première venue dans un lieu : on marque la découverte et on la met en scène. */
function discoverZone(zoneId) {
  if (!rec || isVisited(zoneId)) return false;
  (rec.visited = rec.visited || []).push(zoneId);
  persistRec();
  const intro = ZONE_INTRO[zoneId];
  if (!intro) return false;
  // on annonce à quoi sert le lieu : sans ça on découvre un décor, pas un usage
  const sp = SPECIALITE[zoneId];
  const lines = sp ? [...intro.lines, sp.icon + ' ' + sp.nom + ' — ' + sp.effet + '.'] : intro.lines;
  sfx.evolve(); vibrate([12, 40, 12]);
  ui.showStory({ ...intro, lines, cta: 'EXPLORER' });
  return true;
}

/**
 * Voyage depuis la carte du profil : on se rend directement dans un lieu déjà
 * découvert. Depuis la BERGE ou la TANIÈRE, toucher un lieu connu part
 * directement là-bas — auparavant la carte n'y était que décorative, et il
 * fallait passer par la clairière avant de pouvoir voyager.
 * Les lieux inconnus restent inaccessibles : ils se gagnent à pied.
 */
function worldTravelHandler() {
  if (!denAvailable()) return null;                 // œuf, absence, mini-jeu : pas de départ
  if (s.place === 'monde' && world) return travelTo;
  return (zoneId) => {
    if (!isVisited(zoneId) || !zoneUnlocked(zoneId, curLevel())) return false;
    enterWorld(zoneId);
    ui.hideOverlay('ovl-menu');
    return true;
  };
}

function travelTo(zoneId) {
  if (!world || !isVisited(zoneId) || zoneId === world.zone) return false;
  if (!zoneUnlocked(zoneId, curLevel())) return false;
  const p = spawnPoint(zoneId);
  goToZone(zoneId, p.x, p.y);
  ui.hideOverlay('ovl-menu');
  return true;
}

/**
 * Un bord vers un lieu encore VERROUILLÉ : la brume repousse la loutre à
 * l'intérieur et lui dit à partir de quel niveau la voie s'ouvrira. C'est le
 * cœur du déblocage progressif — le monde est là, mais il se mérite.
 */
function barrerPassage(zoneId) {
  world.route = null; world.walking = false;
  // on la recale de quelques pixels vers le centre, pour ne pas re-déclencher
  const cx = WORLD_W / 2, cy = WORLD_H / 2;
  const dx = cx - world.px, dy = cy - world.py, d = Math.hypot(dx, dy) || 1;
  world.px += dx / d * (TILE + 2); world.py += dy / d * (TILE + 2);
  world.tx = world.px; world.ty = world.py;
  const req = zoneReq(zoneId);
  if (frame > (world.brumeCooldown || 0)) {
    world.brumeCooldown = frame + 180;
    sfx.sad(); vibrate([15, 30, 15]);
    messageImportant('🌫️ La brume te barre le passage — reviens niveau ' + req + '.');
  }
}

/** Change de zone : nouvelle carte, nouvelles loutres, on entre par le bon bord. */
function goToZone(zoneId, px, py) {
  // Si on quitte la zone jardin, arrêter l'ambiance dédiée
  if (world.zone === 'jardin' && zoneId !== 'jardin') {
    ambient.stopGardenAmbient();
    if (mg && mg.mode === 'garden') { endGarden({ score: mg.score, flowers: 0, frogs: 0 }); }
  }
  const p = safeEntry(zoneId, px, py);
  world.zone = zoneId;
  s.worldZone = zoneId;                 // pour que le profil sache où l'on est
  world.px = p.x; world.py = p.y; world.tx = p.x; world.ty = p.y;
  world.walking = false; world.route = null;
  world.otters = wildOttersFor(zoneId);
  world.pnj = habitantFor(zoneId);
  world.coffre = coffreFor(zoneId);
  world.epreuve = epreuveFor(zoneId);
  world.chasseur = chasseurFor(zoneId);
  world.finds = findsFor(zoneId);
  sfx.press(); vibrate(8);
  quest('zoneVisit');
  // le passage se met en scène : rideau + nom du lieu (cf. R.flashZone)
  const z = zoneById(zoneId), intro = ZONE_INTRO[zoneId];
  R.flashZone && R.flashZone(z.name, intro && intro.emoji);
  if (!discoverZone(zoneId)) {          // déjà connu : simple annonce
    ui.log('🗺️ ' + z.name);
  }
  // La Crue (É5b) : ce lieu est-il celui envahi cette semaine ? Si oui, on le
  // signale (la météo de la Crue l'habille dans le nom de l'événement).
  const cr = currentCrue();
  world.crue = (zoneId === cr.zone) ? cr : null;
  if (world.crue) {
    messageImportant('🌊 ' + cr.weatherLabel + ' — la Crue a envahi ' + z.name + ' ! ' + cr.name + ' rôde (Profil → 🌊 La Crue).');
  }
  // Auto-lancer le mini-jeu jardin quand on entre dans la zone jardin
  if (zoneId === 'jardin' && curLevel() >= UNLOCK_LEVEL.garden && s.energy >= 10 && !mg) {
    mg = newGarden(now());
    ambient.startGardenAmbient();
    sfx.press();
    ui.log('Jardin ! Plante des graines, arrose-les, récolte les fleurs et attrape les grenouilles ! 🌸🐸');
    ui.updateHUD(s, mg, rec);
  }
}

/** Entre dans la vallée : engendre les loutres sauvages du jour et place tout le monde. */
/**
 * Partir en balade. Sans précision, on reprend LÀ OÙ L'ON S'ÉTAIT ARRÊTÉ
 * (s.worldZone était sauvegardé mais jamais relu : on repartait toujours de la
 * clairière, et il fallait retraverser la vallée à chaque sortie).
 * Repli sur la clairière si le lieu est inconnu ou n'existe plus.
 */
function enterWorld(zoneId) {
  if (!denAvailable()) return;
  const voulu = typeof zoneId === 'string' ? zoneId : s.worldZone;
  // zoneById retombe sur la clairière pour un id inconnu : on compare donc l'id
  // rendu, sinon une sauvegarde citant un lieu supprimé passerait pour valide
  const connu = !!voulu && isVisited(voulu) && zoneById(voulu).id === voulu;
  const zone = connu ? voulu : START_ZONE;
  const sp = spawnPoint(zone);
  world = {
    zone, px: sp.x, py: sp.y, tx: sp.x, ty: sp.y,
    walking: false, facing: 1, otters: wildOttersFor(zone), finds: findsFor(zone),
    pnj: habitantFor(zone), coffre: coffreFor(zone), epreuve: epreuveFor(zone),
    chasseur: chasseurFor(zone)
  };
  s.worldZone = zone;
  s.place = 'monde';
  sfx.press(); vibrate(8);
  updatePlaceBtn(); persist();
  // on nomme la destination quand elle a été choisie ou retrouvée : « part
  // explorer la vallée » n'apprenait rien à qui venait de toucher un lieu
  if (!discoverZone(zone)) {
    ui.log(connu
      ? '🗺️ ' + (s.name || 'La loutre') + ' file vers ' + zoneById(zone).name.toLowerCase() + '…'
      : '🗺️ ' + (s.name || 'La loutre') + ' part explorer la vallée…');
  }
  // La Crue (É5b) : marque le lieu s'il est envahi + bannière d'entrée de vallée
  // (une fois par session) + notification opt-in « la Crue est arrivée ».
  const cr = currentCrue();
  world.crue = (zone === cr.zone) ? cr : null;
  maybeNotifyCrue();
  if (!crueBannerShown) {
    crueBannerShown = true;
    const cz = zoneById(cr.zone);
    messageImportant('🌊 ' + cr.weatherLabel + ' cette semaine — ' + cr.name + ' rôde à ' + cz.name + '. (Profil → 🌊 La Crue)');
  }
}

/** Quitte la vallée, retour à la berge. */
function exitWorld() {
  world = null; encounterOtter = null;
  ui.hideOverlay('ovl-encounter');
  s.place = 'berge';
  berCreatures = spawnCreatures('clairiere', Math.random); // créatures de la berge
  sfx.press(); vibrate(8);
  ui.log((s.name || 'La loutre') + ' rentre au bord de la rivière. 🌊');
  updatePlaceBtn(); persist();
}

/** Un pas de simulation du Monde (déplacement de la loutre + rencontres), chaque frame. */
function stepWorld() {
  if (!world) return;
  if (!encounterOtter) {
    const dx = world.tx - world.px, dy = world.ty - world.py, d = Math.hypot(dx, dy);
    if (d > 1.5) {
      const step = Math.min(1.4, d);   // ~11 frames par tuile : marche posée
      const res = moveWithCollision(world.zone, world.px, world.py, dx / d * step, dy / d * step);
      if (res.x === world.px && res.y === world.py) {
        // vraiment coincée : on abandonne l'itinéraire entier, pas seulement l'étape
        world.route = null;
        world.tx = world.px; world.ty = world.py; world.walking = false;
      } else {
        world.px = res.x; world.py = res.y;
        world.facing = dx < 0 ? -1 : 1; world.walking = true;
      }
      // franchi un bord ouvert ? on bascule sur la zone voisine
      const out = zoneExit(world.zone, world.px, world.py);
      if (out) {
        if (!zoneUnlocked(out.to, curLevel())) { barrerPassage(out.to); return; }
        goToZone(out.to, out.x, out.y);
        return;
      }
    } else if (world.route && world.route.length) {
      const p = world.route.shift();          // étape suivante de l'itinéraire
      world.tx = p.x; world.ty = p.y;
    } else world.walking = false;
  }
  for (const o of world.otters) {
    if (o.gone) continue;
    o.wx = o.x + Math.sin((frame + o.phase) / 55) * 3;
    if (encounterOtter) continue;
    const pd = Math.hypot(o.wx - world.px, o.y - world.py);
    if (pd < 16 && frame > (o.cooldown || 0)) openEncounter(o);
  }
  // LE CHASSEUR : il patrouille, repère, puis fond sur la loutre.
  if (world.chasseur && !encounterOtter) {
    const evt = stepChasseur(world.chasseur, world.px, world.py, now(),
      (x, y, dx, dy) => moveWithCollision(world.zone, x, y, dx, dy));
    if (evt === 'repere') {
      sfx.sad(); vibrate([25, 40, 25]); ui.shake();
      messageImportant('❗ Un chasseur t\'a repérée — FUIS !');
    } else if (evt === 'capture') {
      capturee();
      return;
    }
  }

  // le coffre : marcher dessus l'ouvre, et il disparaît du décor
  if (!encounterOtter && world.coffre) {
    const c = world.coffre;
    if (Math.hypot(c.x - world.px, c.y - world.py) < 12) {
      world.coffre = null;
      ouvrirCoffre(c);
      return;
    }
  }
  // la championne du lieu : elle propose son duel quand on l'approche
  if (!encounterOtter && world.epreuve) {
    const e = world.epreuve;
    const pres = Math.hypot(e.x - world.px, e.y - world.py) < 16;
    if (pres && frame > (world.epreuveCooldown || 0)) {
      world.epreuveCooldown = frame + 320;
      world.walking = false; world.route = null; world.tx = world.px; world.ty = world.py;
      proposerEpreuve(e);
      return;
    }
    if (!pres && (world.epreuveCooldown || 0) > frame + 140) world.epreuveCooldown = frame + 40;
  }
  // l'habitant : on lui parle en s'approchant, avec un délai avant de le
  // relancer — sinon il babille en boucle tant qu'on lui tourne autour
  if (!encounterOtter && world.pnj) {
    const p = world.pnj;
    const pres = Math.hypot(p.x - world.px, p.y - world.py) < 15;
    if (pres && frame > (world.pnjCooldown || 0)) {
      world.pnjCooldown = frame + 260;
      parlerAuPnj(p);
      return;
    }
    if (!pres && (world.pnjCooldown || 0) > frame + 120) world.pnjCooldown = frame + 40;
  }
  // ramassage : marcher sur une trouvaille suffit
  if (!encounterOtter && world.finds && world.finds.length) {
    for (let i = world.finds.length - 1; i >= 0; i--) {
      const f = world.finds[i];
      if (Math.hypot(f.x - world.px, f.y - world.py) < 11) {
        world.finds.splice(i, 1);
        collectFind(f);
      }
    }
  }
  // on oublie les « +points » envolés (au-delà de leur durée de vie à l'écran)
  if (world.floats && world.floats.length)
    world.floats = world.floats.filter(fl => frame - fl.born <= 56);
}

/** Largeur de la lisière d'écran qui veut dire « je pars par là ». */
const BORD_ECRAN = 20;
/**
 * Haut de la zone de jeu réellement touchable : le bandeau de nom (3-28) et les
 * jauges (32-46) sont du DOM posé PAR-DESSUS le canevas et avalent le toucher.
 * Une lisière nord calée sur y=0 aurait donc été impossible à toucher.
 */
const MONDE_HAUT = 47;

/**
 * Le toucher vise-t-il une SORTIE ? Toucher la lisière de l'écran, du côté d'un
 * bord lié, vise le passage de ce côté puis un pas au-delà — la loutre traverse
 * la zone et change de carte d'un seul geste. Sinon null : toucher ordinaire.
 */
function sortieVisee(x, y) {
  const dir = x <= BORD_ECRAN ? 'west'
    : x >= CANVAS_W - BORD_ECRAN ? 'east'
      : y <= MONDE_HAUT + BORD_ECRAN ? 'north'
        : y >= CANVAS_H - BORD_ECRAN ? 'south' : null;
  if (!dir) return null;
  const g = zoneGates(world.zone).find(p => p.dir === dir);
  if (!g) return null;
  return {
    x: dir === 'west' ? -TILE : dir === 'east' ? WORLD_W + TILE : g.x,
    y: dir === 'north' ? -TILE : dir === 'south' ? WORLD_H + TILE : g.y
  };
}

/** Coin haut-gauche de la caméra (mêmes bornes que le rendu). */
function worldCam() {
  return {
    x: Math.max(0, Math.min(WORLD_W - CANVAS_W, Math.round(world.px - CANVAS_W / 2))),
    y: Math.max(0, Math.min(WORLD_H - CANVAS_H, Math.round(world.py - CANVAS_H / 2)))
  };
}

/** Ouvre la rencontre avec une loutre sauvage (la balade se met en pause). */
function openEncounter(o) {
  if (encounterOtter) return;
  encounterOtter = o; world.walking = false;
  sfx.chirp(); vibrate(10);
  ui.renderEncounter(o, rec.gang, BEFRIEND_NEED, encHandlers);
  ui.showOverlay('ovl-encounter');
}

/** Ferme la rencontre ; si on n'a pas amadoué, la loutre reste (petit répit). */
function closeEncounter(befriended) {
  const o = encounterOtter; encounterOtter = null;
  ui.hideOverlay('ovl-encounter');
  if (o && !befriended) o.cooldown = frame + 240;
}

let battleStarter = null;   // pont vers le lanceur de combat (défini au boot)
let epreuveEnCours = null;  // zone dont on affronte la championne, s'il y a lieu

/**
 * Fin de duel : récompenses (une seule fois). Déclenché soit par une entrée qui
 * porte le coup de grâce, soit par la boucle quand le moteur conclut de lui-même
 * (une loutre tombe à zéro entre deux appuis). Le drapeau battleDone évite le
 * double comptage.
 */
function onDuelOver() {
  if (!battle || !battle.over || battleDone) return;
  battleDone = true;
  if (battle.winner === 'me') {
    rec.wins++;
    s.fun = clamp(s.fun + 12, 0, 100);
    gainXp(XP.win);
    sfx.happy(); vibrate([20, 40, 20]); ui.toast('🏆 Victoire de ' + battle.me.name + ' !');
    tryDrop(1.5);                       // une victoire peut rapporter un trésor
    if (epreuveEnCours) gagnerEpreuve(epreuveEnCours);
    if (crueEnCours) gagnerCrue(crueEnCours);
  } else {
    s.fun = clamp(s.fun + 2, 0, 100);
    sfx.sad(); ui.toast('💔 Défaite… ça se rejouera !');
    if (epreuveEnCours) ui.log('⚔️ L\'épreuve reste à passer — reviens quand tu seras prête.');
    if (crueEnCours) ui.log('🌊 La championne tient bon — la Crue t\'attend encore.');
  }
  epreuveEnCours = null;
  crueEnCours = null;
  persist(); persistRec(); checkUnlocks();
}

const encHandlers = {
  offer: () => {
    const o = encounterOtter; if (!o) return;
    o.friend = (o.friend || 0) + 1;
    R.spawn && R.spawn('heart', s.stage); sfx.happy(); vibrate(8);
    if (o.friend >= BEFRIEND_NEED) befriend(o);
    else ui.renderEncounter(o, rec.gang, BEFRIEND_NEED, encHandlers);
  },
  // la défier : on quitte la rencontre pour l'arène, contre CETTE loutre-là
  fight: () => {
    const o = encounterOtter; if (!o || !battleStarter) return;
    closeEncounter(false);
    ui.showOverlay('ovl-battle');
    battleStarter(o, 'rencontre|' + (o.id || o.name));
  },
  close: () => closeEncounter(false)
};

/** Amadouée : la loutre sauvage rejoint l'escouade (créée au besoin). */
function befriend(o) {
  if (!rec.gang) rec.gang = makeGang('Mon escouade', '🦦', s);
  if (rec.gang.members.length >= MAX_MEMBERS) {
    ui.toast('Escouade complète (5) 🦦'); closeEncounter(false); return;
  }
  recruit(rec.gang, o); markRecruited(o.id); o.gone = true;
  persistRec(); ui.renderProfile(s, rec, worldTravelHandler());
  ui.log('🤝 ' + o.name + ' rejoint « ' + rec.gang.name + ' » !');
  ui.toast('🤝 ' + o.name + ' rejoint ton escouade !');
  closeEncounter(true);
}

/* ---------------- Canvas (pêche, caresses, œuf) ---------------- */
function onCanvasPointer(e) {
  const { x, y } = canvasXY(e);
  // hitbox élargie au doigt, puis par la technique « Œil de pêcheuse »
  const pad = (e.pointerType === 'touch' ? 8 : 4) + (mg ? jeuBuffs(rec, equipBonus(s)).pad : 0);

  if (mg) {
    if (mg.mode === 'slide') { setSlideLane(mg, laneAt(x)); vibrate(6); }
    else if (mg.mode === 'garden') {
      // clic : récolte (fleur ou grenouille) ou arrosage
      const got = harvestAt(mg, x, y, pad);
      if (got) {
        if (got.type === 'frog') { sfx.gardenFrog(); vibrate(10); feel('soft'); ui.toast('🐸 Grenouille attrapée ! +3'); }
        else { sfx.gardenHarvest(); vibrate(6); feel('soft'); ui.toast('🌸 Fleur récoltée ! +1'); }
      } else if (waterAt(mg, x, y)) {
        sfx.gardenWater(); vibrate(4); ui.toast('💧 Graine arrosée !');
      }
    }
    else if (clickGame(mg, x, y, pad)) { R.splashAt(x, y); sfx.catch(); vibrate(8); feel('soft'); }
    return;
  }
  if (s && !s.gameOver) {
    if (s.stage === 'egg') { actWarm(); return; }
    if (s.away) return; // elle n'est pas là — le bouton du héron fait le travail

    // dans le Monde : on guide la loutre au toucher (coords écran -> monde)
    if (s.place === 'monde') {
      if (world && !encounterOtter) {
        const cam = worldCam();
        // on peut viser un peu au-delà du bord : c'est ainsi qu'on quitte la zone
        let bx = clampN(x + cam.x, -TILE, WORLD_W + TILE);
        let by = clampN(y + cam.y, -TILE, WORLD_H + TILE);
        // TOUCHER LE BORD DE L'ÉCRAN, C'EST PARTIR. Un toucher ne visait qu'un
        // point de l'écran : pour gagner le bord de la CARTE il fallait une
        // dizaine de touchers d'affilée, et l'on croyait la zone close. Toucher
        // la lisière de l'écran vise désormais le passage lui-même — un geste,
        // une zone. (Sans liaison de ce côté, le toucher reste ordinaire.)
        const sortie = sortieVisee(x, y);
        if (sortie) { bx = sortie.x; by = sortie.y; }
        // Taper près de la loutre annule le déplacement en cours
        const dx = bx - world.px, dy = by - world.py;
        if (world.route && world.route.length && dx * dx + dy * dy < 400) {
          world.route = null; world.walking = false;
          return;
        }
        // on CONTOURNE les obstacles : aller tout droit collait la loutre au
        // premier tronc venu, et certaines sorties devenaient inatteignables
        const route = findPath(world.zone, world.px, world.py, bx, by);
        world.route = route;
        const p = route.length ? route.shift() : { x: bx, y: by };
        world.tx = p.x; world.ty = p.y;
      }
      return;
    }

    // dans la tanière : taper un trésor l'identifie ; taper la loutre la caresse
    if (s.place === 'taniere') {
      const owned = rec.items || [];
      const idx = denItemAt(x, y);
      if (idx >= 0 && idx < owned.length) {
        const it = itemById(owned[idx]);
        if (it) { ui.log(it.emoji + ' ' + it.name + ' — ' + RARITIES[it.rarity].label + ' · ' + describeBonus(it.bonus)); sfx.press(); }
        return;
      }
      const h = R.otterBox(s.stage).h; // la loutre est fixe dans la tanière (centre 64, haut 62)
      if (x >= 58 && x <= 102 && y >= 56 && y <= 62 + h + 8) pet();
      return;
    }

    // attraper la balle posée sur la berge -> on la lancera (glisser puis relâcher)
    if (!busy() && !s.sleeping && R.grabBall(x, y)) {
      draggingBall = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      vibrate(8);
      return;
    }

    // attraper le poisson posé sur la berge -> on le glissera jusqu'à sa bouche (nourrir)
    if (!busy() && !s.sleeping && s.hunger < 92) {
      const f = FOOD_POS;
      if (x >= f.x - pad && x <= f.x + f.w + pad && y >= f.y - pad && y <= f.y + f.h + pad) {
        dragFood = { x, y };
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        vibrate(8);
        return;
      }
    }

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
        addSeasonTreat(rec, 1);                     // total à vie + preuve de la saison courante
        refreshGift(); // 1er trésor de saison -> le cadeau devient réclamable
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

    // créatures du bestiaire : clic pour tenter de l'attraper
    if (s.place === 'berge' && berCreatures.length) {
      for (let i = berCreatures.length - 1; i >= 0; i--) {
        const cr = berCreatures[i];
        const crx = cr.x, cry = cr.y + 144; // BERGE_SHIFT
        if (Math.abs(x - crx) < 14 && Math.abs(y - cry) < 14) {
          const data = creatureById(cr.id);
          if (!data) continue;
          const isNew = seeCreature(rec, cr.id);
          if (data.aggressive) {
            // agressif : on le repousse mais on le découvre
            ui.log(data.emoji + ' ' + data.name + ' ! ' + data.desc + (isNew ? ' 📖 Nouveau !' : ''));
            R.burst('sparkle', 4, s.stage);
          } else {
            // pacifique : on l'attrape
            catchCreature(rec, cr.id);
            berCreatures.splice(i, 1);
            s.fun = clamp(s.fun + 3, 0, 100);
            s.energy = clamp(s.energy - 2, 0, 100);
            ui.log(data.emoji + ' ' + data.name + ' attrapé ! ' + (isNew ? '📖 Nouveau dans le bestiaire !' : ''));
            R.burst('sparkle', 8, s.stage);
            sfx.catch(); vibrate(10);
            gainXp(data.xp);
          }
          persist();
          break;
        }
      }
    }

    const box = R.otterBox(s.stage);
    if (x >= box.x - 12 && x <= box.x + box.w + 12 && y >= box.y - 12 && y <= box.y + box.h + 14) { pet(); return; }

    // TOUCHER L'EAU (É4) : un galet qui ricoche, et la pêche (plongée) se lance
    // en touchant la rivière — le bouton 🤿 reste, l'eau devient jouable au doigt.
    if (y >= WATER_Y && !s.sleeping) { tapWater(x); return; }

    // ailleurs sur la berge : on l'appelle vers le point touché (elle vient)
    if (y >= 60 && !s.sleeping) { R.callTo(x); hintDone('callwater'); }
  }
}

// Cooldown court « seedé » par le jour : le ricochet reste réactif mais le petit
// gain de fun ne se ferme pas (anti-spam), sans être mécaniquement constant.
let lastRicochet = 0;
function ricochetCD() {
  const j = dayKey();
  const h = j.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return 520 + (h % 360);   // 520..879 ms, stable sur la journée
}
function tapWater(x) {
  R.ricochet(x);
  sfx.chirp(); vibrate(6);
  hintDone('callwater');
  const t = now();
  if (t - lastRicochet > ricochetCD()) {
    lastRicochet = t;
    s.fun = clamp(s.fun + 3, 0, 100);   // le jeu de l'eau, ça met de bonne humeur
    persist(); ui.updateHUD(s, mg, rec);
  }
  // la pêche/plongée se déclenche au toucher de l'eau si elle est disponible
  if (unlocked('dive') && !busy() && !s.divingUntil) actDive();
}

// Barre d'actions : elle s'efface à demi après 5 s sans interaction (l'eau respire),
// et redevient franche au moindre toucher. Les boutons restent cliquables (opacité).
let actionbarTimer = 0;
function wakeActionbar() {
  const ab = $('actionbar');
  if (!ab) return;
  ab.classList.remove('dim');
  clearTimeout(actionbarTimer);
  actionbarTimer = setTimeout(() => ab.classList.add('dim'), 5000);
}

/* ---------------- Troc quotidien (É5) : coquillages ↔ poissons/gemmes ---------------- */
const giveKindOf = (o) => (o.give.shells != null ? 'shells' : 'fish');
function barterData() {
  if (rec.barterDay !== dayKey()) { rec.barterDay = dayKey(); rec.barterUsed = []; }
  const bal = { shells: rec.shells || 0, fish: rec.fish || 0, gems: rec.gems || 0 };
  return {
    balances: bal,
    offers: dailyBarter(dayKey()).map(o => {
      const gk = giveKindOf(o), gn = o.give[gk];
      const afford = (bal[gk] || 0) >= gn;
      return {
        id: o.id, giveKind: gk, giveN: gn,
        getKind: o.get.fish != null ? 'fish' : 'gems',
        getN: o.get.fish != null ? o.get.fish : o.get.gems,
        used: (rec.barterUsed || []).includes(o.id),
        afford, rest: (bal[gk] || 0) - gn        // solde APRÈS achat (négatif = manque)
      };
    })
  };
}
const barterHandlers = {
  trade: (id) => {
    if (rec.barterDay !== dayKey()) { rec.barterDay = dayKey(); rec.barterUsed = []; }
    if ((rec.barterUsed || []).includes(id)) return;
    const offer = dailyBarter(dayKey()).find(o => o.id === id);
    if (!offer) return;
    const gk = giveKindOf(offer), gn = offer.give[gk];
    if ((rec[gk] || 0) < gn) { ui.toast((gk === 'shells' ? '🐚' : '🐟') + ' Pas assez pour cet échange.'); sfx.sad(); vibrate(20); return; }
    rec[gk] -= gn;
    if (offer.get.fish != null) rec.fish = (rec.fish || 0) + offer.get.fish;
    else if (offer.get.gems != null) rec.gems = (rec.gems || 0) + offer.get.gems;
    else if (offer.get.shells != null) rec.shells = (rec.shells || 0) + offer.get.shells;
    (rec.barterUsed = rec.barterUsed || []).push(id);
    persistRec(); sfx.happy(); vibrate(10);
    ui.updateHUD(s, mg, rec); refreshBarter();
  }
};
function refreshBarter() { ui.renderBarter(barterData(), barterHandlers); }
function openBarter() { if (!rec) return; sfx.press(); refreshBarter(); ui.showOverlay('ovl-barter'); }

/* ---------------- Atelier (É5) : 3 doublons → 1 trésor du palier supérieur ---------------- */
let workshopChoice = null;   // { tier, ids } quand on choisit le trésor à forger
function workshopData() {
  return TIERS.slice(0, -1).map(t => ({
    tier: t,
    label: RARITIES[t].label,
    color: RARITIES[t].color,
    count: (rec.dupes && rec.dupes[t]) || 0,
    need: CRAFT_NEED,
    can: canCraft(rec.dupes, t),
    upLabel: RARITIES[nextTier(t)].label
  }));
}
function itemPoolByTier(preferUnowned) {
  const pool = {};
  for (const it of ITEMS) {
    if (preferUnowned && rec.items.includes(it.id)) continue;
    (pool[it.rarity] = pool[it.rarity] || []).push(it.id);
  }
  return pool;
}
const workshopHandlers = {
  begin: (tier) => {
    if (!canCraft(rec.dupes, tier)) return;
    const up = nextTier(tier);
    let pool = itemPoolByTier(true);
    if (!(pool[up] || []).length) pool = itemPoolByTier(false);   // tout possédé : on rejoue quand même
    const ids = craftChoices(tier, pool, dayKey(), (rec.dupes[tier] || 0));
    if (!ids.length) { ui.toast('Rien à forger pour ce palier.'); return; }
    workshopChoice = { tier, ids };
    refreshWorkshop();
  },
  pick: (tier, id) => {
    if (!canCraft(rec.dupes, tier)) { workshopChoice = null; refreshWorkshop(); return; }
    rec.dupes[tier] = (rec.dupes[tier] || 0) - CRAFT_NEED;
    const it = itemById(id);
    if (it && !rec.items.includes(id)) {
      rec.items.push(id);
      ui.toast(it.emoji + ' ' + it.name + ' forgé !');
      ui.log('🛠️ Atelier : 3 doublons ' + RARITIES[tier].label.toLowerCase() + ' fondus en ' + it.emoji + ' ' + it.name + ' (' + RARITIES[it.rarity].label + ') !');
    } else if (it) {                       // déjà possédé : devient un doublon du palier sup + gemmes
      rec.dupes[it.rarity] = (rec.dupes[it.rarity] || 0) + 1;
      rec.gems = (rec.gems || 0) + 3;
      ui.toast(it.emoji + ' doublon rangé + 3 💎');
    }
    workshopChoice = null;
    persistRec(); sfx.levelup(); vibrate([15, 30, 15]);
    ui.updateHUD(s, mg, rec); refreshWorkshop();
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
function openWorkshop() { if (!rec) return; workshopChoice = null; sfx.press(); ui.hideOverlay('ovl-menu'); refreshWorkshop(); ui.showOverlay('ovl-workshop'); }

/* ---------------- La Crue (É5b) : le rendez-vous HEBDOMADAIRE ---------------- */
let crueEnCours = null;        // la Crue dont on affronte la championne, s'il y a lieu
let crueBannerShown = false;   // bannière d'entrée de vallée montrée une fois par session
const MEDAL_EMOJI = { bronze: '🥉', argent: '🥈', or: '🥇' };

// La Crue de la semaine, déterministe (lieu + météo + championne + talents visibles).
function currentCrue() {
  return crueOfWeek(isoWeekKey(new Date()), Object.keys(ZONES), PASSIVE_TECHNIQUES.map(t => t.id));
}
// Progrès de la SEMAINE courante — remis à zéro dès qu'on change de semaine ISO.
function crueProgress() {
  const wk = isoWeekKey(new Date());
  if (!rec.crue || rec.crue.week !== wk) rec.crue = { week: wk, best: 'none', claimed: [] };
  return rec.crue;
}
// La carte de la championne : calée sur la loutre NUE (duel serré), renforcée par
// powerMult au lancement (comme l'épreuve, mais seedée par la SEMAINE, pas le lieu).
function carteChampionne(cr) {
  const base = wildFoe(curLevel(), cr.seed, makeFighter(s));
  return { ...base, name: cr.name, hat: null };
}
function defierCrue() {
  if (!denAvailable()) { ui.toast('🌊 Reviens quand ta loutre pourra se battre.'); return; }
  if (curLevel() < UNLOCK_LEVEL.battle) {
    ui.log('🌊 La Crue et sa championne s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + '.'); return;
  }
  if (!battleStarter) return;
  const cr = currentCrue();
  crueProgress();               // aligne rec.crue sur la bonne semaine avant le duel
  crueEnCours = cr;
  ui.hideOverlay('ovl-crue');
  ui.showOverlay('ovl-battle');
  battleStarter(carteChampionne(cr), cr.seed, cr.powerMult);
}
// Victoire sur la championne : médaille selon les PV restants, la MEILLEURE est
// gardée, et chaque palier atteint se réclame UNE fois par semaine (matériaux + gemmes).
function gagnerCrue(cr) {
  const prog = crueProgress();
  const hpFrac = (battle && battle.me && battle.me.maxHp) ? battle.me.hp / battle.me.maxHp : 0;
  const medal = medalFor(true, hpFrac);
  const res = claimCrueRewards(prog, rec, medal);   // logique pure & testée
  persistRec(); ui.updateHUD(s, mg, rec);
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
    locked: curLevel() < UNLOCK_LEVEL.battle,
    lockLevel: UNLOCK_LEVEL.battle
  };
}
function openCrue() {
  if (!rec) return;
  sfx.press(); ui.hideOverlay('ovl-menu');
  ui.renderCrue(crueData(), { defy: defierCrue });
  ui.showOverlay('ovl-crue');
}
// Notification optionnelle « la Crue est arrivée » — gated sur l'opt-in existant
// (s.push + permission accordée). Une seule fois par semaine, en local (best-effort).
function maybeNotifyCrue() {
  try {
    if (!s || !s.push || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const wk = isoWeekKey(new Date());
    if (rec.crueNotified === wk) return;
    rec.crueNotified = wk; persistRec();
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification('🌊 La Crue est arrivée !', {
          body: 'Une championne rôde dans la vallée cette semaine.', tag: 'crue', icon: './icons/icon-192.png'
        }))
        .catch(() => {});
    }
  } catch (_) { /* le banner en jeu reste le canal principal */ }
}

/* ---------------- Le Dojo de parade (v4.0) : entraînement quotidien ---------------- */
// Enchaînement seedé du jour, joué au TEMPS RÉEL (setTimeout + now()) — pas de
// dépendance à la boucle de rendu. La logique de jugement est pure (dojo.js).
let dojoState = null;
function setDojoPrompt(txt, cls) {
  const p = $('dojo-prompt'); if (p) { p.textContent = txt; p.className = 'dojo-prompt ' + (cls || ''); }
}
function animDojoBar(ms) {
  const bar = $('dojo-bar'); if (!bar) return;
  bar.style.transition = 'none'; bar.style.width = '0%';
  // reflow puis on lance l'animation de remplissage sur la durée de la fenêtre
  void bar.offsetWidth;
  bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '100%';
}
function resetDojoBar() { const bar = $('dojo-bar'); if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; } }
function updateDojoScore() {
  const el = $('dojo-score'); if (el && dojoState) el.textContent = 'Score : ' + dojoState.score + (dojoState.combo > 1 ? '   ✦ combo ×' + dojoState.combo : '');
}
function openDojo() {
  if (!rec) return;
  if (busy() || s.sleeping || s.stage === 'egg' || s.away || s.gameOver) { ui.toast('🥋 Le dojo t\'attend quand ta loutre sera disponible.'); return; }
  sfx.press(); vibrate(8);
  dojoState = { seq: dailyDojo(dayKey()), i: -1, score: 0, combo: 0, windowOpenAt: 0, windowMs: 0, phase: 'ready', results: [], timer: 0 };
  $('dojo-result').classList.add('hidden');
  $('dojo-live').classList.remove('hidden');
  resetDojoBar(); updateDojoScore();
  setDojoPrompt('Prêt ? Pare chaque assaut au bon moment.', 'ready');
  ui.showOverlay('ovl-dojo');
  dojoState.timer = setTimeout(dojoNextStrike, 950);
}
function dojoNextStrike() {
  if (!dojoState) return;
  dojoState.i++;
  if (dojoState.i >= dojoState.seq.strikes.length) { dojoEnd(); return; }
  const st = dojoState.seq.strikes[dojoState.i];
  dojoState.phase = 'windup';
  resetDojoBar();
  setDojoPrompt('Prépare-toi… (' + (dojoState.i + 1) + '/' + dojoState.seq.strikes.length + ')', 'windup');
  clearTimeout(dojoState.timer);
  dojoState.timer = setTimeout(() => dojoOpenWindow(st), st.windup);
}
function dojoOpenWindow(st) {
  if (!dojoState) return;
  dojoState.phase = 'window';
  dojoState.windowMs = st.window;
  dojoState.windowOpenAt = now();
  setDojoPrompt('PARE !', 'window');
  animDojoBar(st.window);
  sfx.chirp();
  clearTimeout(dojoState.timer);
  dojoState.timer = setTimeout(() => dojoResolve(null), st.window);   // fenêtre ratée
}
function dojoTap() {
  if (!dojoState) return;
  if (dojoState.phase === 'windup') { dojoResolve(-1); return; }       // touché trop tôt (feinte)
  if (dojoState.phase !== 'window') return;
  dojoResolve(now() - dojoState.windowOpenAt);
}
function dojoResolve(elapsed) {
  if (!dojoState || dojoState.phase === 'resolved') return;
  dojoState.phase = 'resolved';
  clearTimeout(dojoState.timer);
  resetDojoBar();
  const st = dojoState.seq.strikes[dojoState.i];
  const q = (elapsed === -1) ? 'miss' : judgeParry(st.window, elapsed);
  const gained = parryScore(q, dojoState.combo);
  dojoState.score += gained;
  dojoState.combo = nextCombo(q, dojoState.combo);
  dojoState.results.push(q);
  const label = q === 'perfect' ? '🛡️ PARFAIT !' : q === 'good' ? '🛡️ Bien !' : '💥 Raté…';
  setDojoPrompt(label + (gained ? '  +' + gained : ''), 'result-' + q);
  if (q === 'miss') { sfx.sad(); vibrate(30); } else { sfx.catch(); vibrate(q === 'perfect' ? 14 : 8); }
  updateDojoScore();
  dojoState.timer = setTimeout(dojoNextStrike, 700);
}
function dojoEnd() {
  if (!dojoState) return;
  clearTimeout(dojoState.timer);
  const score = dojoState.score;
  const belt = beltFor(score);
  const newBest = score > (rec.dojoBest || 0);
  if (newBest) rec.dojoBest = score;
  let reward = null;
  if (rec.dojoDay !== dayKey()) {          // récompense une fois par jour
    rec.dojoDay = dayKey();
    reward = dojoReward(score);
    rec.gems = (rec.gems || 0) + reward.gems;
    rec.fish = (rec.fish || 0) + reward.fish; rec.fishTotal = (rec.fishTotal || 0) + reward.fish;
    gainXp(reward.xp);
  }
  persistRec(); ui.updateHUD(s, mg, rec);
  sfx.happy(); vibrate([15, 30, 15]);
  // écran de résultat
  const perfects = dojoState.results.filter(r => r === 'perfect').length;
  const html = '<p class="dojo-belt">' + belt.emoji + ' Ceinture ' + belt.name + '</p>' +
    '<p class="dojo-final">Score : <b>' + score + '</b>' + (newBest ? '   🏅 Nouveau record !' : '') + '</p>' +
    '<p class="small">' + perfects + ' parade' + (perfects > 1 ? 's' : '') + ' parfaite' + (perfects > 1 ? 's' : '') + ' · meilleur : ' + (rec.dojoBest || 0) + '</p>' +
    (reward
      ? '<p class="dojo-reward">Récompense du jour : +' + reward.gems + ' 💎  +' + reward.fish + ' 🐟  +' + reward.xp + ' XP</p>'
      : '<p class="small">Déjà récompensé aujourd\'hui — reviens demain (l\'entraînement, lui, reste ouvert).</p>');
  const res = $('dojo-result');
  res.innerHTML = html +
    '<div class="dojo-actions"><button id="dojo-replay" class="act" type="button">↻ Recommencer</button>' +
    '<button id="dojo-close" class="act ghost" type="button">Fermer</button></div>';
  $('dojo-live').classList.add('hidden');
  res.classList.remove('hidden');
  $('dojo-replay').addEventListener('click', openDojo);
  $('dojo-close').addEventListener('click', closeDojo);
  dojoState.phase = 'done';
}
function closeDojo() {
  if (dojoState) { clearTimeout(dojoState.timer); dojoState = null; }
  ui.hideOverlay('ovl-dojo');
}

// Gestes de glissement : la balle qu'on lance, ou le poisson qu'on donne. Le doigt
// pilote le jeton ; on convertit les coords écran -> coords canvas.
// Convertit un pointeur écran -> coordonnées logiques du canvas (0..CANVAS_W, 0..CANVAS_H),
// en tenant compte d'object-fit (cover/contain), d'object-position et du HiDPI
// (cv.width/cv.height peuvent être multipliés par le devicePixelRatio).
function canvasXY(e) {
  const r = cv.getBoundingClientRect();
  const cs = getComputedStyle(cv);
  const fit = cs.objectFit;
  const W = CANVAS_W, H = CANVAS_H;
  let scaleX = r.width / W, scaleY = r.height / H, s = null;
  if (fit === 'cover') s = Math.max(scaleX, scaleY);
  else if (fit === 'contain') s = Math.min(scaleX, scaleY);
  if (s) {
    const pos = cs.objectPosition.split(' ');
    const px = (parseFloat(pos[0]) || 0) / 100, py = (parseFloat(pos[1]) || 0) / 100;
    const left = (r.width - W * s) * px, top = (r.height - H * s) * py;
    return { x: (e.clientX - r.left - left) / s, y: (e.clientY - r.top - top) / s };
  }
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
function onCanvasMove(e) {
  if (draggingBall) { const p = canvasXY(e); R.dragBall(p.x, p.y); return; }
  if (dragFood) dragFood = canvasXY(e);
}

function onCanvasUp(e) {
  // lâcher la balle -> elle est lancée vers le point de largage, la loutre la rapporte
  if (draggingBall) {
    const p = canvasXY(e);
    R.throwBall(p.x, p.y);
    draggingBall = false;
    hintDone('ball');
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    sfx.press(); vibrate(6);
    return;
  }
  if (!dragFood) return;
  const drop = dragFood; dragFood = null;
  try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!s || busy() || s.sleeping) return;
  const box = R.otterBox(s.stage);
  if (drop.x >= box.x - 10 && drop.x <= box.x + box.w + 10 && drop.y >= box.y - 10 && drop.y <= box.y + box.h + 12) {
    R.splashAt(box.x + 16, box.y + 10); // petit plouf de gourmandise
    actFeed(); sfx.chirpHappy(); hintDone('dragfood');
  }
}

// La loutre vient de rapporter la balle : petite récompense de jeu (humeur, lien, XP).
function onFetchDone() {
  if (!s || busy() || s.sleeping) return;
  s.fun = clamp(s.fun + 8, 0, 100);
  R.spawn('heart', s.stage); R.burst('sparkle', 4, s.stage); R.ring(s.stage);
  sfx.chirpHappy(); vibrate(12); feel('med');
  careBond('play');
  gainXp(XP.pet);
  ui.log(s.name + ' rapporte la balle, tout fier ! 🎾');
  afterAct();
}

/** Musique + ambiance jouent quand : loutre en vie, option activée, pas coupé, app visible. */
function syncMusic() {
  if (s) setVolume(s.volume ?? 0.7);
  const on = !!(s && s.music !== false && !s.mute && !s.gameOver && !document.hidden);
  music.setActive(on);
  const wt = () => (s && s.place === 'berge') ? weatherFor(new Date()) : null;
  ambient.setActive(on, wt);
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

// Badge « ! » du Cadeau : visible seulement quand un cadeau de saison est réclamable.
function refreshGift() {
  const b = $('b-gift'); if (!b) return;
  const badge = b.querySelector('.badge');
  if (badge) badge.classList.toggle('hidden', !almanachHasClaimable(rec));
}
/** Après chaque action joueur : sauvegarde + HUD à jour immédiatement. */
function afterAct() { persist(); ui.updateHUD(s, mg, rec); updateCoach(); refreshGift(); }

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

/* ---------------- Découvrabilité : astuces de gestes (après le tuto de base) ---------------- */
const HINT_MAX = 22000, HINT_GAP = 6000;
const HINTS = [
  { id: 'pet',       msg: '💡 Astuce : touche ta loutre pour la câliner. 💛',
    when: () => s.place === 'berge' },
  { id: 'dragfood',  msg: '💡 Tu peux glisser le poisson 🐟 posé sur la berge jusqu\'à sa bouche pour la nourrir.',
    when: () => s.place === 'berge' && s.hunger < 92 },
  { id: 'callwater', msg: '💡 Tape la berge ou l\'eau 💧 : ta loutre vient à cet endroit.',
    when: () => s.place === 'berge' },
  { id: 'ball',      msg: '💡 Attrape la balle 🎾 sur la berge et lance-la : elle court la rapporter !',
    when: () => s.place === 'berge' },
  { id: 'den',       msg: '💡 Le bouton 🏠 (en haut à droite) ouvre sa tanière — ta collection de trésors s\'y expose.',
    when: () => denAvailable() }
];

function hintTargetFor(id) {
  if (id === 'pet') { const b = R.otterBox(s.stage); return { x: b.x + b.w / 2, y: b.y - 2 }; }
  if (id === 'dragfood') return { x: FOOD_POS.x + 10, y: FOOD_POS.y + 2 };
  if (id === 'callwater') return { x: 104, y: 110 };
  if (id === 'ball') return { x: BALL_HOME.x, y: BALL_HOME.y - 2 };
  if (id === 'den') return { x: 146, y: 30, up: true };
  return null;
}

/** Le joueur a fait le geste -> l'astuce est classée. */
function hintDone(id) {
  if (!s || !s.hints) return;
  if (!s.hints[id]) { s.hints[id] = 1; persist(); }
  if (activeHint === id) { activeHint = null; hintCooldown = now() + HINT_GAP; }
}

/** Révèle les astuces de gestes une par une, une fois le tuto de base terminé. */
function maybeHint() {
  const blocked = !s || s.coach || s.gameOver || s.away || s.stage === 'egg' || !s.name
    || s.sleeping || mg || storyOpen || diving();
  if (blocked) { activeHint = null; return; }
  if (!s.hints) s.hints = {};
  if (activeHint) {
    const h = HINTS.find(x => x.id === activeHint);
    if (!h || s.hints[activeHint] || !h.when() || now() - hintAt > HINT_MAX) {
      if (h && now() - hintAt > HINT_MAX) { s.hints[activeHint] = 1; persist(); } // vue assez longtemps -> classée
      activeHint = null; hintCooldown = now() + HINT_GAP;
    }
    return;
  }
  if (now() < hintCooldown) return;
  const next = HINTS.find(h => !s.hints[h.id] && h.when());
  if (next) { activeHint = next.id; hintAt = now(); ui.log(next.msg); }
}

/**
 * Un message qui COMPTE (éjection, perte, événement). Les astuces et le coach
 * écrivent dans le même bandeau et le remplaçaient parfois dans la seconde :
 * on repousse leur prochaine prise de parole pour laisser lire celui-ci.
 */
function messageImportant(msg) {
  ui.log(msg);
  activeHint = null;
  hintCooldown = now() + HINT_GAP;
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

  // les pelages se débloquaient EN SILENCE : on gagnait une récompense sans
  // jamais l'apprendre. Ils s'annoncent comme les chapeaux.
  const nowFurs = unlockedFurs(rec);
  for (const id of nowFurs) {
    if (!prevFurs.has(id)) {
      const f = furById(id);
      ui.toast('🎨 Pelage débloqué : ' + f.name + ' !');
      if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
      sfx.evolve(); vibrate([15, 30, 15]);
    }
  }
  prevFurs = new Set(nowFurs);

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
    const opened = featuresOpenedBetween(before, L.level);
    let reward, rewardColor;
    if (gotItems.length) {
      const it = gotItems[gotItems.length - 1];
      reward = '🎁 Trésor ' + RARITIES[it.rarity].label.toLowerCase() + '<br>' + it.emoji + ' <b>' + esc(it.name) + '</b>';
      rewardColor = RARITIES[it.rarity].color;
      ui.log('🏅 Niveau ' + L.level + ' ! Trésor ' + RARITIES[it.rarity].label.toLowerCase() + ' : ' + it.emoji + ' ' + it.name + ' ! Équipe-le dans 🎩.');
    } else if (opened.length) {
      reward = '🔓 Débloqué<br><b>' + opened.join(' + ') + '</b>';
      ui.log('⭐ Niveau ' + L.level + ' ! Débloqué : ' + opened.join(' + ') + ' ! Va essayer !');
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

/* ---------------- Trésors : drops dans les activités ---------------- */
/** Tente un drop aléatoire (chance boostée par le trésor équipé + le contexte). */
function tryDrop(boost = 1) {
  if (!s || s.gameOver || s.stage === 'egg') return;
  const id = rollDrop(Math.random, (equipBonus(s).luck || 1) * boost);
  if (!id) return;
  const it = itemById(id);
  if (rec.items.includes(id)) { // déjà possédé -> le doublon part à l'atelier (É5)
    rec.dupes = rec.dupes || {};
    rec.dupes[it.rarity] = (rec.dupes[it.rarity] || 0) + 1;
    persistRec();
    ui.toast('✨ ' + it.emoji + ' doublon ' + it.name + ' → atelier 🛠️');
    gainXp(10);
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
  // La lignée (v4.1) : la loutre qui part ne disparaît pas — elle rejoint le
  // mémorial, et la suivante hérite (souvent) de sa personnalité. Le « recommencer »
  // devient un passage de relais entre générations.
  let generation = 1, heirOf = null, heirTrait = null;
  if (isRealOtter(s)) {
    const anc = makeAncestor(s, ageMs(s, now()), s.generation || 1);
    (rec.memorial = rec.memorial || []).push(anc);
    if (rec.memorial.length > 40) rec.memorial.shift();     // garde-fou mémoire
    rec.bestAge = Math.max(rec.bestAge || 0, anc.ageMs);
    generation = (s.generation || 1) + 1;
    heirOf = s.name;
    heirTrait = inheritTrait(s.trait);
    persistRec();
  }
  s = newState(now());
  s.generation = generation; s.heirOf = heirOf; s.heirTrait = heirTrait;
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
    const wb = weatherFor(new Date(t));
    applyEvents(stepSim(s, rawDt, { simNow: t, weatherBonus: sicknessBonus(wb) }));
  }
  if (s.divingUntil && t >= s.divingUntil && !s.gameOver && !s.away) resolveDive();
  if (s.stage !== 'egg' && ensureDaily(s, t)) {
    // minuit vient de passer : nouvelles quêtes, série, surprise du jour
    persist();
    checkStreak();
    ui.log('✨ Nouveau jour ! ' + dailyEvent(dayKey(t)).label);
  }
  ui.updateHUD(s, mg, rec);
  updatePlaceBtn();  // la tanière n'est accessible que quand la loutre est là (hors œuf/héron/mini-jeu)
  maybeHint();       // révèle une astuce de geste une fois le tuto de base terminé
  maybeStory();      // un chapitre vient peut-être de se débloquer (évolution en direct/au retour)
  maybeSeasonCard(); // la saison a peut-être tourné (minuit / retour d'absence)
  updateCoach();     // garde le surlignage du tutoriel en phase (dodo, overlays…)
  seasonHint();      // rappelle le contre-geste si le froid/la chaleur la malmène
  syncMusic(); // (re)démarre dès que l'audio est débloqué, coupe si veille/fin
  // Télémétrie : un ping par jour, jamais pendant l'œuf, ID généré au 1er envoi.
  if (s && canSendTelemetry(s) && s.lastTelemetryDay !== dayKey(t)) {
    if (!s.telemetryId) s.telemetryId = newTelemetryId();
    s.lastTelemetryDay = dayKey(t);
    sendTelemetry(s, rec, curLevel());
    persist();
  }
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

/* ---------------- Game feel : hit-stop, screen-shake, feedback calibré ---------------- */
let freezeUntil = 0, shakeAmp = 0, shakeMs = 1, shakeStart = 0;
const reducedMotion = () => !!(s && s.reduceMotion);
/** Gel bref à l'impact : donne du poids aux gros moments. */
function hitStop(ms) { if (!reducedMotion()) freezeUntil = Math.max(freezeUntil, now() + ms); }
/** Secousse d'écran amortie (px), coupée en mouvement réduit. */
function screenShake(amp, ms) { if (reducedMotion()) return; shakeAmp = amp; shakeMs = ms; shakeStart = now(); }
/** Combo de feedback calibré par intensité. */
function feel(tier) {
  if (tier === 'soft') screenShake(1.2, 90);
  else if (tier === 'med') { screenShake(2.4, 160); hitStop(35); }
  else if (tier === 'big') { screenShake(5, 340); hitStop(80); }
}
function applyShake() {
  if (!cv) return;
  const t = now() - shakeStart;
  if (shakeAmp > 0 && t < shakeMs) {
    const k = (1 - t / shakeMs) * shakeAmp;
    cv.style.transform = 'translate(' + ((Math.random() * 2 - 1) * k).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * k).toFixed(1) + 'px)';
  } else if (shakeAmp > 0) { shakeAmp = 0; cv.style.transform = ''; }
}

function loop() {
  // hit-stop : on gèle l'animation de la scène (le compteur de frames), jamais la
  // logique de jeu — un mini-jeu en cours continue toujours de tourner.
  const frozen = !mg && now() < freezeUntil;
  if (!frozen) frame++;
  if (mg) {
    // les techniques et la chance portée valent aussi PENDANT la partie
    const jb = jeuBuffs(rec, equipBonus(s));
    const res = mg.mode === 'slide'
      ? tickSlide(mg, now(), Math.random, jb)
      : mg.mode === 'garden'
      ? tickGarden(mg, now(), Math.random)
      : tickGame(mg, now(), Math.random, jb);
    if (res) (mg.mode === 'slide' ? endSlide : mg.mode === 'garden' ? endGarden : endGame)(res);
  }
  if (!frozen && s && s.place === 'monde') stepWorld();
  // créatures sur la berge : déplacement + attaque
  if (!frozen && s && s.place === 'berge' && berCreatures.length) {
    tickCreatures(berCreatures, s.ox || 80, s.oy || 100, now(), Math.random);
    const atk = checkAttack(berCreatures, s.ox || 80, s.oy || 100);
    if (atk && now() > (s.lastCreatureHit || 0) + 2000) {
      s.health = clamp(s.health - 5, 0, 100);
      s.lastCreatureHit = now();
      R.hurtOtter();
      sfx.sad(); vibrate(20); ui.shake();
      ui.log(atk.name + ' te blesse ! (-5 santé) 🩸');
      seeCreature(rec, atk.id);
      persist();
    }
  }
  // Le DUEL TOUR-PAR-TOUR avance en temps réel : le moteur fait naître et tomber les
  // coups au fil de l'horloge, et l'arène se redessine à chaque image tant que le
  // combat tourne.
  if (battle && !battle.over) {
    stepBattle(battle, now());
    ui.updateBattleUI(battle, now());
  }
  if (battle && battle.over) onDuelOver();
  R.render(s, mg, frame, {
    wobble: s && now() < wobbleUntil,
    diving: diving(),
    foe: battle ? battle.foe : null,
    dragFood,
    owned: rec ? rec.items : null,
    memorial: (rec && s && s.place === 'taniere') ? rec.memorial : null,   // portraits de la lignée (v4.1)
    world: (s && s.place === 'monde') ? world : null,
    level: curLevel(),
    hint: (s && activeHint) ? hintTargetFor(activeHint) : null,
    weather: (s && s.place === 'berge') ? weatherFor(new Date()) : null,
    creatures: (s && s.place === 'berge') ? berCreatures : null
  });
  if (R.consumeFetch()) onFetchDone(); // la loutre vient de rapporter la balle
  applyShake();
  requestAnimationFrame(loop);
}

/* ---------------- Boot ---------------- */
function boot() {
  registerSW();
  requestPersistentStorage();
  setupInstall($('b-install'), $('ios-hint'));
  // iPhone/iPad en onglet Safari : les rappels exigent l'app installée -> on prévient d'emblée
  if (isIOS() && !isStandalone()) $('push-note').classList.remove('hidden');
  $('ver').textContent = 'Ma Petite Loutre · v' + GAME_VERSION;

  rec = loadRecords(storage);
  prevHats = new Set(unlockedHats(rec));
  prevFurs = new Set(unlockedFurs(rec));
  ui.renderLevel(rec);
  refreshGift();

  const prev = loadState(storage);
  if (prev) {
    s = prev;
    // Le Monde est une excursion runtime (world non persisté) : on rentre à la berge au boot.
    if (s.place === 'monde') s.place = 'berge';
    // migration : une loutre déjà nommée d'avant v3.10 reçoit un caractère (déterministe)
    if (s.name && s.stage !== 'egg' && !s.trait) s.trait = s.heirTrait || pickTrait(() => (s.born % 1000) / 1000);
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
  updatePlaceBtn();

  $('btn-start').addEventListener('click', () => { sfx.press(); vibrate(15); enableMotion(); startNew(); });
  window.addEventListener('devicemotion', onMotion);
  $('btn-name').addEventListener('click', () => {
    let n = $('name-input').value.trim();
    if (!n) n = 'Loutrette';
    s.name = n.slice(0, 12);
    if (!s.trait) s.trait = s.heirTrait || pickTrait(); // le trait de la lignée, ou le sien propre
    ui.hideOverlay('ovl-name');
    ui.toast('💛 Bienvenue, ' + s.name + ' ! 💛');
    // La lignée : on annonce l'ascendance et le trait transmis (Phase 1).
    if (s.heirOf) {
      const tr = traitById(s.trait);
      const herite = s.heirTrait && s.trait === s.heirTrait;
      ui.log('🕊️ ' + s.name + ', génération ' + (s.generation || 2) + ', descend de ' + s.heirOf + '. ' +
        (herite && tr ? 'Elle tient d\'elle son caractère ' + tr.emoji + ' ' + tr.name.toLowerCase() + '.' : 'Elle trace sa propre voie.'));
    }
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
  $('b-dojo').addEventListener('click', openDojo);        // Dojo de parade (v4.0)
  $('dojo-parry').addEventListener('click', dojoTap);
  $('b-care').addEventListener('click', actCare);

  // Combat de loutres : une sauvage à défier tout de suite (ou le code d'un ami)
  let wildRoll = 0;                       // change d'adversaire sans quitter l'écran
  // l'adversaire se cale sur la forme réelle de la loutre -> duels serrés
  const rollWildFoe = () => wildFoe(curLevel(), 'wild|' + dayKey() + '|' + wildRoll, makeFighter(s, equipBonus(s)));
  /** Lance un combat contre la carte donnée. */
  const startBattle = (card, seed, foeMult) => {
    if (!card) return;
    const techIds = playerTechniques(rec);
    battle = newBattle(s, card, seed,
      { bonus: equipBonus(s), buffs: combatBuffs(rec), foeMult: foeMult || 1, level: curLevel(), now: now(), techIds });
    battleDone = false;
    rec.battles++;
    persistRec();
    ui.shake();
    sfx.evolve(); vibrate([20, 40, 20]);
    ui.updateBattleUI(battle, now());
    gainXp(XP.battle);
    quest('battles');
  };
  /** Ouvre l'arène sur l'écran de préparation (adversaire sauvage proposé). */
  const openBattle = () => {
    if (!unlocked('battle')) { ui.log('⚔️ Les combats s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + ' ! ⭐'); return; }
    sfx.press();
    battle = null;
    ui.renderBattleSetup(rollWildFoe(), s, rec);
    ui.showOverlay('ovl-battle');
  };
  $('b-battle').addEventListener('click', () => {
    if (busy() || s.sleeping) return;
    openBattle();
  });
  battleStarter = startBattle;   // les rencontres du monde peuvent lancer un combat
  $('bt-wild').addEventListener('click', () => startBattle(rollWildFoe(), 'wild|' + dayKey() + '|' + wildRoll));
  $('bt-reroll').addEventListener('click', () => { wildRoll++; sfx.press(); ui.renderBattleSetup(rollWildFoe(), s, rec); });
  $('bt-again').addEventListener('click', () => { wildRoll++; ui.renderBattleSetup(rollWildFoe(), s, rec); });
  $('bt-close').addEventListener('click', () => { battle = null; epreuveEnCours = null; ui.hideOverlay('ovl-battle'); });
  $('bt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bt-mycode').value); ui.toast('📋 Code copié !'); }
    catch (e) { try { $('bt-mycode').select(); document.execCommand('copy'); ui.toast('📋 Code copié !'); } catch (e2) {} }
  });
  $('bt-start').addEventListener('click', () => {
    const card = decodeCard($('bt-foecode').value);
    if (!card) { ui.toast('❌ Code de combat invalide'); return; }
    startBattle(card, encodeCard(s) + $('bt-foecode').value.trim());
  });
  // Sélection d'une technique dans le duel tour-par-tour.
  const duelAct = (techId) => {
    if (!battle || battle.over) return;
    duelInput(battle, techId, now());
    vibrate(6);
    const fk = battle.feedback && battle.feedback.kind;
    if (fk === 'strike') { sfx.catch(); feel('soft'); }
    else if (fk === 'hurt') { sfx.sad(); ui.shake(); }
    else sfx.press();
    ui.updateBattleUI(battle, now());
    if (battle.over) onDuelOver();
  };
  // Les boutons de technique sont créés dynamiquement par updateBattleUI
  ui.setDuelAct(duelAct);

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
    // iPhone/iPad : les notifications web n'existent QUE dans l'app installée sur
    // l'écran d'accueil et lancée depuis son icône — jamais dans un onglet Safari.
    if (isIOS() && !isStandalone()) {
      $('ios-hint').classList.remove('hidden');   // révèle la marche à suivre (Partager → écran d'accueil)
      ui.log('📲 Sur iPhone, les rappels ne marchent que dans l\'app installée : appuie sur Partager ⎋ en bas de Safari, choisis « Sur l\'écran d\'accueil », puis rouvre Loutre depuis son icône et réactive les rappels ici. (iOS 16.4+)');
      ui.toast('📲 iPhone : installe l\'app d\'abord (voir en bas).');
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
      ui.toast(isIOS()
        ? 'Notifications refusées — Réglages iPhone › Loutre › Notifications pour les réautoriser.'
        : 'Notifications refusées — réactivable dans les réglages du navigateur.');
    } else {
      ui.toast(isIOS()
        ? 'Rappels indisponibles : il faut iOS 16.4 ou plus récent.'
        : 'Rappels indisponibles sur ce navigateur.');
    }
  });
  $('b-telemetry').addEventListener('click', () => {
    sfx.press();
    s.telemetry = !s.telemetry;
    $('b-telemetry').textContent = '📊 STATISTIQUES ANONYMES : ' + (s.telemetry ? 'OUI' : 'NON');
    persist();
    ui.toast(s.telemetry ? '📊 Statistiques anonymes activées.' : '📊 Statistiques anonymes désactivées.');
  });
  const livingLabel = () => { const b = $('b-living'); if (b) b.textContent = '🗣️ DIALOGUES VIVANTS : ' + (s && s.livingDialogues ? 'OUI' : 'NON'); };
  $('b-living').addEventListener('click', () => {
    sfx.press();
    s.livingDialogues = !s.livingDialogues;
    livingLabel();
    persist();
    ui.toast(s.livingDialogues
      ? '🗣️ Dialogues vivants activés — les habitants varient leur accueil.'
      : '🗣️ Dialogues vivants coupés — retour aux dialogues écrits.');
  });
  $('b-reset').addEventListener('click', () => {
    const passe = isRealOtter(s)
      ? (s.name || 'Ta loutre') + ' rejoindra la lignée (mémorial et portraits, dans le Carnet 📖) et un œuf reprendra le fil — la suivante héritera souvent de son caractère.'
      : 'Repartir d\'un nouvel œuf ?';
    ui.askConfirm('Passer le relais à une nouvelle loutre ?\n' + passe + '\n(chapeaux et succès conservés)', () => {
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
    },
    // Acheter un TRÉSOR avec des gemmes. Réservé aux trouvables (drop:true) :
    // les exclusifs de palier se gagnent en montant de niveau. On l'équipe.
    onBuyTresor(id) {
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
      prevHats = new Set(unlockedHats(rec));
      prevFurs = new Set(unlockedFurs(rec));
      persist(); persistRec();
      sfx.levelup(); vibrate([20, 40, 20]);
      if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
      ui.toast(item.icon + ' Acheté : ' + item.name + ' ! (−' + prix + ' 💎)');
      ui.renderLevel(rec);
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    });
  }
  // exposé pour les tests (le banc jsdom pilote l'achat via ces gestionnaires)
  if (window.__loutre) window.__loutre.__wardrobeHandlers = wardrobeHandlers;
  // La garde-robe s'ouvre SUR L'ONGLET voulu : chaque slot du profil est un
  // raccourci distinct (chapeau, pelage, décor, trésors) — plus un doublon.
  const openWardrobe = (tab) => {
    sfx.press();
    ui.hideOverlay('ovl-menu');
    ui.renderWardrobe(s, rec, wardrobeHandlers, tab);
    ui.showOverlay('ovl-hats');
  };
  const SLOT_TAB = { 'ps-hat': 'hats', 'ps-fur': 'furs', 'ps-gear': 'tresors', 'ps-decor2': 'decors' };
  for (const [id, tab] of Object.entries(SLOT_TAB)) {
    const el = $(id); if (el) el.addEventListener('click', () => openWardrobe(tab));
  }
  $('btn-hats-close').addEventListener('click', () => ui.hideOverlay('ovl-hats'));

  // ── Le Marché (v3.96) : le HUB économique. Il ne réinvente rien — il RASSEMBLE
  //    et rend visible ce qui existait, éparpillé (garde-robe, troc, atelier,
  //    recrutement). Surtout, il rend le troc atteignable sans marcher jusqu'au lac.
  const marcheHandlers = {
    cosmetics: () => { ui.hideOverlay('ovl-marche'); openWardrobe('hats'); },
    troc: () => { ui.hideOverlay('ovl-marche'); openBarter(); },
    atelier: () => { ui.hideOverlay('ovl-marche'); openWorkshop(); },
    recrutement: () => { ui.hideOverlay('ovl-marche'); openGang(); }
  };
  const openMarche = (focus) => {
    if (!rec) return;
    sfx.press(); ui.hideOverlay('ovl-menu');
    ui.renderMarche({ fish: rec.fish, shells: rec.shells, gems: rec.gems, focus: focus || null }, marcheHandlers);
    ui.showOverlay('ovl-marche');
    if (!rec.marcheSeen) { rec.marcheSeen = true; persistRec(); ui.toast('🪙 Voici ta bourse — dépense 🐟 🐚 💎 ici !'); }
  };
  $('pt-marche').addEventListener('click', () => openMarche());
  // La bourse du HUD est TAPPABLE : 🐟 / 🐚 / 💎 ouvrent le Marché (stats → argent).
  [['gems', 'gem'], ['pill-fish', 'fish'], ['pill-shell', 'shell']].forEach(([id, key]) => {
    const el = $(id); if (!el) return;
    el.addEventListener('click', () => openMarche(key));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMarche(key); } });
  });

  // Carte photo (accessible depuis Succès)
  $('b-photo').addEventListener('click', openPhoto);
  $('b-place').addEventListener('click', togglePlace);
  // sans la lambda, l'événement du clic arriverait en guise de zone demandée
  $('b-world').addEventListener('click', () => enterWorld());
  $('b-world-back').addEventListener('click', exitWorld);
  $('enc-fish').addEventListener('click', () => encHandlers.offer());
  $('enc-fight').addEventListener('click', () => encHandlers.fight());

  // L'Almanach de saison (v3.99) : le bouton 🎁 ouvre la piste de 8 paliers gratuits
  // (l'ancien cadeau unique en est le palier final). Réclamation palier par palier.
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
  const openAlmanach = () => { if (!rec) return; sfx.press(); refreshAlmanach(); ui.showOverlay('ovl-almanach'); };
  $('b-gift').addEventListener('click', openAlmanach);
  $('ovl-cheer').addEventListener('click', ui.closeCheer); // fermer la célébration au toucher
  $('btn-photo-share').addEventListener('click', sharePhoto);
  $('btn-photo-save').addEventListener('click', savePhoto);
  $('btn-photo-close').addEventListener('click', () => { cardCv = null; ui.hideOverlay('ovl-photo'); });

  // Succès
  const openAch = () => {
    sfx.press();
    ui.hideOverlay('ovl-menu');
    if (s && s.stage !== 'egg') ensureDaily(s, now());
    ui.renderAchievements(rec, s);
    // Succès consultés : on éteint le badge de notif jusqu'aux prochains débloqués.
    if (rec) { rec.achSeen = (rec.achievements || []).length; persistRec(); ui.renderLevel(rec); }
    ui.showOverlay('ovl-ach');
  };
  $('b-ach').addEventListener('click', openAch);
  { const el = $('ps-ach'); if (el) el.addEventListener('click', openAch); }

  // Le Carnet du naturaliste (v3.98) : unifie bestiaire + trouvailles + records.
  let carnetSection = 'bestiaire';
  const refreshCarnet = () => ui.renderCarnet(rec, s, carnetSection, {});
  const openCarnet = () => {
    if (!rec) return;
    sfx.press(); ui.hideOverlay('ovl-menu');
    carnetSection = 'bestiaire';
    refreshCarnet();
    ui.showOverlay('ovl-carnet');
  };
  $('pt-carnet').addEventListener('click', openCarnet);
  document.querySelectorAll('#carnet-tabs .carnet-tab').forEach(tab => {
    tab.addEventListener('click', () => { carnetSection = tab.getAttribute('data-sec'); sfx.press(); refreshCarnet(); });
  });

  // Escouade (gang) : création, recrutement (se paie en POISSONS 🐟, prix doux
  // progressif selon la taille de l'escouade — fini l'XP-monnaie), combats de bande.
  const gangBoard = () => {
    const cost = recruitFishCost((rec.gang && rec.gang.members.length) || 0);
    return recruitBoard(curLevel(), dayKey(), 3)
      .map(c => ({ ...c, cost, recruited: isRecruited(c.id) }));
  };
  const refreshGang = () => ui.renderGang(rec, s, gangHandlers, gangBoard());
  const gangHandlers = {
    create: (name, emblem) => {
      rec.gang = makeGang(name, emblem, s);
      persistRec(); sfx.happy(); vibrate(12);
      ui.renderProfile(s, rec, worldTravelHandler()); refreshGang();
    },
    recruit: (c) => {
      if (!rec.gang || rec.gang.members.length >= MAX_MEMBERS) return;
      const cost = recruitFishCost(rec.gang.members.length);
      if ((rec.fish || 0) < cost) { ui.toast('🐟 Pas assez de poissons — il en faut ' + cost + '.'); sfx.sad(); vibrate(20); return; }
      if (recruit(rec.gang, c)) {
        rec.fish -= cost; markRecruited(c.id);
        persistRec(); sfx.happy(); vibrate(12);
        ui.renderProfile(s, rec, worldTravelHandler()); refreshGang();
        ui.updateHUD(s, mg, rec);
      }
    },
    battle: () => {
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
      ui.renderProfile(s, rec, worldTravelHandler());
      ui.renderGangResult(res, rival, rec.gang, gangHandlers);
    },
    back: () => refreshGang()
  };
  const openGang = () => {
    sfx.press();
    ui.hideOverlay('ovl-menu');
    refreshGang();
    ui.showOverlay('ovl-gang');
  };
  $('pt-gang').addEventListener('click', openGang);
  $('pt-atelier').addEventListener('click', openWorkshop);   // atelier de trésors (É5)
  $('pt-crue').addEventListener('click', openCrue);          // La Crue de la semaine (É5b)

  // la bannière de quête ouvre le détail (quêtes + succès)
  $('quest').addEventListener('click', openAch);
  $('quest').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openAch(); });
  // …et le chevron la replie/déplie (état persisté), sans ouvrir le détail (É4)
  const qtg = $('quest-toggle');
  if (qtg) qtg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!s) return;
    s.questCollapsed = !s.questCollapsed;
    sfx.press(); vibrate(6);
    persist();
    ui.renderDailies(s, rec);
  });
  // barre d'actions qui s'estompe au repos, se réveille au moindre geste (É4)
  ['pointerdown', 'keydown'].forEach(ev =>
    document.addEventListener(ev, wakeActionbar, { passive: true }));
  wakeActionbar();
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

  // Réglages : export / import / reset. Ouvert depuis le menu de la pastille.
  const openSettings = () => {
    sfx.press();
    $('exp-code').value = s ? exportSave(s, rec) : '';
    $('imp-code').value = '';
    $('b-music').textContent = '🎵 MUSIQUE : ' + (s && s.music !== false ? 'OUI' : 'NON');
    updateVolumeLabel();
    updateA11yLabels();
    $('b-push').textContent = '🔔 RAPPELS : ' + (s && s.push ? 'OUI' : 'NON');
    $('b-telemetry').textContent = '📊 STATISTIQUES ANONYMES : ' + (s && s.telemetry !== false ? 'OUI' : 'NON');
    livingLabel();
    ui.showOverlay('ovl-set');
  };

  // La pastille de niveau ouvre l'écran « Profil de la loutre ».
  $('lvl-badge').addEventListener('click', () => { sfx.press(); ui.renderProfile(s, rec, worldTravelHandler()); ui.showOverlay('ovl-menu'); });
  $('m-gear').addEventListener('click', () => { ui.hideOverlay('ovl-menu'); openSettings(); });
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
  prevFurs = new Set(unlockedFurs(rec));
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
  cv.addEventListener('pointermove', onCanvasMove);
  cv.addEventListener('pointerup', onCanvasUp);
  cv.addEventListener('pointercancel', onCanvasUp);
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
    'ovl-menu': () => ui.hideOverlay('ovl-menu'),
    'ovl-gang': () => ui.hideOverlay('ovl-gang'),
    'ovl-barter': () => ui.hideOverlay('ovl-barter'),
    'ovl-workshop': () => { workshopChoice = null; ui.hideOverlay('ovl-workshop'); },
    'ovl-crue': () => ui.hideOverlay('ovl-crue'),
    'ovl-marche': () => ui.hideOverlay('ovl-marche'),
    'ovl-carnet': () => ui.hideOverlay('ovl-carnet'),
    'ovl-almanach': () => ui.hideOverlay('ovl-almanach'),
    'ovl-dojo': closeDojo,
    'ovl-encounter': () => closeEncounter(false),
    'ovl-hats': () => ui.hideOverlay('ovl-hats'),
    'ovl-ach': () => ui.hideOverlay('ovl-ach'),
    'ovl-set': () => ui.hideOverlay('ovl-set'),
    'ovl-photo': () => { cardCv = null; ui.hideOverlay('ovl-photo'); },
    'ovl-battle': () => { battle = null; epreuveEnCours = null; ui.hideOverlay('ovl-battle'); }
  };
  for (const [id, close] of Object.entries(overlayClosers)) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('click', (e) => {
      if (e.target !== el) return; // un vrai toucher "à côté", pas sur un bouton
      if (id === 'ovl-battle' && battle && !battle.over) return;
      sfx.press();
      close();
    });
    const x = el.querySelector('.ovl-x');
    if (x) x.addEventListener('click', () => { sfx.press(); close(); });
  }
  // Touche Échap pour fermer l'overlay visible
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Confirm : Échap = NON
    const confirmEl = $('ovl-confirm');
    if (confirmEl && !confirmEl.classList.contains('hidden')) {
      sfx.press();
      $('btn-confirm-no').click();
      return;
    }
    for (const [id, close] of Object.entries(overlayClosers)) {
      const el = $(id);
      if (el && !el.classList.contains('hidden')) {
        if (id === 'ovl-battle' && battle && !battle.over) return;
        sfx.press();
        close();
        return;
      }
    }
  });

  checkStreak(); // la visite du jour compte pour la série 🔥
  // Rappels : on répare un abonnement perdu (iOS le lâche parfois) plutôt que
  // d'échouer en silence. Si c'est irrécupérable, l'état devient honnête (NON)
  // pour que le joueur puisse les réactiver depuis ⚙️ Réglages.
  if (s && s.push) {
    push.ensureSubscribed(s).then((r) => {
      if (r !== 'ok' && s) {
        s.push = false; persist();
        const b = $('b-push'); if (b) b.textContent = '🔔 RAPPELS : NON';
        ui.log('🔔 Les rappels s\'étaient désactivés — réactive-les dans ⚙️ Réglages.');
      }
    });
  }

  setInterval(tick, 1000);
  requestAnimationFrame(loop);
}

// Hooks de debug / tests automatisés
window.__loutre = {
  get state() { return s; },
  get records() { return rec; },
  get minigame() { return mg; },
  get world() { return world; },
  get enc() { return encounterOtter; },
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
