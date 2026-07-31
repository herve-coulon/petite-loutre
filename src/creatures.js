// Créatures du bestiaire : données, spawn, comportement IA.
// Certaines sont agressives et font perdre de la santé si on les croise.
export const CREATURES = [
  { id: 'lapin',     emoji: '🐇', name: 'Lapin des prés',     zone: 'clairiere', aggressive: false, loot: 'carotte',   xp: 2,  desc: 'Un lapin timide qui bondit dans l\'herbe haute.' },
  { id: 'renard',    emoji: '🦊', name: 'Renard roux',        zone: 'foret',     aggressive: true,  loot: 'peau',      xp: 8,  desc: 'Vif et rusé, il rôde à la lisière. Ne le surprends pas.' },
  { id: 'heron',     emoji: '🦩', name: 'Héron cendré',       zone: 'roseaux',   aggressive: false, loot: 'plume',     xp: 3,  desc: 'Patient, il guette le poisson au bord de l\'eau.' },
  { id: 'castor',    emoji: '🦫', name: 'Castor ingénieur',   zone: 'lac',       aggressive: false, loot: 'bois',      xp: 4,  desc: 'Architecte des barrages, il ne veut que travailler.' },
  { id: 'ours',      emoji: '🐻', name: 'Ours brun',          zone: 'vallon',    aggressive: true,  loot: 'miel',      xp: 12, desc: 'Massif mais tranquille… s\'il ne se sent pas menacé.' },
  { id: 'sanglier',  emoji: '🐗', name: 'Sanglier sauvage',   zone: 'gorge',     aggressive: true,  loot: 'truffe',    xp: 10, desc: 'Grognon et costaud, il charge sans prévenir.' },
  { id: 'hibou',     emoji: '🦉', name: 'Hibou tueur',        zone: 'sapiniere', aggressive: false, loot: 'plume',     xp: 5,  desc: 'Silencieux et observateur, il veille la nuit.' },
  { id: 'aigle',     emoji: '🦅', name: 'Aigle royal',        zone: 'cimes',     aggressive: true,  loot: 'serre',     xp: 15, desc: 'Seul au sommet, il plonge sur ses proies.' }
];

/** Créature par id. */
export function creatureById(id) { return CREATURES.find(c => c.id === id) || null; }

/** Créatures d'une zone. */
export function creaturesIn(zone) { return CREATURES.filter(c => c.zone === zone); }

/** Créatures agressives d'une zone. */
export function aggressiveIn(zone) { return CREATURES.filter(c => c.zone === zone && c.aggressive); }

/**
 * État de spawn pour une zone : jusqu'à 2 créatures vivantes à la fois.
 * spawn = () => créature { id, x, y, hp } | null.
 */
export function spawnCreatures(zone, rng = Math.random) {
  const pool = creaturesIn(zone);
  if (!pool.length) return [];
  const count = Math.min(2, pool.length);
  const picked = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let idx;
    do { idx = (rng() * pool.length) | 0; } while (used.has(idx) && used.size < pool.length);
    if (used.has(idx)) break;
    used.add(idx);
    const c = pool[idx];
    picked.push({
      id: c.id,
      x: 30 + (rng() * 100) | 0,
      y: 80 + (rng() * 100) | 0,
      hp: c.aggressive ? 3 : 1,
      vx: (rng() - 0.5) * 0.3,
      vy: (rng() - 0.5) * 0.2,
      state: 'idle',
      lastDir: rng() < 0.5 ? -1 : 1
    });
  }
  return picked;
}

/**
 * Déplacement basique : les créatures non agressives errent, les agressives
 * se rapprochent de la loutre si elle est à portée.
 * creatures, otterX, otterY, rng = Math.random
 * @returns creatures muté
 */
export function tickCreatures(creatures, otterX, otterY, now, rng = Math.random) {
  for (const c of creatures) {
    const data = creatureById(c.id);
    if (!data) continue;

    if (data.aggressive) {
      // rapprochement si la loutre est à < 50px
      const dx = otterX - c.x, dy = otterY - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 50 && dist > 8) {
        c.vx = (dx / dist) * 0.6;
        c.vy = (dy / dist) * 0.4;
        c.state = 'chase';
      } else if (dist <= 8) {
        c.state = 'attack';
        c.vx = 0; c.vy = 0;
      } else {
        c.state = 'idle';
        c.vx *= 0.95; c.vy *= 0.95;
      }
    } else {
      // errance lente
      if (rng() < 0.02) { c.vx = (rng() - 0.5) * 0.4; c.vy = (rng() - 0.5) * 0.3; }
      c.vx *= 0.98; c.vy *= 0.98;
      c.state = 'idle';
    }

    c.x += c.vx;
    c.y += c.vy;
    c.x = Math.max(10, Math.min(150, c.x));
    c.y = Math.max(60, Math.min(150, c.y));
    if (c.vx !== 0) c.lastDir = c.vx > 0 ? 1 : -1;
  }
  return creatures;
}

/** Vérifie si une créature agressive touche la loutre (x, y). */
export function checkAttack(creatures, otterX, otterY) {
  for (const c of creatures) {
    if (c.state !== 'attack') continue;
    const dx = c.x - otterX, dy = c.y - otterY;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      return creatureById(c.id);
    }
  }
  return null;
}
