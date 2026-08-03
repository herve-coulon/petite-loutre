// Dialogues vivants (É6) — construction du prompt et nettoyage de la réponse.
// Module PUR : aucun DOM, aucun réseau (l'appel réseau vit dans kimi-client.js).
// Le jeu ne dépend JAMAIS de ce module pour fonctionner : si le réseau, le budget
// ou la latence font défaut, main.js retombe sur les dialogues écrits (pnj.mots).

/**
 * Construit les messages pour Kimi : une persona d'habitant + un contexte d'instant.
 * @param {{nom?:string, role?:string, emoji?:string}} pnj  l'habitant
 * @param {object} ctx  { otterName, trait, season, weather, zoneName, level }
 * @returns {Array<{role:string, content:string}>}
 */
export function buildDialoguePrompt(pnj, ctx) {
  pnj = pnj || {}; ctx = ctx || {};
  const nom = pnj.nom || 'un habitant';
  const role = pnj.role || 'de la vallée';
  const persona =
    `Tu es ${nom}, ${role}, un personnage d'un jeu doux et poétique en français. ` +
    `Tu accueilles une jeune loutre de passage. Réponds en 1 à 2 phrases COURTES, ` +
    `chaleureuses, au tutoiement, dans le ton d'un conte — sans emoji, sans guillemets, ` +
    `sans te présenter ni poser de question.`;
  const bits = [];
  bits.push(`La loutre s'appelle ${ctx.otterName || 'la loutre'}.`);
  if (ctx.trait) bits.push(`Sa personnalité : ${ctx.trait}.`);
  if (ctx.season) bits.push(`Saison : ${ctx.season}.`);
  if (ctx.weather) bits.push(`Météo du moment : ${ctx.weather}.`);
  if (ctx.zoneName) bits.push(`Lieu : ${ctx.zoneName}.`);
  if (ctx.level) bits.push(`Le soigneur est niveau ${ctx.level}.`);
  const user = `${bits.join(' ')} Salue-la et glisse une remarque en lien avec l'instant.`;
  return [
    { role: 'system', content: persona },
    { role: 'user', content: user },
  ];
}

/**
 * Nettoie la réponse générée en 1-2 lignes sûres à afficher : retire guillemets
 * de bord, coupe les lignes trop longues, borne le nombre de lignes. Retourne []
 * si rien d'exploitable (→ main.js gardera les dialogues écrits).
 */
export function cleanDialogueLines(text, maxLines = 2, maxLen = 160) {
  if (!text || typeof text !== 'string') return [];
  const stripped = text.replace(/^[\s"'«»]+|[\s"'«»]+$/g, '').trim();
  if (!stripped) return [];
  return stripped
    .split(/\n+/)
    .map(l => l.replace(/^[\s"'«»]+|[\s"'«»]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map(l => (l.length > maxLen ? l.slice(0, maxLen - 1).trimEnd() + '…' : l));
}
