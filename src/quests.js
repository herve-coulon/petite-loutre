// Quêtes du jour : 3 micro-objectifs quotidiens (les mêmes pour tout le monde,
// tirés de façon déterministe à partir de la date). Module pur.
import { hashSeed, makeRng } from './battle.js';

// Chaque entrée du pool gagne un champ `need` déclaratif.
// Les quêtes dont le need n'est pas satisfait par le contexte joueur sont
// REMPLACÉES (pas supprimées) : on reprend le même tirage déterministe et on
// comble les trous avec la quête éligible suivante du même tirage.
export const QUEST_POOL = [
  // ── Soin (toujours éligible) ──
  { id: 'meals2', icon: '🐟', label: 'Servir 2 repas', key: 'meals', target: 2 },
  { id: 'meals3', icon: '🐟', label: 'Servir 3 repas', key: 'meals', target: 3 },
  { id: 'wash1', icon: '🧼', label: 'Donner 1 bain', key: 'washes', target: 1 },
  { id: 'wash2', icon: '🧼', label: 'Donner 2 bains', key: 'washes', target: 2 },
  { id: 'pets3', icon: '💛', label: 'Câliner 3× (touche la loutre)', key: 'pets', target: 3 },
  { id: 'pets5', icon: '💛', label: 'Câliner 5× (touche la loutre)', key: 'pets', target: 5 },
  { id: 'sleep1', icon: '💤', label: 'Border la loutre 1 fois', key: 'sleeps', target: 1 },
  { id: 'meals4', icon: '🍽️', label: 'Servir 4 repas', key: 'meals', target: 4, need: { level: 4 } },
  { id: 'meals5', icon: '🍽️', label: 'Servir 5 repas', key: 'meals', target: 5, need: { level: 5 } },
  { id: 'wash3', icon: '🫧', label: 'Donner 3 bains', key: 'washes', target: 3, need: { level: 5 } },
  { id: 'wash5', icon: '🫧', label: 'Donner 5 bains', key: 'washes', target: 5, need: { level: 8 } },
  { id: 'pets8', icon: '🤗', label: 'Câliner 8×', key: 'pets', target: 8, need: { level: 5 } },
  { id: 'pets10', icon: '🤗', label: 'Câliner 10×', key: 'pets', target: 10, need: { level: 6 } },
  { id: 'sleep2', icon: '🌙', label: 'Border la loutre 2 fois', key: 'sleeps', target: 2, need: { level: 4 } },
  // ── Pêche (accessible dès le début) ──
  { id: 'fish2', icon: '🐠', label: 'Attraper 2 poissons', key: 'fish', target: 2 },
  { id: 'fish3', icon: '🐠', label: 'Attraper 3 poissons', key: 'fish', target: 3 },
  { id: 'fish5', icon: '🐟', label: 'Attraper 5 poissons', key: 'fish', target: 5 },
  { id: 'games1', icon: '🎣', label: 'Jouer 1 partie de pêche', key: 'games', target: 1 },
  { id: 'games2', icon: '🎣', label: 'Jouer 2 parties de pêche', key: 'games', target: 2 },
  { id: 'games3', icon: '🎣', label: 'Jouer 3 parties de pêche', key: 'games', target: 3, need: { level: 4 } },
  { id: 'fish8', icon: '🎣', label: 'Attraper 8 poissons', key: 'fish', target: 8, need: { level: 4 } },
  { id: 'fish10', icon: '🎣', label: 'Attraper 10 poissons', key: 'fish', target: 10, need: { level: 5 } },
  // ── Friandise (niv 2+) ──
  { id: 'treat1', icon: '🍡', label: 'Offrir 1 friandise', key: 'treats', target: 1 },
  { id: 'treat2', icon: '🍬', label: 'Offrir 2 friandises', key: 'treats', target: 2, need: { level: 5 } },
  { id: 'treat3', icon: '🍬', label: 'Offrir 3 friandises', key: 'treats', target: 3, need: { level: 8 } },
  // ── Combat (niv 10) ──
  { id: 'battle1', icon: '⚔️', label: 'Livrer 1 combat', key: 'battles', target: 1, need: { feature: 'battle' } },
  { id: 'battle2', icon: '🗡️', label: 'Livrer 2 combats', key: 'battles', target: 2, need: { feature: 'battle' } },
  { id: 'battle3', icon: '🗡️', label: 'Livrer 3 combats', key: 'battles', target: 3, need: { feature: 'battle' } },
  // ── Toboggan (niv 3) ──
  { id: 'slide1', icon: '🌊', label: 'Glisser 1 descente', key: 'slides', target: 1, need: { feature: 'slide' } },
  { id: 'slide3', icon: '🏄', label: 'Glisser 3 descentes', key: 'slides', target: 3, need: { feature: 'slide' } },
  // ── Plongée (niv 6) ──
  { id: 'dive1', icon: '🤿', label: 'Faire 1 plongée', key: 'dives', target: 1, need: { feature: 'dive' } },
  { id: 'dive2', icon: '🐚', label: 'Faire 2 plongées', key: 'dives', target: 2, need: { feature: 'dive' } },
  // ── Jardin (niv 4) ──
  { id: 'garden1', icon: '🌿', label: 'Jardiner une fois', key: 'garden', target: 1, need: { feature: 'garden' } },
  { id: 'garden2', icon: '🌷', label: 'Jardiner 2 fois', key: 'garden', target: 2, need: { feature: 'garden', level: 6 } },
  // ── Vallée / monde ouvert ──
  { id: 'finds2', icon: '🗺️', label: 'Ramasser 2 trouvailles', key: 'finds', target: 2, need: { world: true } },
  { id: 'finds3', icon: '🗺️', label: 'Ramasser 3 trouvailles', key: 'finds', target: 3, need: { world: true } },
  { id: 'finds5', icon: '🧭', label: 'Ramasser 5 trouvailles', key: 'finds', target: 5, need: { world: true, level: 5 } },
  { id: 'zone1', icon: '📍', label: 'Visiter le lieu du jour', key: 'zoneVisit', target: 1, need: { world: true } },
  { id: 'habitant1', icon: '💬', label: 'Parler à un habitant', key: 'habitantTalk', target: 1, need: { world: true } },
  { id: 'habitant2', icon: '🗨️', label: 'Parler à 2 habitants', key: 'habitantTalk', target: 2, need: { world: true, level: 4 } }
];

