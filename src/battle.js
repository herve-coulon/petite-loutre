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

/**
 * Construit un combattant depuis un état de loutre (ou une carte décodée).
 * `bonus` est l'équipement porté (chapeau, pelage, trésor) : jusqu'à la v3.63 il
 * n'avait AUCUN effet en duel — on collectionnait des objets qui ne servaient
 * qu'aux jauges. Désormais pv/atq/vit s'y appliquent, donc s'équiper compte.
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
  // Sinon, repli sur une progression liée au niveau.
  if (me && me.maxHp) {
    const stage = me.stage || 'baby';
    const f = 0.85 + rng() * 0.3;                      // entre -15% et +15%
    const inv = (target, base, k) => Math.max(0, Math.round((target - base) / k));
    return {
      name: pick(WILD_NAMES),
      stage,
      fur: pick(WILD_FURS),
      hat: null,
      // on inverse makeFighter pour viser des stats proches de celles du joueur
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

/* ─────────────────────────── Le duel ───────────────────────────
 * REFONTE v3.62. L'ancien combat empilait trois aléas — 30 % d'échec sur la
 * roulade, ±15 % sur chaque dégât, et une adversaire qui tirait son coup au
 * hasard. Le choix du joueur ne portait donc presque aucune information : on
 * appuyait, on voyait.
 *
 * Le duel est maintenant DÉTERMINISTE : à état égal et coup égal, le résultat
 * est toujours le même. Ce qu'on gagne, on le gagne en lisant l'adversaire.
 *
 * Trois coups en triangle, chacun battant le suivant :
 *   COUP DE QUEUE  bat  PRISE D'ÉLAN   (on la surprend en pleine charge)
 *   PRISE D'ÉLAN   bat  ESQUIVE        (elle esquive dans le vide, on monte)
 *   ESQUIVE        bat  COUP DE QUEUE  (on l'évite et on contre)
 *
 * L'ÉLAN est la ressource qui donne du poids aux décisions : il se charge
 * lentement, se dépense d'un coup, et charger expose. Frapper sans élan ne
 * fait qu'un coup d'épingle — la vraie question est toujours « est-ce que je
 * charge encore, ou est-ce qu'elle va me punir ? »
 */
export const ELAN_MAX = 3;
export const ROUNDS_MAX = 20;      // au-delà, celui qui tient le mieux l'emporte

export const MOVES = [
  { id: 'frappe', icon: '🌊', name: 'Coup de queue',
    desc: 'Frappe. Dégâts selon l\'élan. Punit une charge, mais s\'esquive.' },
  { id: 'esquive', icon: '💨', name: 'Esquive',
    desc: 'Annule le coup adverse et contre. Inutile face à une charge.' },
  { id: 'elan', icon: '🔥', name: 'Prise d\'élan',
    desc: '+1 élan et un souffle repris. Découvre : un coup de queue fait mal.' }
];
const moveById = id => MOVES.find(m => m.id === id) || MOVES[0];

/** Dégâts d'un coup de queue, selon l'élan dépensé. PUR et sans aléa. */
export function frappeDamage(att, elan, mult = 1) {
  // sans élan, c'est un coup d'épingle (0,30) ; à pleine charge, c'est décisif
  // (1,95). Marteler la frappe à vide ne doit jamais être une stratégie payante.
  return Math.max(1, Math.round(att.atk * (0.30 + 0.55 * elan) * mult));
}

export function newBattle(meState, foeCard, seedStr, opts) {
  const seed = hashSeed(seedStr || (encodeCard(meState) + JSON.stringify(foeCard)));
  const o = opts || {};
  const b = {
    me: makeFighter(meState, o.bonus),
    foe: makeFighter(foeCard),
    rng: makeRng(seed),      // conservé pour la compatibilité : le duel ne s'en sert plus
    round: 1,
    log: [],
    over: false,
    winner: null,
    lastMine: null,          // ce que l'adversaire a vu de nous au tour d'avant
    lastTheirs: null,        // et ce qu'elle a joué
    hist: [],                // nos deux derniers coups : ce qu'elle lit pour prédire
    buffs: o.buffs || {},    // techniques acquises : ce que le jeu a appris à la loutre
    souffleUse: false        // le second souffle ne se déclenche qu'une fois
  };
  // Difficulté de l'adversaire, appliquée aux STATISTIQUES et non aux jauges :
  // celles-ci sont plafonnées à 100, si bien qu'un multiplicateur de 1,45 y
  // saturait et que les « championnes » n'étaient guère plus fortes qu'une
  // sauvage. C'est ici qu'une épreuve devient vraiment une épreuve.
  if (o.foeMult && o.foeMult !== 1) {
    b.foe.maxHp = Math.round(b.foe.maxHp * o.foeMult);
    b.foe.hp = b.foe.maxHp;
    b.foe.atk = Math.round(b.foe.atk * o.foeMult);
  }
  b.me.elanMax = Math.max(ELAN_MAX, b.buffs.elanMax || 0);
  b.foe.elanMax = ELAN_MAX;
  b.me.elan = Math.min(b.me.elanMax, b.buffs.elanDepart || 0);
  b.foe.elan = 0;
  return b;
}

