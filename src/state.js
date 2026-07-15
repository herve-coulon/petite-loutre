// État du jeu + records globaux + persistance + export/import.
// Aucune dépendance DOM : le stockage est injecté.
import { SAVE_KEY, H } from './constants.js';

export const REC_KEY = 'petite_loutre_records_v1';
const EXPORT_PREFIX = 'LOUTRE1.';

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
    bond: 0,         // lien/affinité avec CETTE loutre, grandit avec les soins
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
    return normalizeState(JSON.parse(raw));
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
    treatsTotal: 0,     // trésors de saison récoltés
    items: [],          // trésors rares possédés (ids) — global, survit aux loutres
    wins: 0,
    battles: 0,
    questsDone: 0,
    xp: 0,
    streakCount: 0,
    streakDay: null,
    streakBest: 0,
    achievements: [],
    gang: null,          // le gang du joueur (survit aux loutres) — cf. gang.js
    seasonGifts: {}      // cadeaux de saison réclamés, par clé (cf. seasonpass.js)
  };
}

function normalizeRecords(o) {
  if (!o || o.v !== 1) return null;
  const base = newRecords();
  for (const k of Object.keys(base)) {
    if (o[k] === undefined) o[k] = base[k];
  }
  if (!Array.isArray(o.achievements)) o.achievements = [];
  if (!Array.isArray(o.items)) o.items = [];
  if (!o.seasonGifts || typeof o.seasonGifts !== 'object') o.seasonGifts = {};
  if (o.gang !== null && (typeof o.gang !== 'object')) o.gang = null;
  return o;
}

export function loadRecords(storage) {
  if (!storage) return newRecords();
  try {
    const raw = storage.getItem(REC_KEY);
    if (!raw) return newRecords();
    return normalizeRecords(JSON.parse(raw)) || newRecords();
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
    const payload = JSON.parse(fromB64(trimmed.slice(EXPORT_PREFIX.length)));
    const s = normalizeState(payload.s);
    const rec = normalizeRecords(payload.rec) || newRecords();
    if (!s) return null;
    return { s, rec };
  } catch (e) { return null; }
}
