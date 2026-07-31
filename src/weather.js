// Météo dynamique : état dérivé de la saison + heure + seed du jour.
// Module pur — aucune dépendance DOM. Les effets visuels sont dans render.js.
import { seasonInfo } from './seasons.js';

// Poids de chaque type de météo par saison (somme = 1)
const SEASON_WEIGHTS = {
  printemps: { clair: 0.45, pluie: 0.35, brouillard: 0.15, orage: 0.05 },
  ete:       { clair: 0.65, canicule: 0.15, orage: 0.10, pluie: 0.10 },
  automne:   { clair: 0.35, pluie: 0.30, brouillard: 0.25, vent: 0.10 },
  hiver:     { clair: 0.30, neige: 0.30, verglas: 0.15, brouillard: 0.15, vent: 0.10 },
};

// Intensité minimale pour que la météo soit visible (sinon on reste 'clair')
const MIN_INTENSITY = 0.25;

/** Hash simple string -> entier non signé (pour le seed). */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) | 0; }
  return h >>> 0;
}

/** RNG déterministe à partir d'un seed entier. */
function rng(seed) {
  let s = seed;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
}

/**
 * Retourne la météo pour un instant donné.
 * @param {Date} now
 * @returns {{ type: string, intensity: number, wind: number }}
 */
export function weatherFor(now) {
  const season = seasonInfo(now);
  const key = season ? season.key : 'printemps';
  const daySeed = hash('weather-' + now.toISOString().slice(0, 10));
  const h = now.getHours();

  // Le matin (6-10h) et le soir (17-21h) sont plus propices aux changements
  const hourFactor = (h >= 6 && h < 10) || (h >= 17 && h < 21) ? 0.7 : 1.0;

  const weights = SEASON_WEIGHTS[key] || SEASON_WEIGHTS.printemps;
  const r = rng(daySeed + h);
  const roll = r() * hourFactor;

  let cumul = 0;
  for (const [type, w] of Object.entries(weights)) {
    cumul += w;
    if (roll < cumul) {
      const intensity = type === 'clair' ? 0 : MIN_INTENSITY + r() * (1 - MIN_INTENSITY);
      const wind = (type === 'vent' || type === 'orage') ? 0.3 + r() * 0.7
        : type === 'neige' ? 0.1 + r() * 0.3 : r() * 0.2;
      return { type, intensity: Math.round(intensity * 100) / 100, wind: Math.round(wind * 100) / 100 };
    }
  }
  return { type: 'clair', intensity: 0, wind: 0 };
}

/** Vrai si la météo est hostile (malus de santé). */
export function isHostile(weather) {
  return weather.type === 'orage' || weather.type === 'verglas' || weather.type === 'canicule';
}

/** Bonus de maladie selon la météo (0 = aucun, 1 = fort). */
export function sicknessBonus(weather) {
  if (weather.type === 'pluie') return 0.15 * weather.intensity;
  if (weather.type === 'brouillard') return 0.10 * weather.intensity;
  if (weather.type === 'verglas') return 0.20 * weather.intensity;
  return 0;
}

/** Label d'affichage pour la météo courante. */
export const WEATHER_LABELS = {
  clair: '☀️ Ciel dégagé',
  pluie: '🌧️ Pluie',
  brouillard: '🌫️ Brouillard',
  orage: '⛈️ Orage',
  neige: '❄️ Neige',
  verglas: '🧊 Verglas',
  vent: '💨 Vent',
  canicule: '🔥 Canicule',
};
