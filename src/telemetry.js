// Télémétrie privacy-first : un ping quotidien anonyme vers Supabase.
// Module PUR — aucun DOM, aucune dépendance circulaire.
// L'ID est aléatoire et local ; il change quand la sauvegarde est effacée.
import { dayKey } from './quests.js';
import { levelFromXp } from './level.js';
import { UNLOCK_LEVEL } from './constants.js';

export const TELEMETRY_URL = 'https://wjpoojscmnbgofymcmvz.supabase.co/functions/v1/telemetry';
// Clé ANON Supabase (même projet que les rappels push) — publique par nature.
export const TELEMETRY_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcG9vanNjbW5iZ29meW1jbXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDkzODYsImV4cCI6MjA5OTA4NTM4Nn0.zJ_ejAWgNqLP1UHRn-vm7jO2_K-ozSrsOOcCaTFU2RE';

/** Génère un identifiant anonyme aléatoire (hex 16 chars). */
export function newTelemetryId(crypto_ = typeof crypto !== 'undefined' ? crypto : null) {
  if (crypto_ && typeof crypto_.randomUUID === 'function') {
    return crypto_.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  let id = '';
  for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

/**
 * Calcule les fonctionnalités que le joueur a au moins débloquées/vues.
 * @param {object} s - état courant
 * @param {object} rec - records globaux
 * @param {number} level - niveau effectif (curLevel)
 * @returns {string[]} clés triées
 */
export function featuresSeen(s, rec, level) {
  const f = ['care']; // toujours présent si loutre nommée
  if (level >= (UNLOCK_LEVEL.treat || 2)) f.push('treats');
  if (level >= (UNLOCK_LEVEL.slide || 3)) f.push('slide');
  if (level >= (UNLOCK_LEVEL.dive || 6)) f.push('dive');
  if (level >= (UNLOCK_LEVEL.battle || 10)) f.push('battle');
  if (rec.visited && rec.visited.length > 0) f.push('world');
  if (rec.recruited && rec.recruited.length > 0) f.push('recruit');
  if ((rec.streakCount || 0) > 0) f.push('streak');
  if ((rec.treasures || 0) > 0) f.push('treasures');
  if ((rec.questsDone || 0) > 0) f.push('quests');
  if ((rec.wins || 0) > 0) f.push('wins');
  return f;
}

/** Vérifie si un ping peut être envoyé. */
export function canSendTelemetry(s) {
  return !!s && s.telemetry === true && !!s.name && s.stage !== 'egg' && !!s.telemetryId;
}

/**
 * Construit le payload anonyme.
 * @param {object} s
 * @param {object} rec
 * @param {number} level - curLevel()
 * @param {Function} [dayKeyFn] - injecté pour les tests
 */
export function telemetryPayload(s, rec, level, dayKeyFn = dayKey) {
  return {
    id: s.telemetryId,
    day: dayKeyFn(),
    level,
    streak: rec.streakCount || 0,
    features: featuresSeen(s, rec, level)
  };
}

/**
 * Envoie le ping (fire-and-forget). Erreur silencieuse.
 * @returns {Promise<boolean>} true si envoyé
 */
export async function sendTelemetry(s, rec, level) {
  if (!canSendTelemetry(s)) return false;
  const payload = telemetryPayload(s, rec, level);
  try {
    const res = await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TELEMETRY_ANON,
        'apikey': TELEMETRY_ANON
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch { return false; }
}
