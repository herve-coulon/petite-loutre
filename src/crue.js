// La Crue (É5b) — le rendez-vous HEBDOMADAIRE de la vallée. Logique PURE, seedée
// par la SEMAINE ISO : deux joueurs, la même semaine → exactement la même Crue
// (même lieu, même météo, même championne). Testée node --test, sans DOM.
import { hashSeed, makeRng } from './battle.js';

// Clé de semaine ISO : 'YYYY-Www' (lundi = début, jeudi = pivot). Basée sur l'UTC,
// comme dayKey (toISOString) — cohérent d'un fuseau à l'autre.
export function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;                 // dimanche(0) → 7
  d.setUTCDate(d.getUTCDate() + 4 - day);         // le jeudi de la semaine ISO
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

// Les habillages météo possibles de la Crue (la météo existante l'habille).
export const CRUE_WEATHERS = ['orage', 'brume', 'canicule', 'crue', 'grand-vent'];
const CRUE_WEATHER_LABEL = {
  orage: 'Crue d\'orage', brume: 'Crue de brume', canicule: 'Crue de canicule',
  crue: 'Grande Crue', 'grand-vent': 'Crue de grand-vent'
};
export const MEDALS = ['bronze', 'argent', 'or'];
const CHAMPION_NAMES = ['Ondine', 'Rade', 'Marée', 'Écume', 'Nixe', 'Houle', 'Vague', 'Sirène'];

/**
 * La Crue de la semaine, déterministe.
 * @param weekKey  clé ISO (isoWeekKey)
 * @param zoneIds  liste des lieux de la vallée (on en tire UN)
 * @param skillPool  ids de talents disponibles (on en rend 1-2, « visibles »)
 */
export function crueOfWeek(weekKey, zoneIds, skillPool) {
  const rng = makeRng(hashSeed('crue|' + weekKey));
  const zones = (zoneIds && zoneIds.length) ? zoneIds : ['clairiere'];
  const zone = zones[Math.floor(rng() * zones.length)];
  const weather = CRUE_WEATHERS[Math.floor(rng() * CRUE_WEATHERS.length)];
  const name = CHAMPION_NAMES[Math.floor(rng() * CHAMPION_NAMES.length)];
  const powerMult = Math.round((1.5 + Math.floor(rng() * 6) * 0.1) * 100) / 100; // 1.5..2.0
  // talents visibles : jusqu'à 2, tirés sans doublon du pool fourni
  const pool = (skillPool || []).slice();
  const talents = [];
  while (talents.length < 2 && pool.length) talents.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return {
    week: weekKey, zone, weather,
    weatherLabel: CRUE_WEATHER_LABEL[weather] || 'Crue',
    name, powerMult, talents,
    seed: 'crue|' + weekKey,                     // seed du duel (rejoue à l'identique)
    tiers: [
      { medal: 'bronze', desc: 'Vaincre la championne' },
      { medal: 'argent', desc: 'La vaincre en gardant au moins la moitié de tes PV' },
      { medal: 'or', desc: 'La vaincre presque sans une égratignure' }
    ]
  };
}

// Médaille selon la performance : victoire + fraction de PV restants (0..1).
export function medalFor(won, hpFrac) {
  if (!won) return 'none';
  if (hpFrac >= 0.8) return 'or';
  if (hpFrac >= 0.5) return 'argent';
  return 'bronze';
}

// Rang d'une médaille — pour ne conserver que la MEILLEURE de la semaine.
export function medalRank(m) { return ({ none: 0, bronze: 1, argent: 2, or: 3 })[m] || 0; }
export function bestMedal(a, b) { return medalRank(a) >= medalRank(b) ? a : b; }

// Récompense d'une médaille : matériaux d'atelier (doublons) + gemmes — JAMAIS de
// puissance exclusive (cf. charte F2P doux). Chaque médaille se réclame une fois/semaine.
export function crueReward(medal) {
  switch (medal) {
    case 'bronze': return { gems: 3, dupes: 1, dupesTier: 'commun' };
    case 'argent': return { gems: 6, dupes: 1, dupesTier: 'rare' };
    case 'or': return { gems: 12, dupes: 1, dupesTier: 'epique' };
    default: return { gems: 0, dupes: 0, dupesTier: null };
  }
}

/**
 * Applique les récompenses CUMULÉES d'une médaille sur des objets simples
 * (prog = { best, claimed:[] } ; rec = { gems, dupes }). Chaque palier atteint et
 * NON encore réclamé cette semaine est crédité une fois ; on garde la meilleure
 * médaille. Pur → testable sans DOM ni combat. Retourne { granted:[…], gems }.
 */
export function claimCrueRewards(prog, rec, medal) {
  prog.best = bestMedal(prog.best || 'none', medal);
  prog.claimed = prog.claimed || [];
  rec.dupes = rec.dupes || {};
  let gems = 0; const granted = [];
  for (const m of MEDALS) {                       // ['bronze','argent','or']
    if (medalRank(m) <= medalRank(medal) && !prog.claimed.includes(m)) {
      prog.claimed.push(m);
      const rw = crueReward(m);
      rec.gems = (rec.gems || 0) + rw.gems; gems += rw.gems;
      if (rw.dupesTier && rw.dupes) rec.dupes[rw.dupesTier] = (rec.dupes[rw.dupesTier] || 0) + rw.dupes;
      granted.push(m);
    }
  }
  return { granted, gems };
}
