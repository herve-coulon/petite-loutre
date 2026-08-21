// Orchestrateur : relie simulation, rendu, UI, audio et PWA.
import {
  SEC, MIN, clamp, TREAT_CD, DIVE_MS, GRUMPY_MS, WAKE_OK_ENERGY, GEM_TREAT, GEM_HEAL,
  WARM_BOOST, WARM_CD, SHAKE_BOOST, SHAKE_CD, SHAKE_G,
  SEASON_FX, UNLOCK_LEVEL, GAME_VERSION, STAGES, SAVE_KEY
} from './constants.js';
import { setupStreak, checkStreak } from './streak-controller.js';
import { setupHeron, actCare } from './heron-controller.js';
import { setupTreasure, tryDrop } from './treasure-controller.js';
import { setupSlots, openSlots } from './slots-controller.js';
import { setupMarche, openBarter, openWorkshop, openMarche, closeWorkshop } from './marche-controller.js';
import {
  setupWorld, enterWorld, exitWorld, stepWorld, worldTravelHandler, worldPointer,
  getWorld, getEnc, epreuvesGagnees, coffresOuverts, onDuelOverBridge, resetBattleDone, clearEpreuve
} from './world-controller.js';
import { greeting } from './mood.js';
import * as push from './push.js';
import { canSendTelemetry, sendTelemetry, newTelemetryId } from './telemetry.js';
import { setupShare, openPhoto, sharePhoto, savePhoto, closePhoto, shareDayResult } from './share-controller.js';
import { dailyEvent, butterflyPos } from './events.js';
import * as music from './music.js';
import * as ambient from './ambient.js';
import { XP, levelFromXp, titleFor, levelUpGems } from './level.js';
import { bumpQuest, completedQuests, ensureDaily, dayKey, questContext } from './quests.js';
import { addSeasonTreat } from './seasonpass.js';
import { ALMANACH_TIERS, tierState, almanachProgress, almanachCompletion, almanachHasClaimable, claimTier } from './almanach.js';
import { setupDojo, openDojo, dojoTap, closeDojo } from './dojo-controller.js';

