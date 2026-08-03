// Dialogues vivants (É6) — construction de prompt & nettoyage, purs et déterministes.
// (Le repli complet sur les dialogues écrits est piloté par main.js ; ici on couvre
//  la logique sans DOM ni réseau.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDialoguePrompt, cleanDialogueLines } from '../src/dialogue.js';

test('prompt : persona de l\'habitant + contexte de l\'instant injecté', () => {
  const pnj = { nom: 'Basile', role: 'le doyen du carrefour', emoji: '🦡' };
  const msgs = buildDialoguePrompt(pnj, {
    otterName: 'Néo', trait: 'joueuse', season: 'ete', weather: 'orage',
    zoneName: 'La clairière', level: 12
  });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.match(msgs[0].content, /Basile/);
  assert.match(msgs[0].content, /le doyen du carrefour/);
  assert.match(msgs[0].content, /sans emoji/);           // garde-fou charte DA
  const u = msgs[1].content;
  for (const bit of ['Néo', 'joueuse', 'ete', 'orage', 'La clairière', '12']) assert.match(u, new RegExp(bit));
});

test('prompt : robuste aux champs manquants (jamais de crash)', () => {
  const msgs = buildDialoguePrompt(null, {});
  assert.equal(msgs.length, 2);
  assert.ok(msgs[0].content.length > 0 && msgs[1].content.length > 0);
  assert.match(msgs[1].content, /la loutre/);
});

test('nettoyage : retire guillemets, borne lignes et longueur, [] si vide', () => {
  assert.deepEqual(cleanDialogueLines('  « Bonjour, petite. »  '), ['Bonjour, petite.']);
  assert.deepEqual(cleanDialogueLines('Ligne 1\n\nLigne 2\nLigne 3'), ['Ligne 1', 'Ligne 2']); // max 2
  assert.deepEqual(cleanDialogueLines(''), []);
  assert.deepEqual(cleanDialogueLines(null), []);
  assert.deepEqual(cleanDialogueLines('   '), []);
  const long = 'a'.repeat(200);
  const out = cleanDialogueLines(long);
  assert.equal(out.length, 1);
  assert.ok(out[0].length <= 160 && out[0].endsWith('…'));
});
