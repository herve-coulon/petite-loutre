import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tickGame, harvestAt, waterAt, gardenProgress, GROW_TIME, FROG_LIVE, FLOWER_POINTS, FROG_POINTS,
  BUTTERFLY_POINTS, RARE_FLOWER_POINTS, BOUQUET_TARGET, BOUQUET_BONUS } from '../src/garden.js';

describe('garden', () => {
  it('newGame initialise correctement', () => {
    const g = newGame(1000);
    assert.equal(g.mode, 'garden');
    assert.equal(g.score, 0);
    assert.equal(g.flowers.length, 0);
    assert.equal(g.frogs.length, 0);
    assert.equal(g.startedAt, 1000);
    assert.equal(g.endsAt, 1000 + 25000);
  });

  it('gardenProgress va de 0 à 1', () => {
    const g = newGame(0);
    assert.equal(gardenProgress(g, 0), 0);
    assert.equal(gardenProgress(g, 12500), 0.5);
    assert.equal(gardenProgress(g, 25000), 1);
    assert.equal(gardenProgress(null, 0), 0);
  });

  it('tickGame fait pousser les graines (seed → sprout → bloom)', () => {
    const g = newGame(1000);
    g.flowers.push({ x: 20, y: 200, plantedAt: 1000, stage: 'seed' });
    // après GROW_TIME : sprout
    tickGame(g, 1000 + GROW_TIME);
    assert.equal(g.flowers[0].stage, 'sprout');
    // après GROW_TIME * 1.8 : bloom
    tickGame(g, 1000 + Math.ceil(GROW_TIME * 1.8));
    assert.equal(g.flowers[0].stage, 'bloom');
  });

  it('tickGame termine après la durée', () => {
    const g = newGame(1000);
    const res = tickGame(g, 26000);
    assert.equal(res.type, 'end');
    assert.equal(typeof res.score, 'number');
  });

  it('harvestAt récolte une fleur en bloom', () => {
    const g = newGame(1000);
    g.flowers.push({ x: 20, y: 200, plantedAt: 0, stage: 'bloom' });
    const got = harvestAt(g, 20, 200, 12);
    assert.equal(got.type, 'flower');
    assert.equal(g.score, FLOWER_POINTS);
    assert.equal(g.flowers[0].stage, 'wilted');
  });

  it('harvestAt attrape une grenouille', () => {
    const g = newGame(1000);
    g.frogs.push({ x: 30, y: 210, appearedAt: 1000 });
    const got = harvestAt(g, 30, 210, 12);
    assert.equal(got.type, 'frog');
    assert.equal(g.score, FROG_POINTS);
  });

  it('waterAt arrose une graine et avance sa pousse', () => {
    const g = newGame(1000);
    g.flowers.push({ x: 20, y: 200, plantedAt: 1000, stage: 'seed' });
    const ok = waterAt(g, 20, 200);
    assert.equal(ok, true);
    assert.equal(g.waterDrops, 1);
    // plantedAt reculé de 600ms → pousse plus vite
    assert.ok(g.flowers[0].plantedAt < 1000);
  });

  it('tickGame fait apparaître des graines et des grenouilles', () => {
    const g = newGame(1000);
    const rnd = () => 0.5;
    // nextSeed = 1600, nextFrog = 3000, intro finit à 4200
    tickGame(g, 4500, rnd);
    assert.ok(g.flowers.length > 0, 'une graine est apparue');
    tickGame(g, 5500, rnd);
    assert.ok(g.frogs.length > 0, 'une grenouille est apparue');
  });

  // ── v4.6 : papillons, fleurs rares, bouquet bonus ──
  it('harvestAt attrape un papillon (+2)', () => {
    const g = newGame(1000);
    g.butterflies.push({ baseX: 40, x: 40, y: 120, appearedAt: 1000 });
    const got = harvestAt(g, 40, 120, 12);
    assert.equal(got.type, 'butterfly');
    assert.equal(g.score, BUTTERFLY_POINTS);
    assert.equal(g.butterfliesCaught, 1);
  });

  it('une fleur rare vaut plus qu\'une fleur normale', () => {
    const g = newGame(1000);
    g.flowers.push({ x: 20, y: 200, plantedAt: 0, stage: 'bloom', rare: true });
    const got = harvestAt(g, 20, 200, 12);
    assert.equal(got.type, 'flower');
    assert.equal(got.rare, true);
    assert.equal(g.score, RARE_FLOWER_POINTS);
    assert.ok(RARE_FLOWER_POINTS > FLOWER_POINTS);
  });

  it('tickGame fait apparaître des papillons', () => {
    const g = newGame(1000);
    const rnd = () => 0.5;
    tickGame(g, 4700, rnd); // nextButterfly = 2400, après l'intro
    assert.ok(g.butterflies.length > 0, 'un papillon est apparu');
  });

  it('bouquet bonus : récolter BOUQUET_TARGET fleurs donne un bonus à la fin', () => {
    const g = newGame(1000);
    for (let i = 0; i < BOUQUET_TARGET; i++) {
      g.flowers.push({ x: 20, y: 200, plantedAt: 0, stage: 'bloom' });
      harvestAt(g, 20, 200, 12);
    }
    assert.equal(g.harvested, BOUQUET_TARGET);
    const scoreBefore = g.score;
    const res = tickGame(g, 26000);
    assert.equal(res.bonus, BOUQUET_BONUS, 'bonus versé');
    assert.equal(res.score, scoreBefore + BOUQUET_BONUS, 'le bonus s\'ajoute au score');
    assert.equal(res.flowers, BOUQUET_TARGET);
  });

  it('pas de bouquet bonus sous le seuil', () => {
    const g = newGame(1000);
    g.flowers.push({ x: 20, y: 200, plantedAt: 0, stage: 'bloom' });
    harvestAt(g, 20, 200, 12);
    const res = tickGame(g, 26000);
    assert.equal(res.bonus, 0);
  });
});
