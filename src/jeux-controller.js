// Contrôleur des « Mini-jeux » (pêche, toboggan, jardin) — extrait de main.js
// (audit M5, tranche 12). Regroupe le LANCEMENT et la CLÔTURE des trois parties :
// actPlay/endGame (pêche), actSlide/endSlide (toboggan), actGarden/endGarden
// (jardin), + onFetchDone (retour de balle). L'état runtime `mg` reste dans
// main.js (lu chaque image par la boucle, le rendu, busy(), le routeur de
// pointeur) : on le pousse via le hook setMinigame et on le lit via getMinigame.
// Les moteurs (minigame.js/toboggan.js/garden.js) sont purs ; ici l'orchestration
// via un contexte injecté — aucun accès direct à la portée de main.js.
import { newGame } from './minigame.js';
import { newSlide, DEGATS_EJECTION } from './toboggan.js';
import { newGame as newGarden } from './garden.js';
import { jeuBuffs } from './skills.js';
import { equipBonus } from './skins.js';
import { XP } from './level.js';
import { clamp, UNLOCK_LEVEL } from './constants.js';
import * as ambient from './ambient.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null, R = null;
let s = null, rec = null, mg = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame(); }
// Le mini-jeu vit dans main.js : toute écriture y est répercutée.
function setMg(v) { mg = v; ctx.setMinigame(v); }

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
const checkUnlocks = () => ctx.checkUnlocks();
const tryDrop = (b) => ctx.tryDrop(b);
const messageImportant = (m) => ctx.messageImportant(m);

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupJeux(hooks) { ctx = hooks; R = hooks.R; }

export function actPlay() {
  sync();
  if (busy() || s.sleeping) return;
  if (s.energy < 12) { ui.log(s.name + ' est trop fatiguée pour jouer…'); return; }
  press();
  varietyBonus('play');
  setMg(newGame(now(), jeuBuffs(rec, equipBonus(s))));
  sfx.press();
  ui.log('Partie de pêche ! Attrape les poissons en les touchant !');
  ui.updateHUD(s, mg, rec);
}

export function endGame(res) {
  sync();
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
  setMg(null);
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
export function actSlide() {
  sync();
  if (busy() || s.sleeping) return;
  if (!unlocked('slide')) { ui.log('🛝 Le toboggan s\'ouvre au niveau ' + UNLOCK_LEVEL.slide + ' ! ⭐'); return; }
  if (s.energy < 14) { ui.log(s.name + ' est trop fatiguée pour le toboggan…'); return; }
  press();
  varietyBonus('slide');
  setMg(newSlide(now(), jeuBuffs(rec, equipBonus(s))));
  sfx.press();
  ui.log('Toboggan ! Tape le couloir pour gober les 🐟 et esquiver les 🪨 !');
  ui.updateHUD(s, mg, rec);
}

// Le jardin en action de premier plan (v4.6) : accessible depuis la berge, comme
// le toboggan/la plongée — plus besoin de voyager jusqu'à la zone du monde ouvert.
export function actGarden() {
  sync();
  if (busy() || s.sleeping) return;
  if (!unlocked('garden')) { ui.log('🌿 Le jardin s\'ouvre au niveau ' + UNLOCK_LEVEL.garden + ' ! ⭐'); return; }
  if (s.energy < 10) { ui.log(s.name + ' est trop fatiguée pour jardiner…'); return; }
  press();
  varietyBonus('garden');
  setMg(newGarden(now()));
  ambient.startGardenAmbient();
  sfx.press();
  ui.log('Jardin ! Récolte chaque fleur à PLEINE FLORAISON (halo lumineux) — parfait = +3 ! Arrose 💧 les pousses pour les hâter. 🌸');
  ui.updateHUD(s, mg, rec);
}

export function endSlide(res) {
  sync();
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
  setMg(null);
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
export function endGarden(res) {
  sync();
  const sc = res.score;
  ambient.stopGardenAmbient();
  s.fun = clamp(s.fun + 6 + sc * 3, 0, 100);
  s.energy = clamp(s.energy - 6, 0, 100);
  s.hunger = clamp(s.hunger - 3, 0, 100);
  s.played++;
  rec.gamesTotal++;
  setMg(null);
  if (sc >= 8) R.burst('confetti', 20, s.stage);
  else if (sc > 0) R.burst('sparkle', 6, s.stage);
  const bouquet = (res.bonus || 0) > 0 ? ' Bouquet complet, +' + res.bonus + ' 💐 !' : '';
  const parfaits = (res.perfects || 0) > 0 ? ' (' + res.perfects + ' pleine' + (res.perfects > 1 ? 's' : '') + ' floraison' + (res.perfects > 1 ? 's' : '') + ' ✨)' : '';
  if (sc >= 8) { sfx.happy(); ui.log('Magnifique jardin ! ' + sc + ' points de récolte' + parfaits + ' !' + bouquet + ' 🌸🎉'); }
  else if (sc > 0) { sfx.eat(); ui.log(sc + ' point' + (sc > 1 ? 's' : '') + ' de jardin' + parfaits + ' !' + bouquet + ' 🌿'); }
  else { sfx.sad(); ui.log('Aucune fleur récoltée à temps… guette la pleine floraison ! 🌱'); }
  gainXp(XP.game + sc * XP.fish);
  checkUnlocks();
  persist();
  ui.updateHUD(s, mg, rec);
  quest('games');
  quest('garden');
  if (sc > 0) quest('fish', sc);
  tryDrop();
  careBond('play');
}

/** Retour de balle : la loutre rapporte fièrement -> petit shot de joie. */
export function onFetchDone() {
  sync();
  if (!s || busy() || s.sleeping) return;
  s.fun = clamp(s.fun + 8, 0, 100);
  R.spawn('heart', s.stage); R.burst('sparkle', 4, s.stage); R.ring(s.stage);
  sfx.chirpHappy(); vibrate(12); feel('med');
  careBond('play');
  gainXp(XP.pet);
  ui.log(s.name + ' rapporte la balle, tout fier ! 🎾');
  afterAct();
}
