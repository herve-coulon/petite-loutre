// Tests du module util.js — helpers génériques partagés (audit : déduplication).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, clamp01, fmtDur } from '../src/util.js';

test('esc : échappe les caractères HTML dangereux', () => {
  assert.equal(esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('simple'), 'simple');
  assert.equal(esc(''), '');
  assert.equal(esc(null), '');
});

test('clamp01 : borne dans [0, 1]', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(1), 1);
  assert.equal(clamp01(42), 1);
});

test('fmtDur : format compact « d j h », « h min », « min » (parité avec l\'ancien fmtShort)', () => {
  const MIN = 60000, H = 3600000, D = 86400000;
  assert.equal(fmtDur(0), '0 min');
  assert.equal(fmtDur(5 * MIN), '5 min');
  assert.equal(fmtDur(2 * H + 3 * MIN), '2 h 3 min');
  assert.equal(fmtDur(3 * D + 4 * H), '3 j 4 h');
  assert.equal(fmtDur(24 * H), '1 j 0 h');
  assert.equal(fmtDur(50 * D + 2 * H + 30 * MIN), '50 j 2 h');
});
