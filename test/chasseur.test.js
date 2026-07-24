// Le chasseur : il doit faire peur SANS être injuste. Ces tests fixent les
// trois garanties d'équité — on le voit venir, on peut le semer, et le
// carrefour reste un refuge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chasseurRode, newChasseur, stepChasseur,
  VUE, OUBLI, PRISE, PAS_PATROUILLE, PAS_POURSUITE, ALERTE_MS, DEGATS_CAPTURE
} from '../src/chasseur.js';
import { ZONES, START_ZONE, MAP_W, MAP_H, TILE, isSolid } from '../src/tilemap.js';

const JOUR = '2026-07-24';
const libre = (zone) => (cx, cy) => !isSolid(zone, cx, cy);
const bougeLibre = (x, y, dx, dy) => ({ x: x + dx, y: y + dy });
const ids = Object.keys(ZONES);

test('présence : le carrefour est un REFUGE, il n\'y vient jamais', () => {
  // sans lieu sûr la vallée deviendrait invivable plutôt que tendue
  for (const jour of ['2026-01-01', '2026-05-17', '2026-11-30', JOUR]) {
    assert.equal(chasseurRode(START_ZONE, jour, START_ZONE), false,
      'il ne doit jamais rôder dans ' + START_ZONE + ' (' + jour + ')');
  }
});

test('présence : stable dans la journée, et il ne rôde pas partout à la fois', () => {
  for (const id of ids) {
    const a = chasseurRode(id, JOUR, START_ZONE);
    assert.equal(chasseurRode(id, JOUR, START_ZONE), a, id + ' : présence instable');
  }
  // sur un mois, il doit à la fois apparaître et laisser des jours tranquilles
  let avec = 0, total = 0;
  for (let d = 1; d <= 28; d++) {
    const jour = '2026-04-' + String(d).padStart(2, '0');
    for (const id of ids) { total++; if (chasseurRode(id, jour, START_ZONE)) avec++; }
  }
  assert.ok(avec > total * 0.15, 'il doit se montrer : ' + avec + '/' + total);
  assert.ok(avec < total * 0.6, 'mais laisser respirer : ' + avec + '/' + total);
});

test('ronde : il part d\'une case praticable et suit des points de passage', () => {
  const zone = ids.find(id => id !== START_ZONE);
  const ch = newChasseur(zone, JOUR, MAP_W, MAP_H, TILE, libre(zone));
  assert.ok(ch, 'il doit pouvoir se placer');
  assert.ok(ch.points.length >= 2, 'une ronde suppose plusieurs points');
  for (const p of ch.points) {
    assert.equal(isSolid(zone, Math.floor(p.x / TILE), Math.floor(p.y / TILE)), false,
      'point de ronde dans l\'eau ou un arbre');
  }
  assert.equal(ch.etat, 'patrouille');
});

test('équité : il TÉLÉGRAPHIE son attaque — une fenêtre pour fuir', () => {
  const ch = { x: 100, y: 100, points: [{ x: 100, y: 100 }], cible: 0,
    etat: 'patrouille', alerteA: 0, facing: 1 };
  // la loutre entre dans son champ de vision
  const evt = stepChasseur(ch, 100 + VUE - 10, 100, 1000, bougeLibre);
  assert.equal(evt, 'repere', 'le repérage est signalé à l\'orchestrateur');
  assert.equal(ch.etat, 'alerte');

  // pendant l'alerte il ne BOUGE PAS : c'est la fenêtre pour détaler
  const x0 = ch.x;
  stepChasseur(ch, 100 + VUE - 10, 100, 1000 + ALERTE_MS - 50, bougeLibre);
  assert.equal(ch.x, x0, 'il reste immobile tant qu\'il épaule');
  assert.equal(ch.etat, 'alerte');

  // puis il s'élance
  stepChasseur(ch, 100 + VUE - 10, 100, 1000 + ALERTE_MS + 10, bougeLibre);
  assert.equal(ch.etat, 'poursuite');
});

test('équité : on peut le SEMER — il court moins vite qu\'une loutre lancée', () => {
  // la loutre file à 1,4 px par image (cf. stepWorld)
  assert.ok(PAS_POURSUITE < 1.4, 'sinon la fuite serait impossible');
  assert.ok(PAS_PATROUILLE < PAS_POURSUITE, 'sa ronde doit être plus lente que sa charge');

  const ch = { x: 100, y: 100, points: [{ x: 100, y: 100 }], cible: 0,
    etat: 'poursuite', alerteA: 0, facing: 1 };
  // la loutre est déjà loin : il renonce
  stepChasseur(ch, 100 + OUBLI + 20, 100, 2000, bougeLibre);
  assert.equal(ch.etat, 'patrouille', 'distancé, il perd la trace');
});

test('capture : elle ne survient qu\'au CONTACT, et elle est signalée', () => {
  const ch = { x: 100, y: 100, points: [{ x: 100, y: 100 }], cible: 0,
    etat: 'poursuite', alerteA: 0, facing: 1 };
  // à distance moyenne : il se rapproche, sans prendre
  const evt = stepChasseur(ch, 160, 100, 2000, bougeLibre);
  assert.equal(evt, null, 'pas de capture à distance');
  assert.ok(ch.x > 100, 'mais il avance vers elle');

  // au contact : capture
  ch.x = 100; ch.y = 100;
  assert.equal(stepChasseur(ch, 100 + PRISE - 2, 100, 2100, bougeLibre), 'capture');
});

test('capture : elle coûte cher, sans être irréversible', () => {
  // le jeu ne tue plus (v2.7) ; le prédateur doit mordre fort quand même
  assert.ok(DEGATS_CAPTURE >= 15, 'trop peu et ce n\'est qu\'un décor mouvant');
  assert.ok(DEGATS_CAPTURE <= 40, 'trop et une seule erreur ruinerait la loutre');
});

test('déplacement : il ne traverse pas les obstacles', () => {
  const zone = ids.find(id => id !== START_ZONE);
  const ch = newChasseur(zone, JOUR, MAP_W, MAP_H, TILE, libre(zone));
  // un « bouge » qui refuse tout : il ne doit pas se téléporter
  const bloque = (x, y) => ({ x, y });
  const x0 = ch.x, y0 = ch.y;
  ch.etat = 'poursuite';
  stepChasseur(ch, x0 + 60, y0, 3000, bloque);
  assert.equal(ch.x, x0, 'bloqué, il reste sur place');
  assert.equal(ch.y, y0);
});
