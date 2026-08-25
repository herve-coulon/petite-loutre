// Contrôleur des « Lieux » (berge ⇄ tanière ⇄ monde) — extrait de main.js
// (audit M5, tranche 18). La tanière est accessible quand la loutre est là,
// disponible et hors mini-jeu (`denAvailable`, prédicat lu par le Monde et la
// Crue). `updatePlaceBtn` pilote les boutons de lieu et les classes CSS d'écran ;
// `togglePlace` bascule berge/tanière. Déplacement verbatim ; l'état, `diving`,
// `persist` et `hintDone` sont injectés — aucun accès direct à la portée de main.
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const $ = (id) => document.getElementById(id);

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, mg = null;
function sync() { s = ctx.getState(); mg = ctx.getMinigame(); }

const diving = () => ctx.diving();
const persist = () => ctx.persist();
const hintDone = (id) => ctx.hintDone(id);

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupLieux(hooks) { ctx = hooks; }

/** La tanière est accessible quand la loutre est là, disponible et hors mini-jeu. */
export function denAvailable() {
  sync();
  return s && !s.gameOver && !s.away && s.stage !== 'egg' && !mg;
}

export function updatePlaceBtn() {
  sync();
  const inWorld = !!(s && s.place === 'monde');
  const overlayOpen = !!document.querySelector('.ovl:not(.hidden)');
  const b = $('b-place');
  if (b) {
    const show = !!denAvailable() && !overlayOpen && !inWorld;
    b.classList.toggle('hidden', !show);
    const inDen = show && s.place === 'taniere';
    b.textContent = inDen ? '🌊' : '🏠';
    b.title = inDen ? 'Retourner à la rivière' : 'Aller à la tanière';
  }
  // Commandes de lieu, dans la colonne de gauche : « Explorer » depuis la berge,
  // « Rentrer » depuis la vallée. Jamais les deux, jamais l'une sur l'avatar.
  const bw = $('b-world');
  if (bw) bw.classList.toggle('hidden', !(denAvailable() && !overlayOpen && s.place === 'berge'));
  const bb = $('b-world-back');
  if (bb) bb.classList.toggle('hidden', !(inWorld && !overlayOpen));
  // Séparation des écrans, pilotée en CSS (robuste face à updateHUD chaque frame) :
  //   • BERGE  = vie active   • TANIÈRE = repos/collection   • MONDE = balade/rencontres
  const app = $('app');
  if (app) {
    app.classList.toggle('in-den', !!(s && s.place === 'taniere') && !overlayOpen);
    app.classList.toggle('in-world', inWorld);
    // un mini-jeu prend tout l'écran : le HUD de la berge s'efface
    app.classList.toggle('in-game', !!mg);
    // plongée : on la regarde nager au large. Les deux panneaux du bas
    // recouvraient justement la rivière ; les actions sont bloquées de toute
    // façon pendant la plongée, mais on garde la barre du haut pour naviguer.
    app.classList.toggle('in-dive', diving() && !mg && !overlayOpen);
  }
}

export function togglePlace() {
  sync();
  if (!denAvailable()) return;
  s.place = s.place === 'taniere' ? 'berge' : 'taniere';
  sfx.press(); vibrate(8);
  if (s.place === 'taniere') { sfx.chirp(); ui.log(s.name + ' rentre dans sa tanière douillette. 🏠'); }
  else ui.log(s.name + ' retourne au bord de la rivière. 🌊');
  updatePlaceBtn();
  hintDone('den');
  persist();
}
