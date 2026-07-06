// État du jeu + persistance. Aucune dépendance DOM : le stockage est injecté.
import { SAVE_KEY, H } from './constants.js';

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
    fed: 0, played: 0, washed: 0, healed: 0,
    lastTick: now
  };
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
    const o = JSON.parse(raw);
    if (!o || (o.v !== 2 && o.v !== 1)) return null;
    if (o.v === 1) { o.v = 2; o.diedAt = o.diedAt || null; } // migration v1
    return o;
  } catch (e) { return null; }
}

export function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (e) {}
}
