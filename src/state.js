// État du jeu + records globaux + persistance + export/import.
// Aucune dépendance DOM : le stockage est injecté.
import { SAVE_KEY, H } from './constants.js';
import { levelFromXp } from './level.js';
import { seasonGiftKey, GIFT_NEED_TREATS } from './seasonpass.js';   // migration douce du cadeau de saison

export const REC_KEY = 'petite_loutre_records_v1';
const EXPORT_PREFIX = 'LOUTRE1.';

/* ---------------- Assainissement (audit M7) ----------------
   Un code de sauvegarde est une entrée NON fiable : taille non bornée, valeurs
   absurdes (1e999 -> Infinity au parse, chaînes, null), clés inconnues.
   On borne/clamp tout ce qui peut casser la simulation ou l'UI — sans jamais
   rejeter une save légitime. Appliqué à l'import ET au chargement. */
const MAX_SAVE_B64 = 100_000;   // ~75 Ko JSON — une save normale fait quelques Ko
const MAX_STR = 64;             // longueur max d'une chaîne de champ
const MAX_ARR = 5000;           // longueur max d'un tableau (tronqué, jamais rejeté)
const STAGE_WHITELIST = ['egg', 'baby', 'child', 'adult'];

function clampNum(v, def, lo, hi) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(hi, Math.max(lo, n));
}

/** Tue NaN/Infinity (dont 1e999 au parse), tronque chaînes et tableaux géants. */
function hardenObject(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isFinite(v)) o[k] = 0;
    else if (typeof v === 'string' && v.length > MAX_STR) o[k] = v.slice(0, MAX_STR);
    else if (Array.isArray(v)) {
      if (v.length > MAX_ARR) o[k] = v.slice(0, MAX_ARR);
      hardenObject(o[k], depth + 1);
    } else if (v && typeof v === 'object') hardenObject(v, depth + 1);
  }
}

/** Champs numériques des records : doivent rester des nombres finis ≥ 0. */
const NUMERIC_REC_FIELDS = [
  'fish', 'shells', 'gems', 'xp', 'streakCount', 'streakBest', 'levelReached',
  'bestAge', 'mealsTotal', 'bathsTotal', 'gamesTotal', 'fishTotal',
  'perfectGames', 'slidesTotal', 'slideBest', 'perfectSlides', 'sleepsTotal',
  'treasures', 'treatsTotal', 'questsDone', 'wins', 'battles', 'achSeen', 'otters'
];

function sanitizeState(s) {
  // 1) ciblé sur les VALEURS D'ORIGINE (avant hardenObject : un 1e999 doit
  //    retomber sur un défaut sain, pas sur 0).
  // nom : chaîne bornée (64 — la saisie plafonne à 12, mais une vieille save
  //    légitime peut porter plus), sinon null
  s.name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, MAX_STR) : null;
  // stade : whitelist, sinon on déduit de l'éclosion
  if (!STAGE_WHITELIST.includes(s.stage)) s.stage = s.hatchedAt ? 'baby' : 'egg';
  // jauges : dans [0,100], défauts sains si absurdes
  s.hunger = clampNum(s.hunger, 80, 0, 100);
  s.fun = clampNum(s.fun, 80, 0, 100);
  s.energy = clampNum(s.energy, 80, 0, 100);
  s.clean = clampNum(s.clean, 100, 0, 100);
  s.health = clampNum(s.health, 100, 0, 100);
  // horodatages : finis, bornés (pas de born du futur lointain, pas de NaN)
  const nowT = Date.now();
  s.born = clampNum(s.born, nowT, 0, nowT + 86400000);
  if (s.hatchedAt != null && !Number.isFinite(s.hatchedAt)) s.hatchedAt = null;
  if (s.diedAt != null && !Number.isFinite(s.diedAt)) s.diedAt = null;
  if (typeof s.nextPoop !== 'number' || !Number.isFinite(s.nextPoop)) s.nextPoop = nowT + H;
  // cacas : nombres uniquement, au plus 3 (comme le jeu)
  s.poops = Array.isArray(s.poops)
    ? s.poops.filter(p => typeof p === 'number' && Number.isFinite(p)).slice(0, 3)
    : [];
  // 2) générique : NaN/Infinity résiduels -> 0, chaînes/tableaux géants tronqués
  hardenObject(s);
  return s;
}

