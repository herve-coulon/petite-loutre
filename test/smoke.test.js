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
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,STUB';

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
  assert.equal($('ach-list').querySelectorAll('.row-item').length, 15, '3 quêtes + 12 succès');
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

/* ---------------- v2.4 : game feel ---------------- */

test('game feel : une jauge qui remonte pulse (classe .up)', () => {
  L.state.hunger = 40;
  tick(); // mémorise la valeur basse
  // purge des pulses éventuels des tests précédents (timers 700 ms encore en vol)
  $('f-hunger').classList.remove('up');
  $('f-energy').classList.remove('up');
  $('b-feed').click(); // faim 40 -> 70
  assert.ok($('f-hunger').classList.contains('up'), 'la jauge remontée pulse');
  assert.ok(!$('f-energy').classList.contains('up'), 'une jauge qui n\'a pas monté ne pulse pas');
});

test('game feel : le début de combat secoue l\'écran', () => {
  // vieillit la loutre jusqu'au stade jeune (sinon la sim ramène stage à "baby")
  L.state.hatchedAt = Date.now() - 25 * 3600 * 1000;
  L.state.stage = 'child';
  L.state.sleeping = false;
  tick();
  assert.equal(L.state.stage, 'child', 'stade stable après tick');
  $('b-battle').click();
  assert.ok(!$('ovl-battle').classList.contains('hidden'));
  $('bt-foecode').value = $('bt-mycode').value; // duel miroir : code valide garanti
  $('bt-start').click();
  assert.ok(L.battle, 'combat démarré');
  assert.ok($('screenwrap').classList.contains('shake'), 'écran secoué au gong');
  $('bt-close').click();
  renderOnce(); // un rendu passe (confettis/particules éventuels) sans erreur
});

/* ---------------- v2.4 : carte photo ---------------- */

test('carte photo : aperçu généré, partage masqué sans API native, fermeture', () => {
  $('b-photo').click();
  assert.ok(!$('ovl-photo').classList.contains('hidden'), 'overlay ouvert');
  assert.match($('photo-img').getAttribute('src') || '', /^data:image/, 'aperçu de la carte affiché');
  assert.ok($('btn-photo-share').classList.contains('hidden'),
    'pas de navigator.share dans jsdom -> bouton partager masqué, reste "Enregistrer"');
  assert.ok(!$('btn-photo-save').classList.contains('hidden'));
  $('btn-photo-close').click();
  assert.ok($('ovl-photo').classList.contains('hidden'));
});

test('carte photo : refusée tant que l\'œuf n\'a pas éclos', () => {
  $('b-reset').click();
  $('btn-confirm-yes').click(); // nouvel œuf
  assert.equal(L.state.stage, 'egg');
  $('b-photo').click();
  assert.ok($('ovl-photo').classList.contains('hidden'), 'pas de photo d\'un œuf');
  assert.match($('toast').textContent, /née/);
});

/* ---------------- v2.4.1 : œuf à bercer, réveil boudeur ---------------- */

test('œuf : secouer le téléphone rapproche l\'éclosion (avec anti-spam)', () => {
  assert.equal(L.state.stage, 'egg'); // hérité du test précédent
  const born0 = L.state.born;
  const ev = new window.Event('devicemotion');
  ev.accelerationIncludingGravity = { x: 24, y: 3, z: 10 }; // vraie secousse (~26 m/s²)
  window.dispatchEvent(ev);
  assert.ok(L.state.born < born0, 'l\'éclosion se rapproche');
  const born1 = L.state.born;
  window.dispatchEvent(ev); // immédiatement après
  assert.equal(L.state.born, born1, 'throttle : secouer comme un fou ne compte pas double');
  const calm = new window.Event('devicemotion');
  calm.accelerationIncludingGravity = { x: 0, y: 0, z: 9.8 }; // téléphone posé
  window.dispatchEvent(calm);
  assert.equal(L.state.born, born1, 'immobile : rien ne se passe');
});

test('réveil anticipé : elle boude (visage, HUD, humeur), un câlin la déride', () => {
  L.forceHatch();
  $('name-input').value = 'Plume';
  $('btn-name').click();
  L.state.energy = 30;
  $('b-sleep').click(); // dodo
  assert.equal(L.state.sleeping, true);
  const fun0 = L.state.fun;
  $('b-sleep').click(); // réveillée en plein rêve !
  assert.equal(L.state.sleeping, false);
  assert.ok(L.state.grumpyUntil > Date.now(), 'bouderie enclenchée');
  assert.ok(L.state.fun < fun0, 'humeur entamée');
  assert.match($('log').textContent, /boude/);
  assert.match($('hud-stage').textContent, /😾/);
  L.pet(); // on se fait pardonner
  assert.equal(L.state.grumpyUntil, 0, 'câlin accepté, bouderie levée');
});

test('remise à zéro depuis les réglages : la confirmation passe DEVANT (régression)', () => {
  // le bug : ovl-confirm avant ovl-set dans le DOM -> peinte derrière, "bouton mort"
  const ids = [...document.querySelectorAll('.ovl')].map(e => e.id);
  assert.ok(ids.indexOf('ovl-confirm') > ids.indexOf('ovl-set'),
    'ovl-confirm doit être après ovl-set dans le DOM (empilement)');
  // parcours réel du joueur : ⚙️ -> ↺ -> OUI
  $('b-gear').click();
  assert.ok(!$('ovl-set').classList.contains('hidden'));
  $('b-reset').click();
  assert.ok(!$('ovl-confirm').classList.contains('hidden'), 'confirmation affichée');
  $('btn-confirm-yes').click();
  assert.equal(L.state.stage, 'egg', 'nouvel œuf');
  assert.ok($('ovl-set').classList.contains('hidden'), 'réglages refermés');
  assert.ok($('ovl-confirm').classList.contains('hidden'));
  // on redonne une loutre aux tests suivants
  L.forceHatch();
  $('name-input').value = 'Rebond';
  $('btn-name').click();
});

test('réveil au bon moment : pas de bouderie', () => {
  L.state.energy = 90;
  $('b-sleep').click();
  assert.equal(L.state.sleeping, true);
  $('b-sleep').click();
  assert.equal(L.state.sleeping, false);
  assert.equal(L.state.grumpyUntil, 0, 'énergie haute : réveil serein');
});
