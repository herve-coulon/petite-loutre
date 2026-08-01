// Le CIEL de la berge — SOURCE UNIQUE heure → palette. Module PUR (aucun DOM,
// aucun canvas) : c'est ici, et NULLE PART AILLEURS (surtout pas en CSS), que
// l'heure décide des couleurs du monde. Le canvas (render.js) est le seul
// peintre ; le CSS ne touche que l'UI. Ainsi ciel et sol racontent toujours la
// même heure — fini le ciel de nuit posé sur une herbe de plein jour.

/** Mélange deux couleurs hex (#rrggbb), t=0 -> a, t=1 -> b. */
export function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// 4 palettes fixes : nuit, aube, jour, crépuscule. Le ciel fond doucement
// entre elles sur des fenêtres de ~1h30 au lieu de couper brutalement.
export const SKY_PALETTES = [
  { h: 0,  sky: '#1b2440', hill: '#2c4433', hill2: '#233828', water: '#1e3a5f', wave: '#31558a' }, // nuit (pleine à 3h)
  { h: 7,  sky: '#f2b28c', hill: '#5f9e4a', hill2: '#4a8340', water: '#4a6fae', wave: '#7d9fd4' }, // aube (pleine à 7h30)
  { h: 12, sky: '#9fd9e8', hill: '#7ac74f', hill2: '#5aa63d', water: '#3f7fd1', wave: '#7db4e8' }, // jour (plein à 12h)
  { h: 19, sky: '#f2b28c', hill: '#5f9e4a', hill2: '#4a8340', water: '#4a6fae', wave: '#7d9fd4' }, // crépuscule (plein à 19h30)
];

/**
 * Couleurs du ciel ET du décor pour une heure donnée (objet Date, ou tout objet
 * exposant getHours()/getMinutes()). Ciel, collines et eau viennent du MÊME
 * calcul : ils ne peuvent pas se contredire. `night` pilote lune/étoiles.
 */
export function skyColors(now) {
  const h = now.getHours() + now.getMinutes() / 60;
  // Trouve les deux palettes encadrantes et interpole
  for (let i = 0; i < SKY_PALETTES.length - 1; i++) {
    const a = SKY_PALETTES[i], b = SKY_PALETTES[i + 1];
    if (h >= a.h && h < b.h) {
      const t = (h - a.h) / (b.h - a.h);
      return {
        sky: mix(a.sky, b.sky, t), hill: mix(a.hill, b.hill, t),
        hill2: mix(a.hill2, b.hill2, t), water: mix(a.water, b.water, t),
        wave: mix(a.wave, b.wave, t), night: h >= 21 || h < 7
      };
    }
  }
  // Au-delà de 19h → fondre du crépuscule (19h) vers la nuit (21h) puis nuit pleine
  if (h >= 19) {
    if (h < 21) {
      const t = (h - 19) / 2;
      const a = SKY_PALETTES[3], b = SKY_PALETTES[0];
      return {
        sky: mix(a.sky, b.sky, t), hill: mix(a.hill, b.hill, t),
        hill2: mix(a.hill2, b.hill2, t), water: mix(a.water, b.water, t),
        wave: mix(a.wave, b.wave, t), night: true
      };
    }
    return { sky: '#1b2440', hill: '#2c4433', hill2: '#233828', water: '#1e3a5f', wave: '#31558a', night: true };
  }
  // Avant 0h → nuit pleine (entre 21h et 0h on est dans le premier cas)
  return { sky: '#1b2440', hill: '#2c4433', hill2: '#233828', water: '#1e3a5f', wave: '#31558a', night: true };
}
