// Bestiaire & faune en PIXEL (É2) : les grilles sont bien formées, toutes les
// lettres sont connues, chaque créature a son sprite, et la faune d'ambiance ne
// contient plus AUCUN emoji (charte DA : le monde est peint au pixel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAL, SPRITES, SPRITES_BESTIAIRE, SPRITES_FAUNE } from '../src/sprites.js';
import { FAUNE } from '../src/tilemap.js';
import { CREATURES } from '../src/creatures.js';

const known = new Set([...Object.keys(PAL), '.']);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Une grille de sprite valide : lignes de même largeur, lettres connues. */
function assertGrid(name, grid) {
  assert.ok(Array.isArray(grid) && grid.length > 0, name + ' : grille vide');
  const w = grid[0].length;
  assert.ok(w > 0, name + ' : largeur nulle');
  for (const [i, row] of grid.entries()) {
    assert.equal(row.length, w, name + ' ligne ' + i + ' : largeur incohérente');
    for (const ch of row) assert.ok(known.has(ch), name + ' : lettre inconnue « ' + ch + ' »');
  }
}

test('bestiaire : 8 créatures, grilles bien formées et lettres connues', () => {
  assert.equal(Object.keys(SPRITES_BESTIAIRE).length, 8, 'huit créatures attendues');
  for (const [k, g] of Object.entries(SPRITES_BESTIAIRE)) assertGrid('bestiaire.' + k, g);
});

test('faune : 28 bestioles, grilles bien formées et lettres connues', () => {
  assert.equal(Object.keys(SPRITES_FAUNE).length, 28, 'vingt-huit bestioles attendues');
  for (const [k, g] of Object.entries(SPRITES_FAUNE)) assertGrid('faune.' + k, g);
});

test('bestiaire : chaque créature du jeu a son sprite crXxx', () => {
  for (const c of CREATURES) {
    const key = 'cr' + cap(c.id);
    assert.ok(SPRITES_BESTIAIRE[key], c.id + ' : sprite « ' + key + ' » manquant');
  }
});

test('faune d\'ambiance : que des clés de sprites, plus AUCUN emoji dans le monde', () => {
  const resolve = k => SPRITES_FAUNE[k] || SPRITES_BESTIAIRE[k] || SPRITES[k];
  let especes = new Set();
  for (const [zone, keys] of Object.entries(FAUNE)) {
    assert.ok(Array.isArray(keys) && keys.length, zone + ' : pas de faune');
    assert.equal(new Set(keys).size, keys.length, zone + ' : bestiole en double');
    for (const k of keys) {
      // une clé de sprite est un identifiant ASCII ; un emoji sort de l'ASCII
      assert.ok(/^[a-zA-Z]+$/.test(k), zone + ' : « ' + k + ' » n\'est pas une clé de sprite (emoji ?)');
      assert.ok(resolve(k), zone + ' : la clé « ' + k + ' » ne résout aucun sprite');
      especes.add(k);
    }
  }
  assert.ok(especes.size >= 10, 'la vallée doit rester variée : ' + especes.size + ' espèces');
});
