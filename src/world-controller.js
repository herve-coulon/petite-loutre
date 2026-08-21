// Contrôleur du « Monde » (balade libre, rencontres, recrutement, épreuves,
// chasseur, coffres, trouvailles) — extrait de main.js (audit M5, tranche 9).
// LA plus grosse et la plus couplée : l'état runtime `world`/`encounterOtter`
// vit ICI (non persisté), lu par la boucle de rendu via getWorld(). Tout le
// reste du jeu (état, records, combat, trésors, crue, marché, renderer, quêtes,
// XP, persistance, créatures de berge, compteur de frames) est injecté par
// setupWorld — AUCun accès direct à la portée de main.js. Déplacement verbatim.
import {
  ZONES, ZONE_INTRO, SPECIALITE, HABITANT, COFFRE, EPREUVE, EPREUVE_ZONES, COFFRE_ZONES,
  START_ZONE, MAP_W, MAP_H, TILE, WORLD_W, WORLD_H,
  zoneById, zoneFinds, zoneDuJour, zoneUnlocked, zoneReq, zoneGates, zoneExit,
  habitantAt, coffreAt, epreuveAt, spawnPoint, safeEntry, nearestFree, findPath,
  moveWithCollision, isSolid
} from './tilemap.js';
import { CANVAS_W, CANVAS_H } from './render.js';
import { UNLOCK_LEVEL } from './constants.js';
import { wildFoe, makeFighter } from './battle.js';
import { chasseurRode, newChasseur, stepChasseur, DEGATS_CAPTURE } from './chasseur.js';
import { makeGang, recruit, recruitBoard, MAX_MEMBERS } from './gang.js';
import { addSeasonTreat } from './seasonpass.js';
import { itemById, RARITIES } from './items.js';
import { weatherFor } from './weather.js';
import { seasonFor } from './seasons.js';
import { livingLine } from './dialogue.js';
import { spawnCreatures } from './creatures.js';
import { dayKey } from './quests.js';
import { clamp } from './constants.js';
import { XP } from './level.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';
import * as ambient from './ambient.js';

const now = () => Date.now();
const BEFRIEND_NEED = 3;

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, rec = null, mg = null, frame = 0, R = null, battle = null;
function sync() {
  s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame();
  frame = ctx.getFrame(); battle = ctx.getBattle();
}
/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupWorld(hooks) { ctx = hooks; R = hooks.R; battleStarter = hooks.launchBattle; }

// Ponts de la couture Combat (le moteur de combat reste dans main.js, tranche 10) :
// main.js réinitialise le drapeau de duel au lancement, et efface l'épreuve à la
// fermeture de l'arène — ces deux états vivent ici avec la logique de résultat.
export function resetBattleDone() { battleDone = false; }
export function clearEpreuve() { epreuveEnCours = null; }
export function onDuelOverBridge() { sync(); onDuelOver(); }

// Raccourcis vers les helpers/domaines encore dans main.js ou d'autres contrôleurs.
const curLevel = () => ctx.level();
const denAvailable = () => ctx.denAvailable();
const updatePlaceBtn = () => ctx.updatePlaceBtn();
const messageImportant = (m) => ctx.messageImportant(m);
const quest = (k, n) => ctx.quest(k, n);
const gainXp = (n) => ctx.gainXp(n);
const persist = () => ctx.persist();
const persistRec = () => ctx.persistRec();
const checkUnlocks = () => ctx.checkUnlocks();
const isRecruited = (id) => ctx.isRecruited(id);
const markRecruited = (id) => ctx.markRecruited(id);
const endGarden = (res) => ctx.endGarden(res);
const newGarden = (t) => ctx.newGarden(t);
const tryDrop = (b) => ctx.tryDrop(b);
const openBarter = () => ctx.openBarter();
const currentCrue = () => ctx.currentCrue();
const maybeNotifyCrue = () => ctx.maybeNotifyCrue();
const crueBannerOnce = () => ctx.crueBannerOnce();
const crueDuelActive = () => ctx.crueDuelActive();
const resolveCrueDuel = (won) => ctx.resolveCrueDuel(won);

// État runtime du Monde (non persisté), et l'interface de duel.
let world = null;
let encounterOtter = null;
let battleStarter = null;   // = ctx.launchBattle, câblé dans setupWorld
let epreuveEnCours = null;
let battleDone = false;

