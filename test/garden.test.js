import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, tickGame, harvestAt, waterAt, gardenProgress, plotState,
  GROW_TIME, BLOOM_WINDOW, PEAK_POINTS, EDGE_POINTS, RARE_MULT, BOUQUET_TARGET, BOUQUET_BONUS
} from '../src/garden.js';

// Prépare un parterre à un âge donné (ms depuis le semis) et renvoie {mg, p, now}.
function withPlot(ageMs, extra = {}) {
  const now = 100000;
  const mg = newGame(now);
  const p = mg.plots[0];
  p.stage = 'growing'; p.plantedAt = now - ageMs; Object.assign(p, extra);
  return { mg, p, now, x: p.x, y: p.y };
}

describe('garden (v4.9 — récolte au bon moment)', () => {
  it('newGame : 6 parterres vides, score 0', () => {
    const g = newGame(1000);
    assert.equal(g.mode, 'garden');
    assert.equal(g.score, 0);
    assert.equal(g.plots.length, 6);
    assert.ok(g.plots.every(p => p.stage === 'empty'));
    assert.equal(g.endsAt, 1000 + 25000);
  });

  it('gardenProgress va de 0 à 1', () => {
    const g = newGame(0);
    assert.equal(gardenProgress(g, 12500), 0.5);
    assert.equal(gardenProgress(null, 0), 0);
  });

  it('plotState : phases de croissance selon l\'âge', () => {
    const { p, now } = withPlot(0);
    assert.equal(plotState(p, now).phase, 'seed');
    assert.equal(plotState({ ...p, plantedAt: now - GROW_TIME * 0.5 }, now).phase, 'sprout');
    assert.equal(plotState({ ...p, plantedAt: now - GROW_TIME * 0.8 }, now).phase, 'bud');
    // en floraison : bloomT ∈ [0,1]
    const bloom = plotState({ ...p, plantedAt: now - GROW_TIME - BLOOM_WINDOW * 0.5 }, now);
    assert.equal(bloom.phase, 'bloom');
    assert.ok(Math.abs(bloom.bloomT - 0.5) < 0.01);
    // après la fenêtre : fané
    assert.equal(plotState({ ...p, plantedAt: now - GROW_TIME - BLOOM_WINDOW - 10 }, now).phase, 'wilt');
  });

  it('harvestAt : PILE à la pleine floraison = parfait, points max', () => {
    const { mg, now, x, y } = withPlot(GROW_TIME + BLOOM_WINDOW * 0.5); // pic
    mg.plots[0].stage = 'bloom';
    const got = harvestAt(mg, x, y, 22, now);
    assert.equal(got.type, 'flower');
    assert.equal(got.perfect, true);
    assert.equal(got.points, PEAK_POINTS);
    assert.equal(mg.score, PEAK_POINTS);
    assert.equal(mg.perfects, 1);
    assert.equal(mg.harvested, 1);
    assert.equal(mg.plots[0].stage, 'empty', 'le parterre se libère');
  });

  it('harvestAt : en bordure de floraison = pas parfait, peu de points', () => {
    const { mg, now, x, y } = withPlot(GROW_TIME + 40); // tout début de floraison
    mg.plots[0].stage = 'bloom';
    const got = harvestAt(mg, x, y, 22, now);
    assert.equal(got.perfect, false);
    assert.equal(got.points, EDGE_POINTS);
    assert.ok(PEAK_POINTS > EDGE_POINTS);
  });

  it('harvestAt : une fleur rare vaut le double', () => {
    const { mg, now, x, y } = withPlot(GROW_TIME + BLOOM_WINDOW * 0.5, { rare: true });
    mg.plots[0].stage = 'bloom';
    const got = harvestAt(mg, x, y, 22, now);
    assert.equal(got.rare, true);
    assert.equal(got.points, PEAK_POINTS * RARE_MULT);
  });

  it('harvestAt : ne récolte PAS un parterre pas encore en fleur', () => {
    const { mg, now, x, y } = withPlot(500); // encore graine
    mg.plots[0].stage = 'growing';
    assert.equal(harvestAt(mg, x, y, 22, now), false);
    assert.equal(mg.score, 0);
  });

  it('waterAt : arrose une POUSSE et avance sa maturité ; pas une fleur', () => {
    const { mg, now, x, y } = withPlot(1000);
    mg.plots[0].stage = 'growing';
    const before = mg.plots[0].plantedAt;
    assert.equal(waterAt(mg, x, y, 22), true);
    assert.ok(mg.plots[0].plantedAt < before, 'la maturité avance');
    // en fleur : l'arrosage ne fait rien (on récolte, on n\'arrose pas)
    mg.plots[0].stage = 'bloom';
    assert.equal(waterAt(mg, x, y, 22), false);
  });

  it('tickGame : sème automatiquement dans un parterre libre après l\'intro', () => {
    const g = newGame(1000);
    const rnd = () => 0.5;
    tickGame(g, 1000 + 3300 + 200, rnd); // après INTRO_DURATION + nextSow
    assert.ok(g.plots.some(p => p.stage !== 'empty'), 'un semis a eu lieu');
  });

  it('tickGame : bouquet bonus à la fin si assez de fleurs récoltées', () => {
    const g = newGame(1000);
    g.harvested = BOUQUET_TARGET;
    const before = g.score;
    const res = tickGame(g, 27000);
    assert.equal(res.type, 'end');
    assert.equal(res.bonus, BOUQUET_BONUS);
    assert.equal(res.score, before + BOUQUET_BONUS);
    assert.equal(res.flowers, BOUQUET_TARGET);
  });

  it('tickGame : pas de bonus sous le seuil', () => {
    const g = newGame(1000);
    g.harvested = 1;
    assert.equal(tickGame(g, 27000).bonus, 0);
  });
});
