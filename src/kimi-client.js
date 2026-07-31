// Client frontend pour le proxy Kimi avec cache serveur.
// Vanilla ES module : aucune dépendance externe.
// La clé API Kimi reste côté serveur ; ce client ne fait qu'appeler l'Edge Function.
import { TELEMETRY_URL } from './telemetry.js';

const KIMI_FUNCTION_URL = TELEMETRY_URL.replace('/telemetry', '/kimi-chat');

/**
 * Appelle l'API Kimi via l'Edge Function Supabase (cache + proxy sécurisé).
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [options]
 * @param {string} [options.model='kimi-k2.7']
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=1024]
 * @returns {Promise<{content:string, cached:boolean, usage:object|null, raw:object}>}
 */
export async function askKimi(messages, { model = 'kimi-k2.7', temperature = 0.7, maxTokens = 1024 } = {}) {
  const normalized = messages
    .filter(m => m && typeof m === 'object' && m.role && m.content)
    .map(m => ({ role: String(m.role).trim().toLowerCase(), content: String(m.content).trim() }));

  if (normalized.length === 0) {
    throw new Error('Au moins un message valide est requis.');
  }

  const res = await fetch(KIMI_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: normalized, model, temperature, maxTokens }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur Kimi (${res.status})`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? data.content ?? '';
  return {
    content,
    cached: !!data.cached,
    usage: data.usage || null,
    raw: data,
  };
}
