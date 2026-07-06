// Smoke test : boot complet de l'app dans jsdom (canvas et timers stubbés).
// Vérifie le parcours joueur réel : adoption -> éclosion -> soins -> fin -> restart.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

let window, document, L;
const tickFns = [];   // setInterval capturés -> tick manuel
const rafCbs = [];    // rAF capturés -> rendu manuel

before(async () => {
  const dom = new JSDOM(html, {
    url: 'http://localhost/',       // origine réelle -> localStorage fonctionnel
    pretendToBeVisual: true
  });
  window = dom.window;
  document = window.document;

  // Canvas 2D factice
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, p) => (p === 'measureText' ? () => ({ width: 0 }) : (typeof p === 'string' ? noop : undefined)),
    set: () => true
  });
  window.HTMLCanvasElement.prototype.getContext = () => ctx;

  // Globaux pour les modules (exécutés dans le contexte node)
  global.window = window;
  global.document = document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  global.localStorage = window.localStorage;
  global.requestAnimationFrame = cb => { rafCbs.push(cb); return rafCbs.length; };
  global.setInterval = (fn) => { tickFns.push(fn); return tickFns.length; };

  await import('../src/main.js');
  L = window.__loutre;
});

const $ = id => document.getElementById(id);
const tick = () => tickFns.forEach(f => f());
const renderOnce = () => { const cbs = rafCbs.splice(0); cbs.forEach(cb => cb(0)); };

test('boot : écran d intro visible, un rendu passe sans erreur', () => {
  assert.ok(!$('ovl-intro').classList.contains('hidden'));
  renderOnce();
});

test('adoption : nouvel œuf', () => {
  $('btn-start').click();
  assert.equal(L.state.stage, 'egg');
  assert.ok(!$('btnrow-egg').classList.contains('hidden'));
  $('b-warm').click(); // réchauffer ne plante pas
  renderOnce();
});

test('éclosion -> nommage', () => {
  L.forceHatch();
  assert.equal(L.state.stage, 'baby');
  assert.ok(!$('ovl-name').classList.contains('hidden'));
  $('name-input').value = 'Kiwi';
  $('btn-name').click();
  assert.equal(L.state.name, 'Kiwi');
  assert.ok($('ovl-name').classList.contains('hidden'));
  assert.ok(!$('buttons').classList.contains('hidden'));
});

test('actions : manger, laver, dodo, soigner', () => {
  L.state.hunger = 50;
  $('b-feed').click();
  assert.equal(Math.round(L.state.hunger), 80);

  L.state.clean = 40; L.state.poops = [1, 2];
  $('b-wash').click();
  assert.equal(L.state.clean, 100);
  assert.equal(L.state.poops.length, 0);

  $('b-sleep').click();
  assert.equal(L.state.sleeping, true);
  assert.equal($('b-feed').disabled, true, 'pas de repas pendant le dodo');
  $('b-sleep').click();
  assert.equal(L.state.sleeping, false);

  L.state.sick = true;
  tick(); // le HUD active le bouton soigner
  $('b-heal').click();
  assert.equal(L.state.sick, false);
});

test('mini-jeu : lancement et fin propre', () => {
  $('b-play').click();
  assert.ok(L.minigame, 'partie lancée');
  assert.equal($('b-feed').disabled, true, 'boutons gelés pendant la pêche');
  L.minigame.endsAt = Date.now() - 1; // force la fin
  renderOnce();
  assert.equal(L.minigame, null, 'partie terminée');
  assert.equal($('b-feed').disabled, false);
});

test('sauvegarde écrite dans localStorage', () => {
  const raw = window.localStorage.getItem('petite_loutre_v2');
  assert.ok(raw);
  const saved = JSON.parse(raw);
  assert.equal(saved.v, 2);
  assert.equal(saved.name, 'Kiwi');
});

test('HUD : jauges et libellés cohérents', () => {
  tick();
  assert.equal($('hud-name').textContent, 'KIWI');
  assert.match($('f-hunger').style.width, /%$/);
});

test('mort -> écran de fin -> recommencer', () => {
  L.state.health = 1; L.state.hunger = 0; L.state.sick = true;
  L.step(3600 * 1000);
  assert.equal(L.state.gameOver, true);
  assert.ok(!$('ovl-over').classList.contains('hidden'));
  assert.match($('over-text').innerText || $('over-text').textContent, /Kiwi/);
  $('btn-restart').click();
  assert.equal(L.state.stage, 'egg');
  assert.equal(L.state.gameOver, false);
  renderOnce();
});

test('reset : confirmation maison puis nouvel œuf', () => {
  $('b-reset').click();
  assert.ok(!$('ovl-confirm').classList.contains('hidden'));
  $('btn-confirm-no').click();
  assert.ok($('ovl-confirm').classList.contains('hidden'));
  $('b-reset').click();
  $('btn-confirm-yes').click();
  assert.equal(L.state.stage, 'egg');
});

test('garde-robe : déblocage par records + équipement', () => {
  L.forceHatch();
  $('name-input').value = 'Némo';
  $('btn-name').click();

  L.records.mealsTotal = 5; // débloque le nœud
  $('b-hats').click();
  assert.ok(!$('ovl-hats').classList.contains('hidden'));
  const rows = [...$('hat-list').querySelectorAll('.row-item')];
  assert.equal(rows.length, 17, '6 chapeaux + 6 pelages + 5 décors');
  const noeud = rows[0];
  assert.ok(!noeud.classList.contains('locked'), 'nœud débloqué');
  assert.ok(rows[3].classList.contains('locked'), 'couronne verrouillée');
  noeud.click();
  assert.equal(L.state.hat, 'noeud');
  $('btn-hats-close').click();
});

test('succès : écran + records affichés', () => {
  $('b-ach').click();
  assert.ok(!$('ovl-ach').classList.contains('hidden'));
  assert.equal($('ach-list').querySelectorAll('.row-item').length, 11);
  assert.match($('rec-line').textContent, /Records/);
  $('btn-ach-close').click();
});

test('réglages : export non vide, import round-trip', () => {
  $('b-gear').click();
  const code = $('exp-code').value;
  assert.ok(code.startsWith('LOUTRE1.'));
  $('imp-code').value = code;
  $('btn-import').click();
  assert.ok(!$('ovl-confirm').classList.contains('hidden'), 'confirmation demandée');
  $('btn-confirm-yes').click();
  assert.equal(L.state.name, 'Némo', 'état restauré depuis le code');
  assert.ok($('ovl-set').classList.contains('hidden'));
});
