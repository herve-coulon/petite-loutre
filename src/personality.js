// Le caractère de la loutre : une PERSONNALITÉ tirée à la naissance (chaque
// loutre est unique) + un LIEN (affinité) qui grandit avec les soins.
// Module PUR (hasard injecté). L'état vit dans s.trait (id) et s.bond (nombre).

export const TRAITS = [
  { id: 'gourmande',   name: 'Gourmande',   emoji: '🍡', like: 'feed',  desc: 'raffole des repas' },
  { id: 'joueuse',     name: 'Joueuse',     emoji: '🎣', like: 'play',  desc: 'adore jouer' },
  { id: 'dormeuse',    name: 'Dormeuse',    emoji: '💤', like: 'sleep', desc: 'championne de la sieste' },
  { id: 'caline',      name: 'Câline',      emoji: '💛', like: 'pet',   desc: 'réclame des câlins' },
  { id: 'coquette',    name: 'Coquette',    emoji: '🫧', like: 'wash',  desc: 'aime être toute propre' },
  { id: 'aventuriere', name: 'Aventurière', emoji: '🧭', like: 'dive',  desc: 'curieuse de tout' }
];

export const traitById = id => TRAITS.find(t => t.id === id) || null;

/** Tire une personnalité (RNG injectable). */
export function pickTrait(rnd = Math.random) {
  return TRAITS[Math.min(TRAITS.length - 1, Math.floor(rnd() * TRAITS.length))].id;
}

/** L'action est-elle la préférée de cette personnalité ? */
export function isFavorite(trait, actionKey) {
  const t = traitById(trait);
  return !!t && t.like === actionKey;
}

/** Réaction quand on lui offre son activité préférée (RNG injectable). */
export function favoriteLine(trait, name, rnd = Math.random) {
  const t = traitById(trait);
  const who = name || 'Ta loutre';
  const lines = {
    feed:  ['Miam ! ' + who + ' se régale — c\'est son péché mignon ! 🍡', who + ' engloutit son repas, aux anges ! 😋'],
    play:  [who + ' jubile — jouer, c\'est toute sa vie ! 🎣', 'Quelle énergie ! ' + who + ' adore ça. ✨'],
    sleep: [who + ' s\'installe pour LA sieste dont elle rêvait… 💤', 'Rien ne vaut un bon dodo pour ' + who + '. 😴'],
    pet:   [who + ' fond littéralement sous tes caresses ! 💛', '« Encore ! » — ' + who + ' en redemande. 💛'],
    wash:  [who + ' resplendit, toute pimpante ! 🫧', 'Propre comme un sou neuf : ' + who + ' adore ça. ✨'],
    dive:  [who + ' plonge, l\'œil pétillant d\'aventure ! 🧭', 'L\'inconnu ne fait pas peur à ' + who + ' ! 🌊']
  };
  const arr = (t && lines[t.like]) || ['💛'];
  return arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
}

/* ---------------- Le lien (affinité) ---------------- */

// Combien de « points de lien » rapporte chaque geste attentionné (×2 si c'est
// l'activité préférée : on apprend vite ce qu'ELLE aime).
const BOND_BASE = { feed: 2, play: 3, wash: 2, sleep: 2, heal: 3, pet: 2, treat: 3, dive: 4, care: 5 };

export function bondGain(actionKey, trait) {
  const base = BOND_BASE[actionKey] || 1;
  return base + (isFavorite(trait, actionKey) ? base : 0);
}

export const BOND_LEVELS = [
  { at: 0,    name: 'Nouvelle amie' },
  { at: 60,   name: 'Complices' },
  { at: 200,  name: 'Fidèle compagne' },
  { at: 450,  name: 'Inséparables' },
  { at: 900,  name: 'Âmes sœurs' }
];

/** Niveau de lien pour un total (progression comme les niveaux du soigneur). */
export function bondLevel(bond) {
  const b = Math.max(0, Math.floor(bond || 0));
  let i = 0;
  for (let k = 0; k < BOND_LEVELS.length; k++) if (b >= BOND_LEVELS[k].at) i = k;
  const cur = BOND_LEVELS[i], nxt = BOND_LEVELS[i + 1] || null;
  return {
    level: i + 1,
    name: cur.name,
    cur: b - cur.at,
    next: nxt ? nxt.at - cur.at : 0,
    max: !nxt
  };
}