function sanitizeRecords(rec) {
  hardenObject(rec);
  for (const k of NUMERIC_REC_FIELDS) {
    if (typeof rec[k] !== 'number' || !Number.isFinite(rec[k]) || rec[k] < 0) rec[k] = 0;
  }
  return rec;
}

export function newState(now = Date.now(), rnd = Math.random) {
  return {
    v: 2,
    name: null,
    born: now,
    hatchedAt: null,
    diedAt: null,
    stage: 'egg',
    hunger: 80, fun: 80, energy: 80, clean: 100, health: 100,
    sleeping: false,
    sick: false,
    poops: [],
    nextPoop: now + (3 + rnd() * 2) * H,
    gameOver: false,
    mute: false,
    music: true,
    volume: 0.7,   // volume maître 0..1 (réglé dans ⚙️)
    bigText: false,      // accessibilité : texte agrandi
    reduceMotion: false, // accessibilité : animations réduites (init. sur la pref OS au boot)
    questCollapsed: false, // bandeau de quêtes replié (É4) — laisse respirer l'eau
    livingDialogues: true, // « Dialogues vivants » (v3.95) : habitants générés LOCALEMENT — ON par défaut (gratuit, hors-ligne)
    livingV2: true,        // marqueur : bascule unique vers le défaut ON de la version locale
    push: false,
    hat: null,
    fur: 'roux',
    decor: 'aucun',
    lastTreat: 0,
    divingUntil: 0,
    grumpyUntil: 0,
    away: false, awayAt: 0, awayCare: 0, awayNextCare: 0,
    fed: 0, played: 0, washed: 0, healed: 0,
    storySeen: [],   // chapitres narratifs déjà joués (fil de l'aventure)
    coach: true,     // premiers pas guidés en cours (tutoriel doux)
    season: null,    // dernière saison connue (null = à initialiser en silence)
    gear: null,      // trésor équipé (id) — bonus de jeu, par loutre
    trait: null,     // personnalité, tirée au baptême (chaque loutre est unique)
    generation: 1,   // La lignée (v4.1) : rang dans le fil des vies (1 = la fondatrice)
    heirOf: null,    // nom de la loutre dont celle-ci descend (null pour la 1re)
    heirTrait: null, // trait hérité à appliquer au baptême (null → tirage libre)
    elderSeen: false, // La vieillesse (v4.2) : l'annonce « aînée » a-t-elle été faite ?
    criticalAt: 0,   // Détresse (v4.10) : depuis quand la santé est à 0 (grâce avant le héron) ; 0 = va bien
    dayActs: null,   // Bonus de variété (v4.7) : { date, done:[…] } — activités déjà faites aujourd'hui
    bond: 0,         // lien/affinité avec CETTE loutre, grandit avec les soins
    telemetry: true,      // statistiques anonymes (opt-out dans ⚙️)
    telemetryId: null,    // identifiant aléatoire, généré au 1er envoi
    lastTelemetryDay: null, // dernier jour de ping envoyé AVEC SUCCÈS (retry m8)
    nextTelemetryRetry: 0,  // throttle de réessai après un ping raté (audit m8)
    lastTick: now
  };
}

