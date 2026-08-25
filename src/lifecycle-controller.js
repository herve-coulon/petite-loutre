// Contrôleur du « Cycle de vie complet » (v4.2, opt-in) — extrait de main.js
// (audit M5, tranche 17). Éteint par défaut : le jeu cozy reste intact. Une fois
// allumé (⚙️ rec.lifecycle), la loutre devient aînée après une longue vie, puis
// s'en va paisiblement — jamais un échec. Elle rejoint la lignée (mémorial +
// héritage, cf. startNew, resté dans main.js car il RERELIE s/mg au jeu) et un
// œuf reprend le fil. Le grand départ vient aussi d'une trop longue absence chez
// le héron. Déplacement verbatim ; l'état/persist/startNew sont injectés.
import { ageMs } from './sim.js';
import { endOfLife, isElder } from './lifecycle.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, rec = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); }

const persist = () => ctx.persist();
const startNew = () => ctx.startNew();

let passingInProgress = false;

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupLifecycle(hooks) { ctx = hooks; }

/** Appelé chaque seconde par tick() : franchit les étapes de fin de vie. */
export function checkLifecycle(t) {
  sync();
  if (!s || !rec || !rec.lifecycle) return;
  if (passingInProgress || s.gameOver || s.stage === 'egg') return;
  const age = ageMs(s, t);
  // L'annonce des cheveux d'argent, une seule fois.
  if (!s.elderSeen && isElder(age)) {
    s.elderSeen = true;
    persist();
    ui.log('🌾 ' + (s.name || 'Elle') + ' est devenue une aînée — le poil argenté, le cœur plein d\'histoires.');
  }
  const awayMs = s.away ? (t - (s.awayAt || t)) : null;
  const cause = endOfLife({ ageMs: age, awayMs, lifecycle: true });
  if (cause) passAway(cause, t);
}

// Le grand départ : une carte d'adieu paisible, puis l'œuf de la génération suivante.
function passAway(cause, t) {
  passingInProgress = true;
  const name = s.name || 'Ta loutre';
  s.diedAt = t;         // fige l'âge pour le mémorial (cf. ageMs)
  s.gameOver = true;    // suspend la simulation le temps de l'adieu
  persist();
  if (sfx.over) sfx.over();
  vibrate([40, 60, 40]);
  const vecu = ui.fmtAge ? ui.fmtAge(s, t) : '';
  const card = cause === 'age'
    ? { kicker: 'Une belle vie', big: '🕊️', title: name + ' s\'en est allée paisiblement',
        reward: 'Elle a bien vécu' + (vecu ? ' — ' + vecu : '') + '. Elle veille sur la lignée.', rewardColor: 'var(--accent)' }
    : { kicker: 'Adieu tout doux', big: '🕊️', title: name + ' est restée auprès du héron',
        reward: 'Elle s\'en est allée sereinement. La lignée, elle, continue.', rewardColor: 'var(--accent)' };
  ui.celebrate(card);
  ui.log('🕊️ ' + name + ' nous a quittés en paix. ' +
    (cause === 'age' ? 'Quelle belle vie…' : 'Le héron veillera sur elle…') +
    ' Un œuf reprend le fil de la lignée.');
  // On laisse la carte respirer, puis l'œuf de la génération suivante arrive.
  setTimeout(() => { passingInProgress = false; startNew(); }, 2600);
}
