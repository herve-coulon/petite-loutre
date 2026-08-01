// Le ciel de la berge : SOURCE UNIQUE heure → palette (src/sky.js).
// Ces tests figent quatre heures repères (3 h, 7 h 30, 12 h, 19 h 30) et
// vérifient que CIEL et SOL racontent la même heure — la garantie qu'on ne
// reverra plus un ciel de nuit posé sur une herbe de plein jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyColors, SKY_PALETTES, mix } from '../src/sky.js';

// horloge gelée par duck-typing : indépendante du fuseau de la machine/CI
const at = (h, m = 0) => skyColors({ getHours: () => h, getMinutes: () => m });
const isHex = c => /^#[0-9a-f]{6}$/i.test(c);
const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);

test('sky : aux 4 heures repères, ciel ET sol sont des couleurs valides d\'un seul calcul', () => {
  for (const [h, m] of [[3, 0], [7, 30], [12, 0], [19, 30]]) {
    const c = at(h, m);
    for (const k of ['sky', 'hill', 'hill2', 'water', 'wave']) {
      assert.ok(isHex(c[k]), h + 'h' + m + ' : ' + k + ' invalide (' + c[k] + ')');
    }
    assert.equal(typeof c.night, 'boolean', h + 'h : night manquant');
  }
});

test('sky : 3 h = nuit, 12 h = jour — et le SOL suit le ciel', () => {
  const nuit = at(3), jour = at(12);
  assert.equal(nuit.night, true, '3 h doit être la nuit');
  assert.equal(jour.night, false, '12 h doit être le jour');
  // cohérence ciel/sol : de jour tout est plus clair que de nuit (même source)
  assert.ok(lum(jour.sky) > lum(nuit.sky), 'ciel de jour plus clair que de nuit');
  assert.ok(lum(jour.hill) > lum(nuit.hill), 'herbe de jour plus claire que de nuit');
  assert.ok(lum(jour.water) > lum(nuit.water), 'eau de jour plus claire que de nuit');
});

test('sky : 7 h 30 aube (jour), 19 h 30 crépuscule (bascule nuit)', () => {
  const aube = at(7, 30), crep = at(19, 30);
  assert.equal(aube.night, false, '7 h 30 = jour naissant');
  assert.equal(crep.night, true, '19 h 30 bascule vers la nuit');
  for (const c of [aube, crep]) {
    for (const k of ['sky', 'hill', 'water']) assert.ok(isHex(c[k]), k);
  }
});

test('sky : le ciel FOND (interpolation continue), il ne coupe pas à la minute', () => {
  const a = at(11, 59), b = at(12, 0);
  const dR = Math.abs(parseInt(a.sky.slice(1, 3), 16) - parseInt(b.sky.slice(1, 3), 16));
  assert.ok(dR < 20, 'deux instants proches → couleurs proches (pas de saut brutal)');
});

test('sky : mix borne correctement (t=0 → a, t=1 → b)', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#204060', '#204060', 0.5), '#204060');
});

test('sky : les 4 palettes repères sont des hex valides et distinctes jour/nuit', () => {
  for (const p of SKY_PALETTES) {
    for (const k of ['sky', 'hill', 'hill2', 'water', 'wave']) assert.ok(isHex(p[k]), p.h + 'h : ' + k);
  }
  // la palette de nuit (h:0) est plus sombre que celle du plein jour (h:12)
  const nuit = SKY_PALETTES.find(p => p.h === 0), jour = SKY_PALETTES.find(p => p.h === 12);
  assert.ok(lum(jour.sky) > lum(nuit.sky), 'palette jour plus claire que palette nuit');
});
