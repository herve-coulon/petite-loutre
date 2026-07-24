// Smoke test : boot complet de l'app dans jsdom (canvas et timers stubbés).
// Vérifie le parcours joueur réel : adoption -> éclosion -> soins -> fin -> restart.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { dailyQuests, dayKey } from '../src/quests.js';
import { levelFromXp } from '../src/level.js';
import { seasonFor } from '../src/seasons.js';
import { ACHIEVEMENTS } from '../src/achievements.js';
import { ITEMS } from '../src/items.js';
import { HATS } from '../src/accessories.js';
import { FURS, DECORS } from '../src/skins.js';

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

test('régression : le tutoriel survit au stade œuf (des ticks ne le closent pas)', () => {
  assert.equal(L.state.stage, 'egg');
  assert.equal(L.state.coach, true, 'tutoriel armé dès l\'adoption');
  tick(); tick();
  assert.equal(L.state.coach, true, 'toujours actif après des ticks sur l\'œuf');
});

test('éclosion -> nommage', () => {
  L.forceHatch();
  assert.equal(L.state.stage, 'baby');
  assert.ok(!$('ovl-name').classList.contains('hidden'));
  $('name-input').value = 'Kiwi';
  $('btn-name').click();
  assert.equal(L.state.name, 'Kiwi');
  assert.ok($('ovl-name').classList.contains('hidden'));
  assert.ok(!$('actionbar').classList.contains('hidden'));
});

test('fil narratif : Chapitre 1 s\'affiche, puis les premiers pas guident vers Manger', () => {
  // le nommage vient de déclencher le premier chapitre
  assert.ok(!$('ovl-story').classList.contains('hidden'), 'carte chapitre visible');
  assert.equal($('story-title').textContent, 'Chapitre 1 — La rencontre');
  assert.ok(!L.state.storySeen.includes('naissance'), 'pas encore marqué vu tant qu\'ouvert');
  $('btn-story-next').click(); // « VEILLER SUR ELLE »
  assert.ok($('ovl-story').classList.contains('hidden'), 'chapitre refermé');
  assert.ok(L.state.storySeen.includes('naissance'), 'chapitre mémorisé -> ne rejoue plus');
  assert.ok($('b-feed').classList.contains('coach-target'), 'Manger surligné par le tutoriel');
});

test('tutoriel : manger -> jouer -> laver puis clôture, ne réapparaît plus', () => {
  $('b-feed').click();
  assert.ok($('b-play').classList.contains('coach-target'), 'après manger : Jouer surligné');
  L.state.played = 1;                 // on saute la partie de pêche
  tick();
  assert.ok($('b-wash').classList.contains('coach-target'), 'après jouer : Laver surligné');
  $('b-wash').click();
  assert.equal(L.state.coach, false, 'les trois bases faites -> tutoriel clos');
  assert.equal(document.querySelector('.coach-target'), null, 'plus aucun surlignage');
  tick();
  assert.equal(L.state.coach, false, 'ne se réarme pas');
});

test('saisons : initialisée en silence, un basculement déclenche une carte', () => {
  const cur = seasonFor(new Date());
  assert.equal(L.state.season, cur, 'saison initialisée (jamais null) sans carte parasite');
  assert.ok($('ovl-story').classList.contains('hidden'), 'aucune carte au régime stable');
  // on simule un changement de saison
  L.state.season = (cur === 'hiver') ? 'ete' : 'hiver';
  tick();
  assert.ok(!$('ovl-story').classList.contains('hidden'), 'carte de saison affichée au basculement');
  $('btn-story-next').click();
  assert.ok($('ovl-story').classList.contains('hidden'), 'carte refermée');
  assert.equal(L.state.season, cur, 'saison mise à jour après lecture de la carte');
});

