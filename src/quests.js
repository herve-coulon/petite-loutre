// Quêtes du jour : 3 micro-objectifs quotidiens (les mêmes pour tout le monde,
// tirés de façon déterministe à partir de la date). Module pur.
import { hashSeed, makeRng } from './battle.js';

export const QUEST_POOL = [
  { id: 'meals3', icon: '🐟', label: 'Servir 3 repas', key: 'meals', target: 3 },
  { id: 'games2', icon: '🎣', label: 'Jouer 2 parties de pêche', key: 'games', target: 2 },
  { id: 'fish5', icon: '🐠', label: 'Attraper 5 poissons', key: 'fish', target: 5 },
  { id: 'wash2', icon: '🧼', label: 'Donner 2 bains', key: 'washes', target: 2 },
  { id: 'pets5', icon: '💛', label: 'Faire 5 câlins', key: 'pets', target: 5 },
  { id: 'treat1', icon: '🍡', label: 'Offrir 1 friandise', key: 'treats', target: 1 },
  { id: 'battle1', icon: '⚔️', label: 'Livrer 1 combat', key: 'battles', target: 1 },
  { id: 'sleep1', icon: '💤', label: 'Border la loutre 1 fois', key: 'sleeps', target: 1 }
];

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Les 3 quêtes du jour (déterministes par date). */
export function dailyQuests(date) {
  const rng = makeRng(hashSeed('quests-' + date));
  const pool = [...QUEST_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length) {
    picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
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

/** @returns les quêtes nouvellement terminées (marquées dans s.qDaily.done). */
export function completedQuests(s, rec, now = Date.now()) {
  ensureDaily(s, now);
  const got = [];
  for (const q of dailyQuests(s.qDaily.date)) {
    if (s.qDaily.done.includes(q.id)) continue;
    if ((s.qDaily.progress[q.key] || 0) >= q.target) {
      s.qDaily.done.push(q.id);
      rec.questsDone = (rec.questsDone || 0) + 1;
      got.push(q);
    }
  }
  return got;
}
