// Contrôleur du « Coach / Onboarding » — extrait de main.js (audit M5, tranche
// 13). Regroupe tout l'accompagnement du joueur : le tutoriel de base guidé
// (updateCoach), les cartes d'histoire et de saison (maybeStory/maybeSeasonCard),
// le rappel saisonnier (seasonHint) et les astuces de gestes découvrables
// (maybeHint/hintDone). L'état d'accompagnement (storyOpen, coachTarget,
// activeHint…) vit ICI. Rien de neuf : déplacement verbatim des corps de main.js.
// L'état du jeu, le renderer et les helpers (diving/denAvailable/persist) sont
// injectés par setupCoach ; les tables (story/personality/seasons) sont pures.
import { nextBeat, markSeen, coachStep } from './story.js';
import { traitById } from './personality.js';
import { seasonFor, seasonInfo } from './seasons.js';
import { SEASON_FX, SEC } from './constants.js';
import { FOOD_POS, BALL_HOME } from './render.js';
import * as ui from './ui.js';
import { sfx } from './audio.js';

const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null, R = null;
let s = null, mg = null;
function sync() { s = ctx.getState(); mg = ctx.getMinigame(); }

const persist = () => ctx.persist();
const diving = () => ctx.diving();
const denAvailable = () => ctx.denAvailable();

// État d'accompagnement (non persisté hors s.hints/s.coach/s.season, dans le save).
let storyOpen = false;        // une carte chapitre est à l'écran
let coachTarget = null;       // bouton actuellement surligné par le tutoriel
let activeHint = null, hintAt = 0, hintCooldown = 0; // astuce de geste en cours
let lastSeasonHint = 0;       // throttle des rappels saisonniers (froid/chaud)

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupCoach(hooks) { ctx = hooks; R = hooks.R; }

export function maybeStory() {
  sync();
  if (storyOpen || !s) return;
  const b = nextBeat(s);
  if (!b) return;
  storyOpen = true;
  ui.setCoach(null); // pas de surlignage sous l'overlay
  sfx.evolve();
  ui.showStory(b, () => {
    markSeen(s, b.id);
    storyOpen = false;
    persist();
    coachTarget = null;   // force la ré-annonce du geste guidé au retour
    updateCoach();
    maybeStory();          // un autre chapitre attend peut-être derrière
  });
}

/** Annonce un changement de saison (réutilise l'overlay d'histoire). */
export function maybeSeasonCard() {
  sync();
  if (storyOpen || !s || s.gameOver) return;
  const cur = seasonFor(new Date());
  if (s.season === cur) return;
  if (s.season == null) { s.season = cur; persist(); return; } // 1er lancement : silencieux
  storyOpen = true;
  ui.setCoach(null);
  sfx.evolve();
  ui.showStory(seasonInfo(new Date()).card, () => {
    s.season = cur;
    storyOpen = false;
    persist();
    coachTarget = null;
    updateCoach();
  });
}

/** Rappel doux (throttlé) du contre-geste quand la saison malmène la loutre. */
export function seasonHint() {
  sync();
  if (!s || s.coach || s.gameOver || s.away || s.stage === 'egg' || s.sleeping || mg || storyOpen) return;
  const t = now();
  if (t - lastSeasonHint < 110 * SEC) return;
  const season = seasonFor(new Date(t));
  let msg = null;
  if (season === 'ete' && s.clean < SEASON_FX.HEAT_OVERHEAT_CLEAN) {
    msg = s.name + ' a chaud… un bon bain la rafraîchirait ! 💧';
  } else if (season === 'hiver' && !s.sick && (s.energy < SEASON_FX.COLD_LOW_ENERGY || s.hunger < SEASON_FX.COLD_LOW_HUNGER)) {
    msg = s.name + ' grelotte… nourris-la et fais-lui un câlin pour la réchauffer. ❄️';
  }
  if (msg) { ui.log(msg); lastSeasonHint = t; }
}

