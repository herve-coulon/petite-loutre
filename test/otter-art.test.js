// Le kit de sprites de la loutre : découpe des planches, ancrages, et déclinaison
// des pelages par remap de palette. Tout ce qui est testable sans navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIMS, ART_SCALE, ANATOMY, FUR_REMAP, frameRect, frameAt, animForMood, loadOtterArt, drawAnim
} from '../src/otter-art.js';
import { FURS } from '../src/skins.js';

test('planches : chaque animation se découpe en images entières', () => {
  for (const [nom, a] of Object.entries(ANIMS)) {
    assert.ok(a.frames >= 1, nom + ' : au moins une image');
    assert.ok(a.fps > 0, nom + ' : cadence positive');
    // la largeur déclarée est celle d'UNE image ; la planche vaut w × frames
    assert.equal(a.w % ART_SCALE, 0, nom + ' : largeur divisible par l\'échelle d\'export');
    assert.equal(a.h % ART_SCALE, 0, nom + ' : hauteur divisible par l\'échelle d\'export');
  }
});

test('frameRect : découpe au bon endroit et rend la taille NATIVE', () => {
  const r0 = frameRect('walk', 0), r2 = frameRect('walk', 2);
  assert.equal(r0.sx, 0);
  assert.equal(r2.sx, 2 * ANIMS.walk.w, 'la 3e image commence à 2 largeurs');
  assert.equal(r0.sw, ANIMS.walk.w);
  // destination = source ÷ 4 : sous-échantillonnage ENTIER, seul rendu net
  assert.equal(r0.dw, ANIMS.walk.w / ART_SCALE);
  assert.equal(r0.dh, ANIMS.walk.h / ART_SCALE);
  assert.equal(frameRect('inconnue', 0), null);
});

test('frameRect : l\'index boucle, y compris pour les valeurs négatives', () => {
  const n = ANIMS.walk.frames;
  assert.equal(frameRect('walk', n).sx, frameRect('walk', 0).sx);
  assert.equal(frameRect('walk', -1).sx, frameRect('walk', n - 1).sx);
});

test('frameAt : la cadence déclarée est respectée', () => {
  assert.equal(frameAt('walk', 0), 0);
  // walk tourne à 8 im/s : 125 ms par image
  assert.equal(frameAt('walk', 125), 1);
  assert.equal(frameAt('walk', 1000), 0, 'un tour complet revient à la 1re image');
  assert.equal(frameAt('inconnue', 500), 0);
});

test('ancrages : chaque animation sait où sont ses pieds et sa tête', () => {
  for (const nom of Object.keys(ANIMS)) {
    const an = ANATOMY[nom];
    assert.ok(an, nom + ' : anatomie manquante');
    const r = frameRect(nom, 0);
    // les pieds et la tête doivent tomber DANS l'image, sinon chapeau et bulles
    // se retrouvent dans le vide
    assert.ok(an.feet.x >= 0 && an.feet.x <= r.dw, nom + ' : pieds hors cadre (x)');
    assert.ok(an.feet.y > 0 && an.feet.y <= r.dh, nom + ' : pieds hors cadre (y)');
    assert.ok(an.headTop >= 0 && an.headTop < an.feet.y, nom + ' : tête sous les pieds');
    assert.ok(an.headCx >= 0 && an.headCx <= r.dw, nom + ' : tête hors cadre (x)');
  }
});

test('pelages : chaque fourrure du jeu a sa déclinaison', () => {
  for (const f of FURS) {
    assert.ok(f.id in FUR_REMAP, 'pelage sans déclinaison : ' + f.id);
  }
  // le roux est la teinte d'origine du kit : aucun remap à faire
  assert.equal(FUR_REMAP.roux, null);
  for (const [id, r] of Object.entries(FUR_REMAP)) {
    if (!r) continue;
    assert.equal(r.fur.length, 5, id + ' : 5 tons de fourrure attendus');
    assert.equal(r.belly.length, 4, id + ' : 4 tons de ventre attendus');
    for (const c of [...r.fur, ...r.belly]) {
      assert.match(c, /^#[0-9a-f]{6}$/i, id + ' : couleur mal formée ' + c);
    }
  }
});

test('humeur : seule « contente » déclenche la pose joyeuse', () => {
  assert.equal(animForMood('contente'), 'happy');
  for (const m of ['neutre', 'affamee', 'boudeuse', 'malade', 'dodo', null]) {
    assert.equal(animForMood(m), 'idle', 'humeur ' + m);
  }
});

test('hors navigateur : le chargement ne casse rien et le dessin s\'abstient', () => {
  const art = loadOtterArt();          // pas d'Image sous Node
  assert.equal(art.ready, false);
  assert.deepEqual(art.sheets, {});
  // drawAnim doit rendre null plutôt que lever : le rendu retombe sur la grille
  assert.equal(drawAnim(null, art, 'idle', 0, 0, 0, 'roux', false), null);
  assert.equal(drawAnim({}, null, 'idle', 0, 0, 0, 'roux', false), null);
});