/** Complète une sauvegarde d'une version antérieure avec les champs manquants. */
function normalizeState(o) {
  if (!o || (o.v !== 2 && o.v !== 1)) return null;
  o.v = 2;
  if (o.diedAt === undefined) o.diedAt = null;
  if (o.hat === undefined) o.hat = null;
  if (o.fur === undefined) o.fur = 'roux';
  if (o.decor === undefined) o.decor = 'aucun';
  if (typeof o.lastTreat !== 'number') o.lastTreat = 0;
  if (typeof o.divingUntil !== 'number') o.divingUntil = 0;
  if (typeof o.grumpyUntil !== 'number') o.grumpyUntil = 0;
  if (typeof o.music !== 'boolean') o.music = true;
  if (typeof o.volume !== 'number' || o.volume < 0 || o.volume > 1) o.volume = 0.7;
  if (typeof o.bigText !== 'boolean') o.bigText = false;
  if (typeof o.reduceMotion !== 'boolean') o.reduceMotion = false;
  if (typeof o.questCollapsed !== 'boolean') o.questCollapsed = false;
  if (typeof o.generation !== 'number' || o.generation < 1) o.generation = 1;   // lignée (v4.1)
  if (o.heirOf === undefined) o.heirOf = null;
  if (o.heirTrait === undefined) o.heirTrait = null;
  if (typeof o.elderSeen !== 'boolean') o.elderSeen = false; // v4.2
  if (typeof o.criticalAt !== 'number') o.criticalAt = 0;    // v4.10 (détresse)
  if (typeof o.livingDialogues !== 'boolean') o.livingDialogues = true;    // v3.95 : local, ON par défaut
  // Bascule UNIQUE : les saves d'avant la version locale (Kimi, réglage à false et
  // inopérant sans clé) passent une fois au nouveau défaut ON. L'utilisateur peut re-couper.
  if (!o.livingV2) { o.livingDialogues = true; o.livingV2 = true; }
  if (typeof o.push !== 'boolean') o.push = false;
  if (typeof o.away !== 'boolean') o.away = false;
  for (const k of ['awayAt', 'awayCare', 'awayNextCare']) {
    if (typeof o[k] !== 'number') o[k] = 0;
  }
  if (!Array.isArray(o.poops)) o.poops = [];
  for (const k of ['fed', 'played', 'washed', 'healed']) {
    if (typeof o[k] !== 'number') o[k] = 0;
  }
  if (!Array.isArray(o.storySeen)) o.storySeen = [];
  // sauvegardes d'avant le fil narratif : loutre déjà grandie -> pas de tutoriel
  // rétroactif, mais on laisse les chapitres se rejouer une fois (storySeen vide).
  if (typeof o.coach !== 'boolean') o.coach = (o.stage === 'egg' || o.stage === 'baby');
  // saison : null -> initialisée en silence au 1er tick (pas de fausse transition)
  if (typeof o.season !== 'string') o.season = null;
  if (o.gear === undefined) o.gear = null; // trésor équipé
  if (o.trait === undefined) o.trait = null; // personnalité (assignée au besoin par l'orchestrateur)
  if (typeof o.bond !== 'number') o.bond = 0;
  if (typeof o.telemetry !== 'boolean') o.telemetry = true;
  if (typeof o.telemetryId !== 'string') o.telemetryId = null;
  if (typeof o.lastTelemetryDay !== 'string') o.lastTelemetryDay = null;
  if (typeof o.nextTelemetryRetry !== 'number' || o.nextTelemetryRetry < 0) o.nextTelemetryRetry = 0;
  // échelle courante de l'aventure (monde / berge / tanière) — repli sur berge
  if (o.place !== 'taniere' && o.place !== 'monde') o.place = 'berge';
  if (!o.hints || typeof o.hints !== 'object') o.hints = {}; // astuces de gestes déjà vues
  return o;
}

export function saveState(s, storage, now = Date.now()) {
  if (!s || !storage) return false;
  s.lastTick = now;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch (e) { return false; }
}

export function loadState(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const st = normalizeState(JSON.parse(raw));
    return st ? sanitizeState(st) : null;   // assainissement (audit M7) : même une save locale corrompue ne casse rien
  } catch (e) { return null; }
}

export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (e) {}
}

/* ---------------- Records globaux (conservés entre les vies) ---------------- */