test('caractère : personnalité au baptême, lien qui grandit, action favorite doublée', () => {
  assert.ok(L.state.trait, 'une personnalité a été tirée au baptême');
  // état sain et nourrissable
  Object.assign(L.state, { stage: 'child', sleeping: false, away: false, gameOver: false, divingUntil: 0 });
  // trait qui n'aime PAS manger : gain de lien « normal »
  L.state.trait = 'joueuse'; L.state.bond = 0; L.state.hunger = 40;
  L.actFeed();
  const normal = L.state.bond;
  assert.ok(normal > 0, 'nourrir renforce le lien');
  // trait qui AIME manger : gain doublé
  L.state.trait = 'gourmande'; L.state.bond = 0; L.state.hunger = 40;
  L.actFeed();
  assert.equal(L.state.bond, normal * 2, 'nourrir une gourmande rapporte le double de lien');
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
  assert.match($('hud-name').textContent, /^KIWI/); // + emoji de caractère éventuel
  assert.match($('f-hunger').style.width, /%$/);
});

test('négligence -> chez le héron -> rituel de retour en 3 soins (v2.7)', () => {
  L.state.health = 1; L.state.hunger = 0; L.state.sick = true;
  L.step(3600 * 1000);
  assert.equal(L.state.away, true, 'partie chez le héron');
  assert.equal(L.state.gameOver, false, 'plus de mort');
  assert.ok($('ovl-over').classList.contains('hidden'), 'pas d\'écran de fin');
  tick();
  assert.ok($('actionbar').classList.contains('hidden'), 'actions normales masquées');
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
  // chaque slot du profil est un raccourci vers SON onglet : plus de doublon
  $('ps-gear').click();
  assert.ok(!$('ovl-hats').classList.contains('hidden'));
  assert.equal($('hat-list').querySelectorAll('.row-item').length, ITEMS.length,
    'le slot Trésor porté ouvre l\'onglet Trésors');
  $('btn-hats-close').click();

  $('ps-hat').click();   // le slot chapeau ouvre directement l'onglet Chapeaux
  assert.ok(!$('ovl-hats').classList.contains('hidden'));
  const tabs = [...$('hat-tabs').querySelectorAll('.tab')];
  assert.equal(tabs.length, 4, '4 onglets');
  const rows = [...$('hat-list').querySelectorAll('.row-item')];
  assert.equal(rows.length, HATS.length, 'ouverture directe sur les chapeaux');
  assert.equal(rows.length, HATS.length, 'la section Chapeaux seule');
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
  // 3 quêtes du jour + tous les succès (dérivé des données, pas d'un nombre en dur)
  const expected = 3 + ACHIEVEMENTS.length;
  assert.equal($('ach-list').querySelectorAll('.row-item').length, expected, '3 quêtes + succès');
  assert.match($('rec-line').textContent, /Records/);
  $('btn-ach-close').click();
});

test('réglages : export non vide, import round-trip', () => {
  $('lvl-badge').click(); $('m-gear').click();
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
  L.records.xp = 100000; // le combat se débloque par NIVEAU désormais
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
  L.pet(); // on se fait pardonner
  assert.equal(L.state.grumpyUntil, 0, 'câlin accepté, bouderie levée');
});

test('remise à zéro depuis les réglages : la confirmation passe DEVANT (régression)', () => {
  // le bug : ovl-confirm avant ovl-set dans le DOM -> peinte derrière, "bouton mort"
  const ids = [...document.querySelectorAll('.ovl')].map(e => e.id);
  assert.ok(ids.indexOf('ovl-confirm') > ids.indexOf('ovl-set'),
    'ovl-confirm doit être après ovl-set dans le DOM (empilement)');
  // parcours réel du joueur : ⚙️ -> ↺ -> OUI
  $('lvl-badge').click(); $('m-gear').click();
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
  $('lvl-badge').click(); $('m-gear').click();
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
  $('lvl-badge').click(); $('m-gear').click();
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
  $('ps-hat').click();   // le slot chapeau ouvre la garde-robe
  assert.ok(!$('ovl-hats').classList.contains('hidden'));
  $('hat-list').click(); // la liste, pas le fond
  assert.ok(!$('ovl-hats').classList.contains('hidden'), 'clic interne inoffensif');
  $('ovl-hats').querySelector('.ovl-x').click();
});

