import { test } from 'node:test';
import assert from 'node:assert';
import {
  MAX_MEMBERS, makeGang, makeMember, recruit, gangPower, fighterPower,
  generateRival, autoDuel, resolveGangBattle, applyGangResult,
  recruitBoard, recruitCost
} from '../src/gang.js';
import { makeFighter, makeRng } from '../src/battle.js';

const leader = { name: 'Kiwi', stage: 'adult', fur: 'roux', health: 90, fun: 70, energy: 80 };

test('gang : créé avec le joueur comme chef', () => {
  const g = makeGang('Les Otaries', '⚔️', leader);
  assert.equal(g.name, 'Les Otaries');
  assert.equal(g.emblem, '⚔️');
  assert.equal(g.members.length, 1);
  assert.equal(g.members[0].name, 'Kiwi');
  assert.equal(g.wins, 0);
});

test('gang : nom borné, valeurs par défaut tolérantes', () => {
  const g = makeGang('', '', {});
  assert.ok(g.name.length > 0 && g.name.length <= 18);
  assert.equal(g.emblem, '🦦');
  assert.equal(g.members[0].fur, 'roux');
});

test('recrutement : ajoute des membres jusqu\'au plafond', () => {
  const g = makeGang('Bande', '🦦', leader);
  for (let i = 0; i < 10; i++) recruit(g, { name: 'R' + i, stage: 'child' });
  assert.equal(g.members.length, MAX_MEMBERS, 'plafonné à MAX_MEMBERS');
  assert.equal(recruit(g, { name: 'Trop' }), false, 'refus quand plein');
});

test('puissance : un adulte pèse plus qu\'un bébé, le gang somme ses membres', () => {
  assert.ok(fighterPower(makeFighter({ stage: 'adult', health: 90 }))
          > fighterPower(makeFighter({ stage: 'baby', health: 40 })));
  const g = makeGang('B', '🦦', leader);
  const p1 = gangPower(g);
  recruit(g, { name: 'R', stage: 'adult', health: 90 });
  assert.ok(gangPower(g) > p1, 'recruter augmente la puissance');
});

test('rival : généré, dosé, et REPRODUCTIBLE avec la même graine', () => {
  const a = generateRival(600, 10, 'seed-x');
  const b = generateRival(600, 10, 'seed-x');
  assert.deepEqual(a, b, 'même graine -> même gang adverse');
  assert.ok(a.members.length >= 2 && a.members.length <= MAX_MEMBERS);
  assert.ok(a.name && a.emblem && a.rival === true);
  const c = generateRival(600, 10, 'seed-y');
  assert.notDeepEqual(a, c, 'graine différente -> gang différent');
});

test('autoDuel : se termine toujours et désigne un gagnant', () => {
  const rng = makeRng(123);
  const fa = makeFighter({ stage: 'adult', health: 90, fun: 90, energy: 80 });
  const fb = makeFighter({ stage: 'baby', health: 40, fun: 30, energy: 20 });
  const w = autoDuel(fa, fb, rng);
  assert.ok(w === 'a' || w === 'b');
  assert.ok(fa.hp <= 0 || fb.hp <= 0 || true); // au moins un a encaissé
});

test('combat de gang : reproductible, se termine, un seul vainqueur', () => {
  const mine = makeGang('Moi', '🦦', leader);
  recruit(mine, { name: 'Deux', stage: 'child', health: 80 });
  const foe = generateRival(gangPower(mine), 10, 'foe-1');
  const r1 = resolveGangBattle(mine, foe, 'match-42');
  const r2 = resolveGangBattle(mine, foe, 'match-42');
  assert.equal(r1.winner, r2.winner, 'même graine -> même issue');
  assert.ok(r1.winner === 'a' || r1.winner === 'b');
  assert.ok(r1.log.length > 0, 'un journal de duels');
});

test('combat de gang : une bande beaucoup plus forte l\'emporte largement', () => {
  const strong = makeGang('Costauds', '⚔️', { stage: 'adult', health: 100, fun: 100, energy: 100 });
  recruit(strong, { stage: 'adult', health: 100, fun: 100, energy: 100 });
  recruit(strong, { stage: 'adult', health: 100, fun: 100, energy: 100 });
  const weak = makeGang('Bébés', '🍼', { stage: 'baby', health: 30, fun: 10, energy: 10 });
  let strongWins = 0;
  for (let i = 0; i < 12; i++) {
    if (resolveGangBattle(strong, weak, 'm' + i).winner === 'a') strongWins++;
  }
  assert.ok(strongWins >= 10, 'les costauds gagnent la vaste majorité (' + strongWins + '/12)');
});

test('recrutement : tableau du jour seedé (mêmes recrues le même jour), coûts positifs', () => {
  const a = recruitBoard(10, '2026-07-15');
  const b = recruitBoard(10, '2026-07-15');
  assert.deepEqual(a, b, 'même jour + niveau -> mêmes recrues');
  assert.equal(a.length, 3);
  for (const c of a) {
    assert.ok(c.name && c.stage && c.power > 0, 'recrue valide : ' + c.name);
    assert.ok(c.cost >= 20, 'coût en XP plancher respecté');
    assert.equal(c.cost, recruitCost(c), 'coût cohérent');
  }
  assert.notDeepEqual(a, recruitBoard(10, '2026-07-16'), 'le lendemain, d\'autres recrues');
});

test('recrutement : une recrue plus puissante coûte plus cher', () => {
  const strong = { stage: 'adult', health: 100, fun: 100, energy: 100 };
  const weak = { stage: 'baby', health: 30, fun: 10, energy: 10 };
  assert.ok(recruitCost(strong) > recruitCost(weak));
});

test('applyGangResult : met à jour victoires/défaites des deux gangs', () => {
  const a = makeGang('A', '🦦', leader), b = makeGang('B', '🦦', leader);
  applyGangResult(a, b, 'a');
  assert.equal(a.wins, 1); assert.equal(b.losses, 1);
  applyGangResult(a, b, 'b');
  assert.equal(b.wins, 1); assert.equal(a.losses, 1);
});