/** Applique les techniques du joueur : sa force en attaque, sa cuirasse en défense. */
function ajuste(b, att, def, brut) {
  let d = brut;
  if (att === b.me && b.buffs.force) d *= b.buffs.force;
  if (def === b.me && b.buffs.encaisse) d *= b.buffs.encaisse;
  return Math.max(1, Math.round(d));
}

function frapper(b, att, def, mult, note) {
  const dmg = ajuste(b, att, def, frappeDamage(att, att.elan, mult));
  att.elan = 0;                                   // le coup dépense toute la charge
  def.hp = Math.max(0, def.hp - dmg);
  b.log.push(att.name + ' place un coup de queue' + (note || '') + ' — ' + dmg + ' dégâts !');
  return dmg;
}

/** Le seuil d'élan à partir duquel une charge traverse une esquive (jamais modifié :
 *  l'abaisser rendait la frappe imparable et effondrait le triangle). */
const SEUIL_PERCEE = 2;
/** Ce qui reste des dégâts quand une charge lourde traverse une esquive. */
function forcePercee(b, who) {
  return who === b.me && b.buffs.perceeForce ? b.buffs.perceeForce : 0.5;
}

function charger(b, who) {
  const max = who.elanMax || ELAN_MAX;
  if (who.elan < max) {
    who.elan++;
    b.log.push(who.name + ' prend son élan (⚡' + who.elan + '/' + max + ')');
  } else {
    b.log.push(who.name + ' est déjà à pleine charge (⚡' + max + ')');
  }
  const soin = Math.min(who.maxHp - who.hp, 4);   // on reprend son souffle
  if (soin > 0) who.hp += soin;
}

/**
 * IA de l'adversaire : DÉTERMINISTE et lisible. Elle contre ce que le joueur
 * vient de jouer — donc répéter le même coup se paie — et elle réagit à l'état
 * plutôt que de tirer aux dés. On peut apprendre à la lire : c'est le but.
 */
/** Le coup qui bat celui-ci, selon le triangle. */
const CONTRE = { frappe: 'esquive', esquive: 'elan', elan: 'frappe' };

/**
 * IA de l'adversaire : DÉTERMINISTE et lisible, mais pas naïve.
 *
 * Elle ne contre pas le dernier coup — une simple alternance A,B,A,B suffisait
 * alors à la battre à tous les coups, puisqu'elle contrait toujours celui qu'on
 * venait justement de quitter. Elle PRÉDIT le coup suivant à partir des deux
 * derniers : si le joueur alterne, elle attend le retour de l'avant-dernier ; si
 * le joueur se répète, elle attend la répétition. Puis elle contre sa prédiction.
 *
 * Casser une régularité demande donc de vraies décisions — et rien n'est tiré
 * aux dés : la même partie rejouée à l'identique se déroule à l'identique.
 */
export function foeIntent(b) {
  const f = b.foe, m = b.me;
  const h = b.hist || [];

  // L'état prime sur la lecture : ces situations-là commandent.
  if (f.elan >= ELAN_MAX) return 'frappe';                 // chargée à bloc : elle lâche tout
  if (m.elan >= 2) return 'frappe';                        // elle interrompt la charge
  if (f.hp <= f.maxHp * 0.25 && f.elan >= 1) return 'frappe';   // dos au mur : va-tout
  if (!h.length) return 'elan';                            // rien à lire encore : elle se prépare

  // Elle contre l'HABITUDE : le coup que le joueur a le plus joué récemment.
  // Contrer le dernier coup se faisait battre par une simple alternance, et un
  // contre d'ordre 2 par n'importe quel cycle de période 3. La fréquence, elle,
  // punit toute manie et ne laisse rien de gratuit à un joueur régulier : pour
  // la prendre en défaut il faut varier POUR DE BON.
  const cnt = { frappe: 0, esquive: 0, elan: 0 };
  // fréquence BRUTE : pondérer par la récence revenait à contrer le dernier
  // coup, et toute alternance A,B,A,B redevenait gratuite
  h.forEach(c => { if (cnt[c] != null) cnt[c] += 1; });
  const ordre = ['frappe', 'elan', 'esquive'];             // départage stable
  let prevu = ordre[0];
  for (const c of ordre) if (cnt[c] > cnt[prevu]) prevu = c;
  return CONTRE[prevu];
}

