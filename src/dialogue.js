// Dialogues vivants (v3.95) — génération LOCALE, seedée, 100 % hors-ligne et
// gratuite (plus d'appel LLM). Module PUR : aucun DOM, aucun réseau, déterministe.
// Principe : on garde la VOIX propre de l'habitant (une de ses répliques signature)
// et on y ajoute une remarque de l'instant (météo, sinon saison), personnalisée au
// nom de la loutre. Seedé par le jour+lieu → varie d'un jour à l'autre, stable dans
// la journée (comme les autres contenus « du jour »).
import { hashSeed, makeRng } from './battle.js';

// Remarques de l'instant selon la météo (sobres, tutoiement, sans emoji — charte DA).
const WEATHER_REMARKS = {
  orage: ['L\'orage gronde — mais toi, {name}, tu n\'as pas froid aux yeux.', 'Sous ce ciel lourd, avance à couvert.', 'Le tonnerre roule au loin ; garde la tête haute, {name}.'],
  pluie: ['La pluie lustre ton pelage, {name}.', 'Une bonne averse : la rivière va enfler.', 'Il pleut doux aujourd\'hui — profites-en.'],
  brouillard: ['Dans cette brume, fie-toi à ton flair, {name}.', 'On n\'y voit goutte ; tends l\'oreille.', 'Le brouillard efface les sentiers — reste près de l\'eau.'],
  brume: ['Dans cette brume, fie-toi à ton flair, {name}.', 'Le brouillard efface les sentiers — reste près de l\'eau.'],
  canicule: ['Quelle chaleur — pense à te rafraîchir, {name}.', 'Le soleil tape ; l\'ombre est ton amie.', 'Par ce cagnard, bois et repose-toi, {name}.'],
  vent: ['Le vent se lève — tiens bon, {name}.', 'Ça souffle à décorner les hérons, aujourd\'hui.', 'Couvre-toi bien, le vent est traître.'],
  'grand-vent': ['Le vent se lève — tiens bon, {name}.', 'Ça souffle à décorner les hérons, aujourd\'hui.'],
  neige: ['La neige tombe — laisse tes empreintes, {name}.', 'Tout est blanc ; avance au chaud.', 'Un froid mordant ; ne t\'attarde pas dehors.'],
  verglas: ['Attention où tu poses les pattes, {name} — ça glisse.', 'Le verglas rend tout traître ; prudence.'],
  clair: ['Belle journée claire pour explorer, {name}.', 'Pas un nuage ; la vallée s\'offre à toi.', 'Un temps radieux — savoure-le, {name}.'],
};
// Repli par saison si la météo est inconnue/absente.
const SEASON_REMARKS = {
  printemps: ['Le printemps réveille tout, même les vieux comme moi.', 'Ça bourgeonne de partout, {name}.'],
  ete: ['L\'été s\'étire, long et doux.', 'Les jours sont longs — savoure-les, {name}.'],
  automne: ['L\'automne roussit la vallée.', 'Les feuilles tombent ; le temps file, {name}.'],
  hiver: ['L\'hiver resserre les rangs — prends soin de toi, {name}.', 'Il fait froid ; garde le cœur chaud.'],
};
const GENERIC_REMARKS = ['La vallée a ses humeurs, {name}, comme nous tous.', 'Chaque visite me fait plaisir, {name}.'];

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function fill(line, ctx) { return String(line).replace(/\{name\}/g, ctx && ctx.otterName ? ctx.otterName : 'la loutre'); }

/**
 * Une salutation vivante de l'habitant : sa réplique signature + une remarque de
 * l'instant. Déterministe pour un même (pnj, ctx, seed). Retourne 1 à 2 lignes.
 * @param {{mots?:string[], nom?:string}} pnj
 * @param {object} ctx  { otterName, trait, season, weather, zoneName, level }
 * @param {string} seed  ex. dayKey()+'|'+zone (stable dans la journée)
 */
export function livingLine(pnj, ctx, seed) {
  pnj = pnj || {}; ctx = ctx || {};
  const rng = makeRng(hashSeed('living|' + String(seed || '')));
  const mots = (Array.isArray(pnj.mots) && pnj.mots.length) ? pnj.mots : ['Bonjour, petite.'];
  const voice = fill(pick(rng, mots), ctx);                 // la voix propre de l'habitant
  const remark = fill(contextRemark(ctx, rng), ctx);        // la remarque de l'instant
  return remark ? [voice, remark] : [voice];
}

/** La remarque contextuelle : météo d'abord, saison en repli, générique sinon. */
export function contextRemark(ctx, rng) {
  ctx = ctx || {};
  const pool = (ctx.weather && WEATHER_REMARKS[ctx.weather])
    || (ctx.season && SEASON_REMARKS[ctx.season])
    || GENERIC_REMARKS;
  return pick(rng, pool);
}
