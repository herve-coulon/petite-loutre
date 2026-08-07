// Dialogues vivants (v3.95) — génération LOCALE seedée, pure et déterministe.
// Plus d'appel LLM : la salutation garde la voix de l'habitant + une remarque de
// l'instant, seedée par le jour+lieu.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { livingLine, contextRemark } from '../src/dialogue.js';

const BASILE = { nom: 'Basile', mots: ['Tout le monde passe par ici, petite.', 'Une vallée, ça se lit comme une piste.'] };

test('livingLine : 1-2 lignes, voix de l\'habitant + remarque, {name} interpolé', () => {
  const lines = livingLine(BASILE, { otterName: 'Néo', weather: 'orage', season: 'ete' }, '2026-08-03|clairiere');
  assert.ok(lines.length >= 1 && lines.length <= 2);
  assert.ok(BASILE.mots.includes(lines[0]), 'la 1re ligne est une réplique signature de l\'habitant');
  assert.ok(lines[1] && lines[1].length > 0, 'une remarque de l\'instant suit');
  assert.ok(!lines.join(' ').includes('{name}'), 'le gabarit {name} est bien rempli');
});

test('livingLine : déterministe (même pnj+ctx+seed → identique), varie selon le jour', () => {
  const ctx = { otterName: 'Néo', weather: 'pluie', season: 'ete' };
  const a = livingLine(BASILE, ctx, '2026-08-03|clairiere');
  const b = livingLine(BASILE, ctx, '2026-08-03|clairiere');
  assert.deepEqual(a, b, 'même jour/lieu → même salutation (stable dans la journée)');
  // au moins un jour de la semaine change la salutation (variété réelle)
  const variants = new Set();
  for (const d of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']) {
    variants.add(livingLine(BASILE, ctx, d + '|clairiere').join('¶'));
  }
  assert.ok(variants.size >= 2, 'la salutation varie d\'un jour à l\'autre');
});

test('remarque contextuelle : météo prioritaire, saison en repli, générique sinon — sans emoji', () => {
  const rng = () => 0;   // rng déterministe : prend toujours le 1er élément
  const parWeather = contextRemark({ weather: 'canicule', season: 'hiver' }, rng);
  assert.match(parWeather, /chaleur|soleil|cagnard/i, 'la météo prime sur la saison');
  const parSaison = contextRemark({ season: 'hiver' }, rng);           // pas de météo
  assert.match(parSaison, /hiver|froid/i);
  const generique = contextRemark({}, rng);                            // ni météo ni saison
  assert.ok(generique && generique.length > 0);
  // charte DA : jamais d'emoji dans ces remarques
  for (const w of ['orage', 'pluie', 'canicule', 'neige', 'clair']) {
    const line = contextRemark({ weather: w }, rng);
    assert.ok(!/\p{Extended_Pictographic}/u.test(line), 'pas d\'emoji dans « ' + w + ' »');
  }
});

test('robustesse : pnj/ctx vides ne plantent pas', () => {
  const lines = livingLine(null, null, 'x');
  assert.ok(lines.length >= 1 && lines[0].length > 0);
});
