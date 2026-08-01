// Duel de loutres — TOUR PAR TOUR, Pokémon-like (refonte v3.85).
//
// Chaque tour : l'ennemi montre son intention, le joueur choisit une technique,
// la vitesse détermine l'ordre, les dégâts sont calculés avec le combo à risque.
// Le module est PUR : aucune dépendance DOM, horloge injectée.

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
export function makeFighter(o, bonus) {
  const stage = o.stage === 'adult' ? 'adult' : o.stage === 'child' ? 'child' : 'baby';
  const b = bonus || {};
  const hp = Math.round((40 + STAGE_BONUS[stage] + Math.round((o.health ?? 80) * 0.3)) * (b.pv || 1));
  return {
    name: (o.name || 'Loutre mystère').slice(0, 12),
    stage,
    fur: o.fur || 'roux',
    hat: o.hat || null,
    maxHp: hp, hp,
    atk: Math.round((8 + Math.round((o.fun ?? 60) * 0.08) + STAGE_ATK[stage]) * (b.atq || 1)),
    spd: Math.round((o.energy ?? 50) * (b.vit || 1))
  };
}

// ── Adversaires solo ──

const WILD_NAMES = ['Bandit', 'Vasco', 'Ondine', 'Ricky', 'Perle', 'Iris', 'Zibo', 'Kaya', 'Tao', 'Nyx', 'Brume', 'Silex'];
const WILD_FURS = ['roux', 'choco', 'doree', 'neige', 'nuit', 'bonbon', 'braise'];

