// La lignée (v4.1) — logique pure : fiche mémorial d'un ancêtre + héritage du trait.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeAncestor, inheritTrait, isRealOtter } from '../src/lineage.js';

test('makeAncestor : fiche complète et robuste aux champs manquants', () => {
  const a = makeAncestor({ name: 'Néo', trait: 'joueuse', fur: 'argent', hat: 'noeud', stage: 'adult' }, 950400000, 3);
  assert.deepEqual(a, { name: 'Néo', trait: 'joueuse', fur: 'argent', hat: 'noeud', ageMs: 950400000, generation: 3 });
  const b = makeAncestor({}, -5, 0);
  assert.equal(b.name, 'Loutre'); assert.equal(b.fur, 'roux'); assert.equal(b.trait, null);
  assert.equal(b.ageMs, 0);        // jamais négatif
  assert.equal(b.generation, 1);   // au moins la 1re génération
});

test('inheritTrait : 70 % transmet la lignée, 30 % une personnalité neuve', () => {
  assert.equal(inheritTrait('caline', () => 0.5), 'caline');   // < 0.7 → transmis
  assert.equal(inheritTrait('caline', () => 0.9), null);       // ≥ 0.7 → nouvelle (tirage au baptême)
  assert.equal(inheritTrait(null, () => 0), null);             // pas d'ancêtre → rien à transmettre
  // sur beaucoup de tirages, la transmission domine mais n'est pas totale
  let kept = 0; const N = 1000; let seed = 1;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < N; i++) if (inheritTrait('joueuse', rng) === 'joueuse') kept++;
  assert.ok(kept > N * 0.55 && kept < N * 0.85, 'autour de 70 % de transmission');
});

test('isRealOtter : une loutre nommée et éclose, pas un œuf', () => {
  assert.equal(isRealOtter({ name: 'Néo', stage: 'adult' }), true);
  assert.equal(isRealOtter({ name: 'Néo', stage: 'egg' }), false);
  assert.equal(isRealOtter({ stage: 'adult' }), false);   // sans nom
  assert.equal(isRealOtter(null), false);
});
