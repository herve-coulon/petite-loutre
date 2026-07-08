// Humeurs et petites manies de la loutre — module PUR (aucune dépendance DOM).
// Le rendu s'appuie dessus pour choisir yeux, bouche et animations d'attente.

/**
 * Humeur affichée, par priorité décroissante. Une bouderie de réveil forcé
 * (s.grumpyUntil) impose le visage renfrogné, quelles que soient les jauges.
 * @returns {'dodo'|'malade'|'affamee'|'boudeuse'|'contente'|'neutre'|null}
 */
export function moodOf(s, now = Date.now()) {
  if (!s || s.stage === 'egg' || s.gameOver) return null;
  if (s.sleeping) return 'dodo';
  if (s.sick) return 'malade';
  if ((s.grumpyUntil || 0) > now) return 'boudeuse';
  if (s.hunger < 30) return 'affamee';
  if (s.fun < 30) return 'boudeuse';
  if (s.fun >= 70 && s.hunger >= 45 && s.health >= 60) return 'contente';
  return 'neutre';
}

/* ---------------- Bonjour de reconnexion ---------------- */

/**
 * Ce que dit la loutre quand on rouvre l'app, selon son humeur du moment
 * (et l'heure pour la version neutre). RNG injectable pour les tests.
 */
export function greeting(s, now = Date.now(), rnd = Math.random) {
  const name = (s && s.name) || 'Ta loutre';
  const mood = moodOf(s, now);
  const pick = arr => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];

  if (mood === 'dodo') return 'Chut… ' + name + ' dort paisiblement. 💤';
  if (mood === 'malade') return pick([
    '« Atchoum… » ' + name + ' te regarde avec des yeux fiévreux. Un médicament ? 🤒',
    name + ' renifle doucement… mais elle est contente de te voir. 🤒'
  ]);
  if (mood === 'affamee') return pick([
    '« Te voilà enfin ! J\'ai le ventre qui gargouille… » Un poisson pour ' + name + ' ? 🐟',
    name + ' te réclame un poisson à grands cris ! 🐟'
  ]);
  if (mood === 'boudeuse') return pick([
    name + ' te tourne le dos, l\'air vexé… (un câlin arrangerait tout)',
    '« Hmpf. » ' + name + ' boude, mais son regard en coin te guette. 😾'
  ]);
  if (mood === 'contente') return pick([
    '« Youpi, te revoilà ! » ' + name + ' frétille de joie ! 💛',
    name + ' fait une roulade de bonheur en te voyant ! 💛',
    '« Tu m\'as manqué ! » ' + name + ' saute partout. 💛'
  ]);
  // neutre (ou état sans humeur) : politesse selon l'heure
  const h = new Date(now).getHours();
  const salut = h < 6 ? 'Déjà debout ?' : h < 12 ? 'Bonjour !' : h < 18 ? 'Coucou !' : 'Bonsoir !';
  return '« ' + salut + ' » ' + name + ' te salue d\'un petit signe de patte. 🦦';
}

/* ---------------- Animations d'attente (idle) ---------------- */

export const IDLES = ['gratte', 'baille', 'caillou'];

/** Durées en frames (~60 fps). */
export const IDLE_FRAMES = { gratte: 72, baille: 84, caillou: 108 };

/** Tire une animation d'attente (RNG injectable pour les tests). */
export function pickIdle(rnd = Math.random) {
  return IDLES[Math.min(IDLES.length - 1, Math.floor(rnd() * IDLES.length))];
}

/** La loutre est-elle assez tranquille pour une petite manie ? */
export function canIdle(mood) {
  return mood === 'neutre' || mood === 'contente';
}