import {
  newState, saveState, loadState, clearSave,
  loadRecords, saveRecords, exportSave, importSave, REC_KEY
} from './state.js';
import { slotKey, clampSlot } from './slots.js';
import { stepSim, simulateOffline, ageMs } from './sim.js';
import { newGame, tickGame, clickGame, WATER_Y } from './minigame.js';
import { recruitFishCost, MEAL_HUNGER } from './economy.js';
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
import { setupCombat, wireCombat, startBattle, stepCombat, getBattle as currentBattle, battleActive, closeBattle } from './combat-controller.js';
import { setupSoins, actTreat, actDive, resolveDive, actFeed, actWash, actSleep, actHeal } from './soins-controller.js';
import { setupJeux, actPlay, endGame, actSlide, actGarden, endSlide, endGarden, onFetchDone } from './jeux-controller.js';
import { setupCoach, updateCoach, maybeStory, maybeSeasonCard, seasonHint, maybeHint, hintDone, currentHintTarget, suppressHint } from './coach-controller.js';
import { jeuBuffs, PASSIVE_TECHNIQUES } from './skills.js';
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
import { nextBeat, markSeen, coachStep } from './story.js';
import { seasonFor, seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { weatherFor, sicknessBonus } from './weather.js';
import { RARITIES, itemById, milestoneItem, describeBonus, cosmeticPrice, treasurePrice } from './items.js';
import { pickTrait, traitById, isFavorite, favoriteLine, bondGain, bondLevel } from './personality.js';
import { makeAncestor, inheritTrait, isRealOtter } from './lineage.js';
import { endOfLife, isElder } from './lifecycle.js';
import { remembrance } from './memory.js';
import { esc } from './util.js';
import { setupCrue, currentCrue, openCrue, maybeNotifyCrue, crueDuelActive, resolveCrueDuel, crueBannerOnce } from './crue-controller.js';

const $ = id => document.getElementById(id);
const now = () => Date.now();
const rawStore = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const SLOT_PTR = 'petite_loutre_slot';   // pointeur (localStorage brut) : quel slot est actif

// Un « storage » qui redirige les clés de sauvegarde (état + records) vers le slot
// actif. Tout le reste (persist, boot, hors-ligne) l'utilise sans le savoir : le
// chemin chaud reste synchrone et inchangé. Slot 1 = clés d'origine (compat totale).
function makeSlotStorage(raw, slot) {
  if (!raw) return raw;
  const remap = { [SAVE_KEY]: slotKey(SAVE_KEY, slot), [REC_KEY]: slotKey(REC_KEY, slot) };
  return {
    getItem: (k) => raw.getItem(remap[k] || k),
    setItem: (k, v) => raw.setItem(remap[k] || k, v),
    removeItem: (k) => raw.removeItem(remap[k] || k)
  };
}
let activeSlot = rawStore ? clampSlot(+(rawStore.getItem(SLOT_PTR) || 1)) : 1;
let storage = makeSlotStorage(rawStore, activeSlot);

let s = null;
let rec = null;               // records globaux (toutes loutres confondues)
let prevHats = new Set();     // pour détecter les nouveaux déblocages
let prevFurs = new Set();     // idem pour les pelages, qu'on n'annonçait pas
let mg = null;
let berCreatures = []; // créatures vivantes sur la berge
// Le duel (état `battle`) et son lanceur vivent dans combat-controller.js (M5,
// tranche 10). main.js le lit via currentBattle() et fait avancer via stepCombat().
let frame = 0;
let dragFood = null;          // {x,y} quand on glisse le poisson vers la loutre (px canvas)
let draggingBall = false;     // vrai pendant qu'on tient la balle pour la lancer
let wobbleUntil = 0, lastWarm = 0, lastPet = 0, lastSave = 0, lastTickAt = now();
const isRecruited = id => !!rec && Array.isArray(rec.recruited) && rec.recruited.includes(id);
const markRecruited = id => { if (rec && !isRecruited(id)) (rec.recruited = rec.recruited || []).push(id); };
const BEFRIEND_NEED = 3;      // nombre d'attentions pour amadouer une loutre sauvage

/* ---------------- Garde-fous globaux ----------------
   Erreur inattendue (runtime, promesse rejetée…) : on sauvegarde et on prévient
   clairement au lieu d'un écran figé sans explication. Throttlé : une alerte
   max par 30 s. */
let lastCrashToast = 0;
function onGlobalError() {
  try { saveState(s, storage, now()); } catch (e) {}
  const t = now();
  if (t - lastCrashToast > 30 * SEC) {
    lastCrashToast = t;
    ui.toast('⚠️ Une erreur inattendue est survenue — ta progression est sauvegardée. Recharge la page si le jeu se fige.');
  }
}
window.addEventListener('error', onGlobalError);
window.addEventListener('unhandledrejection', onGlobalError);

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
    if (ev.type === 'critical') {
      // Détresse : santé à zéro, mais elle T'ATTEND (grâce). On alerte, même au retour.
      if (!offline) { if (sfx.over) sfx.over(); ui.shake(); vibrate([30, 50, 30]); }
      ui.log('💔 ' + (s.name || 'Ta loutre') + ' est à bout de forces… Occupe-toi vite d\'elle (nourris-la, soigne-la 💊) avant qu\'elle ne parte chez le héron !');
      continue;
    }
    if (offline) continue; // le reste est résumé au retour
    if (ev.type === 'rescued') {
      ui.log('💚 Ouf… ' + (s.name || 'Elle') + ' reprend des forces. Tu l\'as sauvée à temps. 🫂');
      continue;
    }
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
  return questContext(curLevel(), s && s.place === 'monde');
}
const UNLOCK_LABEL = { treat: '🍡 Friandise', slide: '🛝 Toboggan', battle: '⚔️ Combat', dive: '🤿 Plongée' };
/** Activités qui s'ouvrent en passant de `before` à `after` (annonce de palier). */
function featuresOpenedBetween(before, after) {
  return Object.keys(UNLOCK_LABEL)
    .filter(f => before < UNLOCK_LEVEL[f] && after >= UNLOCK_LEVEL[f])
    .map(f => UNLOCK_LABEL[f]);
}

// Soins (friandise, repas, bain, dodo, soin/trousse, plongée) -> soins-controller.js
// (M5, tranche 11). Câblés au boot par setupSoins({...}). resolveDive() est
// appelé par tick() ; les boutons b-feed/b-wash/… par le câblage du boot.

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

// Mini-jeux (pêche, toboggan, jardin : lancement + clôture) -> jeux-controller.js
// (M5, tranche 12). Câblés au boot par setupJeux({...}). endGame/endSlide/
// endGarden appelés par la boucle ; onFetchDone par la boucle (retour de balle).

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

