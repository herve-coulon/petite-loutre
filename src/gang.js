// La couche sociale de l'aventure : les GANGS de loutres. Au niveau Monde, le
// joueur crée ou rejoint un gang, recrute des membres, et affronte d'autres
// gangs (PvP). Module PUR (RNG seedé, aucun DOM ni réseau) : la logique de
// gang ET la résolution des combats de bande sont testables et reproductibles,
// construites sur le moteur de duel existant (battle.js).
import { makeFighter, makeRng, hashSeed } from './battle.js';

export const MAX_MEMBERS = 5;

// Générateurs pour les gangs adverses (thème loutre / rivière).
const RIVAL_ADJ = ['Griffes', 'Crocs', 'Éclaireurs', 'Ombres', 'Rapides', 'Rusés', 'Sauvages', 'Corsaires'];
const RIVAL_NOUN = ['de la Cascade', 'du Rapide', 'des Roseaux', 'du Torrent', 'de l\'Écume', 'des Berges', 'du Grand Lac', 'de la Brume'];
const RIVAL_EMBLEM = ['🦦', '⚔️', '🔱', '🌊', '🐾', '🏴', '⚡', '🌀'];
const RIVAL_FUR = ['roux', 'choco', 'doree', 'neige', 'nuit', 'bonbon', 'braise'];
const RIVAL_NAMES = ['Bandit', 'Vasco', 'Ondine', 'Ricky', 'Nemo', 'Perle', 'Boss', 'Iris', 'Zibo', 'Kaya', 'Tao', 'Nyx'];

/** Puissance d'un combattant (matchmaking, tri du roster). */
export function fighterPower(f) {
  return Math.round(f.maxHp + f.atk * 4 + f.spd * 0.5);
}

/** Une loutre -> descripteur léger de membre (assez pour reconstruire un combattant). */
export function makeMember(o) {
  return {
    name: (o && o.name || 'Loutre').slice(0, 12),
    stage: (o && o.stage) || 'baby',
    fur: (o && o.fur) || 'roux',
    hat: (o && o.hat) || null,
    health: Math.round((o && o.health) ?? 80),
    fun: Math.round((o && o.fun) ?? 60),
    energy: Math.round((o && o.energy) ?? 50)
  };
}

/** Crée un gang mené par la loutre du joueur (chef = 1er membre). */
export function makeGang(name, emblem, leader) {
  return {
    name: String(name || 'Mon gang').slice(0, 18),
    emblem: emblem || '🦦',
    members: [makeMember(leader)],
    wins: 0, losses: 0
  };
}

/** Recrute un membre si la bande n'est pas pleine. Retourne true si ajouté. */
export function recruit(gang, o) {
  if (!gang || !Array.isArray(gang.members) || gang.members.length >= MAX_MEMBERS) return false;
  gang.members.push(makeMember(o));
  return true;
}

/** Coût de recrutement d'une recrue, en XP (proportionnel à sa puissance). */
export function recruitCost(candidate) {
  const p = (candidate && candidate.power) || fighterPower(makeFighter(candidate || {}));
  return Math.max(20, Math.round(p * 0.6));
}

/**
 * Tableau de recrues du jour : des loutres candidates à enrôler, générées de
 * façon SEEDÉE (mêmes recrues pour tous ce jour-là, se renouvelle chaque jour).
 * Chaque candidate porte sa puissance et son coût en XP.
 */
export function recruitBoard(level, dayKey, count = 3) {
  const rng = makeRng(hashSeed('recruit|' + (dayKey || '?') + '|' + (level || 1)));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const topStage = level >= 12 ? 'adult' : level >= 5 ? 'child' : 'baby';
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = rng();
    const stage = t < 0.4 ? topStage : (t < 0.75 ? 'child' : 'baby');
    const cand = {
      id: 'rec|' + dayKey + '|' + i,
      name: pick(RIVAL_NAMES),
      stage, fur: pick(RIVAL_FUR), hat: null,
      health: 60 + Math.round(rng() * 40),
      fun: 40 + Math.round(rng() * 55),
      energy: 30 + Math.round(rng() * 60)
    };
    cand.power = fighterPower(makeFighter(cand));
    cand.cost = recruitCost(cand);
    out.push(cand);
  }
  return out;
}

/** Puissance totale d'un gang (somme des puissances de membres). */
export function gangPower(gang) {
  if (!gang || !Array.isArray(gang.members)) return 0;
  return gang.members.reduce((sum, m) => sum + fighterPower(makeFighter(m)), 0);
}

