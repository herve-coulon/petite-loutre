// Génération déterministe de clés de cache pour les appels Kimi.
// Module PUR : testable, aucun DOM, aucun réseau.
// La même logique est appliquée côté serveur dans l'Edge Function Supabase.

const encoder = new TextEncoder();

/** Normalise un message : role et content en minuscules/trim. */
export function normalizeMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const role = String(msg.role || '').trim().toLowerCase();
  const content = String(msg.content || '').trim();
  if (!role || !content) return null;
  return { role, content };
}

/** Normalise un tableau de messages en gardant l'ordre. */
export function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(normalizeMessage).filter(Boolean);
}

/**
 * Construit une clé de cache SHA-256 à partir du prompt et des paramètres.
 * Deux requêtes identiques (après normalisation) produisent la même clé.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [options]
 * @param {string} [options.model='kimi-k2.7']
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=1024]
 * @returns {Promise<string>} hash hexadécimal de 64 caractères
 */
export async function kimiCacheKey(messages, { model = 'kimi-k2.7', temperature = 0.7, maxTokens = 1024 } = {}) {
  const normalized = normalizeMessages(messages);
  const payload = JSON.stringify({
    model: String(model),
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
    messages: normalized,
  });

  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