/* ---------------- v2.7 : streak, partage du jour ---------------- */

test('streak : la visite du jour est comptée au boot, 🔥 caché au jour 1', () => {
  assert.equal(L.records.streakCount, 1, 'première visite comptée');
  assert.ok(L.records.streakDay, 'jour mémorisé');
  assert.ok($('streak').classList.contains('hidden'), 'pas de flamme pour un seul jour');
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
  // neutralise les quêtes du jour : sinon, selon la date, nourrir peut EN plus
  // compléter la quête « repas » et ajouter son bonus -> +5 non déterministe
  L.state.qDaily = { date: dayKey(), progress: {}, done: dailyQuests(dayKey()).map(q => q.id) };
  const xp0 = L.records.xp || 0;
  L.state.hunger = 50;
  L.state.sleeping = false;
  $('b-feed').click();
  assert.equal(L.records.xp, xp0 + 5, '+5 XP par repas');
  assert.match($('lvl-badge').textContent, /^\d+$/, 'badge de niveau affiché');
  assert.match($('lvl-fill').style.width, /%$/);
});

test('montée de niveau : toast étoilé, friandise rechargée, sauvegardé', () => {
  // neutralise les quêtes du jour pour un gain déterministe
  L.state.qDaily = {
    date: dayKey(),
    progress: {},
    done: dailyQuests(dayKey()).map(q => q.id)
  };
  const lv0 = $('lvl-badge').textContent;
  // repart d'un niveau bas (les tests précédents peuvent avoir atteint le plafond 50)
  L.records.xp = 100;
  const cur = L.records.xp;
  const Lc = levelFromXp(cur);
  L.records.xp = cur + (Lc.next - Lc.cur) - 2; // à 2 XP du niveau suivant
  L.state.lastTreat = Date.now(); // friandise en recharge
  L.state.hunger = 50;
  $('b-feed').click();
  assert.ok($('ovl-cheer').classList.contains('show'), 'bannière de célébration affichée');
  assert.match($('cheer-kicker').textContent, /niveau/i, 'la bannière annonce le niveau');
  assert.match($('cheer-big').textContent, /^\d+$/, 'le numéro de niveau est affiché');
  assert.equal(L.state.lastTreat, 0, 'récompense : friandise rechargée');
  assert.notEqual($('lvl-badge').textContent, lv0, 'le badge a changé de niveau');
  const savedRec = JSON.parse(window.localStorage.getItem('petite_loutre_records_v1'));
  assert.equal(savedRec.xp, L.records.xp, 'XP persistée');
});

/* ---------------- v2.5 : musique ---------------- */

