// Moteur de simulation PUR : aucune dépendance DOM, horloge et hasard injectés.
// Toute la vie de la loutre passe par ici — en direct comme en rattrapage hors-ligne.
import { H, MIN, HATCH_MS, CHILD_AT, ADULT_AT, MAX_OFFLINE, R, RS, SEASON_FX, clamp } from './constants.js';
import { seasonFor } from './seasons.js';
import { equipBonus } from './skins.js';

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

/**
 * v2.7 : la loutre ne meurt plus — négligée, elle part bouder CHEZ LE HÉRON.
 * Là-bas elle est en sécurité (plus aucune décroissance) ; on la ramène par
 * un rituel de soins en 3 visites espacées (voir actCare côté orchestrateur).
 * L'irréversible faisait désinstaller ; l'absence réparable fait revenir.
 */
function goAway(s, simNow, events) {
  s.away = true;
  s.awayAt = simNow;
  s.awayCare = 0;
  s.awayNextCare = 0;
  s.sleeping = false;
  s.sick = false; // le héron la soigne — c'est le retour qui se mérite
  events.push({ type: 'away' });
}

/**
 * Fait avancer la vie de `dt` millisecondes.
 * @returns {Array} événements survenus pendant ce pas
 */
export function stepSim(s, dt, opts = {}) {
  const events = opts.events || [];
  if (s.gameOver || s.away) return events; // gameOver : sauvegardes d'avant v2.7
  const offline = !!opts.offline;
  const simNow = opts.simNow || Date.now();
  const rnd = opts.rnd || Math.random;

  // Éclosion (l'œuf ne se dégrade pas)
  if (s.stage === 'egg') {
    if (simNow - s.born >= HATCH_MS) hatch(s, simNow, events);
    return events;
  }

  const h = dt / H; // fraction d'heure simulée
  const season = seasonFor(new Date(simNow)); // saison réelle, déterministe
  const heat = season === 'ete';
  const cold = season === 'hiver';
  const gear = equipBonus(s);                 // bonus de tout l'équipement porté
  const gd = gear.decay || 1;                 // jauges plus lentes (< 1)

  if (s.sleeping) {
    s.hunger = clamp(s.hunger - RS.hunger * gd * h, 0, 100);
    s.fun    = clamp(s.fun    - RS.fun * gd * h, 0, 100);
    s.clean  = clamp(s.clean  - RS.clean * gd * h, 0, 100);
    s.energy = clamp(s.energy + RS.energyGain * h, 0, 100);
    if (s.energy >= 100) { s.sleeping = false; events.push({ type: 'wake' }); }
  } else {
    const dirtMalus = s.poops.length * 1.2;
    // été : la chaleur accélère faim (soif), humeur et énergie
    const m = heat ? SEASON_FX.HEAT_MULT : null;
    s.hunger = clamp(s.hunger - R.hunger * (m ? m.hunger : 1) * gd * h, 0, 100);
    s.fun    = clamp(s.fun    - R.fun    * (m ? m.fun    : 1) * gd * h, 0, 100);
    s.energy = clamp(s.energy - R.energy * (m ? m.energy : 1) * gd * h, 0, 100);
    s.clean  = clamp(s.clean  - (R.clean + dirtMalus) * gd * h, 0, 100);
    if (s.energy <= 0) { s.sleeping = true; events.push({ type: 'autosleep' }); }
  }

  // Cacas
  if (simNow >= s.nextPoop) {
    if (s.poops.length < 3 && s.hunger > 10) s.poops.push(Math.floor(rnd() * 3));
    s.nextPoop = simNow + (3 + rnd() * 3) * H;
  }

  // Maladie (probabilité par heure simulée) — l'hiver, le froid fait attraper froid
  if (!s.sick) {
    let p = 0.004 + s.poops.length * 0.02 + (s.clean < 25 ? 0.03 : 0) + (s.hunger < 15 ? 0.02 : 0);
    if (cold) {
      const coldTerm = SEASON_FX.COLD_SICK
        + (s.energy < SEASON_FX.COLD_LOW_ENERGY ? SEASON_FX.COLD_SICK_TIRED : 0)
        + (s.hunger < SEASON_FX.COLD_LOW_HUNGER ? SEASON_FX.COLD_SICK_HUNGRY : 0);
      p += coldTerm * (1 - (gear.coldResist || 0)); // un trésor peut atténuer le froid
    }
    if (rnd() < p * h) { s.sick = true; events.push({ type: 'sick' }); }
  }

  // Santé
  let dh = 0;
  if (s.hunger <= 0) dh -= 6;
  if (s.clean <= 0) dh -= 4;
  if (s.sick) dh -= 7;
  if (s.energy <= 0 && !s.sleeping) dh -= 3;
  // été : surchauffe si elle n'est pas rafraîchie (un bain la refroidit)
  if (heat && s.clean < SEASON_FX.HEAT_OVERHEAT_CLEAN) dh -= SEASON_FX.HEAT_OVERHEAT_HP * (1 - (gear.heatResist || 0));
  if (dh === 0 && !s.sick && s.hunger > 25 && s.clean > 25) dh = +6;
  s.health = clamp(s.health + dh * h, 0, 100);

  if (s.health <= 0) { goAway(s, simNow, events); return events; }

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
  while (cursor < target && !s.gameOver && !s.away) {
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
