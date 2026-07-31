import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherFor, sicknessBonus, isHostile, WEATHER_LABELS } from '../src/weather.js';

test('weatherFor retourne un objet valide', () => {
  const w = weatherFor(new Date());
  assert.ok(w.type, 'a un type');
  assert.ok(typeof w.intensity === 'number', 'intensity est un nombre');
  assert.ok(typeof w.wind === 'number', 'wind est un nombre');
  assert.ok(w.intensity >= 0 && w.intensity <= 1, 'intensity entre 0 et 1');
  assert.ok(WEATHER_LABELS[w.type], 'type a un label');
});

test('weatherFor est déterministe pour une même date', () => {
  const d = new Date('2025-06-15T14:30:00');
  const w1 = weatherFor(d), w2 = weatherFor(d);
  assert.equal(w1.type, w2.type, 'même type à chaque fois');
  assert.equal(w1.intensity, w2.intensity, 'même intensité');
});

test('weatherFor varie selon la saison', () => {
  const types = new Set();
  for (let m = 0; m < 12; m++) {
    types.add(weatherFor(new Date(2025, m, 15, 12)).type);
  }
  assert.ok(types.size > 1, 'au moins 2 types différents sur l\'année');
});

test('sicknessBonus est 0 pour clair, positif pour pluie/brouillard/verglas', () => {
  assert.equal(sicknessBonus({ type: 'clair', intensity: 0 }), 0);
  assert.ok(sicknessBonus({ type: 'pluie', intensity: 0.8 }) > 0);
  assert.ok(sicknessBonus({ type: 'brouillard', intensity: 0.5 }) > 0);
  assert.ok(sicknessBonus({ type: 'verglas', intensity: 1 }) > 0);
  assert.equal(sicknessBonus({ type: 'vent', intensity: 0.5 }), 0);
});

test('isHostile est vrai pour orage/verglas/canicule', () => {
  assert.ok(isHostile({ type: 'orage' }));
  assert.ok(isHostile({ type: 'verglas' }));
  assert.ok(isHostile({ type: 'canicule' }));
  assert.ok(!isHostile({ type: 'clair' }));
  assert.ok(!isHostile({ type: 'pluie' }));
});
