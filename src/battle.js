// Duel de loutres — RÉFLEXE, pas hasard (refonte v3.76).
//
// Les versions précédentes étaient tour par tour : soit trop aléatoires (« claqué
// au sol »), soit un pierre-feuille-ciseaux DÉTERMINISTE et donc RÉSOLU — une
// seule ligne de jeu gagnait 100 %, toutes les autres 0 % (mesuré). Ni nerveux,
// ni juste.
//
// Le duel est maintenant TEMPS RÉEL et se joue à la parade. L'adversaire
// télégraphe ses coups ; on pare AU BON MOMENT. Aucune issue n'est tirée aux
// dés : seul compte l'INSTANT où l'on appuie. C'est réflexe et lisible.
//   • PARER pile à l'impact  → parade parfaite : coup annulé + riposte, le combo
//     monte ; trois parades parfaites ouvrent une FRAPPE dévastatrice.
//   • PARER un peu à côté      → on bloque (dégâts réduits), le combo retombe.
//   • PARER à contretemps / trop tard → on encaisse le coup plein.
// Le module est PUR : il avance avec une horloge injectée (stepBattle(b, now)) et
// réagit aux entrées (duelInput(b, kind, now)). Rejoué au même tempo, il se
// déroule à l'identique.

const CARD_PREFIX = 'LBATTLE1.';

function toB64(str) {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, 'utf8').toString('base64');
}
function fromB64(b64) {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf8');
}

/** RNG déterministe (mulberry32) — sert à engendrer les adversaires, pas le duel. */
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

/**
 * Construit un combattant depuis un état de loutre (ou une carte décodée).
 * `bonus` est l'équipement porté (chapeau, pelage, trésor) : pv/atq s'y
 * appliquent, donc s'équiper compte en duel. (vit ne pèse plus sur l'issue — le
 * duel n'est plus au tour par tour — mais on la garde pour les cartes.)
 */
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

// Adversaires solo : on n'a plus besoin du code d'un ami pour se battre.
const WILD_NAMES = ['Bandit', 'Vasco', 'Ondine', 'Ricky', 'Perle', 'Iris', 'Zibo', 'Kaya', 'Tao', 'Nyx', 'Brume', 'Silex'];
const WILD_FURS = ['roux', 'choco', 'doree', 'neige', 'nuit', 'bonbon', 'braise'];

/**
 * Une loutre sauvage à défier, engendrée de façon SEEDÉE et dosée au niveau :
 * douce au début, coriace ensuite. Retourne une « carte » (même forme que
 * decodeCard), donc utilisable telle quelle par newBattle.
 */
