// Techniques de combat : ce que la loutre APPREND à force de se battre et
// d'explorer. Module PUR — il ne connaît ni le DOM ni l'état courant, seulement
// les records globaux (donc les techniques survivent au changement de loutre).
//
// Le duel est volontairement dur (v3.62). Les techniques sont la réponse à cette
// dureté : on ne devient pas meilleur en appuyant mieux sur les boutons du
// premier jour, on le devient en JOUANT — chaque palier rend une championne un
// peu plus abordable.
import { COFFRE_ZONES, EPREUVE_ZONES } from './tilemap.js';
import { levelFromXp } from './level.js';

/**
 * Chaque technique est passive et modifie une règle précise du duel.
 * `effet` est lu par battle.js ; rien ici ne touche au jeu directement.
 */
export const TECHNIQUES = [
  {
    id: 'riposte', icon: '↩️', name: 'Riposte affûtée',
    cond: 'Remporter 5 duels',
    desc: 'Tes ripostes d\'esquive font moitié plus mal.',
    test: r => (r.wins || 0) >= 5,
    effet: { riposte: 1.5 }
  },
  {
    id: 'depart', icon: '⚡', name: 'Départ lancé',
    cond: 'Livrer 15 duels',
    desc: 'Tu commences chaque duel avec un cran d\'élan.',
    test: r => (r.battles || 0) >= 15,
    effet: { elanDepart: 1 }
  },
  {
    id: 'percee', icon: '💥', name: 'Percée',
    cond: 'Battre 3 championnes de la vallée',
    desc: 'Quand ta charge lourde traverse une esquive, elle passe presque entière.',
    test: r => (r.epreuves || []).length >= 3,
    // Abaisser le SEUIL de percée supprimait le contre de l'esquive : la frappe
    // devenait imparable et le triangle s'effondrait (mesuré : 0 % -> 100 % de
    // victoires à elle seule, quelle que soit la difficulté). On renforce donc
    // ce qui passe, pas le moment où ça passe.
    effet: { perceeForce: 0.85 }
  },
  {
    id: 'cuirasse', icon: '🛡️', name: 'Cuirasse',
    cond: 'Remporter 20 duels',
    desc: 'Tu encaisses 15 % de dégâts en moins.',
    test: r => (r.wins || 0) >= 20,
    effet: { encaisse: 0.85 }
  },
  {
    id: 'souffle', icon: '🌬️', name: 'Second souffle',
    cond: 'Ouvrir 4 coffres de la vallée',
    desc: 'Sous 25 % de PV, tu regagnes un cran d\'élan — une fois par duel.',
    test: r => (r.chests || []).length >= 4,
    effet: { secondSouffle: true }
  },
  {
    id: 'maitrise', icon: '🏞️', name: 'Maîtrise de la vallée',
    cond: 'Tous les coffres ET toutes les championnes',
    desc: 'Élan maximal porté à 4 : une charge complète devient dévastatrice.',
    test: r => (r.chests || []).length >= COFFRE_ZONES.length
      && (r.epreuves || []).length >= EPREUVE_ZONES.length,
    effet: { elanMax: 4 }
  },
  {
    id: 'veterane', icon: '🎖️', name: 'Vétérane',
    cond: 'Atteindre le niveau 20',
    desc: 'Tes coups de queue frappent 10 % plus fort.',
    test: r => levelFromXp(r.xp || 0).level >= 20,
    effet: { force: 1.1 }
  }
];

export const techniqueById = id => TECHNIQUES.find(t => t.id === id) || null;

/** Les techniques acquises, dans l'ordre de la liste. */
export function unlockedTechniques(rec) {
  const r = rec || {};
  return TECHNIQUES.filter(t => t.test(r)).map(t => t.id);
}

/**
 * Les effets cumulés à appliquer au duel. Les multiplicateurs se multiplient,
 * les seuils prennent la valeur la plus avantageuse, les drapeaux s'allument.
 * Renvoie un objet plat, consommé par newBattle.
 */
export function combatBuffs(rec) {
  const out = {};
  for (const id of unlockedTechniques(rec)) {
    const e = techniqueById(id).effet;
    if (e.riposte) out.riposte = (out.riposte || 1) * e.riposte;
    if (e.force) out.force = (out.force || 1) * e.force;
    if (e.encaisse) out.encaisse = (out.encaisse || 1) * e.encaisse;
    if (e.elanDepart) out.elanDepart = (out.elanDepart || 0) + e.elanDepart;
    if (e.elanMax) out.elanMax = Math.max(out.elanMax || 0, e.elanMax);
    if (e.perceeForce) out.perceeForce = Math.max(out.perceeForce || 0, e.perceeForce);
    if (e.secondSouffle) out.secondSouffle = true;
  }
  return out;
}
