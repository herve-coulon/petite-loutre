// Smoke test : boot complet de l'app dans jsdom (canvas et timers stubbés).
// Vérifie le parcours joueur réel : adoption -> éclosion -> soins -> fin -> restart.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { dailyQuests, dayKey } from '../src/quests.js';

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

test('négligence -> chez le héron -> rituel de retour en 3 soins (v2.7)', () => {
  L.state.health = 1; L.state.hunger = 0; L.state.sick = true;
  L.step(3600 * 1000);
  assert.equal(L.state.away, true, 'partie chez le héron');
  assert.equal(L.state.gameOver, false, 'plus de mort');
  assert.ok($('ovl-over').classList.contains('hidden'), 'pas d\'écran de fin');
  tick();
  assert.match($('hud-stage').textContent, /HÉRON/);
  assert.ok($('buttons').classList.contains('hidden'), 'actions normales masquées');
  assert.ok(!$('btnrow-away').classList.contains('hidden'), 'bouton de soin visible');

  $('b-feed').click();
  assert.equal(L.state.away, true, 'nourrir ne marche pas : elle n\'est pas là');

  $('b-care').click(); // soin 1
  assert.equal(L.state.awayCare, 1);
  $('b-care').click(); // trop tôt (cooldown 3 h)
  assert.equal(L.state.awayCare, 1, 'le rituel s\'étale dans le temps');

  L.state.awayNextCare = 0; tick(); $('b-care').click(); // soin 2 (le tick réactive le bouton)
  L.state.awayNextCare = 0; tick(); $('b-care').click(); // soin 3 -> retour !
  assert.equal(L.state.away, false, 'elle est rentrée');
  assert.ok(L.state.health >= 40, 'santé retapée');
  assert.ok(L.state.grumpyUntil > Date.now(), 'encore vexée : bouderie de retour');
  assert.match($('toast').textContent, /rentrée/);
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
  assert.equal(rows.length, 21, '8 chapeaux + 7 pelages + 6 décors');
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
  assert.equal($('ach-list').querySelectorAll('.row-item').length, 19, '3 quêtes + 16 succès');
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

test('œuf : secouer le téléphone rapproche l\'éclosion (avec anti-spam)', async () => {
  assert.equal(L.state.stage, 'egg'); // hérité du test précédent
  const born0 = L.state.born;
  const ev = new window.Event('devicemotion');
  ev.accelerationIncludingGravity = { x: 24, y: 3, z: 10 }; // vraie secousse (~26 m/s²)
  window.dispatchEvent(ev);
  assert.equal(born0 - L.state.born, 8000, 'chaque secousse rapporte 8 s');
  const born1 = L.state.born;
  window.dispatchEvent(ev); // immédiatement après
  assert.equal(L.state.born, born1, 'throttle : secouer comme un fou ne compte pas double');
  const calm = new window.Event('devicemotion');
  calm.accelerationIncludingGravity = { x: 0, y: 0, z: 9.8 }; // téléphone posé
  window.dispatchEvent(calm);
  assert.equal(L.state.born, born1, 'immobile : rien ne se passe');
  await new Promise(r => setTimeout(r, 300)); // le throttle expire
  const soft = new window.Event('devicemotion');
  soft.accelerationIncludingGravity = { x: 14, y: 2, z: 9.8 }; // secousse modérée (~17 m/s²)
  window.dispatchEvent(soft);
  assert.equal(born1 - L.state.born, 8000, 'une secousse modérée compte aussi (seuil 16)');
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

/* ---------------- v3.0 : rappels push ---------------- */

test('rappels 🔔 : bouton présent, indisponible en jsdom -> message propre, état intact', async () => {
  $('b-gear').click();
  assert.match($('b-push').textContent, /NON/);
  $('b-push').click();
  await new Promise(r => setTimeout(r, 20)); // gestionnaire asynchrone
  assert.equal(L.state.push, false, 'pas de support push ici : rien n\'est activé');
  assert.match($('toast').textContent, /indisponibles|refusées/i, 'explication affichée');
  assert.match($('b-push').textContent, /NON/, 'le bouton reste à NON');
  $('btn-set-close').click();
});

/* ---------------- v2.7.1 : fermer les menus sans scroller ---------------- */

test('réglages : le numéro de version est affiché (cohérent avec package.json)', async () => {
  const { readFileSync: rf } = await import('node:fs');
  const pkg = JSON.parse(rf(join(root, 'package.json'), 'utf8'));
  assert.equal($('ver').textContent, 'Ma Petite Loutre · v' + pkg.version,
    'la version affichée suit package.json (penser à GAME_VERSION dans constants.js)');
});

test('menus : ✕ collant présent partout, ferme sans scroller', () => {
  for (const id of ['ovl-hats', 'ovl-ach', 'ovl-set', 'ovl-photo', 'ovl-battle']) {
    const x = $(id).querySelector('.ovl-x');
    assert.ok(x, id + ' a son ✕');
  }
  $('b-gear').click();
  assert.ok(!$('ovl-set').classList.contains('hidden'));
  $('ovl-set').querySelector('.ovl-x').click();
  assert.ok($('ovl-set').classList.contains('hidden'), 'fermé par le ✕');
});

test('menus : toucher à côté du contenu ferme aussi', () => {
  $('b-ach').click();
  assert.ok(!$('ovl-ach').classList.contains('hidden'));
  $('ovl-ach').click(); // clic sur le fond de l'overlay lui-même
  assert.ok($('ovl-ach').classList.contains('hidden'), 'fermé au toucher à côté');
  // mais un clic sur un élément INTERNE ne ferme pas
  $('b-hats').click();
  assert.ok(!$('ovl-hats').classList.contains('hidden'));
  $('hat-list').click(); // la liste, pas le fond
  assert.ok(!$('ovl-hats').classList.contains('hidden'), 'clic interne inoffensif');
  $('ovl-hats').querySelector('.ovl-x').click();
});

/* ---------------- v2.7 : streak, partage du jour ---------------- */

test('streak : la visite du jour est comptée au boot, 🔥 caché au jour 1', () => {
  assert.equal(L.records.streakCount, 1, 'première visite comptée');
  assert.ok(L.records.streakDay, 'jour mémorisé');
  assert.equal($('streak').textContent, '', 'pas de flamme pour un seul jour');
});

test('streak : hier -> aujourd\'hui incrémente et affiche la flamme', () => {
  // simule une série entamée hier
  L.records.streakDay = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  L.records.streakCount = 2;
  L.state.hunger = 50;
  $('b-feed').click(); // n'importe quel gain d'XP rafraîchit le bandeau…
  // …mais c'est le passage de minuit ou le boot qui compte la série ; on force :
  L.records.streakCount = 3;
  L.records.streakBest = 3;
  L.state.hunger = 50;
  $('b-feed').click();
  assert.match($('streak').textContent, /🔥3/, 'flamme affichée');
});

test('partage du jour : bouton présent, clic sans API -> message propre', () => {
  $('b-ach').click();
  assert.match($('event-line').textContent, /Aujourd'hui/, 'événement du jour annoncé');
  assert.ok(!$('btn-day-share').classList.contains('hidden'));
  $('btn-day-share').click(); // ni share ni clipboard dans jsdom -> toast de repli
  $('btn-ach-close').click();
});

/* ---------------- v2.6 : niveaux ---------------- */

test('XP : nourrir rapporte 5 XP, la barre de niveau est affichée', () => {
  const xp0 = L.records.xp || 0;
  L.state.hunger = 50;
  L.state.sleeping = false;
  $('b-feed').click();
  assert.equal(L.records.xp, xp0 + 5, '+5 XP par repas');
  assert.match($('lvl-label').textContent, /NIV \d+ · /, 'bandeau NIV + titre');
  assert.match($('lvl-num').textContent, /XP$/);
  assert.match($('lvl-fill').style.width, /%$/);
});

test('montée de niveau : toast étoilé, friandise rechargée, sauvegardé', () => {
  // neutralise les quêtes du jour pour un gain déterministe
  L.state.qDaily = {
    date: dayKey(),
    progress: {},
    done: dailyQuests(dayKey()).map(q => q.id)
  };
  const lv0 = $('lvl-label').textContent;
  // se place juste sous le prochain niveau : le prochain repas le déclenche
  const cur = L.records.xp || 0;
  let total = 0, lvl = 1;
  while (total + (40 + (lvl - 1) * 25) <= cur) { total += 40 + (lvl - 1) * 25; lvl++; }
  L.records.xp = total + (40 + (lvl - 1) * 25) - 2; // à 2 XP du niveau suivant
  L.state.lastTreat = Date.now(); // friandise en recharge
  L.state.hunger = 50;
  $('b-feed').click();
  assert.match($('toast').textContent, /NIVEAU \d/, 'toast de montée de niveau');
  assert.equal(L.state.lastTreat, 0, 'récompense : friandise rechargée');
  assert.notEqual($('lvl-label').textContent, lv0, 'le bandeau a changé de niveau');
  const savedRec = JSON.parse(window.localStorage.getItem('petite_loutre_records_v1'));
  assert.equal(savedRec.xp, L.records.xp, 'XP persistée');
});

/* ---------------- v2.5 : musique ---------------- */

test('musique : le réglage 🎵 bascule et se sauvegarde', () => {
  $('b-gear').click();
  assert.match($('b-music').textContent, /OUI/);
  $('b-music').click();
  assert.match($('b-music').textContent, /NON/);
  assert.equal(L.state.music, false);
  const saved = JSON.parse(window.localStorage.getItem('petite_loutre_v2'));
  assert.equal(saved.music, false, 'préférence persistée');
  $('b-music').click();
  assert.equal(L.state.music, true);
  assert.match($('b-music').textContent, /OUI/);
  $('btn-set-close').click();
  tick(); // la synchro musique tourne sans AudioContext (no-op propre)
});