/** La boucle de rendu lit le monde ici. */
export function getWorld() { return world; }
export function getEnc() { return encounterOtter; }

/* ---------------- Le Monde : balade libre, rencontres, recrutement ---------------- */
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
export function epreuvesGagnees() {
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
export function coffresOuverts() {
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
export function worldTravelHandler() {
  sync();
  if (!denAvailable()) return null;                 // œuf, absence, mini-jeu : pas de départ
  if (s.place === 'monde' && world) return travelTo;
  return (zoneId) => {
    sync();
    if (!isVisited(zoneId) || !zoneUnlocked(zoneId, curLevel())) return false;
    enterWorld(zoneId);
    ui.hideOverlay('ovl-menu');
    return true;
  };
}

function travelTo(zoneId) {
  sync();
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
    ctx.setMinigame(mg);   // le mini-jeu vit dans main.js : lui pousser l'état, sinon la boucle ne l'anime pas
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
export function enterWorld(zoneId) {
  sync();
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
  if (crueBannerOnce()) {
    const cz = zoneById(cr.zone);
    messageImportant('🌊 ' + cr.weatherLabel + ' cette semaine — ' + cr.name + ' rôde à ' + cz.name + '. (Profil → 🌊 La Crue)');
  }
}

/** Quitte la vallée, retour à la berge. */
export function exitWorld() {
  sync();
  world = null; encounterOtter = null;
  ui.hideOverlay('ovl-encounter');
  s.place = 'berge';
  ctx.setBerCreatures(spawnCreatures('clairiere', Math.random)); // créatures de la berge
  sfx.press(); vibrate(8);
  ui.log((s.name || 'La loutre') + ' rentre au bord de la rivière. 🌊');
  updatePlaceBtn(); persist();
}

/** Un pas de simulation du Monde (déplacement de la loutre + rencontres), chaque frame. */
export function stepWorld() {
  if (!world) return;
  sync();
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
    if (crueDuelActive()) resolveCrueDuel(true);
  } else {
    s.fun = clamp(s.fun + 2, 0, 100);
    sfx.sad(); ui.toast('💔 Défaite… ça se rejouera !');
    if (epreuveEnCours) ui.log('⚔️ L\'épreuve reste à passer — reviens quand tu seras prête.');
    if (crueDuelActive()) resolveCrueDuel(false);
  }
  epreuveEnCours = null;
  persist(); persistRec(); checkUnlocks();
}

const encHandlers = {
  offer: () => {
    sync();
    const o = encounterOtter; if (!o) return;
    o.friend = (o.friend || 0) + 1;
    R.spawn && R.spawn('heart', s.stage); sfx.happy(); vibrate(8);
    if (o.friend >= BEFRIEND_NEED) befriend(o);
    else ui.renderEncounter(o, rec.gang, BEFRIEND_NEED, encHandlers);
  },
  // la défier : on quitte la rencontre pour l'arène, contre CETTE loutre-là
  fight: () => {
    sync();
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
// (bloc Monde déplacé verbatim ci-dessus — adaptations : sync() aux entrées, hooks ctx.*)

/** Toucher dans le Monde : guide la loutre (coords écran déjà calculées par
 *  onCanvasPointer côté main.js). Extrait verbatim du cas 'monde'. */
export function worldPointer(x, y) {
  sync();
  if (world && !encounterOtter) {
    const cam = worldCam();
    // on peut viser un peu au-delà du bord : c'est ainsi qu'on quitte la zone
    let bx = clamp(x + cam.x, -TILE, WORLD_W + TILE);
    let by = clamp(y + cam.y, -TILE, WORLD_H + TILE);
    const sortie = sortieVisee(x, y);
    if (sortie) { bx = sortie.x; by = sortie.y; }
    // Taper près de la loutre annule le déplacement en cours
    const dx = bx - world.px, dy = by - world.py;
    if (world.route && world.route.length && dx * dx + dy * dy < 400) {
      world.route = null; world.walking = false;
      return;
    }
    // on CONTOURNE les obstacles
    const route = findPath(world.zone, world.px, world.py, bx, by);
    world.route = route;
    const p = route.length ? route.shift() : { x: bx, y: by };
    world.tx = p.x; world.ty = p.y;
  }
}
