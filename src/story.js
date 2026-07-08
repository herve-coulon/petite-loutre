// Fil narratif : moments d'histoire aux grandes étapes de la vie de la loutre,
// + premiers pas guidés (tutoriel doux). PUR : aucune dépendance DOM.
// Le déclenchement lit l'état ; l'affichage (overlay, surlignage) vit dans ui/main.

/**
 * Moments narratifs (« beats »). Chacun ne se joue qu'UNE fois — la mémoire
 * est dans s.storySeen. `when(s)` décide de l'apparition ; l'ordre du tableau
 * fait office de cascade (si la loutre a sauté une étape hors-ligne, on rejoue
 * les chapitres manqués un par un, dans l'ordre).
 */
export const BEATS = [
  {
    id: 'naissance',
    when: s => !!s.name,
    emoji: '🐣',
    title: 'Chapitre 1 — La rencontre',
    lines: [
      'L\'œuf a éclos : une petite loutre te fixe de ses grands yeux. Prends soin d\'elle — votre aventure commence.'
    ],
    cta: 'VEILLER SUR ELLE'
  },
  {
    id: 'jeune',
    when: s => s.stage === 'child' || s.stage === 'adult',
    emoji: '🌿',
    title: 'Chapitre 2 — Les premières audaces',
    lines: [
      'Ta loutre a grandi ! Plus vive et curieuse, elle réclame des friandises 🍡 et rêve déjà de duels ⚔️.'
    ],
    cta: 'CONTINUER L\'AVENTURE'
  },
  {
    id: 'adulte',
    when: s => s.stage === 'adult',
    emoji: '🌊',
    title: 'Chapitre 3 — La grande loutre',
    lines: [
      'La voilà adulte, sûre d\'elle. Les profondeurs ne l\'effraient plus : elle peut plonger chercher des trésors 🤿.'
    ],
    cta: 'PLONGER DANS LA SUITE'
  }
];

/** Le prochain moment narratif à jouer, ou null. PUR. */
export function nextBeat(s) {
  if (!s || s.gameOver || s.away || s.stage === 'egg') return null;
  const seen = s.storySeen || [];
  for (const b of BEATS) {
    if (!seen.includes(b.id) && b.when(s)) return b;
  }
  return null;
}

/** Mémorise un beat comme joué (mutation ciblée, testable). */
export function markSeen(s, id) {
  if (!s.storySeen) s.storySeen = [];
  if (!s.storySeen.includes(id)) s.storySeen.push(id);
}

/* ---------------- Premiers pas guidés ---------------- */
// Trois gestes de base à découvrir, dans l'ordre. On surligne le bouton et on
// souffle quoi faire, jusqu'à ce que les trois compteurs soient entamés.
export const COACH_STEPS = [
  { key: 'fed',    target: 'b-feed', msg: '👉 Elle a faim ! Touche « Manger » pour lui offrir un poisson. 🐟' },
  { key: 'played', target: 'b-play', msg: '👉 Amuse-la : touche « Jouer » pour une partie de pêche. 🎣' },
  { key: 'washed', target: 'b-wash', msg: '👉 Un brin de toilette : touche « Laver » pour la garder propre. 🧼' }
];

/**
 * Prochain geste du tutoriel à montrer, ou null quand les trois bases sont
 * acquises. PUR — ne tient pas compte du sommeil/overlay (géré à l'affichage) ;
 * ne renvoie rien tant que l'œuf n'a pas éclos et reçu un nom.
 */
export function coachStep(s) {
  if (!s || s.stage === 'egg' || !s.name) return null;
  for (const st of COACH_STEPS) {
    if ((s[st.key] || 0) === 0) return st;
  }
  return null;
}