/**
 * Joue un tour. Les deux coups sont résolus ENSEMBLE selon le triangle ; seule
 * la confrontation frappe/frappe départage par la vitesse.
 * @returns le combat mis à jour (muté).
 */
export function playTurn(b, myMoveId) {
  if (b.over) return b;
  const mine = moveById(myMoveId).id;
  const theirs = foeIntent(b);
  const me = b.me, foe = b.foe;

  if (mine === 'frappe' && theirs === 'frappe') {
    // duel franc : le plus rapide frappe d'abord, et un K.O. clôt l'échange
    const meFirst = me.spd >= foe.spd;
    const [a, d] = meFirst ? [me, foe] : [foe, me];
    frapper(b, a, d, 1);
    if (d.hp > 0) frapper(b, d, a, 1);
  } else if (mine === 'frappe' && theirs === 'esquive') {
    if (me.elan >= SEUIL_PERCEE) {
      // une charge lourde ne s'esquive pas proprement : elle passe, atténuée.
      // Sans cette percée, un adversaire qui esquive rendait l'élan indépensable.
      frapper(b, me, foe, forcePercee(b, me), ' malgré l\'esquive');
    } else {
      me.elan = 0;
      const riposte = ajuste(b, foe, me, foe.atk * 0.5);
      me.hp = Math.max(0, me.hp - riposte);
      b.log.push(foe.name + ' esquive et riposte — ' + riposte + ' dégâts !');
    }
  } else if (mine === 'frappe' && theirs === 'elan') {
    frapper(b, me, foe, 1.35, ' en pleine charge');
    foe.elan = 0;
    b.log.push(foe.name + ' perd sa charge !');
  } else if (mine === 'esquive' && theirs === 'frappe') {
    if (foe.elan >= SEUIL_PERCEE) {
      frapper(b, foe, me, forcePercee(b, foe), ' malgré l\'esquive');
    } else {
      foe.elan = 0;
      const riposte = ajuste(b, me, foe, me.atk * 0.5 * (b.buffs.riposte || 1));
      foe.hp = Math.max(0, foe.hp - riposte);
      b.log.push(me.name + ' esquive et riposte — ' + riposte + ' dégâts !');
    }
  } else if (mine === 'esquive' && theirs === 'esquive') {
    b.log.push('Les deux loutres se tournent autour…');
  } else if (mine === 'esquive' && theirs === 'elan') {
    charger(b, foe);
    b.log.push(me.name + ' esquive dans le vide.');
  } else if (mine === 'elan' && theirs === 'frappe') {
    frapper(b, foe, me, 1.35, ' en pleine charge');
    me.elan = 0;
    b.log.push(me.name + ' perd sa charge !');
  } else if (mine === 'elan' && theirs === 'esquive') {
    charger(b, me);
    b.log.push(foe.name + ' esquive dans le vide.');
  } else {                                        // elan / elan
    charger(b, me);
    charger(b, foe);
  }

  // Second souffle : dos au mur, la loutre retrouve un cran d'élan. Une fois.
  if (b.buffs.secondSouffle && !b.souffleUse && me.hp > 0 && me.hp <= me.maxHp * 0.25) {
    b.souffleUse = true;
    me.elan = Math.min(me.elanMax || ELAN_MAX, me.elan + 1);
    b.log.push('🌬️ ' + me.name + ' trouve un second souffle (⚡' + me.elan + ') !');
  }

  if (me.hp <= 0 || foe.hp <= 0) {
    b.over = true;
    b.winner = foe.hp <= 0 && me.hp > 0 ? 'me' : me.hp <= 0 && foe.hp > 0 ? 'foe'
      : (me.hp / me.maxHp >= foe.hp / foe.maxHp ? 'me' : 'foe');
    const gagnant = b.winner === 'me' ? me : foe;
    b.log.push((b.winner === 'me' ? foe.name : me.name) + ' est K.O. ! 🏆 ' + gagnant.name + ' gagne !');
  }

  b.lastMine = mine;
  b.lastTheirs = theirs;
  b.hist.push(mine);
  if (b.hist.length > 6) b.hist.shift();
  b.round++;

  // Verrou anti-enlisement : deux esquives en boucle pourraient tourner sans
  // fin. Passé la limite, celle qui tient le mieux l'emporte.
  if (!b.over && b.round > ROUNDS_MAX) {
    b.over = true;
    b.winner = (me.hp / me.maxHp) >= (foe.hp / foe.maxHp) ? 'me' : 'foe';
    b.log.push('Les deux loutres s\'essoufflent… 🏆 ' +
      (b.winner === 'me' ? me.name : foe.name) + ' l\'emporte aux points !');
  }
  return b;
}