/** Vérifie si une quête est éligible au contexte donné. */
export function isEligible(q, ctx) {
  if (!q.need || !ctx) return true;
  const n = q.need;
  if (n.level && (ctx.level || 1) < n.level) return false;
  if (n.feature && !(ctx.unlocked || []).includes(n.feature)) return false;
  if (n.world && !ctx.world) return false;
  return true;
}

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * Les 3 quêtes du jour (déterministes par date).
 * @param {string} date - clé jour (YYYY-MM-DD)
 * @param {object} [ctx] - { level, unlocked[], world } — optionnel, défaut permissif
 * @returns {Array} 3 quêtes éligibles, tirées de façon déterministe
 */
export function dailyQuests(date, ctx) {
  const rng = makeRng(hashSeed('quests-' + date));
  const pool = [...QUEST_POOL];

  // Tirage déterministe : on parcourt la séquence rng dans l'ordre,
  // chaque step choisit un index dans la pool résiduelle.
  // Si la quête tirée est inéligible, on la saute (elle reste dans le pool
  // pour d'éventuels tirages futurs, mais on ne la compte pas).
  const picked = [];
  const usedKeys = new Set();
  while (picked.length < 3 && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    const candidate = pool.splice(idx, 1)[0];
    // Éligible ET d'une activité encore non tirée aujourd'hui : trois défis DISTINCTS
    // (jamais « 2 repas » ET « 3 repas » le même jour).
    if (isEligible(candidate, ctx) && !usedKeys.has(candidate.key)) {
      picked.push(candidate);
      usedKeys.add(candidate.key);
    }
    // sinon : on continue le tirage (la pool rétrécit quand même,
    // ce qui garantit la stabilité déterministe à ctx égal)
  }
  return picked;
}

/** Initialise/réinitialise le suivi quotidien si la date a changé. */
export function ensureDaily(s, now = Date.now()) {
  const d = dayKey(now);
  if (!s.qDaily || s.qDaily.date !== d) {
    s.qDaily = { date: d, progress: {}, done: [] };
    return true;
  }
  return false;
}

export function bumpQuest(s, key, n = 1, now = Date.now()) {
  ensureDaily(s, now);
  s.qDaily.progress[key] = (s.qDaily.progress[key] || 0) + n;
}

/**
 * @returns les quêtes nouvellement terminées (marquées dans s.qDaily.done).
 * @param {object} [ctx] - contexte pour le filtrage (même que dailyQuests)
 */
export function completedQuests(s, rec, now = Date.now(), ctx) {
  ensureDaily(s, now);
  const got = [];
  for (const q of dailyQuests(s.qDaily.date, ctx)) {
    if (s.qDaily.done.includes(q.id)) continue;
    if ((s.qDaily.progress[q.key] || 0) >= q.target) {
      s.qDaily.done.push(q.id);
      rec.questsDone = (rec.questsDone || 0) + 1;
      got.push(q);
    }
  }
  return got;
}
