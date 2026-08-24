// Régression M5 (tranche 13) : le boot d'une sauvegarde d'un joueur NOMMÉ.
//
// Tous les autres tests smoke démarrent l'app SANS sauvegarde (première visite) :
// le chemin « retour d'un joueur nommé » — qui appelle maybeStory/maybeSeasonCard/
// updateCoach pendant le boot — n'était donc jamais exercé au chargement. Quand le
// Coach a été extrait dans coach-controller.js (T13), son setupCoach était injecté
// APRÈS ce bloc de restauration : toute sauvegarde existante plantait le boot
// (ctx null -> getState), laissant l'app morte (aucun bouton câblé). Ce test
// pré-remplit une sauvegarde AVANT d'importer main.js et vérifie que le boot va
// jusqu'au bout. Fichier séparé -> processus isolé -> import frais de main.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { newState, saveState } from '../src/state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

let window, L, bootError = null;

before(async () => {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  window = dom.window;

  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (t, p) => (p === 'measureText' ? () => ({ width: 0 }) : (typeof p === 'string' ? noop : undefined)),
    set: () => true
  });
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,STUB';

  global.window = window;
  global.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  global.localStorage = window.localStorage;
  global.getComputedStyle = window.getComputedStyle.bind(window);
  global.requestAnimationFrame = () => 1;
  global.setInterval = () => 1;
  global.fetch = async () => ({ ok: false, json: async () => ({}) });

  // ⚠️ Le cœur du test : une sauvegarde d'un joueur NOMMÉ existe AVANT le boot.
  const s = newState(Date.now() - 25 * 3600 * 1000);
  s.stage = 'child';
  s.name = 'Kiwi';
  s.place = 'berge';
  s.coach = true;
  s.hatchedAt = Date.now() - 25 * 3600 * 1000;
  saveState(s, window.localStorage, Date.now());

  try {
    await import('../src/main.js'); // exécute boot() sur le chemin « retour »
  } catch (e) {
    bootError = e;
  }
  L = window.__loutre;
});

test('boot d\'une sauvegarde nommée existante : ne plante pas (régression coach T13)', () => {
  assert.equal(bootError, null,
    bootError ? ('le boot a levé au chargement d\'une sauvegarde : ' + bootError.message) : undefined);
  assert.ok(L, 'window.__loutre doit exister');
  assert.equal(L.state.name, 'Kiwi', 'la sauvegarde nommée est bien chargée');
  // Preuve que le boot est allé jusqu'au bout : un bouton câblé EN FIN de boot répond.
  assert.doesNotThrow(() => window.document.getElementById('b-feed').click(),
    'les boutons sont câblés -> le boot n\'a pas été interrompu');
});
