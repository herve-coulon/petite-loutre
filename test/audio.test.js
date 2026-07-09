// Tests v3.9 : audio — parties PURES (le WebAudio lui-même n'est pas testable ici).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { varyFreq } from '../src/audio.js';
import { seasonVoice } from '../src/music.js';
import { ambientPlan } from '../src/ambient.js';

test('varyFreq : micro-variation bornée à ±1,5 %, centrée', () => {
  assert.equal(varyFreq(440, () => 0.5), 440, 'tirage central = fréquence inchangée');
  for (let i = 0; i <= 20; i++) {
    const f = varyFreq(1000, () => i / 20);
    assert.ok(f >= 985 && f <= 1015, 'reste dans ±1,5 % : ' + f);
  }
});

test('seasonVoice : un timbre par saison, été = son d\'origine', () => {
  assert.equal(seasonVoice('ete').mel, 'square', 'été garde le carré d\'origine');
  assert.equal(seasonVoice('hiver').mel, 'sine');
  assert.equal(seasonVoice('hiver').bell, true, 'clochette d\'hiver');
  assert.equal(seasonVoice('printemps').mel, 'triangle');
  assert.equal(seasonVoice('automne').hat, false, 'automne : plus de charleston (plus doux)');
  // saison inconnue -> repli sur l'été (jamais de son cassé)
  assert.deepEqual(seasonVoice('???'), seasonVoice('ete'));
});

test('ambientPlan : l\'eau toujours là, oiseaux/grillons/vent selon saison et heure', () => {
  const day = false, night = true;
  // l'eau clapote en toute saison, jour comme nuit
  for (const se of ['printemps', 'ete', 'automne', 'hiver']) {
    assert.equal(ambientPlan(se, day).water, true);
    assert.equal(ambientPlan(se, night).water, true);
  }
  // oiseaux : le jour, au printemps et en été
  assert.equal(ambientPlan('printemps', day).birds, true);
  assert.equal(ambientPlan('ete', day).birds, true);
  assert.equal(ambientPlan('hiver', day).birds, false);
  assert.equal(ambientPlan('ete', night).birds, false, 'pas d\'oiseaux la nuit');
  // grillons : la nuit, été et automne
  assert.equal(ambientPlan('ete', night).crickets, true);
  assert.equal(ambientPlan('printemps', night).crickets, false);
  assert.equal(ambientPlan('ete', day).crickets, false, 'pas de grillons le jour');
  // vent : automne et hiver
  assert.equal(ambientPlan('automne', day).wind, true);
  assert.equal(ambientPlan('hiver', night).wind, true);
  assert.equal(ambientPlan('ete', day).wind, false);
});