export function wildFoe(level = 1, seedStr = 'wild', me = null) {
  const rng = makeRng(hashSeed(seedStr + '|' + level));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const lv = Math.max(1, level | 0);
  const grade = Math.min(1, lv / 30);

  // Si on connaît la loutre du joueur (son combattant), on se cale sur SA forme
  // réelle : le duel reste serré même si le niveau et le stade divergent.
  if (me && me.maxHp) {
    const stage = me.stage || 'baby';
    const f = 0.85 + rng() * 0.3;                      // entre -15% et +15%
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

/* ─────────────────────────── Le duel réflexe ─────────────────────────── */

// Toutes les durées sont en millisecondes.
export const INTRO_MS = 650;        // « prépare-toi » avant le premier coup
const WINDUP_MAX = 820;             // télégraphe le plus lent (début, bas niveau)
const WINDUP_MIN = 400;             // le plus rapide (haut niveau / gros combo)
const RECOVER_MS = 300;             // répit entre deux coups
export const PARRY_PERFECT = 130;   // |Δ| ≤ → parade parfaite (riposte)
export const PARRY_OK = 300;        // |Δ| ≤ → blocage ; au-delà → touché plein
export const OPEN_MS = 720;         // durée d'une ouverture (fenêtre de FRAPPE)
export const COMBO_OPEN = 3;        // parades parfaites d'affilée → une ouverture

/**
 * Durée du télégraphe d'un coup. DÉTERMINISTE (aucun dé) : elle rétrécit avec le
 * niveau et le combo — le duel s'accélère quand ça chauffe, d'où le « nerveux »
 * — et suit un motif fixe pour que le tempo VARIE sans être imprévisible. On
 * voit toujours le coup venir : la difficulté est de réagir vite, pas de deviner.
 */
function windupFor(level, seq, combo) {
  const motif = [1.0, 0.72, 1.06, 0.6, 0.9, 0.68][seq % 6];
  const base = WINDUP_MAX - Math.min(320, level * 12) - combo * 45;
  return Math.round(Math.max(WINDUP_MIN, base * motif));
}

/** Applique des dégâts à l'adversaire (force du joueur + un multiplicateur de coup). */
function dealToFoe(b, raw, mult) {
  const d = Math.max(1, Math.round(raw * (b.buffs.force || 1) * (mult || 1)));
  b.foe.hp = Math.max(0, b.foe.hp - d);
  return d;
}
/** Applique des dégâts au joueur (atténués par la cuirasse). */
function dealToMe(b, raw) {
  const d = Math.max(1, Math.round(raw * (b.buffs.encaisse || 1)));
  b.me.hp = Math.max(0, b.me.hp - d);
  return d;
}

function toRecover(b, now) { b.phase = 'recover'; b.nextAt = now + RECOVER_MS; }

function beginAttack(b, now) {
  b.seq++;
  b.windup = windupFor(b.level, b.seq, b.combo);
  b.windStart = now;
  b.impactAt = now + b.windup;
  b.phase = 'wind';
}

function beginOpening(b, now) {
  b.phase = 'opening';
  b.openUntil = now + OPEN_MS;
  b.feedback = { text: 'OUVERTURE — FRAPPE !', kind: 'open', at: now };
}

/** Le coup non paré atteint la loutre (ou le second souffle l'encaisse, une fois). */
function subirCoup(b, now) {
  const encaisse = b.buffs.encaisse || 1;
  if (b.buffs.secondSouffle && !b.souffle && b.me.hp > 0 && b.me.hp - b.foe.atk * encaisse <= 0) {
    b.souffle = true;
    b.feedback = { text: '🌬️ Second souffle — coup encaissé !', kind: 'info', at: now };
  } else {
    const d = dealToMe(b, b.foe.atk);
    b.fx.meHurt = now;
    b.feedback = { text: b.me.name + ' encaisse ! −' + d, kind: 'hurt', at: now };
  }
  b.combo = 0;
  toRecover(b, now);
}

export function newBattle(meState, foeCard, seedStr, opts) {
  const o = opts || {};
  const me = makeFighter(meState, o.bonus);
  const foe = makeFighter(foeCard);
  // Difficulté de l'épreuve : surtout des PV (le combat dure), un peu d'attaque
  // (chaque coup encaissé pique) — mais pas au point qu'un seul raté soit fatal.
  // On adoucit la courbe : les PV grimpent moins vite que le multiplicateur brut
  // (sinon la dernière championne devient un mur increvable) et l'attaque encore
  // moins (un seul coup encaissé ne doit jamais être fatal).
  const mult = o.foeMult && o.foeMult !== 1 ? o.foeMult : 1;
  if (mult !== 1) {
    foe.maxHp = Math.round(foe.maxHp * (1 + (mult - 1) * 0.7)); foe.hp = foe.maxHp;
    foe.atk = Math.round(foe.atk * (1 + (mult - 1) * 0.4));
  }
  const buffs = o.buffs || {};
  const start = o.now != null ? o.now : 0;
  const fen = buffs.fenetre || 1;
  const b = {
    me, foe,
    level: o.level || 1,
    buffs,
    wPerfect: Math.round(PARRY_PERFECT * fen),   // fenêtres effectives (technique « fenêtre »)
    wOk: Math.round(PARRY_OK * fen),
    phase: 'intro',
    nextAt: start + INTRO_MS,
    seq: 0, windup: 0, windStart: start, impactAt: 0,
    combo: Math.min(2, buffs.comboDepart || 0),  // technique « Départ lancé »
    bestCombo: 0, openPower: 0,
    pendingOpen: false, openUntil: 0,
    feedback: { text: 'Prépare-toi à parer !', kind: 'info', at: start },
    fx: { meHurt: -9e9, foeHurt: -9e9, parry: -9e9, strike: -9e9 },
    over: false, winner: null, log: [], souffle: false
  };
  b.log.push('Le duel commence ! ' + me.name + ' vs ' + foe.name);
  return b;
}

function checkEnd(b) {
  if (b.over) return;
  if (b.foe.hp <= 0) {
    b.over = true; b.winner = 'me';
    b.log.push('🏆 ' + b.foe.name + ' est à terre — ' + b.me.name + ' triomphe !');
  } else if (b.me.hp <= 0) {
    b.over = true; b.winner = 'foe';
    b.log.push('💔 ' + b.me.name + ' ne tient plus — ' + b.foe.name + ' l\'emporte…');
  }
}

/** Avance le duel jusqu'à l'instant `now` (horloge injectée). Retourne b (muté). */
export function stepBattle(b, now) {
  if (b.over) return b;
  if (b.phase === 'intro') {
    if (now >= b.nextAt) beginAttack(b, now);
  } else if (b.phase === 'wind') {
    if (now > b.impactAt + b.wOk) subirCoup(b, now);   // aucune parade : le coup passe
  } else if (b.phase === 'recover') {
    if (now >= b.nextAt) {
      if (b.pendingOpen) { b.pendingOpen = false; beginOpening(b, now); }
      else beginAttack(b, now);
    }
  } else if (b.phase === 'opening') {
    if (now > b.openUntil) {                            // ouverture laissée passer
      b.feedback = { text: 'Ouverture manquée…', kind: 'miss', at: now };
      b.combo = 0;
      toRecover(b, now);
    }
  }
  checkEnd(b);
  return b;
}

/**
 * Une entrée du joueur à l'instant `now`. `kind` = 'parry' (pendant un coup) ou
 * 'strike' (pendant une ouverture). Toute la nervosité est ici : la qualité ne
 * dépend QUE de l'écart au bon instant, jamais d'un dé.
 */
export function duelInput(b, kind, now) {
  if (b.over) return b;

  if (kind === 'parry' && b.phase === 'wind') {
    const d = Math.abs(now - b.impactAt);
    if (d <= b.wPerfect) {                          // PARADE PARFAITE : riposte + combo
      b.combo++;
      b.bestCombo = Math.max(b.bestCombo, b.combo);
      const dmg = dealToFoe(b, b.me.atk * (0.5 + 0.14 * b.combo), b.buffs.riposte || 1);
      b.fx.parry = now; b.fx.foeHurt = now;
      b.feedback = { text: 'PARADE ! riposte −' + dmg + '  (combo ×' + b.combo + ')', kind: 'perfect', at: now };
      if (b.combo >= COMBO_OPEN) { b.pendingOpen = true; b.openPower = b.combo; b.combo = 0; }
      toRecover(b, now);
    } else if (d <= b.wOk) {                         // BLOCAGE : on encaisse peu, on rend un peu
      const dmg = dealToMe(b, b.foe.atk * 0.22);
      const rip = dealToFoe(b, b.me.atk * 0.3, 1);   // presque à l'équilibre : celle qui RÉAGIT
      b.combo = 0; b.fx.meHurt = now;                // (un peu en retard) tient et grignote ;
      b.feedback = { text: 'Bloqué −' + dmg + ' · riposte −' + rip, kind: 'block', at: now }; // celle qui ANTICIPE (parade parfaite) écrase
      toRecover(b, now);
    } else {                                         // À CONTRETEMPS : on s'ouvre
      const dmg = dealToMe(b, b.foe.atk);
      b.combo = 0; b.fx.meHurt = now;
      b.feedback = { text: 'À contretemps ! −' + dmg, kind: 'hurt', at: now };
      toRecover(b, now);
    }
    checkEnd(b);
  } else if (kind === 'strike' && b.phase === 'opening') {
    const dmg = dealToFoe(b, b.me.atk * (1.1 + 0.3 * (b.openPower || 1)), b.buffs.frappe || 1);
    b.fx.strike = now; b.fx.foeHurt = now;
    b.feedback = { text: 'FRAPPE ! −' + dmg, kind: 'strike', at: now };
    b.openPower = 0;
    toRecover(b, now);
    checkEnd(b);
  }
  return b;
}
