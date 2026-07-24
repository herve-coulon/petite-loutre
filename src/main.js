// Orchestrateur : relie simulation, rendu, UI, audio et PWA.
import {
  SEC, MIN, clamp, TREAT_CD, DIVE_MS, GRUMPY_MS, WAKE_OK_ENERGY,
  WARM_BOOST, WARM_CD, SHAKE_BOOST, SHAKE_CD, SHAKE_G,
  AWAY_CARE_NEEDED, AWAY_CARE_CD, SEASON_FX, UNLOCK_LEVEL, GAME_VERSION, STAGES
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
import { giftClaimable, giftClaimed, claimSeasonGift } from './seasonpass.js';

import {
  newState, saveState, loadState, clearSave,
  loadRecords, saveRecords, exportSave, importSave
} from './state.js';
import { stepSim, simulateOffline, ageMs } from './sim.js';
import { newGame, tickGame, clickGame } from './minigame.js';
import { newSlide, tickSlide, setSlideLane, laneAt } from './toboggan.js';
import { makeRenderer, FOOD_POS, BALL_HOME, denItemAt, CANVAS_W, CANVAS_H } from './render.js';
import { sfx, vibrate, setMuted, setVolume, getVolume } from './audio.js';
import * as ui from './ui.js';
import { registerSW, setupInstall, requestPersistentStorage, isIOS, isStandalone } from './pwa.js';
import { unlockedHats, hatById } from './accessories.js';
import { unlockedFurs, unlockedDecors, equipBonus } from './skins.js';
import { newAchievements } from './achievements.js';
import { encodeCard, decodeCard, newBattle, playTurn, wildFoe, makeFighter } from './battle.js';
import { makeGang, recruit, recruitBoard, gangPower, generateRival, resolveGangBattle, applyGangResult, MAX_MEMBERS } from './gang.js';
import {
  TILE, WORLD_W, WORLD_H, START_ZONE, zoneById, zoneFinds, ZONE_INTRO,
  moveWithCollision, spawnPoint, zoneExit, safeEntry, nearestFree
} from './tilemap.js';
import { makeCard, CARD_URL } from './photocard.js';
import { nextBeat, markSeen, coachStep } from './story.js';
import { seasonFor, seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { ITEMS, RARITIES, itemById, bonusOf, rollDrop, milestoneItem, describeBonus } from './items.js';
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
  R.burst('sparkle', 5, s.stage); R.ring(s.stage);
  sfx.happy(); feel('med');
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
  R.burst('sparkle', 10, s.stage); R.ring(s.stage);
  sfx.hatch(); vibrate([15, 30, 15]); feel('med');
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
  R.ring(s.stage); sfx.eat(); feel('soft');
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
  if (!s.sick) { ui.log(s.name + ' n\'est pas malade.'); return; }
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
  mg = newGame(now());
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
  mg = newSlide(now());
  sfx.press();
  ui.log('Toboggan ! Tape le couloir pour gober les 🐟 et esquiver les 🪨 !');
  ui.updateHUD(s, mg, rec);
}

function endSlide(res) {
  const sc = res.score, bumps = res.bumps, best = res.bestCombo || 0;
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
  const combo = best >= 3 ? ' Plus bel enchaînement : x' + best + ' !' : '';
  if (clean) { sfx.happy(); ui.log('Descente parfaite : ' + sc + ' points sans un rocher ! 🛝🎉' + combo); }
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
  if (sc > 0) quest('fish', sc);
  tryDrop(clean ? 1.8 : 1); // descente parfaite = meilleure chance de trésor
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
    lac: [[3, 24], [26, 3], [2, 12]], vallon: [[6, 10], [24, 18], [8, 25]]
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

/** Ramasser une trouvaille : chaque zone récompense à sa manière. */
function collectFind(f) {
  if (!rec) return;
  (rec.found = rec.found || []).push(f.id);
  const name = s.name || 'La loutre';
  if (f.kind === 'poisson') {
    rec.fishTotal = (rec.fishTotal || 0) + 1;
    quest('fish', 1);
    ui.log('🐟 ' + name + ' déniche un poisson frais !');
  } else if (f.kind === 'champignon') {
    gainXp(10);
    ui.log('🍄 Un champignon rare sous les fougères ! +10 XP');
  } else if (f.kind === 'gemme') {
    rec.gems = (rec.gems || 0) + 1;
    ui.log('💎 Une gemme scintille dans l\'écume de la cascade !');
  } else if (f.kind === 'coquillage') {
    rec.treatsTotal = (rec.treatsTotal || 0) + 1;
    ui.log('🐚 Un beau coquillage dans la vase des roseaux !');
  } else if (f.kind === 'tresor') {
    ui.log('🎁 ' + name + ' plonge et remonte quelque chose du lac…');
    tryDrop(2.5);                       // le lac est le meilleur endroit pour les trésors
  } else if (f.kind === 'fleur') {
    s.fun = clamp(s.fun + 10, 0, 100);
    ui.log('🌼 Une fleur du vallon — ' + name + ' est ravie !');
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
  sfx.evolve(); vibrate([12, 40, 12]);
  ui.showStory({ ...intro, cta: 'EXPLORER' });
  return true;
}

/**
 * Voyage depuis la carte du profil : on se rend directement dans un lieu déjà
 * découvert, au point d'entrée de la zone. Refusé si l'on n'est pas en balade
 * (la carte sert alors seulement à consulter) ou si le lieu est inconnu.
 */
/** Le voyage n'est proposé que pendant une balade ; sinon la carte se consulte. */
function worldTravelHandler() {
  return (s && s.place === 'monde' && world) ? travelTo : null;
}

function travelTo(zoneId) {
  if (!world || !isVisited(zoneId) || zoneId === world.zone) return false;
  const p = spawnPoint(zoneId);
  goToZone(zoneId, p.x, p.y);
  ui.hideOverlay('ovl-menu');
  return true;
}

/** Change de zone : nouvelle carte, nouvelles loutres, on entre par le bon bord. */
function goToZone(zoneId, px, py) {
  const p = safeEntry(zoneId, px, py);
  world.zone = zoneId;
  s.worldZone = zoneId;                 // pour que le profil sache où l'on est
  world.px = p.x; world.py = p.y; world.tx = p.x; world.ty = p.y;
  world.walking = false;
  world.otters = wildOttersFor(zoneId);
  world.finds = findsFor(zoneId);
  sfx.press(); vibrate(8);
  if (!discoverZone(zoneId)) {          // déjà connu : simple annonce
    ui.log('🗺️ ' + zoneById(zoneId).name);
    ui.toast('🗺️ ' + zoneById(zoneId).name);
  }
}

/** Entre dans la vallée : engendre les loutres sauvages du jour et place tout le monde. */
function enterWorld() {
  if (!denAvailable()) return;
  const zone = START_ZONE;
  const sp = spawnPoint(zone);
  world = {
    zone, px: sp.x, py: sp.y, tx: sp.x, ty: sp.y,
    walking: false, facing: 1, otters: wildOttersFor(zone), finds: findsFor(zone)
  };
  s.worldZone = zone;
  s.place = 'monde';
  sfx.press(); vibrate(8);
  updatePlaceBtn(); persist();
  if (!discoverZone(zone)) ui.log('🗺️ ' + (s.name || 'La loutre') + ' part explorer la vallée…');
}

/** Quitte la vallée, retour à la berge. */
function exitWorld() {
  world = null; encounterOtter = null;
  ui.hideOverlay('ovl-encounter');
  s.place = 'berge';
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
        world.tx = world.px; world.ty = world.py; world.walking = false;  // bloquée : on renonce
      } else {
        world.px = res.x; world.py = res.y;
        world.facing = dx < 0 ? -1 : 1; world.walking = true;
      }
      // franchi un bord ouvert ? on bascule sur la zone voisine
      const out = zoneExit(world.zone, world.px, world.py);
      if (out) { goToZone(out.to, out.x, out.y); return; }
    } else world.walking = false;
  }
  for (const o of world.otters) {
    if (o.gone) continue;
    o.wx = o.x + Math.sin((frame + o.phase) / 55) * 3;
    if (encounterOtter) continue;
    const pd = Math.hypot(o.wx - world.px, o.y - world.py);
    if (pd < 16 && frame > (o.cooldown || 0)) openEncounter(o);
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
  const pad = e.pointerType === 'touch' ? 8 : 4; // hitbox élargie au doigt

  if (mg) {
    if (mg.mode === 'slide') { setSlideLane(mg, laneAt(x)); vibrate(6); }
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
        world.tx = clampN(x + cam.x, -TILE, WORLD_W + TILE);
        world.ty = clampN(y + cam.y, -TILE, WORLD_H + TILE);
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
        rec.treatsTotal = (rec.treatsTotal || 0) + 1;
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

    const box = R.otterBox(s.stage);
    if (x >= box.x - 6 && x <= box.x + box.w + 6 && y >= box.y - 6 && y <= box.y + box.h + 8) { pet(); return; }

    // ailleurs sur la scène : on l'appelle vers le point touché (elle vient),
    // avec un petit plouf si on tapote l'eau
    if (y >= 60 && !s.sleeping) {
      R.callTo(x);
      hintDone('callwater');
      if (y >= 104) { R.splashAt(x, 108); sfx.chirp(); vibrate(6); }
    }
  }
}

// Gestes de glissement : la balle qu'on lance, ou le poisson qu'on donne. Le doigt
// pilote le jeton ; on convertit les coords écran -> coords canvas.
// Convertit un pointeur écran -> coordonnées du canvas (0..W, 0..H), en tenant
// compte d'object-fit (cover/contain) et d'object-position : sinon, plein écran
// « cover » rogne l'image et le repère se décale (perte de précision au glisser).
function canvasXY(e) {
  const r = cv.getBoundingClientRect();
  const cs = getComputedStyle(cv);
  const fit = cs.objectFit;
  let scaleX = r.width / cv.width, scaleY = r.height / cv.height, s = null;
  if (fit === 'cover') s = Math.max(scaleX, scaleY);
  else if (fit === 'contain') s = Math.min(scaleX, scaleY);
  if (s) {
    const pos = cs.objectPosition.split(' ');
    const px = (parseFloat(pos[0]) || 0) / 100, py = (parseFloat(pos[1]) || 0) / 100;
    const left = (r.width - cv.width * s) * px, top = (r.height - cv.height * s) * py;
    return { x: (e.clientX - r.left - left) / s, y: (e.clientY - r.top - top) / s };
  }
  return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
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

// Badge « ! » du Cadeau : visible seulement quand un cadeau de saison est réclamable.
function refreshGift() {
  const b = $('b-gift'); if (!b) return;
  const badge = b.querySelector('.badge');
  if (badge) badge.classList.toggle('hidden', !giftClaimable(rec));
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
  n = Math.round(n * (equipBonus(s).xp || 1)); // bonus d'XP de tout l'équipement porté
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
    const opened = featuresOpenedBetween(before, L.level);
    let reward, rewardColor;
    if (gotItems.length) {
      const it = gotItems[gotItems.length - 1];
      reward = '🎁 Trésor ' + RARITIES[it.rarity].label.toLowerCase() + '<br>' + it.emoji + ' <b>' + it.name + '</b>';
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
  updatePlaceBtn();  // la tanière n'est accessible que quand la loutre est là (hors œuf/héron/mini-jeu)
  maybeHint();       // révèle une astuce de geste une fois le tuto de base terminé
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
    const res = mg.mode === 'slide' ? tickSlide(mg, now()) : tickGame(mg, now());
    if (res) (mg.mode === 'slide' ? endSlide : endGame)(res);
  }
  if (!frozen && s && s.place === 'monde') stepWorld();
  R.render(s, mg, frame, {
    wobble: s && now() < wobbleUntil,
    diving: diving(),
    foe: battle ? battle.foe : null,
    dragFood,
    owned: rec ? rec.items : null,
    world: (s && s.place === 'monde') ? world : null,
    hint: (s && activeHint) ? hintTargetFor(activeHint) : null
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
  ui.renderLevel(rec);
  refreshGift();

  const prev = loadState(storage);
  if (prev) {
    s = prev;
    // Le Monde est une excursion runtime (world non persisté) : on rentre à la berge au boot.
    if (s.place === 'monde') s.place = 'berge';
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
  updatePlaceBtn();

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

  // Combat de loutres : une sauvage à défier tout de suite (ou le code d'un ami)
  let wildRoll = 0;                       // change d'adversaire sans quitter l'écran
  // l'adversaire se cale sur la forme réelle de la loutre -> duels serrés
  const rollWildFoe = () => wildFoe(curLevel(), 'wild|' + dayKey() + '|' + wildRoll, makeFighter(s));
  /** Lance un combat contre la carte donnée. */
  const startBattle = (card, seed) => {
    if (!card) return;
    battle = newBattle(s, card, seed);
    battle.log.push('Le combat commence ! ' + battle.me.name + ' vs ' + battle.foe.name);
    rec.battles++;
    persistRec();
    ui.shake();
    sfx.evolve(); vibrate([20, 40, 20]);
    ui.updateBattleUI(battle);
    gainXp(XP.battle);
    quest('battles');
  };
  /** Ouvre l'arène sur l'écran de préparation (adversaire sauvage proposé). */
  const openBattle = () => {
    if (!unlocked('battle')) { ui.log('⚔️ Les combats s\'ouvrent au niveau ' + UNLOCK_LEVEL.battle + ' ! ⭐'); return; }
    sfx.press();
    battle = null;
    ui.renderBattleSetup(rollWildFoe(), s);
    ui.showOverlay('ovl-battle');
  };
  $('b-battle').addEventListener('click', () => {
    if (busy() || s.sleeping) return;
    openBattle();
  });
  battleStarter = startBattle;   // les rencontres du monde peuvent lancer un combat
  $('bt-wild').addEventListener('click', () => startBattle(rollWildFoe(), 'wild|' + dayKey() + '|' + wildRoll));
  $('bt-reroll').addEventListener('click', () => { wildRoll++; sfx.press(); ui.renderBattleSetup(rollWildFoe(), s); });
  $('bt-again').addEventListener('click', () => { wildRoll++; ui.renderBattleSetup(rollWildFoe(), s); });
  $('bt-close').addEventListener('click', () => { battle = null; ui.hideOverlay('ovl-battle'); });
  $('bt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bt-mycode').value); ui.toast('📋 Code copié !'); }
    catch (e) { try { $('bt-mycode').select(); document.execCommand('copy'); ui.toast('📋 Code copié !'); } catch (e2) {} }
  });
  $('bt-start').addEventListener('click', () => {
    const card = decodeCard($('bt-foecode').value);
    if (!card) { ui.toast('❌ Code de combat invalide'); return; }
    startBattle(card, encodeCard(s) + $('bt-foecode').value.trim());
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

  // Carte photo (accessible depuis Succès)
  $('b-photo').addEventListener('click', openPhoto);
  $('b-place').addEventListener('click', togglePlace);
  $('b-world').addEventListener('click', enterWorld);
  $('b-world-back').addEventListener('click', exitWorld);
  $('enc-fish').addEventListener('click', () => encHandlers.offer());
  $('enc-fight').addEventListener('click', () => encHandlers.fight());

  // Cadeau de saison : un lot (gemmes + poissons) à réclamer une fois par saison
  $('b-gift').addEventListener('click', () => {
    sfx.press();
    if (!giftClaimable(rec)) {
      ui.log(giftClaimed(rec)
        ? '🎁 Cadeau de saison déjà reçu — rendez-vous la saison prochaine !'
        : '🎁 Récolte le trésor de saison sur la berge pour débloquer ton cadeau !');
      ui.toast(giftClaimed(rec) ? '🎁 Déjà réclamé cette saison' : '🎁 Récolte un trésor de saison d\'abord');
      return;
    }
    const g = claimSeasonGift(rec);
    if (!g) return;
    rec.gems = (rec.gems || 0) + g.gems;
    rec.fishTotal = (rec.fishTotal || 0) + g.fish;
    persistRec();
    ui.renderLevel(rec);
    refreshGift();
    vibrate([15, 30, 15]); sfx.happy();
    ui.celebrate({ kicker: 'Cadeau de saison', big: g.emoji, title: g.name,
      reward: '+' + g.gems + ' 💎    +' + g.fish + ' 🐟', rewardColor: 'var(--teal)' });
  });
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
  { const el = $('ps-ach'); if (el) el.addEventListener('click', openAch); } // slot Succès du profil

  // Escouade (gang) : création, recrutement (coûte de l'XP), combats de bande.
  const gangBoard = () => recruitBoard(curLevel(), dayKey(), 3)
    .map(c => ({ ...c, recruited: isRecruited(c.id) }));
  const refreshGang = () => ui.renderGang(rec, s, gangHandlers, gangBoard());
  const gangHandlers = {
    create: (name, emblem) => {
      rec.gang = makeGang(name, emblem, s);
      persistRec(); sfx.happy(); vibrate(12);
      ui.renderProfile(s, rec, worldTravelHandler()); refreshGang();
    },
    recruit: (c) => {
      if (!rec.gang || rec.gang.members.length >= MAX_MEMBERS) return;
      if ((rec.xp || 0) < c.cost) { ui.toast('Pas assez d\'XP 🐟'); return; }
      if (recruit(rec.gang, c)) {
        rec.xp -= c.cost; markRecruited(c.id);
        persistRec(); sfx.happy(); vibrate(12);
        ui.renderProfile(s, rec, worldTravelHandler()); refreshGang();
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

  // la bannière de quête ouvre le détail (quêtes + succès)
  $('quest').addEventListener('click', openAch);
  $('quest').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openAch(); });
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
    'ovl-encounter': () => closeEncounter(false),
    'ovl-hats': () => ui.hideOverlay('ovl-hats'),
    'ovl-ach': () => ui.hideOverlay('ovl-ach'),
    'ovl-set': () => ui.hideOverlay('ovl-set'),
    'ovl-photo': () => { cardCv = null; ui.hideOverlay('ovl-photo'); },
    'ovl-battle': () => { battle = null; ui.hideOverlay('ovl-battle'); }
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