export function newRecords() {
  return {
    v: 1,
    bestAge: 0,        // plus longue vie (ms)
    otters: 0,         // loutres parties
    mealsTotal: 0,
    bathsTotal: 0,
    gamesTotal: 0,
    fishTotal: 0,
    perfectGames: 0,
    slidesTotal: 0,     // descentes de toboggan
    slideBest: 0,       // meilleur score de descente
    perfectSlides: 0,   // descentes sans toucher de rocher
    sleepsTotal: 0,
    treasures: 0,
    treatsTotal: 0,     // trésors de saison récoltés (total à vie — records/UI)
    treatsBySeason: {}, // trésors récoltés par (saison, année) — preuve de jeu du cadeau
    gems: 0,            // gemmes 💎 — monnaie gagnée (cadeaux de saison…)
    fish: 0,            // 🐟 portefeuille DÉPENSABLE (repas/recrutement/troc) — distinct de fishTotal (à vie)
    shells: 0,          // 🐚 portefeuille DÉPENSABLE (troc) — distinct de treatsTotal (à vie)
    dupes: {},          // doublons de trésors par tier (atelier) : {commun,rare,epique,legendaire}
    barterDay: null,    // jour (dayKey) du dernier troc — réinitialise les offres à minuit
    barterUsed: [],     // ids d'offres de troc déjà prises aujourd'hui
    crue: null,         // La Crue (É5b) : { week, best, claimed:[] } — progrès de la semaine courante
    crueNotified: null, // dernière semaine ISO notifiée « la Crue est arrivée » (push opt-in)
    marcheSeen: false,  // Le Marché (v3.96) : le petit mot d'accueil « ta bourse » a été montré une fois
    dojoBest: 0,        // Dojo de parade (v4.0) : meilleur score jamais réalisé (→ Records du Carnet)
    dojoDay: null,      // jour (dayKey) de la dernière récompense de dojo (une fois par jour)
    items: [],          // trésors rares possédés (ids) — global, survit aux loutres
    wins: 0,
    battles: 0,
    questsDone: 0,
    xp: 0,
    levelReached: 0,   // niveau le plus haut jamais atteint (cliquet : ne redescend plus)
    streakCount: 0,
    streakDay: null,
    streakBest: 0,
    achievements: [],
    achSeen: 0,          // nb de succès déjà consultés (badge de notif = non-vus)
    gang: null,          // le gang du joueur (survit aux loutres) — cf. gang.js
    recruited: [],       // ids des recrues déjà enrôlées (anti-doublon monde/escouade)
    found: [],           // trouvailles déjà ramassées (une seule fois par jour et par zone)
    foundKinds: [],      // SORTES de trouvailles déjà découvertes (album du Carnet du naturaliste)
    visited: [],         // lieux déjà découverts (carte de la vallée + arrivée mise en scène)
    seasonGifts: {},     // cadeaux de saison réclamés, par clé (cf. seasonpass.js)
    almanach: {},        // Almanach : paliers réclamés par (saison, année) → [indices] (cf. almanach.js)
    memorial: [],        // La lignée (v4.1) : les loutres passées {name,trait,fur,hat,ageMs,generation}
    lifecycle: false     // Le cycle de vie complet (v4.2) : mortalité douce, opt-in, survit aux générations
  };
}

