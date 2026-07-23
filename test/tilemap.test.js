// La vallée en tuiles : carte cohérente, auto-tuilage des berges, collisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, MAP_ROWS, MAP_W, MAP_H, WORLD_W, WORLD_H, T,
  charAt, isWater, isSolid, waterTile, groundTile, decorTile,
  moveWithCollision, spawnPoint
} from '../src/tilemap.js';

test('carte : rectangulaire et sans caractère inconnu', () => {
  assert.ok(MAP_H > 10 && MAP_W > 10);
  for (const [i, row] of MAP_ROWS.entries()) {
    assert.equal(row.length, MAP_W, 'ligne ' + i + ' de largeur incorrecte');
  }
  const known = new Set([...'.,d~Tpbfs']);
  for (const ch of MAP_ROWS.join('')) assert.ok(known.has(ch), 'caractère inconnu : ' + ch);
  assert.equal(WORLD_W, MAP_W * TILE);
  assert.equal(WORLD_H, MAP_H * TILE);
});

test('hors carte : traité comme un mur (on ne sort pas de la vallée)', () => {
  assert.equal(charAt(-1, 5), 'T');
  assert.equal(charAt(MAP_W, 5), 'T');
  assert.ok(isSolid(-1, 5) && isSolid(5, MAP_H));
});

test('collisions : eau et arbres bloquent, herbe et terre laissent passer', () => {
  let water = null, grass = null, dirt = null;
  for (let y = 0; y < MAP_H && !(water && grass && dirt); y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = charAt(x, y);
      if (c === '~' && !water) water = [x, y];
      if (c === '.' && !grass) grass = [x, y];
      if (c === 'd' && !dirt) dirt = [x, y];
    }
  }
  assert.ok(water && grass && dirt, 'la carte doit contenir eau, herbe et terre');
  assert.equal(isSolid(...water), true);
  assert.equal(isSolid(...grass), false);
  assert.equal(isSolid(...dirt), false, 'le sentier doit être praticable');
});

test('auto-tuilage : l\'eau entourée d\'eau est pleine, les bords prennent une berge', () => {
  // une case d'eau dont les 4 voisins sont de l'eau
  let inner = null;
  for (let y = 1; y < MAP_H - 1 && !inner; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater(x, y) && isWater(x - 1, y) && isWater(x + 1, y) && isWater(x, y - 1) && isWater(x, y + 1)) {
        inner = [x, y]; break;
      }
    }
  }
  assert.ok(inner, 'la rivière doit avoir un intérieur');
  assert.deepEqual(waterTile(...inner), T.water);
  // une rive OUEST pure : de l'eau au-dessus et en dessous, mais pas à gauche
  let westEdge = null;
  for (let y = 1; y < MAP_H - 1 && !westEdge; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater(x, y) && isWater(x, y - 1) && isWater(x, y + 1)
        && !isWater(x - 1, y) && isWater(x + 1, y)) { westEdge = [x, y]; break; }
    }
  }
  assert.ok(westEdge, 'la rivière doit avoir une rive ouest franche');
  assert.deepEqual(waterTile(...westEdge), T.bankW, 'la rive ouest doit s\'ourler');
});

test('tuiles : le sol existe partout, le décor n\'apparaît que sur les cases décorées', () => {
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const g = groundTile(x, y);
    assert.ok(Array.isArray(g) && g.length === 2, 'sol manquant en ' + x + ',' + y);
  }
  let treeAt = null;
  for (let y = 0; y < MAP_H && !treeAt; y++) for (let x = 0; x < MAP_W; x++) {
    if (charAt(x, y) === 'T') { treeAt = [x, y]; break; }
  }
  assert.deepEqual(decorTile(...treeAt), T.tree);
  // une case d'herbe nue n'a pas de décor
  assert.equal(decorTile(...spawnTileOfChar('.')), null);
  function spawnTileOfChar(ch) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (charAt(x, y) === ch) return [x, y];
    return [0, 0];
  }
});

test('déplacement : on glisse le long d\'un obstacle au lieu de s\'y coller', () => {
  // trouve une case libre juste à gauche d'un obstacle
  let spot = null;
  for (let y = 1; y < MAP_H - 1 && !spot; y++) {
    for (let x = 1; x < MAP_W - 2; x++) {
      if (!isSolid(x, y) && isSolid(x + 1, y) && !isSolid(x, y + 1)) { spot = [x, y]; break; }
    }
  }
  assert.ok(spot, 'il faut un obstacle bordé de libre pour ce test');
  const px = spot[0] * TILE + TILE / 2, py = spot[1] * TILE + TILE - 2;
  // pousser vers l'obstacle (droite) ET vers le bas : X est bloqué, Y passe
  const res = moveWithCollision(px, py, 6, 4);
  assert.ok(res.y > py, 'le déplacement vertical doit aboutir');
  assert.ok(res.x <= px + 6, 'le déplacement horizontal ne doit pas traverser');
});

test('déplacement : on ne traverse jamais l\'eau', () => {
  let water = null;
  for (let y = 1; y < MAP_H - 1 && !water; y++) {
    for (let x = 1; x < MAP_W - 1; x++) if (isWater(x, y) && !isSolid(x - 1, y)) { water = [x, y]; break; }
  }
  assert.ok(water);
  const px = (water[0] - 1) * TILE + TILE / 2, py = water[1] * TILE + TILE - 2;
  const res = moveWithCollision(px, py, TILE, 0);   // grand pas vers l'eau
  const landedOn = Math.floor(res.x / TILE);
  assert.notEqual(landedOn, water[0], 'la loutre ne doit pas finir dans la rivière');
});

test('point de départ : toujours sur une case praticable', () => {
  const p = spawnPoint();
  assert.ok(!isSolid(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
  assert.ok(p.x >= 0 && p.x <= WORLD_W && p.y >= 0 && p.y <= WORLD_H);
});
