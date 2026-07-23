// Le monde en tuiles : cartes cohérentes, auto-tuilage des berges, collisions,
// et passages entre zones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, ZONES, START_ZONE, zoneById, MAP_W, MAP_H, WORLD_W, WORLD_H, T,
  charAt, isWater, isSolid, waterTile, groundTile, decorTile,
  moveWithCollision, zoneExit, nearestFree, safeEntry, spawnPoint
} from '../src/tilemap.js';

const ids = Object.keys(ZONES);

test('zones : toutes rectangulaires, même gabarit, sans caractère inconnu', () => {
  assert.ok(ids.length >= 3, 'le monde doit avoir plusieurs zones');
  const known = new Set([...'.,d~Tpbfs']);
  for (const id of ids) {
    const z = ZONES[id];
    assert.equal(z.rows.length, MAP_H, id + ' : hauteur');
    for (const [i, row] of z.rows.entries()) {
      assert.equal(row.length, MAP_W, id + ' ligne ' + i);
      for (const ch of row) assert.ok(known.has(ch), id + ' : caractère ' + ch);
    }
    assert.ok(z.name && z.id === id);
  }
  assert.equal(WORLD_W, MAP_W * TILE);
  assert.equal(WORLD_H, MAP_H * TILE);
});

test('zones : les liaisons pointent vers des zones qui existent', () => {
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      assert.ok(['north', 'south', 'east', 'west'].includes(dir), id + ' : bord ' + dir);
      assert.ok(ZONES[to], id + ' -> ' + to + ' : zone inconnue');
    }
  }
  assert.ok(ZONES[START_ZONE], 'la zone de départ doit exister');
});

test('zones : un bord SANS liaison est un mur, un bord AVEC liaison s\'ouvre', () => {
  const cl = ZONES.clairiere;
  assert.ok(cl.links.north, 'la clairière ouvre au nord');
  assert.equal(isSolid('clairiere', 5, -1), false, 'le nord doit être franchissable');
  assert.ok(!cl.links.south, 'la clairière est fermée au sud');
  assert.equal(isSolid('clairiere', 5, MAP_H), true, 'le sud doit être un mur');
  // la forêt n'ouvre qu'au sud
  assert.equal(isSolid('foret', 5, -1), true, 'la forêt est fermée au nord');
  assert.equal(isSolid('foret', 5, MAP_H), false, 'la forêt ouvre au sud');
});

test('passage : sortir par un bord lié amène dans la zone voisine, côté opposé', () => {
  const out = zoneExit('clairiere', 200, -2);          // on sort par le nord
  assert.ok(out, 'la sortie nord doit exister');
  assert.equal(out.to, 'foret');
  assert.ok(out.y > WORLD_H - 2 * TILE, 'on entre par le bas de la forêt');
  const back = zoneExit('foret', 200, WORLD_H + 2);    // et on revient
  assert.equal(back.to, 'clairiere');
  assert.ok(back.y < 2 * TILE, 'on entre par le haut de la clairière');
  // un bord non lié ne mène nulle part
  assert.equal(zoneExit('clairiere', 200, WORLD_H + 2), null);
  assert.equal(zoneExit('foret', -2, 100), null);
});

test('passage : l\'arrivée est toujours sur une case praticable', () => {
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const px = dir === 'west' ? -2 : dir === 'east' ? WORLD_W + 2 : WORLD_W / 2;
      const py = dir === 'north' ? -2 : dir === 'south' ? WORLD_H + 2 : WORLD_H / 2;
      const out = zoneExit(id, px, py);
      assert.ok(out && out.to === to);
      const entry = safeEntry(out.to, out.x, out.y);
      const cx = Math.floor(entry.x / TILE), cy = Math.floor(entry.y / TILE);
      assert.equal(isSolid(out.to, cx, cy), false,
        'arrivée bloquée en ' + to + ' depuis ' + id + '/' + dir);
    }
  }
});

test('collisions : eau et arbres bloquent, herbe et terre laissent passer', () => {
  let water = null, grass = null;
  for (let y = 0; y < MAP_H && !(water && grass); y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = charAt('clairiere', x, y);
      if (c === '~' && !water) water = [x, y];
      if (c === '.' && !grass) grass = [x, y];
    }
  }
  assert.equal(isSolid('clairiere', ...water), true);
  assert.equal(isSolid('clairiere', ...grass), false);
  // le sentier de terre est praticable
  assert.equal(isSolid('clairiere', 2, 9), false, 'le sentier doit se marcher');
});

test('auto-tuilage : l\'eau intérieure est pleine, une rive ouest s\'ourle', () => {
  let inner = null;
  for (let y = 1; y < MAP_H - 1 && !inner; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater('clairiere', x, y) && isWater('clairiere', x - 1, y) && isWater('clairiere', x + 1, y)
        && isWater('clairiere', x, y - 1) && isWater('clairiere', x, y + 1)) { inner = [x, y]; break; }
    }
  }
  assert.ok(inner);
  assert.deepEqual(waterTile('clairiere', ...inner), T.water);
  let westEdge = null;
  for (let y = 1; y < MAP_H - 1 && !westEdge; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater('clairiere', x, y) && isWater('clairiere', x, y - 1) && isWater('clairiere', x, y + 1)
        && !isWater('clairiere', x - 1, y) && isWater('clairiere', x + 1, y)) { westEdge = [x, y]; break; }
    }
  }
  assert.ok(westEdge);
  assert.deepEqual(waterTile('clairiere', ...westEdge), T.bankW);
});

test('tuiles : chaque zone a un sol partout ; le décor suit la légende', () => {
  for (const id of ids) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const g = groundTile(id, x, y);
      assert.ok(Array.isArray(g) && g.length === 2, id + ' : sol manquant en ' + x + ',' + y);
    }
  }
  let treeAt = null;
  for (let y = 0; y < MAP_H && !treeAt; y++) for (let x = 0; x < MAP_W; x++) {
    if (charAt('foret', x, y) === 'T') { treeAt = [x, y]; break; }
  }
  assert.deepEqual(decorTile('foret', ...treeAt), T.tree);
});

test('déplacement : on glisse le long d\'un obstacle, on ne traverse pas l\'eau', () => {
  let spot = null;
  for (let y = 1; y < MAP_H - 1 && !spot; y++) {
    for (let x = 1; x < MAP_W - 2; x++) {
      if (!isSolid('clairiere', x, y) && isSolid('clairiere', x + 1, y) && !isSolid('clairiere', x, y + 1)) {
        spot = [x, y]; break;
      }
    }
  }
  assert.ok(spot);
  const px = spot[0] * TILE + TILE / 2, py = spot[1] * TILE + TILE - 2;
  const res = moveWithCollision('clairiere', px, py, 6, 4);
  assert.ok(res.y > py, 'le déplacement vertical doit aboutir');
  const landed = Math.floor(res.x / TILE);
  assert.notEqual(landed, spot[0] + 1, 'on ne doit pas entrer dans l\'obstacle');
});

test('départ : chaque zone a un point d\'entrée praticable', () => {
  for (const id of ids) {
    const p = spawnPoint(id);
    assert.equal(isSolid(id, Math.floor(p.x / TILE), Math.floor(p.y / TILE)), false, id);
    assert.ok(p.x >= 0 && p.x <= WORLD_W && p.y >= 0 && p.y <= WORLD_H);
  }
  // zoneById est tolérant : une entrée inconnue retombe sur la zone de départ
  assert.equal(zoneById('n_importe_quoi').id, START_ZONE);
  assert.equal(zoneById(ZONES.foret).id, 'foret');
});
