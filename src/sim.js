// Moteur de simulation PUR : aucune dépendance DOM, horloge et hasard injectés.
// Toute la vie de la loutre passe par ici — en direct comme en rattrapage hors-ligne.
import { H, MIN, HATCH_MS, CHILD_AT, ADULT_AT, MAX_OFFLINE, R, RS, clamp } from './constants.js';

export function ageMs(s, now = Date.now()) {
  if (!s.hatchedAt) return 0;
  return (s.diedAt || now) - s.hatchedAt;
}

export function stageFor(age) {
  return age >= ADULT_AT ? 'adult' : age >= CHILD_AT ? 'child' : 'baby';
}

function hatch(s, simNow, events) {
  s.stage = 'baby';
  s.hatchedAt = simNow;
  s.hunger = 70; s.fun = 80; s.energy = 90; s.clean = 100; s.health = 100;
  events.push({ type: 'hatch' });
}

function die(s, simNow, events) {
  s.gameOver = true;
  s.sleeping = false;
  s.diedAt = simNow;
  events.push({ type: 'die' });
}

/**
 * Fait avancer la vie de `dt` millisecondes.
 * @returns {Array} événements survenus pendant ce pas
 */
export function stepSim(s, dt, opts = {}) {
  const events = opts.events || [];
  if (s.gameOver) return events;
  const offline = !!opts.offline;
  const simNow = opts.simNow || Date.now();
  const rnd = opts.rnd || Math.random;

  // Éclosion (l'œuf ne se dégrade pas)
  if (s.stage === 'egg') {
    if (simNow - s.born >= HATCH_MS) hatch(s, simNow, events);
    return events;
  }

  const h = dt / H; // fraction d'heure simulée

  if (s.sleeping) {
    s.hunger = clamp(s.hunger - RS.hunger * h, 0, 100);
    s.fun    = clamp(s.fun    - RS.fun * h, 0, 100);
    s.clean  = clamp(s.clean  - RS.clean * h, 0, 100);
    s.energy = clamp(s.energy + RS.energyGain * h, 0, 100);
    if (s.energy >= 100) { s.sleeping = false; events.push({ type: 'wake' }); }
  } else {
    const dirtMalus = s.poops.length * 1.2;
    s.hunger = clamp(s.hunger - R.hunger * h, 0, 100);
    s.fun    = clamp(s.fun    - R.fun * h, 0, 100);
    s.energy = clamp(s.energy - R.energy * h, 0, 100);
    s.clean  = clamp(s.clean  - (R.clean + dirtMalus) * h, 0, 100);
    if (s.energy <= 0) { s.sleeping = true; events.push({ type: 'autosleep' }); }
  }

  // Cacas
  if (simNow >= s.nextPoop) {
    if (s.poops.length < 3 && s.hunger > 10) s.poops.push(Math.floor(rnd() * 3));
    s.nextPoop = simNow + (3 + rnd() * 3) * H;
  }

  // Maladie (probabilité par heure simulée)
  if (!s.sick) {
    const p = 0.004 + s.poops.length * 0.02 + (s.clean < 25 ? 0.03 : 0) + (s.hunger < 15 ? 0.02 : 0);
    if (rnd() < p * h) { s.sick = true; events.push({ type: 'sick' }); }
  }

  // Santé
  let dh = 0;
  if (s.hunger <= 0) dh -= 6;
  if (s.clean <= 0) dh -= 4;
  if (s.sick) dh -= 7;
  if (s.energy <= 0 && !s.sleeping) dh -= 3;
  if (dh === 0 && !s.sick && s.hunger > 25 && s.clean > 25) dh = +6;
  s.health = clamp(s.health + dh * h, 0, 100);

  if (s.health <= 0) { die(s, simNow, events); return events; }

  // Croissance
  const st = stageFor(ageMs(s, simNow));
  if (st !== s.stage) {
    s.stage = st;
    events.push({ type: 'evolve', stage: st });
  }

  return events;
}

/**
 * Rattrape le temps écoulé depuis s.lastTick (fermeture de l'app, veille…).
 * @returns {{elapsed: number, events: Array}}
 */
export function simulateOffline(s, nowMs = Date.now(), rnd = Math.random) {
  const elapsed = nowMs - s.lastTick;
  const events = [];
  if (elapsed < 5000) return { elapsed, events };

  let cursor = s.lastTick;
  const target = Math.min(nowMs, s.lastTick + MAX_OFFLINE);
  while (cursor < target && !s.gameOver) {
    const step = Math.min(MIN, target - cursor);
    cursor += step;
    stepSim(s, step, { offline: true, simNow: cursor, rnd, events });
  }
  // Éclosion survenue pendant l'absence
  if (!s.gameOver && s.stage === 'egg' && nowMs - s.born >= HATCH_MS) {
    hatch(s, nowMs, events);
  }
  s.lastTick = nowMs;
  return { elapsed, events };
}