/**
 * Génère un gang adverse dosé au niveau/à la puissance du joueur (seedé).
 * La puissance visée tourne autour de celle du joueur (±) pour un défi équilibré.
 */
export function generateRival(playerPower, level, seedStr) {
  const rng = makeRng(hashSeed(seedStr || ('rival|' + level + '|' + playerPower)));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const size = Math.min(MAX_MEMBERS, Math.max(2, Math.round(2 + rng() * 3)));
  const topStage = level >= 12 ? 'adult' : level >= 5 ? 'child' : 'baby';
  const members = [];
  for (let i = 0; i < size; i++) {
    const t = rng();
    const stage = t < 0.5 ? topStage : (t < 0.8 ? 'child' : 'baby');
    members.push({
      name: pick(RIVAL_NAMES),
      stage,
      fur: pick(RIVAL_FUR),
      hat: null,
      health: 60 + Math.round(rng() * 40),
      fun: 40 + Math.round(rng() * 55),
      energy: 30 + Math.round(rng() * 60)
    });
  }
  return {
    name: pick(RIVAL_ADJ) + ' ' + pick(RIVAL_NOUN),
    emblem: pick(RIVAL_EMBLEM),
    members, wins: 0, losses: 0, rival: true
  };
}

/**
 * Duel automatique entre deux combattants (seedé). Le plus rapide frappe en
 * premier ; on alterne jusqu'au K.O. Retourne 'a' ou 'b' (le gagnant), en
 * mutant les PV. Borné pour ne jamais boucler.
 */
export function autoDuel(fa, fb, rng) {
  let first = fa.spd === fb.spd ? (rng() < 0.5 ? fa : fb) : (fa.spd > fb.spd ? fa : fb);
  let second = first === fa ? fb : fa;
  for (let round = 0; round < 40; round++) {
    for (const [att, def] of [[first, second], [second, first]]) {
      const power = rng() < 0.3 ? 1.6 : 1.0;              // coup fort occasionnel
      const dmg = Math.max(1, Math.round(att.atk * power * (0.85 + rng() * 0.3)));
      def.hp = Math.max(0, def.hp - dmg);
      if (def.hp <= 0) return def === fa ? 'b' : 'a';
    }
  }
  return fa.hp >= fb.hp ? 'a' : 'b';                      // égalité longue : au plus de PV
}

/**
 * Combat de bande en relais (roi de la colline) : les chefs de file s'affrontent
 * en duel ; le perdant cède la place au suivant de son gang, le vainqueur reste
 * (regagne un peu de PV). Le gang vidé perd. PUR & seedé.
 * @returns {winner:'a'|'b', log:[], powerA, powerB}
 */
export function resolveGangBattle(gangA, gangB, seedStr) {
  const rng = makeRng(hashSeed(seedStr || (gangName(gangA) + '|' + gangName(gangB))));
  const teamA = (gangA.members || []).map(makeFighter);
  const teamB = (gangB.members || []).map(makeFighter);
  const qa = teamA.slice(), qb = teamB.slice();
  const log = [];
  let fa = qa.shift(), fb = qb.shift(), guard = 0;
  while (fa && fb && guard++ < 60) {
    const w = autoDuel(fa, fb, rng);
    if (w === 'a') {
      log.push(fa.name + ' bat ' + fb.name);
      fa.hp = Math.min(fa.maxHp, fa.hp + Math.round(fa.maxHp * 0.25)); // souffle
      fb = qb.shift();
    } else {
      log.push(fb.name + ' bat ' + fa.name);
      fb.hp = Math.min(fb.maxHp, fb.hp + Math.round(fb.maxHp * 0.25));
      fa = qa.shift();
    }
  }
  const winner = fa ? 'a' : 'b';
  return { winner, log, powerA: gangPower(gangA), powerB: gangPower(gangB) };
}

/** Applique le résultat d'un combat aux compteurs des deux gangs (mutation). */
export function applyGangResult(gangA, gangB, winner) {
  if (winner === 'a') { gangA.wins = (gangA.wins || 0) + 1; gangB.losses = (gangB.losses || 0) + 1; }
  else { gangB.wins = (gangB.wins || 0) + 1; gangA.losses = (gangA.losses || 0) + 1; }
}

const gangName = g => (g && g.name) || 'Gang';
