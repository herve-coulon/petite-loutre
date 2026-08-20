// Contrôleur du « Dojo de parade » (v4.0) — extrait de main.js (audit M5, tranche 2).
// Entraînement QUOTIDIEN : un enchaînement seedé du jour, joué au TEMPS RÉEL
// (setTimeout + now()), indépendant de la boucle de rendu. La logique de jugement
// est pure (dojo.js) ; ici : l'orchestration UI/timers via un contexte injecté par
// main.js — AUCun accès à la portée de l'orchestrateur (état global, gainXp…).
// Les timers (setTimeout) vivent ICI, pas dans main.js.
import { dailyDojo, judgeParry, parryScore, nextCombo, beltFor, dojoReward } from './dojo.js';
import { dayKey } from './quests.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

// Accès DOM local au dojo (getElementById est un primitif d'affichage sans état,
// self-contained à l'overlay du dojo — pas la portée de main.js).
const $ = (id) => document.getElementById(id);
const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();
const mg = () => ctx && ctx.getMinigame();
const isBusy = () => ctx.isBusy();
const gainXp = (n) => ctx.gainXp(n);
const saveRec = () => ctx.persistRec();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupDojo(hooks) { ctx = hooks; }

let dojoState = null;
function setDojoPrompt(txt, cls) {
  const p = $('dojo-prompt'); if (p) { p.textContent = txt; p.className = 'dojo-prompt ' + (cls || ''); }
}
function animDojoBar(ms) {
  const bar = $('dojo-bar'); if (!bar) return;
  bar.style.transition = 'none'; bar.style.width = '0%';
  // reflow puis on lance l'animation de remplissage sur la durée de la fenêtre
  void bar.offsetWidth;
  bar.style.transition = 'width ' + ms + 'ms linear'; bar.style.width = '100%';
}
function resetDojoBar() { const bar = $('dojo-bar'); if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; } }
function updateDojoScore() {
  const el = $('dojo-score'); if (el && dojoState) el.textContent = 'Score : ' + dojoState.score + (dojoState.combo > 1 ? '   ✦ combo ×' + dojoState.combo : '');
}
export function openDojo() {
  if (!rec()) return;
  const st = s();
  if (isBusy() || st.sleeping || st.stage === 'egg' || st.away || st.gameOver) { ui.toast('🥋 Le dojo t\'attend quand ta loutre sera disponible.'); return; }
  sfx.press(); vibrate(8);
  dojoState = { seq: dailyDojo(dayKey()), i: -1, score: 0, combo: 0, windowOpenAt: 0, windowMs: 0, phase: 'ready', results: [], timer: 0 };
  $('dojo-result').classList.add('hidden');
  $('dojo-live').classList.remove('hidden');
  resetDojoBar(); updateDojoScore();
  setDojoPrompt('Prêt ? Pare chaque assaut au bon moment.', 'ready');
  ui.showOverlay('ovl-dojo');
  dojoState.timer = setTimeout(dojoNextStrike, 950);
}
function dojoNextStrike() {
  if (!dojoState) return;
  dojoState.i++;
  if (dojoState.i >= dojoState.seq.strikes.length) { dojoEnd(); return; }
  const st = dojoState.seq.strikes[dojoState.i];
  dojoState.phase = 'windup';
  resetDojoBar();
  setDojoPrompt('Prépare-toi… (' + (dojoState.i + 1) + '/' + dojoState.seq.strikes.length + ')', 'windup');
  clearTimeout(dojoState.timer);
  dojoState.timer = setTimeout(() => dojoOpenWindow(st), st.windup);
}
function dojoOpenWindow(st) {
  if (!dojoState) return;
  dojoState.phase = 'window';
  dojoState.windowMs = st.window;
  dojoState.windowOpenAt = now();
  setDojoPrompt('PARE !', 'window');
  animDojoBar(st.window);
  sfx.chirp();
  clearTimeout(dojoState.timer);
  dojoState.timer = setTimeout(() => dojoResolve(null), st.window);   // fenêtre ratée
}
export function dojoTap() {
  if (!dojoState) return;
  if (dojoState.phase === 'windup') { dojoResolve(-1); return; }       // touché trop tôt (feinte)
  if (dojoState.phase !== 'window') return;
  dojoResolve(now() - dojoState.windowOpenAt);
}
function dojoResolve(elapsed) {
  if (!dojoState || dojoState.phase === 'resolved') return;
  dojoState.phase = 'resolved';
  clearTimeout(dojoState.timer);
  resetDojoBar();
  const st = dojoState.seq.strikes[dojoState.i];
  const q = (elapsed === -1) ? 'miss' : judgeParry(st.window, elapsed);
  const gained = parryScore(q, dojoState.combo);
  dojoState.score += gained;
  dojoState.combo = nextCombo(q, dojoState.combo);
  dojoState.results.push(q);
  const label = q === 'perfect' ? '🛡️ PARFAIT !' : q === 'good' ? '🛡️ Bien !' : '💥 Raté…';
  setDojoPrompt(label + (gained ? '  +' + gained : ''), 'result-' + q);
  if (q === 'miss') { sfx.sad(); vibrate(30); } else { sfx.catch(); vibrate(q === 'perfect' ? 14 : 8); }
  updateDojoScore();
  dojoState.timer = setTimeout(dojoNextStrike, 700);
}
function dojoEnd() {
  if (!dojoState) return;
  clearTimeout(dojoState.timer);
  const score = dojoState.score;
  const belt = beltFor(score);
  const r = rec();
  const newBest = score > (r.dojoBest || 0);
  if (newBest) r.dojoBest = score;
  let reward = null;
  if (r.dojoDay !== dayKey()) {          // récompense une fois par jour
    r.dojoDay = dayKey();
    reward = dojoReward(score);
    r.gems = (r.gems || 0) + reward.gems;
    r.fish = (r.fish || 0) + reward.fish; r.fishTotal = (r.fishTotal || 0) + reward.fish;
    gainXp(reward.xp);
  }
  saveRec(); ui.updateHUD(s(), mg(), rec());
  sfx.happy(); vibrate([15, 30, 15]);
  // écran de résultat
  const perfects = dojoState.results.filter(r2 => r2 === 'perfect').length;
  const html = '<p class="dojo-belt">' + belt.emoji + ' Ceinture ' + belt.name + '</p>' +
    '<p class="dojo-final">Score : <b>' + score + '</b>' + (newBest ? '   🏅 Nouveau record !' : '') + '</p>' +
    '<p class="small">' + perfects + ' parade' + (perfects > 1 ? 's' : '') + ' parfaite' + (perfects > 1 ? 's' : '') + ' · meilleur : ' + (r.dojoBest || 0) + '</p>' +
    (reward
      ? '<p class="dojo-reward">Récompense du jour : +' + reward.gems + ' 💎  +' + reward.fish + ' 🐟  +' + reward.xp + ' XP</p>'
      : '<p class="small">Déjà récompensé aujourd\'hui — reviens demain (l\'entraînement, lui, reste ouvert).</p>');
  const res = $('dojo-result');
  res.innerHTML = html +
    '<div class="dojo-actions"><button id="dojo-replay" class="act" type="button">↻ Recommencer</button>' +
    '<button id="dojo-close" class="act ghost" type="button">Fermer</button></div>';
  $('dojo-live').classList.add('hidden');
  res.classList.remove('hidden');
  $('dojo-replay').addEventListener('click', openDojo);
  $('dojo-close').addEventListener('click', closeDojo);
  dojoState.phase = 'done';
}
export function closeDojo() {
  if (dojoState) { clearTimeout(dojoState.timer); dojoState = null; }
  ui.hideOverlay('ovl-dojo');
}