function normalizeRecords(o) {
  if (!o || o.v !== 1) return null;
  // treatsBySeason (v3.89) : preuve de jeu PAR saison. AVANT d'appliquer les
  // défauts, on migre en douceur une vieille save : si elle a déjà des trésors
  // (donc a joué) mais pas encore ce champ, on lui crédite la saison COURANTE
  // une seule fois — on ne lui vole pas le cadeau qu'elle était sur le point
  // d'obtenir. Sinon (ou save neuve), map vide ; les saisons futures exigeront
  // une vraie récolte.
  if (o.treatsBySeason === undefined || typeof o.treatsBySeason !== 'object') {
    o.treatsBySeason = (o.treatsTotal || 0) >= GIFT_NEED_TREATS
      ? { [seasonGiftKey()]: o.treatsTotal } : {};
  }
  // Portefeuilles dépensables (É5) : une save d'avant l'économie n'avait qu'un
  // compteur À VIE (fishTotal/treatsTotal). On crédite le portefeuille du cumul
  // déjà gagné (on ne vole rien), puis les deux vivent en parallèle. À faire
  // AVANT le remplissage par défaut, sinon ils repartiraient à 0.
  if (typeof o.fish !== 'number') o.fish = o.fishTotal || 0;
  if (typeof o.shells !== 'number') o.shells = o.treatsTotal || 0;
  if (!o.dupes || typeof o.dupes !== 'object') o.dupes = {};
  if (o.crue !== null && (typeof o.crue !== 'object')) o.crue = null;   // La Crue (É5b)
  const base = newRecords();
  for (const k of Object.keys(base)) {
    if (o[k] === undefined) o[k] = base[k];
  }
  if (!Array.isArray(o.achievements)) o.achievements = [];
  if (!Array.isArray(o.items)) o.items = [];
  if (!Array.isArray(o.recruited)) o.recruited = [];
  if (!Array.isArray(o.barterUsed)) o.barterUsed = [];
  if (!Array.isArray(o.found)) o.found = [];
  if (!Array.isArray(o.foundKinds)) o.foundKinds = [];   // album des sortes (Carnet)
  if (!Array.isArray(o.memorial)) o.memorial = [];       // la lignée (v4.1)
  if (typeof o.lifecycle !== 'boolean') o.lifecycle = false; // cycle de vie complet (v4.2)
  if (!Array.isArray(o.visited)) o.visited = [];
  if (!o.seasonGifts || typeof o.seasonGifts !== 'object') o.seasonGifts = {};
  if (!o.almanach || typeof o.almanach !== 'object') o.almanach = {};   // Almanach de saison
  if (o.gang !== null && (typeof o.gang !== 'object')) o.gang = null;
  // Migration douce : levelReached (v3.77) — computed from xp for old saves
  if (!o.levelReached || o.levelReached < 1) {
    o.levelReached = levelFromXp(o.xp || 0).level;
  }
  return o;
}

export function loadRecords(storage) {
  if (!storage) return newRecords();
  try {
    const raw = storage.getItem(REC_KEY);
    if (!raw) return newRecords();
    return sanitizeRecords(normalizeRecords(JSON.parse(raw)) || newRecords());
  } catch (e) { return newRecords(); }
}

export function saveRecords(rec, storage) {
  if (!rec || !storage) return false;
  try {
    storage.setItem(REC_KEY, JSON.stringify(rec));
    return true;
  } catch (e) { return false; }
}

/* ---------------- Export / import (transfert de téléphone) ---------------- */

function toB64(str) {
  // btoa n'accepte pas l'Unicode brut (noms avec accents/emoji)
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, 'utf8').toString('base64');
}
function fromB64(b64) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf8');
}

/** Sérialise l'état + records en un code copiable. */
export function exportSave(s, rec) {
  const payload = JSON.stringify({ s, rec, t: Date.now() });
  return EXPORT_PREFIX + toB64(payload);
}

/** @returns {{s: object, rec: object}|null} */
export function importSave(code) {
  try {
    const trimmed = String(code).trim();
    if (!trimmed.startsWith(EXPORT_PREFIX)) return null;
    if (trimmed.length > MAX_SAVE_B64) return null;   // borne anti-abus (audit M7)
    const payload = JSON.parse(fromB64(trimmed.slice(EXPORT_PREFIX.length)));
    const s = normalizeState(payload.s);
    if (!s) return null;
    const rec = sanitizeRecords(normalizeRecords(payload.rec) || newRecords());
    return { s: sanitizeState(s), rec };
  } catch (e) { return null; }
}