test('musique : le réglage 🎵 bascule et se sauvegarde', () => {
  $('lvl-badge').click(); $('m-gear').click();
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

test('accessibilité : gros texte et mouvement réduit basculent classes + préférence', () => {
  $('lvl-badge').click(); $('m-gear').click();
  const root = document.documentElement;
  assert.ok(!root.classList.contains('big-text'));
  $('b-bigtext').click();
  assert.equal(L.state.bigText, true, 'gros texte activé');
  assert.ok(root.classList.contains('big-text'), 'classe appliquée');
  assert.match($('b-bigtext').textContent, /OUI/);

  $('b-motion').click();
  assert.equal(L.state.reduceMotion, true, 'mouvement réduit activé');
  assert.ok(root.classList.contains('reduce-motion'), 'classe appliquée');
  assert.match($('b-motion').textContent, /RÉDUITES/);

  const saved = JSON.parse(window.localStorage.getItem('petite_loutre_v2'));
  assert.equal(saved.bigText, true, 'préférences persistées');
  assert.equal(saved.reduceMotion, true);
  // on remet à zéro pour ne pas perturber les autres tests
  $('b-bigtext').click(); $('b-motion').click();
  assert.ok(!root.classList.contains('big-text') && !root.classList.contains('reduce-motion'));
  $('btn-set-close').click();
});

test('toboggan : verrouillé sous le niveau requis, sinon se lance, se termine et compte la descente', () => {
  L.state.energy = 90; L.state.sleeping = false; L.state.divingUntil = 0; L.state.gameOver = false; L.state.away = false;
  L.state.stage = 'child'; L.state.hatchedAt = Date.now() - 25 * 3600 * 1000;

  // verrou : niveau trop bas -> bouton grisé mais tapable, qui explique le déblocage
  L.records.xp = 0; // niveau 1
  L.step(0); // rafraîchit le HUD (état des boutons)
  assert.ok($('b-slide').classList.contains('locked'), 'bouton grisé sous le niveau requis');
  assert.equal($('b-slide').disabled, false, 'mais tapable pour expliquer le déblocage');
  L.actSlide();
  assert.equal(L.minigame, null, 'toboggan verrouillé au niveau 1');
  assert.match($('log').textContent, /niveau/i, 'astuce de déblocage par niveau affichée');

  // débloqué une fois le palier de niveau atteint
  L.records.xp = 100000;
  L.step(0);
  assert.ok(!$('b-slide').classList.contains('locked'), 'débloqué au niveau requis');
  const slidesBefore = L.records.slidesTotal || 0;
  L.actSlide();
  assert.equal(L.minigame && L.minigame.mode, 'slide', 'partie de toboggan lancée');

  // on gagne quelques poissons puis on force la fin ; la boucle la clôt
  L.minigame.score = 4;
  L.minigame.endsAt = Date.now() - 1;
  renderOnce();
  assert.equal(L.minigame, null, 'partie terminée et nettoyée');
  assert.equal(L.records.slidesTotal, slidesBefore + 1, 'descente comptée');
  assert.ok(L.records.slideBest >= 4, 'meilleur score enregistré');
});

test('carte : depuis la berge, toucher un lieu connu part directement là-bas', () => {
  L.state.gameOver = false; L.state.away = false; L.state.divingUntil = 0;
  L.state.stage = 'child'; L.state.hatchedAt = Date.now() - 25 * 3600 * 1000;
  L.state.place = 'berge';
  L.records.visited = ['clairiere', 'lac'];

  $('lvl-badge').dispatchEvent(new window.Event('click', { bubbles: true }));
  const cells = [...$('pm-grid').querySelectorAll('button.pm-cell')];
  assert.ok(cells.length >= 2, 'les lieux connus sont des boutons de voyage depuis la berge');

  const lac = cells.find(c => /grand lac/i.test(c.getAttribute('aria-label') || ''));
  assert.ok(lac, 'le lac, déjà visité, doit être proposé');
  lac.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(L.state.place, 'monde', 'on part en balade');
  assert.equal(L.world && L.world.zone, 'lac', 'et directement dans le lieu touché');

  // un lieu JAMAIS visité reste hors de portée : il se gagne à pied
  const inconnus = [...$('pm-grid').querySelectorAll('.pm-cell.unknown')];
  assert.ok(inconnus.every(c => c.tagName !== 'BUTTON'), 'les lieux inconnus ne sont pas cliquables');
});

test('balade : on repart du dernier lieu quitté, pas systématiquement de la clairière', () => {
  L.records.visited = ['clairiere', 'lac'];
  L.state.place = 'monde'; L.state.worldZone = 'lac';

  $('b-world-back').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(L.state.place, 'berge', 'rentrée à la berge');

  $('b-world').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(L.world && L.world.zone, 'lac', 'la balade reprend où elle s\'était arrêtée');

  // sauvegarde citant un lieu inconnu (ou supprimé) : repli sur la clairière
  L.state.place = 'berge';
  L.state.worldZone = 'atlantide';
  $('b-world').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(L.world && L.world.zone, 'clairiere', 'repli sur le lieu de départ');
});
