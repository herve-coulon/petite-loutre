// Combat de loutres façon Pokémon — module PUR, RNG seedé :
// le duel se joue en local contre la carte de combat d'un ami (code copiable).
const CARD_PREFIX = 'LBATTLE1.';

function toB64(str) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, 'utf8').toString('base64');
}
function fromB64(b64) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf8');
}

/** RNG déterministe (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STAGE_BONUS = { baby: 0, child: 15, adult: 30 };
const STAGE_ATK = { baby: 0, child: 3, adult: 6 };

/** Construit un combattant depuis un état de loutre (ou une carte décodée). */
export function makeFighter(o) {
  const stage = o.stage === 'adult' ? 'adult' : o.stage === 'child' ? 'child' : 'baby';
  const hp = 40 + STAGE_BONUS[stage] + Math.round((o.health ?? 80) * 0.3);
  return {
    name: (o.name || 'Loutre mystère').slice(0, 12),
    stage,
    fur: o.fur || 'roux',
    hat: o.hat || null,
    maxHp: hp, hp,
    atk: 8 + Math.round((o.fun ?? 60) * 0.08) + STAGE_ATK[stage],
    spd: Math.round(o.energy ?? 50)
  };
}

export function encodeCard(s) {
  return CARD_PREFIX + toB64(JSON.stringify({
    name: s.name, stage: s.stage, health: Math.round(s.health),
    fun: Math.round(s.fun), energy: Math.round(s.energy),
    fur: s.fur || 'roux', hat: s.hat || null
  }));
}

export function decodeCard(code) {
  try {
    const t = String(code).trim();
    if (!t.startsWith(CARD_PREFIX)) return null;
    const o = JSON.parse(fromB64(t.slice(CARD_PREFIX.length)));
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch (e) { return null; }
}

export const MOVES = [
  { id: 'splash', icon: '💦', name: 'Splash !', pow: 1.0, acc: 0.95, heal: 0 },
  { id: 'roulade', icon: '🌀', name: 'Roulade', pow: 1.6, acc: 0.7, heal: 0 },
  { id: 'calin', icon: '💛', name: 'Câlin soigneur', pow: 0, acc: 1, heal: 15 }
];
const moveById = id => MOVES.find(m => m.id === id) || MOVES[0];

export function newBattle(meState, foeCard, seedStr) {
  const seed = hashSeed(seedStr || (encodeCard(meState) + JSON.stringify(foeCard)));
  return {
    me: makeFighter(meState),
    foe: makeFighter(foeCard),
    rng: makeRng(seed),
    round: 1,
    log: [],
    over: false,
    winner: null
  };
}

function applyMove(b, att, def, move) {
  if (move.heal > 0) {
    const heal = move.heal + Math.round(b.rng() * 6);
    att.hp = Math.min(att.maxHp, att.hp + heal);
    b.log.push(att.name + ' se fait un câlin (+' + heal + ' PV)');
    return;
  }
  if (b.rng() > move.acc) {
    b.log.push(att.name + ' rate sa ' + move.name.toLowerCase().replace(' !', '') + ' !');
    return;
  }
  const dmg = Math.max(1, Math.round(att.atk * move.pow * (0.85 + b.rng() * 0.3)));
  def.hp = Math.max(0, def.hp - dmg);
  b.log.push(att.name + ' utilise ' + move.name + ' — ' + dmg + ' dégâts !');
  if (def.hp <= 0) {
    b.over = true;
    b.winner = att === b.me ? 'me' : 'foe';
    b.log.push(def.name + ' est K.O. ! 🏆 ' + att.name + ' gagne !');
  }
}

/** IA de l'adversaire (seedée, donc reproductible). */
function foeMove(b) {
  if (b.foe.hp < b.foe.maxHp * 0.3 && b.rng() < 0.5) return moveById('calin');
  return b.rng() < 0.35 ? moveById('roulade') : moveById('splash');
}

/**
 * Joue un tour complet : le plus rapide agit d'abord.
 * @returns le combat mis à jour (muté).
 */
export function playTurn(b, myMoveId) {
  if (b.over) return b;
  const mine = moveById(myMoveId);
  const theirs = foeMove(b);
  const meFirst = b.me.spd === b.foe.spd ? b.rng() < 0.5 : b.me.spd > b.foe.spd;
  const order = meFirst
    ? [[b.me, b.foe, mine], [b.foe, b.me, theirs]]
    : [[b.foe, b.me, theirs], [b.me, b.foe, mine]];
  for (const [att, def, mv] of order) {
    if (b.over) break;
    applyMove(b, att, def, mv);
  }
  b.round++;
  return b;
}