/** Surligne/souffle le prochain geste du tutoriel, ou le clôt en beauté. */
export function updateCoach() {
  sync();
  if (!s || !s.coach) { if (coachTarget) { ui.setCoach(null); coachTarget = null; } return; }
  // tutoriel pas encore démarré (œuf, ou pas encore nommée) : on ne conclut rien
  if (s.stage === 'egg' || !s.name) { if (coachTarget) { ui.setCoach(null); coachTarget = null; } return; }
  const step = coachStep(s);
  if (!step) { // les trois bases sont acquises -> fin douce du tutoriel + révélation du caractère
    s.coach = false; coachTarget = null; ui.setCoach(null);
    const tr = traitById(s.trait);
    ui.toast('🎉 Tu sais tout !');
    ui.log(tr
      ? 'Bravo ! Tu apprends à connaître ' + (s.name || 'ta loutre') + ' : c\'est une petite ' + tr.name + ' ' + tr.emoji + ', elle ' + tr.desc + '. 💛'
      : 'Bravo ! 💡 Astuce : touche ta loutre pour la câliner. 💛');
    persist();
    return;
  }
  const blocked = s.sleeping || s.away || s.gameOver || storyOpen || !!mg || diving();
  ui.setCoach(blocked ? null : step);
  if (!blocked && step.target !== coachTarget) { coachTarget = step.target; ui.log(step.msg); }
  else if (blocked) coachTarget = null;
}

/* ---------------- Découvrabilité : astuces de gestes (après le tuto de base) ---------------- */
const HINT_MAX = 22000, HINT_GAP = 6000;
const HINTS = [
  { id: 'pet',       msg: '💡 Astuce : touche ta loutre pour la câliner. 💛',
    when: () => s.place === 'berge' },
  { id: 'dragfood',  msg: '💡 Tu peux glisser le poisson 🐟 posé sur la berge jusqu\'à sa bouche pour la nourrir.',
    when: () => s.place === 'berge' && s.hunger < 92 },
  { id: 'callwater', msg: '💡 Tape la berge ou l\'eau 💧 : ta loutre vient à cet endroit.',
    when: () => s.place === 'berge' },
  { id: 'ball',      msg: '💡 Attrape la balle 🎾 sur la berge et lance-la : elle court la rapporter !',
    when: () => s.place === 'berge' },
  { id: 'den',       msg: '💡 Le bouton 🏠 (en haut à droite) ouvre sa tanière — ta collection de trésors s\'y expose.',
    when: () => denAvailable() }
];

function hintTargetFor(id) {
  if (id === 'pet') { const b = R.otterBox(s.stage); return { x: b.x + b.w / 2, y: b.y - 2 }; }
  if (id === 'dragfood') return { x: FOOD_POS.x + 10, y: FOOD_POS.y + 2 };
  if (id === 'callwater') return { x: 104, y: 110 };
  if (id === 'ball') return { x: BALL_HOME.x, y: BALL_HOME.y - 2 };
  if (id === 'den') return { x: 146, y: 30, up: true };
  return null;
}

/** Étouffe l'astuce en cours et repousse la prochaine — appelé par
 *  messageImportant (main.js) pour qu'un message qui COMPTE ne soit pas écrasé. */
export function suppressHint() { activeHint = null; hintCooldown = now() + HINT_GAP; }

/** Cible de l'astuce en cours (pour le rendu), ou null. */
export function currentHintTarget() {
  if (!activeHint) return null;
  sync();
  return s ? hintTargetFor(activeHint) : null;
}

/** Le joueur a fait le geste -> l'astuce est classée. */
export function hintDone(id) {
  sync();
  if (!s || !s.hints) return;
  if (!s.hints[id]) { s.hints[id] = 1; persist(); }
  if (activeHint === id) { activeHint = null; hintCooldown = now() + HINT_GAP; }
}

/** Révèle les astuces de gestes une par une, une fois le tuto de base terminé. */
export function maybeHint() {
  sync();
  const blocked = !s || s.coach || s.gameOver || s.away || s.stage === 'egg' || !s.name
    || s.sleeping || mg || storyOpen || diving();
  if (blocked) { activeHint = null; return; }
  if (!s.hints) s.hints = {};
  if (activeHint) {
    const h = HINTS.find(x => x.id === activeHint);
    if (!h || s.hints[activeHint] || !h.when() || now() - hintAt > HINT_MAX) {
      if (h && now() - hintAt > HINT_MAX) { s.hints[activeHint] = 1; persist(); } // vue assez longtemps -> classée
      activeHint = null; hintCooldown = now() + HINT_GAP;
    }
    return;
  }
  if (now() < hintCooldown) return;
  const next = HINTS.find(h => !s.hints[h.id] && h.when());
  if (next) { activeHint = next.id; hintAt = now(); ui.log(next.msg); }
}
