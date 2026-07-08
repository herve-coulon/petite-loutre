// Monde vivant : les saisons réelles habillent la berge et rythment l'aventure.
// PUR : la saison se déduit de la date (hémisphère nord), identique pour tous —
// comme les quêtes et la surprise du jour. Le rendu et la narration lisent d'ici.

/**
 * Saison à une date donnée, par mois (0 = janvier).
 * hiver : déc·jan·fév · printemps : mar·avr·mai · été : juin·juil·août ·
 * automne : sep·oct·nov.
 */
export function seasonFor(date = new Date()) {
  const m = date.getMonth();
  if (m <= 1 || m === 11) return 'hiver';
  if (m <= 4) return 'printemps';
  if (m <= 7) return 'ete';
  return 'automne';
}

// Teintes de berge/rivière par saison (le jour). La nuit garde sa palette
// sombre, sauf l'hiver dont la neige reste visible. `ambient` : la particule
// d'ambiance qui tombe (feuilles, neige, pétales) ; null = rien de spécial.
export const SEASONS = {
  printemps: {
    key: 'printemps', label: 'Printemps', emoji: '🌸',
    day:   { hill: '#8fd857', hill2: '#63b23e' },
    night: null,
    ambient: 'petales',
    treat: { id: 'fleur', emoji: '🌸', gain: { fun: 8 },
      msg: 'Nout cueille une jolie fleur du printemps ! 🌸' },
    card: {
      emoji: '🌸',
      title: 'Le printemps s\'installe',
      lines: [
        'L\'herbe reverdit et des pétales roses dansent dans l\'air tiède. C\'est la saison des découvertes.'
      ],
      cta: 'RESPIRER LE PRINTEMPS'
    }
  },
  ete: {
    key: 'ete', label: 'Été', emoji: '☀️',
    day:   { hill: '#7ac74f', hill2: '#5aa63d' },
    night: null,
    ambient: null,
    treat: { id: 'pasteque', emoji: '🍉', gain: { fun: 8, hunger: 6 },
      msg: 'Une pastèque bien fraîche — Nout se régale et se rafraîchit ! 🍉' },
    card: {
      emoji: '☀️',
      title: 'L\'été est là',
      lines: [
        'Le soleil brille haut, la rivière scintille : baignades et siestes au bord de l\'eau, ta loutre est dans son élément.'
      ],
      cta: 'PROFITER DE L\'ÉTÉ'
    }
  },
  automne: {
    key: 'automne', label: 'Automne', emoji: '🍂',
    day:   { hill: '#c58a3d', hill2: '#9e6a2c' },
    night: null,
    ambient: 'feuilles',
    treat: { id: 'chataigne', emoji: '🌰', gain: { hunger: 12, fun: 3 },
      msg: 'Nout ramasse une châtaigne dodue pour les jours froids ! 🌰' },
    card: {
      emoji: '🍂',
      title: 'Les couleurs de l\'automne',
      lines: [
        'La berge se pare d\'or et les feuilles dansent jusqu\'à la rivière. L\'air fraîchit, le pelage s\'épaissit.'
      ],
      cta: 'SAVOURER L\'AUTOMNE'
    }
  },
  hiver: {
    key: 'hiver', label: 'Hiver', emoji: '❄️',
    day:   { hill: '#d4dee6', hill2: '#b3c1cf', water: '#6f9fc4', wave: '#a9cbe6' },
    night: { hill: '#5a6b7d', hill2: '#45566a', water: '#26436a', wave: '#3a5f8c' }, // neige grisée sous la lune
    ambient: 'neige',
    treat: { id: 'bonhomme', emoji: '⛄', gain: { fun: 10, energy: 6 },
      msg: 'Nout roule un bonhomme de neige — quelle rigolade ! ⛄' },
    card: {
      emoji: '❄️',
      title: 'L\'hiver enveloppe la berge',
      lines: [
        'La neige tombe en silence et couvre la rive de blanc. Le froid pique, mais son pelage épais la garde au chaud.'
      ],
      cta: 'BRAVER L\'HIVER'
    }
  }
};

/** La saison, avec ses métadonnées, à une date donnée. */
export function seasonInfo(date = new Date()) {
  return SEASONS[seasonFor(date)];
}

// Trésor de saison : un cadeau thématique à récolter une fois par jour
// (châtaigne, bonhomme de neige, fleur, pastèque). Emplacement partagé entre
// le rendu et la zone de toucher.
export const TREAT_POS = { x: 118, y: 82, w: 16, h: 16 };

/** Le trésor du jour est-il encore à récolter ? (déterministe, une fois/jour) */
export function treatAvailable(s) {
  if (!s || !s.qDaily) return false;
  return !(s.qDaily.progress && s.qDaily.progress.saison);
}
