// Trésors : objets rares équipables qui donnent un petit bonus de jeu.
// Gagnés de DEUX façons : paliers de niveau (garantis) ET drops aléatoires dans
// les activités. Module PUR (hasard injecté). L'état vit dans rec.items
// (possédés, global) et s.gear (équipé, par loutre — comme le chapeau).

export const RARITIES = {
  commun:     { key: 'commun',     label: 'Commun',     color: '#a9b4c4', weight: 60 },
  rare:       { key: 'rare',       label: 'Rare',       color: '#5fc9e0', weight: 26 },
  epique:     { key: 'epique',     label: 'Épique',     color: '#c07af0', weight: 11 },
  legendaire: { key: 'legendaire', label: 'Légendaire', color: '#f2c14e', weight: 3 }
};

// bonus : xp (mult. d'XP gagnée), decay (mult. de décroissance des jauges, <1 = plus lent),
// luck (mult. de chance de drop), coldResist/heatResist (0..1, atténue les malus de saison).
export const ITEMS = [
  { id: 'caillou',      emoji: '🪨', name: 'Caillou porte-veine',   rarity: 'commun',     drop: true,  bonus: { xp: 1.03 } },
  { id: 'gland',        emoji: '🌰', name: 'Gland vernissé',        rarity: 'commun',     drop: true,  bonus: { decay: 0.97 } },
  { id: 'plume',        emoji: '🪶', name: 'Plume de héron',        rarity: 'commun',     drop: true,  bonus: { luck: 1.15 } },
  { id: 'coquillage',   emoji: '🐚', name: 'Coquillage nacré',      rarity: 'rare',       drop: true,  bonus: { xp: 1.08 } },
  { id: 'trefle',       emoji: '🍀', name: 'Trèfle porte-bonheur',  rarity: 'rare',       drop: true,  bonus: { luck: 1.4 } },
  { id: 'medaillon',    emoji: '🎖️', name: 'Médaillon du soigneur', rarity: 'rare',       drop: false, bonus: { decay: 0.92 } },
  { id: 'amulette',     emoji: '🧿', name: 'Amulette des saisons',  rarity: 'epique',     drop: true,  bonus: { coldResist: 0.6, heatResist: 0.6 } },
  { id: 'cristal',      emoji: '🔮', name: 'Cristal de rivière',    rarity: 'epique',     drop: true,  bonus: { xp: 1.15 } },
  { id: 'boussole',     emoji: '🧭', name: 'Boussole d\'ambre',     rarity: 'epique',     drop: true,  bonus: { decay: 0.88 } },
  { id: 'perle',        emoji: '⚪', name: 'Perle des profondeurs', rarity: 'legendaire', drop: true,  bonus: { xp: 1.2, decay: 0.92 } },
  { id: 'etoilefilante', emoji: '🌠', name: 'Étoile filante',       rarity: 'legendaire', drop: false, bonus: { xp: 1.25, luck: 1.5 } },
  { id: 'coeur',        emoji: '💠', name: 'Cœur de la rivière',    rarity: 'legendaire', drop: true,  bonus: { decay: 0.82, coldResist: 0.8, heatResist: 0.8 } }
];

// Paliers garantis : atteindre CE niveau octroie le trésor (le reste est à dénicher).
export const MILESTONES = { 4: 'gland', 8: 'coquillage', 12: 'medaillon', 20: 'amulette', 35: 'perle', 50: 'etoilefilante' };

export const itemById = id => ITEMS.find(it => it.id === id) || null;

/** Le trésor octroyé en atteignant ce niveau exact, ou null. */
export function milestoneItem(level) { return MILESTONES[level] || null; }

/** Bonus de l'objet équipé (ou {} si aucun / inconnu). */
export function bonusOf(gearId) {
  const it = itemById(gearId);
  return (it && it.bonus) || {};
}

const DROPPABLE = ITEMS.filter(it => it.drop);

/**
 * Tente un drop à la fin d'une activité. PUR (rnd injecté).
 * @param {function} rnd  générateur [0,1)
 * @param {number} luck   multiplicateur de chance (bonus d'objet équipé)
 * @returns {string|null} id de l'objet lâché, ou null.
 */
export function rollDrop(rnd, luck = 1) {
  const base = Math.min(0.12 * (luck || 1), 0.5); // ~12% par activité, boosté par la chance
  if (rnd() >= base) return null;
  const total = DROPPABLE.reduce((sum, it) => sum + RARITIES[it.rarity].weight, 0);
  let r = rnd() * total;
  for (const it of DROPPABLE) {
    r -= RARITIES[it.rarity].weight;
    if (r < 0) return it.id;
  }
  return DROPPABLE[DROPPABLE.length - 1].id;
}

/** Texte court du bonus, pour la garde-robe. */
export function describeBonus(bonus) {
  const parts = [];
  if (bonus.xp) parts.push('+' + Math.round((bonus.xp - 1) * 100) + '% XP');
  if (bonus.decay) parts.push('jauges ' + Math.round((1 - bonus.decay) * 100) + '% plus lentes');
  if (bonus.luck) parts.push('+' + Math.round((bonus.luck - 1) * 100) + '% de chance');
  if (bonus.coldResist || bonus.heatResist) parts.push('résiste au froid et à la chaleur');
  return parts.join(' · ') || 'porte-bonheur';
}