/** Une loutre sauvage à défier, engendrée de façon seedée et dosée au niveau. */
export function wildFoe(level = 1, seedStr = 'wild', me = null) {
  const rng = makeRng(hashSeed(seedStr + '|' + level));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const lv = Math.max(1, level | 0);
  const grade = Math.min(1, lv / 30);

  if (me && me.maxHp) {
    const stage = me.stage || 'baby';
    const f = 0.85 + rng() * 0.3;
    const inv = (target, base, k) => Math.max(0, Math.round((target - base) / k));
    return {
      name: pick(WILD_NAMES),
      stage,
      fur: pick(WILD_FURS),
      hat: null,
      health: Math.min(100, inv(me.maxHp * f, 40 + STAGE_BONUS[stage], 0.3)),
      fun: Math.min(100, inv(me.atk * f, 8 + STAGE_ATK[stage], 0.08)),
      energy: Math.min(100, Math.round(me.spd * (0.85 + rng() * 0.3)))
    };
  }

  const stage = lv >= 12 ? 'adult' : lv >= 5 ? 'child' : 'baby';
  return {
    name: pick(WILD_NAMES),
    stage,
    fur: pick(WILD_FURS),
    hat: null,
    health: Math.round(55 + grade * 40 + rng() * 20),
    fun: Math.round(40 + grade * 45 + rng() * 20),
    energy: Math.round(35 + grade * 40 + rng() * 25)
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

/* ──────────────────── Techniques de combat ──────────────────── */

export const TECHNIQUES = [
  { id: 'morsure', name: 'Morsure', icon: '🦷', element: 'normal', power: 12, maxPp: 99, cost: 0, desc: 'Attaque de base.' },
  { id: 'jet_eau', name: "Jet d'eau", icon: '💧', element: 'eau', power: 16, maxPp: 5, cost: 1, desc: 'Projectile standard.' },
  { id: 'soin', name: 'Soin', icon: '💚', element: 'normal', power: 0, maxPp: 3, cost: 2, desc: 'Récupère 18 PV.', heal: 18 },
  { id: 'coup_queue', name: 'Coup de queue', icon: '🦦', element: 'normal', power: 22, maxPp: 4, cost: 2, desc: 'Frappe lourde.' },
  { id: 'plongee', name: 'Plongée', icon: '🤿', element: 'eau', power: 25, maxPp: 3, cost: 2, desc: 'Si l\'ennemi attaque, −50% dégâts.', dodge: 0.5 },
  { id: 'furie', name: 'Furie', icon: '🔥', element: 'feu', power: 30, maxPp: 2, cost: 3, desc: '+1 combo risque.', bonusCombo: 1 },
  { id: 'racines', name: 'Racines', icon: '🌿', element: 'plante', power: 18, maxPp: 3, cost: 2, desc: 'Attaque + récupère 10 PV.', heal: 10 },
  { id: 'tsunami', name: 'Tsunami', icon: '🌊', element: 'eau', power: 42, maxPp: 1, cost: 4, desc: 'Nécessite combo ≥ 3.', minCombo: 3 }
];

export function techniqueById(id) { return TECHNIQUES.find(t => t.id === id) || null; }

/** Renvoie les techniques débloquées du joueur (liste d'id). */
export function playerTechniques(rec) {
  const r = rec || {};
  const out = [];
  // Techniques de base toujours disponibles
  out.push('morsure');
  if ((r.battles || 0) >= 3) out.push('jet_eau');
  if ((r.wins || 0) >= 2) out.push('soin');
  if ((r.wins || 0) >= 5) out.push('coup_queue');
  if ((r.battles || 0) >= 10) out.push('plongee');
  if ((r.wins || 0) >= 8) out.push('furie');
  if ((r.gamesTotal || 0) >= 15) out.push('racines');
  if ((r.epreuves || []).length >= 2) out.push('tsunami');
  return out;
}

/* ──────────────────── Intentions ennemi ──────────────────── */

const INTENTIONS = [
  { id: 'attaque', icon: '⚔️', label: 'Attaque', mult: 1.0, weight: 50 },
  { id: 'furie', icon: '💥', label: 'Furie', mult: 1.6, weight: 25 },
  { id: 'parade', icon: '🛡️', label: 'Parade', mult: 0, defend: true, weight: 15 },
  { id: 'soin', icon: '❤️', label: 'Soin', mult: 0, heal: true, weight: 10 }
];

/** Tire une intention seedée pour l'ennemi. */
function rollIntent(rng) {
  const total = INTENTIONS.reduce((s, i) => s + i.weight, 0);
  let roll = rng() * total;
  for (const intent of INTENTIONS) {
    roll -= intent.weight;
    if (roll <= 0) return intent;
  }
  return INTENTIONS[0];
}

/* ──────────────────── Combattant ennemi étendu ──────────────────── */

function makeEnemyFighter(foeCard, foeMult, rng) {
  const f = makeFighter(foeCard);
  const mult = foeMult || 1;
  if (mult !== 1) {
    f.maxHp = Math.round(f.maxHp * (1 + (mult - 1) * 0.7));
    f.hp = f.maxHp;
    f.atk = Math.round(f.atk * (1 + (mult - 1) * 0.4));
  }
  // L'ennemi a aussi des techniques (basées sur son ATK)
  f.techniques = [
    { id: 'morsure', name: 'Morsure', icon: '🦷', power: f.atk },
    { id: 'coup_queue', name: 'Coup de queue', icon: '🦦', power: Math.round(f.atk * 1.4) }
  ];
  f.defending = false;
  return f;
}

/* ──────────────────── État du combat ──────────────────── */

export const INTRO_MS = 1200;
const MAX_COMBO = 5;
const COMBO_DAMAGE_MULT = 0.15;   // bonus dégâts par stack
const COMBO_RISK_MULT = 0.10;     // vulnerability par stack
const TURN_DELAY = 800;           // ms entre les tours
const DEFEND_REDUCTION = 0.5;     // réduction quand l'ennemi defend

/**
 * Crée un nouvel état de combat.
 * @param {object} meState - état de la loutre du joueur
 * @param {object} foeCard - carte de l'ennemi
 * @param {string} seedStr - graine pour le RNG
 * @param {object} opts - { bonus, buffs, foeMult, level, now, techIds }
 */
export function newBattle(meState, foeCard, seedStr, opts) {
  const o = opts || {};
  const me = makeFighter(meState, o.bonus);
  const rng = makeRng(hashSeed(seedStr));
  const foe = makeEnemyFighter(foeCard, o.foeMult, rng);

  // Techniques du joueur : on initialise les PP
  const techIds = o.techIds || ['morsure'];
  const pp = {};
  for (const id of techIds) {
    const t = techniqueById(id);
    if (t) pp[id] = t.maxPp;
  }

  const start = o.now != null ? o.now : 0;
  const intent = rollIntent(rng);

  const b = {
    me, foe,
    level: o.level || 1,
    buffs: o.buffs || {},
    phase: 'intro',        // intro | intent | choose | resolve | over
    nextAt: start + INTRO_MS,
    turn: 0,
    rng,
    intent,
    combo: Math.min(MAX_COMBO, (o.buffs && o.buffs.comboDepart) || 0),
    bestCombo: 0,
    defending: false,       // le joueur a choisi Plongée ce tour
    pp,
    feedback: { text: 'Le combat commence !', kind: 'info', at: start },
    fx: { meHurt: -9e9, foeHurt: -9e9 },
    over: false, winner: null,
    log: [], souffle: false
  };
  b.log.push('Le duel commence ! ' + me.name + ' vs ' + foe.name);
  return b;
}

/* ──────────────────── Formules ──────────────────── */

function comboDamageMult(combo) { return 1 + COMBO_DAMAGE_MULT * combo; }
function comboRiskMult(combo) { return 1 + COMBO_RISK_MULT * combo; }

function calcPlayerDamage(b, tech) {
  if (!tech || tech.power === 0) return 0;
  const base = tech.power * (1 + b.me.atk * 0.01);
  const comboMult = comboDamageMult(b.combo);
  const forceMult = b.buffs.force || 1;
  const defense = b.foe.atk * 0.3;
  return Math.max(1, Math.round(base * comboMult * forceMult - defense));
}

function calcEnemyDamage(b, intentMult) {
  const base = b.foe.atk * intentMult;
  const riskMult = comboRiskMult(b.combo);
  const encaisse = b.buffs.encaisse || 1;
  const dodgeMult = b.defending ? DEFEND_REDUCTION : 1;
  const defense = b.me.atk * 0.2;
  return Math.max(1, Math.round(base * riskMult * encaisse * dodgeMult - defense));
}

function applyDamage(target, dmg) {
  target.hp = Math.max(0, target.hp - dmg);
  return dmg;
}

function applyHeal(target, amount) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}

/* ──────────────────── Second souffle ──────────────────── */

function checkSecondSouffle(b, damage) {
  if (b.buffs.secondSouffle && !b.souffle && b.me.hp > 0 && b.me.hp - damage <= 0) {
    b.souffle = true;
    return true;
  }
  return false;
}

/* ──────────────────── Déroulement d'un tour ──────────────────── */

function executeTurn(b, playerTechId, now) {
  b.turn++;
  const tech = techniqueById(playerTechId);
  const intent = b.intent;
  b.defending = tech && !!tech.dodge;

  // Déterminer l'ordre (le plus rapide frappe en premier)
  const playerFirst = b.me.spd >= b.foe.spd;
  const log = [];

  const resolvePlayerAttack = () => {
    if (!tech) return;
    // Vérifier PP
    if (tech.cost > 0 && (b.pp[tech.id] || 0) <= 0) {
      log.push('Plus de PP pour ' + tech.name + ' !');
      return;
    }
    // Consommer PP
    if (tech.cost > 0) b.pp[tech.id] = (b.pp[tech.id] || 0) - 1;
    // Soin (même sans dégâts)
    if (tech.heal) {
      const healed = applyHeal(b.me, tech.heal);
      if (healed > 0) log.push('💚 ' + b.me.name + ' utilise Soin — +' + healed + ' PV.');
    }
    // Dégâts
    if (tech.power > 0) {
      // Combo risque : furie ajoute un stack
      if (tech.bonusCombo) {
        b.combo = Math.min(MAX_COMBO, b.combo + tech.bonusCombo);
      }
      // L'ennemi defend-il ?
      if (intent.defend) {
        log.push(b.foe.name + ' pare — dégâts réduits !');
      }
      const dmg = calcPlayerDamage(b, tech);
      applyDamage(b.foe, dmg);
      b.combo = Math.min(MAX_COMBO, b.combo + 1);
      b.bestCombo = Math.max(b.bestCombo, b.combo);
      b.fx.foeHurt = now;
      log.push(b.me.name + ' utilise ' + (tech.icon || '') + ' ' + tech.name + ' — ' + dmg + ' dégâts !');
    } else {
      // Attaque sans dégâts (soin pur) — combo ne monte pas
      log.push(b.me.name + ' utilise ' + (tech.icon || '') + ' ' + tech.name + ' !');
    }
  };

  const resolveEnemyAttack = () => {
    if (intent.heal) {
      const healed = applyHeal(b.foe, Math.round(b.foe.maxHp * 0.12));
      log.push('❤️ ' + b.foe.name + ' se soigne — +' + healed + ' PV.');
      return;
    }
    if (intent.mult === 0) return; // parade = pas d'attaque
    const rawDmg = calcEnemyDamage(b, intent.mult);
    if (checkSecondSouffle(b, rawDmg)) {
      log.push('🌬️ Second souffle — coup encaissé !');
    } else {
      applyDamage(b.me, rawDmg);
      b.fx.meHurt = now;
      log.push(intent.icon + ' ' + b.foe.name + ' utilise ' + intent.label + ' — ' + rawDmg + ' dégâts !');
      b.combo = 0; // touché = reset combo
    }
  };

  if (playerFirst) {
    resolvePlayerAttack();
    if (!b.over && b.me.hp > 0) resolveEnemyAttack();
  } else {
    resolveEnemyAttack();
    if (!b.over && b.foe.hp > 0) resolvePlayerAttack();
  }

  // Feedback
  b.feedback = { text: log.join(' | '), kind: b.me.hp <= 0 ? 'hurt' : b.foe.hp <= 0 ? 'strike' : 'info', at: now };

  // Vérifier fin
  if (b.foe.hp <= 0) {
    b.over = true; b.winner = 'me';
    b.log.push('🏆 ' + b.foe.name + ' est à terre — ' + b.me.name + ' triomphe !');
  } else if (b.me.hp <= 0) {
    b.over = true; b.winner = 'foe';
    b.log.push('💔 ' + b.me.name + ' ne tient plus — ' + b.foe.name + ' l\'emporte…');
  }

  // Préparer tour suivant
  if (!b.over) {
    b.intent = rollIntent(b.rng);
    b.phase = 'intent';
    b.nextAt = now + TURN_DELAY;
  }
}

/* ──────────────────── API publique ──────────────────── */

/** Avance le duel à l'instant `now`. */
export function stepBattle(b, now) {
  if (b.over) return b;
  if (b.phase === 'intro') {
    if (now >= b.nextAt) {
      b.phase = 'intent';
      b.nextAt = now + 600; // pause avant le premier choix
    }
  } else if (b.phase === 'intent') {
    if (now >= b.nextAt) {
      b.phase = 'choose';
    }
  }
  // 'choose' n'avance pas tout seul — on attend un input du joueur
  // 'resolve' n'existe pas comme phase persistante — on résout directement dans duelInput
  return b;
}

/**
 * Input du joueur : choisir une technique.
 * @param {object} b - état du combat
 * @param {string} techId - id de la technique choisie
 * @param {number} now - horloge courante
 */
export function duelInput(b, techId, now) {
  if (b.over || b.phase !== 'choose') return b;
  const tech = techniqueById(techId);
  if (!tech) return b;
  // Vérifier PP
  if (tech.cost > 0 && (b.pp[tech.id] || 0) <= 0) {
    b.feedback = { text: 'Plus de PP pour ' + tech.name + ' !', kind: 'miss', at: now };
    return b;
  }
  // Vérifier minCombo
  if (tech.minCombo && b.combo < tech.minCombo) {
    b.feedback = { text: tech.name + ' nécessite combo ≥ ' + tech.minCombo + ' !', kind: 'miss', at: now };
    return b;
  }
  b.phase = 'resolve';
  executeTurn(b, techId, now);
  return b;
}
