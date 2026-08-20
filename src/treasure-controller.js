// Contrôleur des « Trésors » (É5) — extrait de main.js (audit M5, tranche 6).
// Domaine : le DROP aléatoire d'objets dans les activités (plongée, pêche,
// toboggan, monde, combat, trésor de saison). La table de butin est pure
// (items.js) ; ici : l'orchestration (inventaire, doublons → atelier, UI) via un
// contexte injecté par main.js. Le lancement se fait via le pont tryDrop().
import { itemById, rollDrop, RARITIES } from './items.js';
import { equipBonus } from './skins.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupTreasure(hooks) { ctx = hooks; }

/** Tente un drop aléatoire (chance boostée par le trésor équipé + le contexte). */
export function tryDrop(boost = 1) {
  const st = s();
  if (!st || st.gameOver || st.stage === 'egg') return;
  const r = rec();
  const id = rollDrop(Math.random, (equipBonus(st).luck || 1) * boost);
  if (!id) return;
  const it = itemById(id);
  if (r.items.includes(id)) { // déjà possédé -> le doublon part à l'atelier (É5)
    r.dupes = r.dupes || {};
    r.dupes[it.rarity] = (r.dupes[it.rarity] || 0) + 1;
    ctx.persistRec();
    ui.toast('✨ ' + it.emoji + ' doublon ' + it.name + ' → atelier 🛠️');
    ctx.gainXp(10);
    return;
  }
  r.items.push(id);
  ctx.persistRec();
  const rar = RARITIES[it.rarity];
  ui.toast(it.emoji + ' ' + rar.label + ' : ' + it.name + ' !');
  ui.log('🎁 Trésor ' + rar.label.toLowerCase() + ' déniché : ' + it.emoji + ' ' + it.name + ' ! Équipe-le dans 🎩.');
  if (!st.gameOver && st.stage !== 'egg') ctx.burst('confetti', 24, st.stage);
  sfx.levelup(); vibrate([20, 40, 20]);
}
