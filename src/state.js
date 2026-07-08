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
    hat: null,
    fur: 'roux',
    decor: 'aucun',
    lastTreat: 0,
    divingUntil: 0,
    grumpyUntil: 0,
    away: false, awayAt: 0, awayCare: 0, awayNextCare: 0,
    fed: 0, played: 0, washed: 0, healed: 0,
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
  if (typeof o.away !== 'boolean') o.away = false;
  for (const k of ['awayAt', 'awayCare', 'awayNextCare']) {
    if (typeof o[k] !== 'number') o[k] = 0;
  }
  if (!Array.isArray(o.poops)) o.poops = [];
  for (const k of ['fed', 'played', 'washed', 'healed']) {
    if (typeof o[k] !== 'number') o[k] = 0;
  }
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
    sleepsTotal: 0,
    treasures: 0,
    wins: 0,
    battles: 0,
    questsDone: 0,
    xp: 0,
    streakCount: 0,
    streakDay: null,
    streakBest: 0,
    achievements: []
  };
}

function normalizeRecords(o) {
  if (!o || o.v !== 1) return null;
  const base = newRecords();
  for (const k of Object.keys(base)) {
    if (o[k] === undefined) o[k] = base[k];
  }
  if (!Array.isArray(o.achievements)) o.achievements = [];
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
