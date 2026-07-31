import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creatureById, creaturesIn, aggressiveIn, spawnCreatures, tickCreatures, checkAttack } from '../src/creatures.js';
import { seeCreature, catchCreature, bestiaryCount, bestiaryTotal, bestiaryList, bestiaryPercent } from '../src/bestiary.js';

describe('creatures', () => {
  it('creatureById trouve une créature existante', () => {
    const c = creatureById('lapin');
    assert.equal(c.emoji, '🐇');
    assert.equal(c.aggressive, false);
  });

  it('creatureById retourne null pour id inconnu', () => {
    assert.equal(creatureById('unicorn'), null);
  });

  it('creaturesIn retourne les créatures d\'une zone', () => {
    const list = creaturesIn('foret');
    assert.ok(list.length > 0);
    assert.ok(list.every(c => c.zone === 'foret'));
  });

  it('aggressiveIn ne retourne que les agressives', () => {
    const list = aggressiveIn('foret');
    assert.ok(list.every(c => c.aggressive));
  });

  it('spawnCreatures retourne 0-2 créatures', () => {
    const rng = () => 0.5;
    const spawned = spawnCreatures('clairiere', rng);
    assert.ok(spawned.length <= 2);
    assert.ok(spawned.length > 0);
    assert.ok(spawned[0].id);
    assert.equal(typeof spawned[0].x, 'number');
    assert.equal(typeof spawned[0].hp, 'number');
  });

  it('spawnCreatures retourne [] zone vide', () => {
    assert.deepEqual(spawnCreatures('zone-inexistante'), []);
  });

  it('tickCreatures déplace les créatures', () => {
    const rng = () => 0.5;
    const spawned = spawnCreatures('foret', rng);
    const x0 = spawned[0].x, y0 = spawned[0].y;
    tickCreatures(spawned, 80, 100, 1000, rng);
    // au moins une créature a bougé (ou state changé)
    assert.ok(spawned[0].state === 'idle' || spawned[0].x !== x0 || spawned[0].y !== y0);
  });

  it('tickCreatures : créature agressive chase si proche', () => {
    const spawned = [{ id: 'renard', x: 80, y: 100, hp: 3, vx: 0, vy: 0, state: 'idle', lastDir: 1 }];
    tickCreatures(spawned, 100, 120, 1000); // distance > 8, < 50
    assert.equal(spawned[0].state, 'chase');
  });

  it('checkAttack détecte une attaque au contact', () => {
    const creatures = [{ id: 'renard', x: 80, y: 100, state: 'attack' }];
    const atk = checkAttack(creatures, 82, 101);
    assert.equal(atk.id, 'renard');
  });

  it('checkAttack ne retourne rien si pas d\'attaque', () => {
    const creatures = [{ id: 'renard', x: 80, y: 100, state: 'idle' }];
    assert.equal(checkAttack(creatures, 82, 101), null);
  });
});

describe('bestiary', () => {
  it('seeCreature ajoute une nouvelle créature', () => {
    const rec = {};
    const isNew = seeCreature(rec, 'lapin');
    assert.equal(isNew, true);
    assert.equal(rec.bestiary.lapin.seen, 1);
  });

  it('seeCreature incrémente seen si déjà vue', () => {
    const rec = { bestiary: { lapin: { seen: 2, caught: 0 } } };
    const isNew = seeCreature(rec, 'lapin');
    assert.equal(isNew, false);
    assert.equal(rec.bestiary.lapin.seen, 3);
  });

  it('catchCreature incrémente caught', () => {
    const rec = { bestiary: { lapin: { seen: 1, caught: 0 } } };
    catchCreature(rec, 'lapin');
    assert.equal(rec.bestiary.lapin.caught, 1);
  });

  it('bestiaryCount', () => {
    const rec = { bestiary: { lapin: { seen: 1 }, renard: { seen: 1 } } };
    assert.equal(bestiaryCount(rec), 2);
    assert.equal(bestiaryCount({}), 0);
  });

  it('bestiaryTotal', () => {
    assert.equal(bestiaryTotal(), 8);
  });

  it('bestiaryPercent', () => {
    const rec = { bestiary: { lapin: { seen: 1 }, renard: { seen: 1 } } };
    assert.equal(bestiaryPercent(rec), 25); // 2/8
  });

  it('bestiaryList retourne les créatures vues avec leurs données', () => {
    const rec = { bestiary: { lapin: { seen: 3, caught: 1, firstSeen: 1000 } } };
    const list = bestiaryList(rec);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'lapin');
    assert.equal(list[0].seen, 3);
    assert.equal(list[0].emoji, '🐇');
  });
});
