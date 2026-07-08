// Série de jours (streak) : revenir chaque jour entretient la flamme 🔥.
// Global (records) — la série survit aux loutres. Module PUR.
import { dayKey } from './quests.js';

/** Paliers récompensés : jours de série -> XP offerte. */
export const STREAK_MILESTONES = { 3: 40, 7: 80, 14: 150, 30: 300 };

/**
 * À appeler une fois par visite (et au passage de minuit si l'app reste ouverte).
 * @returns {null|{count:number, xp:number}} null si le jour est déjà compté ;
 *          sinon la série à jour et l'XP de palier (0 hors palier).
 */
export function touchStreak(rec, now = Date.now()) {
  const today = dayKey(now);
  if (rec.streakDay === today) return null; // déjà compté aujourd'hui
  const yesterday = dayKey(now - 24 * 3600 * 1000);
  rec.streakCount = rec.streakDay === yesterday ? (rec.streakCount || 0) + 1 : 1;
  rec.streakDay = today;
  rec.streakBest = Math.max(rec.streakBest || 0, rec.streakCount);
  return { count: rec.streakCount, xp: STREAK_MILESTONES[rec.streakCount] || 0 };
}
