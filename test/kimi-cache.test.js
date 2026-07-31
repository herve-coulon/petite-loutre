// Tests de la génération de clés de cache Kimi (node --test, pur).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMessage, normalizeMessages, kimiCacheKey } from '../src/kimi-cache-key.js';

/* ---------------- normalizeMessage ---------------- */

test('normalizeMessage : extrait role et content', () => {
  assert.deepEqual(normalizeMessage({ role: 'user', content: 'Bonjour' }), { role: 'user', content: 'Bonjour' });
});

test('normalizeMessage : ignore les champs inutiles', () => {
  assert.deepEqual(
    normalizeMessage({ role: 'USER', content: '  Salut  ', extra: 'ignored' }),
    { role: 'user', content: 'Salut' }
  );
});

test('normalizeMessage : null si role ou content manquant', () => {
  assert.equal(normalizeMessage({ role: 'user' }), null);
  assert.equal(normalizeMessage({ content: 'Bonjour' }), null);
  assert.equal(normalizeMessage(null), null);
  assert.equal(normalizeMessage({ role: '', content: 'Bonjour' }), null);
  assert.equal(normalizeMessage({ role: 'user', content: '' }), null);
});

/* ---------------- normalizeMessages ---------------- */

test('normalizeMessages : filtre les messages invalides', () => {
  const messages = [
    { role: 'user', content: 'Salut' },
    null,
    { role: '', content: 'vide' },
    { role: 'assistant', content: '   ' }
  ];
  assert.deepEqual(normalizeMessages(messages), [{ role: 'user', content: 'Salut' }]);
});

/* ---------------- kimiCacheKey ---------------- */

test('kimiCacheKey : stable pour le même prompt', async () => {
  const messages = [{ role: 'user', content: 'Bonjour' }];
  const a = await kimiCacheKey(messages);
  const b = await kimiCacheKey(messages);
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('kimiCacheKey : change quand le contenu change', async () => {
  const a = await kimiCacheKey([{ role: 'user', content: 'Bonjour' }]);
  const b = await kimiCacheKey([{ role: 'user', content: 'Salut' }]);
  assert.notEqual(a, b);
});

test('kimiCacheKey : change quand les paramètres changent', async () => {
  const messages = [{ role: 'user', content: 'Bonjour' }];
  const a = await kimiCacheKey(messages, { temperature: 0.7 });
  const b = await kimiCacheKey(messages, { temperature: 0.8 });
  assert.notEqual(a, b);
});

test('kimiCacheKey : insensible aux espaces superflus', async () => {
  const a = await kimiCacheKey([{ role: '  USER  ', content: '  Bonjour  ' }]);
  const b = await kimiCacheKey([{ role: 'user', content: 'Bonjour' }]);
  assert.equal(a, b);
});
