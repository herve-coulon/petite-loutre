import { test } from 'node:test';
import assert from 'node:assert';
import {
  SCALES, LOCATIONS, locationById, locationUnlocked,
  unlockedLocations, nextLocation, canEnter, normalizeScale,
  scaleIndex, zoomIn, zoomOut, canZoomIn, canZoomOut
} from '../src/world.js';

test('échelles : les trois vues emboîtées existent', () => {
  assert.deepEqual(SCALES, ['monde', 'berge', 'taniere']);
});

test('lieux : la berge est le foyer, ouverte dès le niveau 1', () => {
  const berge = locationById('berge');
  assert.equal(berge.home, true);
  assert.equal(berge.unlockLevel, 1);
  assert.ok(locationUnlocked(berge, 1));
});

test('lieux : chaque lieu a un id, un niveau requis croissant et des coords valides', () => {
  let prev = 0;
  for (const l of LOCATIONS) {
    assert.ok(l.id && l.name && l.emoji, 'métadonnées présentes : ' + l.id);
    assert.ok(l.unlockLevel >= prev, 'niveaux requis croissants (' + l.id + ')');
    prev = l.unlockLevel;
    assert.ok(l.x >= 0 && l.x <= 100 && l.y >= 0 && l.y <= 100, 'coords carte 0..100 (' + l.id + ')');
  }
});

test('déblocage : le nombre de lieux ouverts croît avec le niveau', () => {
  assert.equal(unlockedLocations(1).length, 1, 'niveau 1 : seule la berge');
  assert.ok(unlockedLocations(6).length >= 2, 'niveau 6 : l\'amont s\'ouvre');
  assert.equal(unlockedLocations(999).length, LOCATIONS.length, 'tout ouvert au plafond');
});

test('prochain lieu : téléguide la progression, null quand tout est ouvert', () => {
  assert.equal(nextLocation(1).id, 'amont', 'après la berge vient l\'amont');
  assert.equal(nextLocation(999), null, 'plus rien à débloquer');
});

test('canEnter : la tanière n\'est accessible que si la loutre est là', () => {
  assert.ok(canEnter('monde', null), 'le monde est toujours accessible');
  assert.ok(canEnter('berge', { stage: 'egg' }), 'la berge aussi');
  assert.ok(!canEnter('taniere', { stage: 'egg' }), 'pas de tanière pour un œuf');
  assert.ok(!canEnter('taniere', { stage: 'adult', away: true }), 'pas de tanière chez le héron');
  assert.ok(canEnter('taniere', { stage: 'adult' }), 'tanière OK pour une loutre présente');
  assert.ok(!canEnter('nawak', {}), 'échelle inconnue refusée');
});

test('normalizeScale : replie une valeur inconnue sur la berge', () => {
  assert.equal(normalizeScale('monde'), 'monde');
  assert.equal(normalizeScale('taniere'), 'taniere');
  assert.equal(normalizeScale('n\'importe'), 'berge');
  assert.equal(normalizeScale(undefined), 'berge');
});

test('navigation : zoom avant descend d\'un cran (monde → berge → tanière)', () => {
  const otter = { stage: 'adult' };
  assert.equal(scaleIndex('monde'), 0);
  assert.equal(scaleIndex('taniere'), 2);
  assert.equal(zoomIn('monde', otter), 'berge');
  assert.equal(zoomIn('berge', otter), 'taniere');
  assert.equal(zoomIn('taniere', otter), 'taniere', 'la tanière est le cran le plus proche');
});

test('navigation : on ne peut pas descendre dans la tanière sans loutre présente', () => {
  assert.equal(zoomIn('berge', { stage: 'egg' }), 'berge', 'un œuf ne descend pas dans la tanière');
  assert.ok(!canZoomIn('berge', { stage: 'egg' }));
  assert.ok(canZoomIn('berge', { stage: 'adult' }));
});

test('navigation : zoom arrière remonte (tanière → berge → monde), borné au monde', () => {
  assert.equal(zoomOut('taniere'), 'berge');
  assert.equal(zoomOut('berge'), 'monde');
  assert.equal(zoomOut('monde'), 'monde', 'le monde est la vue la plus large');
  assert.ok(!canZoomOut('monde'));
  assert.ok(canZoomOut('taniere'));
});