/* ---------------- Le Monde — extrait dans world-controller.js (audit M5, tranche 9) ---------------- */
// L'état runtime world/encounterOtter et toutes les fonctions du Monde (balade,
// rencontres, recrutement, épreuves, chasseur, coffres, trouvailles) vivent
// désormais dans world-controller.js ; contexte injecté au boot via setupWorld.

/* ---------------- Canvas (pêche, caresses, œuf) ---------------- */
function onCanvasPointer(e) {
  const { x, y } = canvasXY(e);
  // hitbox élargie au doigt, puis par la technique « Œil de pêcheuse »
  const pad = (e.pointerType === 'touch' ? 8 : 4) + (mg ? jeuBuffs(rec, equipBonus(s)).pad : 0);

  if (mg) {
    if (mg.mode === 'slide') { setSlideLane(mg, laneAt(x)); vibrate(6); }
    else if (mg.mode === 'garden') {
      // clic : récolter un parterre EN FLORAISON (points selon le timing) ou arroser une pousse
      const got = harvestAt(mg, x, y, pad, now());
      if (got) {
        const rareTag = got.rare ? ' rare 🌷' : '';
        if (got.perfect) {
          sfx.gardenHarvest(); vibrate([8, 30, 8]); feel('med'); R.burst('confetti', 8, s.stage);
          ui.toast('✨ Parfait' + rareTag + ' ! +' + got.points);
        } else {
          sfx.gardenHarvest(); vibrate(6); feel('soft'); R.burst('sparkle', 4, s.stage);
          ui.toast('🌸 Récoltée' + rareTag + ' +' + got.points + ' (vise la pleine floraison !)');
        }
      } else if (waterAt(mg, x, y)) {
        sfx.gardenWater(); vibrate(4); ui.toast('💧 Arrosée — elle mûrit plus vite !');
      }
    }
    else if (clickGame(mg, x, y, pad)) { R.splashAt(x, y); sfx.catch(); vibrate(8); feel('soft'); }
    return;
  }
  if (s && !s.gameOver) {
    if (s.stage === 'egg') { actWarm(); return; }
    if (s.away) return; // elle n'est pas là — le bouton du héron fait le travail

    // dans le Monde : on guide la loutre au toucher (world-controller.js)
    if (s.place === 'monde') {
      worldPointer(x, y);
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

/* ---------------- Troc / Atelier / Marché — extraits dans marche-controller.js (audit M5) ---------------- */
// openBarter / openWorkshop / openMarche sont importés de marche-controller.js ;
// le contexte (état, records, persist, openWardrobe, openGang) est injecté via setupMarche.

// Les défis du jour (v4.5) : détail sur demande, via la pastille 🎯.
function openQuests() { if (!s || !s.qDaily) return; sfx.press(); ui.renderQuestList(s, rec); ui.showOverlay('ovl-quests'); }

// Le souvenir jouable (v4.3) : rejouer le rêve d'une aïeule de la lignée.
function openSouvenir(anc) { if (!anc) return; sfx.press(); vibrate(8); ui.openSouvenir(anc, remembrance(anc)); }

/* ---------------- Les slots de sauvegarde (v4.4) ----------------
   Plusieurs loutres en parallèle, chacune dans son monde isolé. On sauvegarde le
   slot courant, on déplace le pointeur, et on recharge la page : le SW rend ça
   instantané et hors-ligne, et on repart d'un état 100 % propre (zéro résidu). */
function reloadApp() { try { location.reload(); } catch (e) {} }

function loadSlotState(slot) { return loadState(makeSlotStorage(rawStore, slot)); } // lecture seule

// Bascule vers `target` : on sauve le slot COURANT, on déplace le pointeur, puis on
// recharge. On NE réoriente PAS le `storage` en place — sinon un tick tardif écrirait
// la loutre courante dans le slot cible. Le boot chargera le slot cible proprement.
let switching = false;
function commitSlot(target) {
  persist(); persistRec();                 // fige le slot courant (storage = slot courant)
  switching = true;                        // gèle les écritures jusqu'au reload
  if (rawStore) rawStore.setItem(SLOT_PTR, String(clampSlot(target)));
}
// Effacer les clés d'un AUTRE emplacement (le contrôleur garde le garde-fou « pas l'actif »).
function deleteSlotKeys(target) {
  if (rawStore) { rawStore.removeItem(slotKey(SAVE_KEY, target)); rawStore.removeItem(slotKey(REC_KEY, target)); }
}
/* L'écran de gestion des slots est extrait dans slots-controller.js (audit M5) —
   openSlots y vit ; le cœur ci-dessus (storage, switching, commitSlot) reste ici. */

/* ---------------- Atelier (É5) — extrait dans marche-controller.js (audit M5) ---------------- */

/* ---------------- La Crue (É5b) — extrait dans crue-controller.js (audit M5) ---------------- */

/* ---------------- Le Dojo de parade (v4.0) — extrait dans dojo-controller.js (audit M5) ---------------- */
// openDojo / dojoTap / closeDojo sont importés depuis dojo-controller.js ;
// le contexte (état, records, gainXp, persist) est injecté au boot via setupDojo.

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
// Retour de balle (onFetchDone) -> jeux-controller.js (M5, tranche 12).
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
let lastStorageWarn = 0;
/** Sauvegarde honnête : si le stockage échoue (plein, bloqué — mode privé…),
    on prévient au lieu de laisser le joueur croire qu'il progresse.
    Throttlé : une alerte max par minute, pas de spam. */
function warnStorage() {
  const t = now();
  if (t - lastStorageWarn < 60 * SEC) return;
  lastStorageWarn = t;
  ui.toast('⚠️ Sauvegarde impossible (stockage plein ou bloqué) — copie vite ton code dans ⚙️ !');
}
function persist() { if (!saveState(s, storage, now())) warnStorage(); }
function persistRec() { if (!saveRecords(rec, storage)) warnStorage(); }

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

// Coach / Onboarding (tutoriel guidé, cartes histoire+saison, astuces de gestes)
// -> coach-controller.js (M5, tranche 13). Câblé au boot par setupCoach({...}).
// updateCoach/maybeStory/maybeSeasonCard/seasonHint/maybeHint appelés par la
// boucle, afterAct et le boot ; hintDone par le routeur de pointeur ; le rendu
// lit currentHintTarget().

/**
 * Un message qui COMPTE (éjection, perte, événement). Les astuces et le coach
 * écrivent dans le même bandeau et le remplaçaient parfois dans la seconde :
 * on repousse leur prochaine prise de parole pour laisser lire celui-ci.
 */
function messageImportant(msg) {
  ui.log(msg);
  suppressHint();   // coach-controller : ne pas écraser ce message par une astuce
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

/* ---------------- Trésors : drops dans les activités — extrait dans treasure-controller.js (audit M5) ---------------- */
// tryDrop est importé de treasure-controller.js ; le contexte (état, records,
// persist, gainXp, burst) est injecté au boot via setupTreasure.

/** Progression de quête + récompense immédiate si terminée. */
// Bonus de variété (v4.7) : la 1re fois qu'on fait chaque activité DANS LA JOURNÉE,
// un petit +XP — récompense une journée cozy VARIÉE, sans toucher aux défis.
const VARIETY_XP = 5;
const VARIETY_LABEL = { feed: 'repas', wash: 'bain', sleep: 'sieste', treat: 'friandise', play: 'pêche', dive: 'plongée', slide: 'toboggan', garden: 'jardin', battle: 'combat' };
function varietyBonus(key) {
  if (!s || s.gameOver || s.stage === 'egg') return;
  const d = dayKey(now());
  if (!s.dayActs || s.dayActs.date !== d) s.dayActs = { date: d, done: [] };
  if (s.dayActs.done.includes(key)) return;   // déjà fait aujourd'hui → pas de bonus
  s.dayActs.done.push(key);
  ui.toast('✨ 1re ' + (VARIETY_LABEL[key] || 'activité') + ' du jour — variété +' + VARIETY_XP + ' XP');
  gainXp(VARIETY_XP);
}

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

/* ---------------- Chez le héron : le rituel du retour — extrait dans heron-controller.js (audit M5) ---------------- */
// actCare est importé de heron-controller.js ; le contexte (état, effets, press,
// careBond, gainXp, persist) est injecté au boot via setupHeron.

/* ---------------- Série de jours (streak) — extrait dans streak-controller.js (audit M5) ---------------- */
// checkStreak est importé de streak-controller.js ; le contexte (records, persist,
// gainXp, checkUnlocks) est injecté au boot via setupStreak.

/* ---------------- Carte photo / partage — extrait dans share-controller.js (audit M5) ---------------- */
// openPhoto / sharePhoto / savePhoto / closePhoto / shareDayResult sont importés
// depuis share-controller.js ; le contexte (état, records) est injecté via setupShare.

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

/* ---------------- Le cycle de vie complet (v4.2) ----------------
   Opt-in (⚙️ rec.lifecycle), éteint par défaut : le jeu cozy reste intact.
   Une fois allumé, la loutre devient aînée après une longue vie, puis s'en va
   paisiblement — jamais un échec. Elle rejoint alors la lignée (mémorial +
   héritage, cf. startNew) et un œuf reprend le fil. Le grand départ vient aussi
   d'une trop longue absence chez le héron (l'antichambre douce). */
let passingInProgress = false;

function checkLifecycle(t) {
  if (!s || !rec || !rec.lifecycle) return;
  if (passingInProgress || s.gameOver || s.stage === 'egg') return;
  const age = ageMs(s, t);
  // L'annonce des cheveux d'argent, une seule fois.
  if (!s.elderSeen && isElder(age)) {
    s.elderSeen = true;
    persist();
    ui.log('🌾 ' + (s.name || 'Elle') + ' est devenue une aînée — le poil argenté, le cœur plein d\'histoires.');
  }
  const awayMs = s.away ? (t - (s.awayAt || t)) : null;
  const cause = endOfLife({ ageMs: age, awayMs, lifecycle: true });
  if (cause) passAway(cause, t);
}

// Le grand départ : une carte d'adieu paisible, puis l'œuf de la génération suivante.
function passAway(cause, t) {
  passingInProgress = true;
  const name = s.name || 'Ta loutre';
  s.diedAt = t;         // fige l'âge pour le mémorial (cf. ageMs)
  s.gameOver = true;    // suspend la simulation le temps de l'adieu
  persist();
  if (sfx.over) sfx.over();
  vibrate([40, 60, 40]);
  const vecu = ui.fmtAge ? ui.fmtAge(s, t) : '';
  const card = cause === 'age'
    ? { kicker: 'Une belle vie', big: '🕊️', title: name + ' s\'en est allée paisiblement',
        reward: 'Elle a bien vécu' + (vecu ? ' — ' + vecu : '') + '. Elle veille sur la lignée.', rewardColor: 'var(--accent)' }
    : { kicker: 'Adieu tout doux', big: '🕊️', title: name + ' est restée auprès du héron',
        reward: 'Elle s\'en est allée sereinement. La lignée, elle, continue.', rewardColor: 'var(--accent)' };
  ui.celebrate(card);
  ui.log('🕊️ ' + name + ' nous a quittés en paix. ' +
    (cause === 'age' ? 'Quelle belle vie…' : 'Le héron veillera sur elle…') +
    ' Un œuf reprend le fil de la lignée.');
  // On laisse la carte respirer, puis l'œuf de la génération suivante arrive.
  setTimeout(() => { passingInProgress = false; startNew(); }, 2600);
}

// Retry télémétrie (audit m8) : après un ping raté, on n'assiège pas le réseau —
// prochain essai au plus tôt 10 min plus tard. Le compteur vit sur l'état
// (s.nextTelemetryRetry) : testable, et un redémarrage rapide ne re-tente pas
// immédiatement ; au-delà, le jour non marqué déclenche un nouvel essai.
const TELEMETRY_RETRY_MS = 10 * MIN;

function tick() {
  if (!s || switching) return;   // en plein changement de slot : on gèle tout jusqu'au reload
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
  checkLifecycle(t);   // le cycle de vie complet (v4.2) : aînée, puis grand départ paisible
  ui.updateHUD(s, mg, rec);
  updatePlaceBtn();  // la tanière n'est accessible que quand la loutre est là (hors œuf/héron/mini-jeu)
  maybeHint();       // révèle une astuce de geste une fois le tuto de base terminé
  maybeStory();      // un chapitre vient peut-être de se débloquer (évolution en direct/au retour)
  maybeSeasonCard(); // la saison a peut-être tourné (minuit / retour d'absence)
  updateCoach();     // garde le surlignage du tutoriel en phase (dodo, overlays…)
  seasonHint();      // rappelle le contre-geste si le froid/la chaleur la malmène
  syncMusic(); // (re)démarre dès que l'audio est débloqué, coupe si veille/fin
  // Télémétrie : un ping par jour, jamais pendant l'œuf. L'ID anonyme est généré
  // ICI, HORS du garde canSendTelemetry qui l'exige : avant ce fix, il n'était
  // créé qu'à l'intérieur du bloc gardé -> code mort -> aucun ping jamais envoyé.
  if (s && s.telemetry && s.name && s.stage !== 'egg' && !s.telemetryId) {
    s.telemetryId = newTelemetryId();
    persist();
  }
  // Envoi (retry m8) : le jour n'est marqué envoyé qu'en cas de SUCCÈS. Un ping
  // raté (hors-ligne, erreur réseau…) est réessayé au prochain tick, throttlé
  // à TELEMETRY_RETRY_MS pour ne pas marteler le réseau tant que c'est coupé.
  if (s && canSendTelemetry(s) && s.lastTelemetryDay !== dayKey(t) && t >= (s.nextTelemetryRetry || 0)) {
    s.nextTelemetryRetry = t + TELEMETRY_RETRY_MS;
    const day = dayKey(t);
    sendTelemetry(s, rec, curLevel()).then((ok) => {
      if (ok && s && s.lastTelemetryDay !== day) {
        s.lastTelemetryDay = day;
        persist();
      }
    });
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
  if (stepCombat(now())) onDuelOverBridge();
  const curBattle = currentBattle();
  R.render(s, mg, frame, {
    wobble: s && now() < wobbleUntil,
    diving: diving(),
    foe: curBattle ? curBattle.foe : null,
    dragFood,
    owned: rec ? rec.items : null,
    memorial: (rec && s && s.place === 'taniere') ? rec.memorial : null,   // portraits de la lignée (v4.1)
    world: (s && s.place === 'monde') ? getWorld() : null,
    level: curLevel(),
    hint: currentHintTarget(),
    weather: (s && s.place === 'berge') ? weatherFor(new Date()) : null,
    creatures: (s && s.place === 'berge') ? berCreatures : null
  });
  if (R.consumeFetch()) onFetchDone(); // la loutre vient de rapporter la balle
  applyShake();
  requestAnimationFrame(loop);
}

/* ---------------- Raccourci PWA (manifest.webmanifest) ----------------
   Le manifeste déclare le raccourci « Nourrir » -> ./?action=feed, mais rien ne
   le consommait (le raccourci était inerte). Ici on nourrit la loutre dès
   l'arrivée, puis on retire le paramètre de l'URL : un simple refresh ne
   re-nourrit pas. Sans effet si aucune loutre nourrissable (œuf, héron, dodo…). */
function consumeBootAction() {
  if (typeof window === 'undefined' || !window.location) return;
  const p = new URLSearchParams(window.location.search);
  if (p.get('action') !== 'feed') return;
  try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) {}
  actFeed();
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
  // La Crue (É5b) : injecte les accès au jeu global au contrôleur extrait (audit M5).
  setupCrue({
    getState: () => s,
    getRecords: () => rec,
    getBattle: () => currentBattle(),
    getMinigame: () => mg,
    level: () => curLevel(),
    canFight: () => denAvailable(),
    launchBattle: (foe, seed, mult) => startBattle(foe, seed, mult),
    persistRec: () => persistRec()
  });
  setupDojo({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    isBusy: () => busy(),
    gainXp: (n) => gainXp(n),
    persistRec: () => persistRec()
  });
  setupShare({
    getState: () => s,
    getRecords: () => rec
  });
  setupStreak({
    getRecords: () => rec,
    persistRec: () => persistRec(),
    gainXp: (n) => gainXp(n),
    checkUnlocks: () => checkUnlocks()
  });
  setupHeron({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    press: () => press(),
    burst: (kind, n, stage) => R.burst(kind, n, stage),
    squash: () => R.squash(),
    gainXp: (n) => gainXp(n),
    persist: () => persist(),
    careBond: (key) => careBond(key)
  });
  setupTreasure({
    getState: () => s,
    getRecords: () => rec,
    persistRec: () => persistRec(),
    gainXp: (n) => gainXp(n),
    burst: (kind, n, stage) => R.burst(kind, n, stage)
  });
  setupSlots({
    getState: () => s,
    getActiveSlot: () => activeSlot,
    loadSlot: (slot) => loadSlotState(slot),
    switchTo: (target) => { commitSlot(target); reloadApp(); },
    deleteSlot: (target) => deleteSlotKeys(target)
  });
  setupMarche({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    persistRec: () => persistRec(),
    openWardrobe: (tab) => openWardrobe(tab),
    openGang: () => openGang()
  });
  setupWorld({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    getFrame: () => frame,
    getBattle: () => currentBattle(),
    R,
    level: () => curLevel(),
    denAvailable: () => denAvailable(),
    updatePlaceBtn: () => updatePlaceBtn(),
    messageImportant: (m) => messageImportant(m),
    quest: (k, n) => quest(k, n),
    gainXp: (n) => gainXp(n),
    persist: () => persist(),
    persistRec: () => persistRec(),
    checkUnlocks: () => checkUnlocks(),
    isRecruited: (id) => isRecruited(id),
    markRecruited: (id) => markRecruited(id),
    endGarden: (res) => endGarden(res),
    newGarden: (t) => newGarden(t),
    tryDrop: (b) => tryDrop(b),
    openBarter: () => openBarter(),
    currentCrue: () => currentCrue(),
    maybeNotifyCrue: () => maybeNotifyCrue(),
    crueBannerOnce: () => crueBannerOnce(),
    crueDuelActive: () => crueDuelActive(),
    resolveCrueDuel: (won) => resolveCrueDuel(won),
    launchBattle: (foe, seed, mult) => startBattle(foe, seed, mult),
    setBerCreatures: (c) => { berCreatures = c; },
    setMinigame: (v) => { mg = v; }   // le Monde lance le mini-jeu jardin -> l'état vit ici
  });
  // Le Combat (moteur de duel) : injecte les accès au jeu global au contrôleur
  // extrait (M5, tranche 10), puis câble les boutons de l'arène.
  setupCombat({
    getState: () => s,
    getRecords: () => rec,
    level: () => curLevel(),
    unlocked: (f) => unlocked(f),
    busy: () => busy(),
    gainXp: (n) => gainXp(n),
    quest: (k, n) => quest(k, n),
    varietyBonus: (k) => varietyBonus(k),
    feel: (t) => feel(t),
    persistRec: () => persistRec(),
    resetBattleDone: () => resetBattleDone(),
    clearEpreuve: () => clearEpreuve(),
    onDuelOver: () => onDuelOverBridge()
  });
  wireCombat();
  // Les Soins (gestes de base) : injecte les helpers partagés au contrôleur
  // extrait (M5, tranche 11). Les boutons sont câblés plus bas avec les autres.
  setupSoins({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    R,
    press: () => press(),
    feel: (t) => feel(t),
    gainXp: (n) => gainXp(n),
    afterAct: () => afterAct(),
    quest: (k, n) => quest(k, n),
    varietyBonus: (k) => varietyBonus(k),
    careBond: (key) => careBond(key),
    busy: () => busy(),
    unlocked: (f) => unlocked(f),
    persist: () => persist(),
    persistRec: () => persistRec(),
    checkUnlocks: () => checkUnlocks(),
    tryDrop: (b) => tryDrop(b)
  });
  // Les Mini-jeux (pêche/toboggan/jardin) : injecte les helpers partagés + le
  // setter du mini-jeu (M5, tranche 12). Boutons câblés plus bas.
  setupJeux({
    getState: () => s,
    getRecords: () => rec,
    getMinigame: () => mg,
    setMinigame: (v) => { mg = v; },
    R,
    press: () => press(),
    feel: (t) => feel(t),
    gainXp: (n) => gainXp(n),
    afterAct: () => afterAct(),
    quest: (k, n) => quest(k, n),
    varietyBonus: (k) => varietyBonus(k),
    careBond: (key) => careBond(key),
    busy: () => busy(),
    unlocked: (f) => unlocked(f),
    persist: () => persist(),
    checkUnlocks: () => checkUnlocks(),
    tryDrop: (b) => tryDrop(b),
    messageImportant: (m) => messageImportant(m)
  });
  // Le Coach / Onboarding : injecte l'état + helpers au contrôleur extrait
  // (M5, tranche 13). Appelé par la boucle, afterAct, le routeur et le boot.
  setupCoach({
    getState: () => s,
    getMinigame: () => mg,
    R,
    persist: () => persist(),
    diving: () => diving(),
    denAvailable: () => denAvailable()
  });
  consumeBootAction(); // raccourci PWA « Nourrir » (manifest) : ?action=feed

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
  $('b-garden').addEventListener('click', actGarden);
  $('b-dojo').addEventListener('click', openDojo);        // Dojo de parade (v4.0)
  $('dojo-parry').addEventListener('click', dojoTap);
  $('b-care').addEventListener('click', actCare);

  // Combat de loutres : arène, adversaire sauvage et techniques -> combat-controller.js
  // (M5, tranche 10). Câblé plus haut par setupCombat({...}) + wireCombat().

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
  const lifecycleLabel = () => { const b = $('b-lifecycle'); if (b) b.textContent = '🌿 CYCLE DE VIE COMPLET : ' + (rec && rec.lifecycle ? 'OUI' : 'NON'); };
  $('b-lifecycle').addEventListener('click', () => {
    sfx.press();
    const on = !(rec && rec.lifecycle);
    if (on) {
      ui.askConfirm('Activer le cycle de vie complet ?\nTes loutres vieilliront et s\'en iront un jour, paisiblement et fêtées — jamais une défaite. La lignée continue à chaque fois. (Réversible ici à tout moment.)', () => {
        rec.lifecycle = true; persistRec(); lifecycleLabel();
        ui.toast('🌿 Cycle de vie complet activé — chaque vie compte.');
      });
    } else {
      rec.lifecycle = false; persistRec(); lifecycleLabel();
      ui.toast('🌿 Cycle de vie complet coupé — tes loutres restent auprès de toi.');
    }
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

  // Le Marché (v3.96) : le HUB économique, extrait dans marche-controller.js.
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
  $('btn-photo-close').addEventListener('click', closePhoto);
  $('btn-souvenir-close').addEventListener('click', () => { sfx.press(); ui.closeSouvenir(); });
  $('b-slots').addEventListener('click', openSlots);
  $('btn-slots-close').addEventListener('click', () => { sfx.press(); ui.hideOverlay('ovl-slots'); });

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
  const refreshCarnet = () => ui.renderCarnet(rec, s, carnetSection, { onSouvenir: openSouvenir });
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

  // La pastille 🎯 ouvre le détail des défis du jour (v4.5 : plus de bannière fixe).
  $('pill-quests').addEventListener('click', openQuests);
  $('pill-quests').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuests(); } });
  $('btn-quests-close').addEventListener('click', () => { sfx.press(); ui.hideOverlay('ovl-quests'); });
  // barre d'actions qui s'estompe au repos, se réveille au moindre geste (É4)
  ['pointerdown', 'keydown'].forEach(ev =>
    document.addEventListener(ev, wakeActionbar, { passive: true }));
  wakeActionbar();
  $('btn-ach-close').addEventListener('click', () => ui.hideOverlay('ovl-ach'));
  $('btn-day-share').addEventListener('click', shareDayResult);

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
    lifecycleLabel();
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
    'ovl-workshop': () => closeWorkshop(),
    'ovl-crue': () => ui.hideOverlay('ovl-crue'),
    'ovl-marche': () => ui.hideOverlay('ovl-marche'),
    'ovl-carnet': () => ui.hideOverlay('ovl-carnet'),
    'ovl-souvenir': () => ui.closeSouvenir(),
    'ovl-slots': () => ui.hideOverlay('ovl-slots'),
    'ovl-quests': () => ui.hideOverlay('ovl-quests'),
    'ovl-almanach': () => ui.hideOverlay('ovl-almanach'),
    'ovl-dojo': closeDojo,
    'ovl-encounter': () => closeEncounter(false),
    'ovl-hats': () => ui.hideOverlay('ovl-hats'),
    'ovl-ach': () => ui.hideOverlay('ovl-ach'),
    'ovl-set': () => ui.hideOverlay('ovl-set'),
    'ovl-photo': () => closePhoto(),
    'ovl-battle': () => closeBattle()
  };
  for (const [id, close] of Object.entries(overlayClosers)) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('click', (e) => {
      if (e.target !== el) return; // un vrai toucher "à côté", pas sur un bouton
      if (id === 'ovl-battle' && battleActive()) return;
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
        if (id === 'ovl-battle' && battleActive()) return;
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
  get world() { return getWorld(); },
  get enc() { return getEnc(); },
  forceHatch() {
    if (s && s.stage === 'egg') {
      s.born = now() - 3 * MIN;
      applyEvents(stepSim(s, 1000, { simNow: now() }));
      ui.updateHUD(s, mg, rec);
    }
  },
  step(ms) { applyEvents(stepSim(s, ms, { simNow: now() })); ui.updateHUD(s, mg, rec); },
  startNew, actFeed, actWash, actSleep, actHeal, actPlay, actTreat, actDive, actSlide, actCare, pet,
  consumeBootAction,
  get battle() { return currentBattle(); }
};

boot();
