// Tests v3.2 : saisons (monde vivant). Déterministe par date, pur.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seasonFor, seasonInfo, SEASONS } from '../src/seasons.js';

// Date locale à un mois donné (jour 15 pour éviter tout effet de bord).
const at = (month) => new Date(2026, month, 15, 12, 0, 0);

test('seasonFor : chaque mois tombe dans la bonne saison (hémisphère nord)', () => {
  const expected = [
    'hiver', 'hiver',                 // jan, fév
    'printemps', 'printemps', 'printemps', // mar, avr, mai
    'ete', 'ete', 'ete',             // juin, juil, août
    'automne', 'automne', 'automne', // sep, oct, nov
    'hiver'                          // déc
  ];
  for (let m = 0; m < 12; m++) {
    assert.equal(seasonFor(at(m)), expected[m], 'mois ' + m);
  }
});

test('seasonFor : les 4 saisons sont couvertes sur l\'année', () => {
  const set = new Set();
  for (let m = 0; m < 12; m++) set.add(seasonFor(at(m)));
  assert.deepEqual([...set].sort(), ['automne', 'ete', 'hiver', 'printemps']);
});

test('seasonInfo : renvoie les métadonnées complètes de la saison', () => {
  const info = seasonInfo(at(6)); // juillet -> été
  assert.equal(info.key, 'ete');
  assert.equal(info.label, 'Été');
  assert.ok(info.emoji && info.day && info.card);
});

test('chaque saison : palette jour valide, carte narrative complète', () => {
  for (const key of Object.keys(SEASONS)) {
    const s = SEASONS[key];
    assert.equal(s.key, key, key + ' : clé cohérente');
    assert.ok(s.label && s.emoji, key + ' : label + emoji');
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.day.hill), key + ' : couleur colline jour valide');
    assert.ok(/^#[0-9a-f]{6}$/i.test(s.day.hill2), key + ' : couleur colline2 jour valide');
    const c = s.card;
    assert.ok(c && c.title && c.cta, key + ' : carte titrée');
    assert.ok(Array.isArray(c.lines) && c.lines.length > 0, key + ' : carte a du texte');
    // ambient : soit null, soit un des trois types connus
    assert.ok(s.ambient === null || ['petales', 'feuilles', 'neige'].includes(s.ambient),
      key + ' : ambiance connue');
  }
});

test('teinte nuit d\'hiver présente (la neige reste visible sous la lune)', () => {
  assert.ok(SEASONS.hiver.night, 'hiver a une teinte nuit');
  assert.ok(/^#[0-9a-f]{6}$/i.test(SEASONS.hiver.night.hill), 'colline nuit valide');
  // les autres saisons gardent la palette nuit par défaut (pas d'override)
  assert.equal(SEASONS.ete.night, null);
});
