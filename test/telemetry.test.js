// Tests télémétrie privacy-first (node --test, zéro dépendance DOM/fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newState, loadState } from '../src/state.js';
import { canSendTelemetry, featuresSeen, telemetryPayload, newTelemetryId } from '../src/telemetry.js';
import { levelFromXp, xpCost } from '../src/level.js';

const T0 = 1_750_000_000_000;

/* ---------------- newTelemetryId ---------------- */

test('newTelemetryId : 16 caractères hexadécimaux', () => {
  const id = newTelemetryId();
  assert.equal(id.length, 16);
  assert.ok(/^[0-9a-f]{16}$/.test(id), 'format hex valide');
});

test('newTelemetryId : deux appels donnent des IDs différents', () => {
  const a = newTelemetryId();
  const b = newTelemetryId();
  assert.notEqual(a, b, 'probabilité quasi nulle de collision');
});

/* ---------------- canSendTelemetry ---------------- */

test('canSendTelemetry : false si pas de nom (œuf)', () => {
  const s = newState(T0);
  assert.equal(canSendTelemetry(s), false, 'œuf sans nom');
});

test('canSendTelemetry : false si telemetry désactivée', () => {
  const s = newState(T0);
  s.name = 'Test'; s.stage = 'baby'; s.telemetryId = 'abc123';
  s.telemetry = false;
  assert.equal(canSendTelemetry(s), false, 'telemetry off');
});

test('canSendTelemetry : false si pas de telemetryId', () => {
  const s = newState(T0);
  s.name = 'Test'; s.stage = 'baby';
  s.telemetryId = null;
  assert.equal(canSendTelemetry(s), false, 'pas d\'ID');
});

test('canSendTelemetry : true si tout est bon', () => {
  const s = newState(T0);
  s.name = 'Test'; s.stage = 'baby'; s.telemetryId = 'abc123';
  s.telemetry = true;
  assert.equal(canSendTelemetry(s), true);
});

test('canSendTelemetry : false si stage egg même avec nom', () => {
  const s = newState(T0);
  s.name = 'Test'; s.stage = 'egg'; s.telemetryId = 'abc123';
  s.telemetry = true;
  assert.equal(canSendTelemetry(s), false, 'œuf nommé');
});

/* ---------------- featuresSeen ---------------- */

test('featuresSeen : baby niv 1 → juste care', () => {
  const s = newState(T0); s.stage = 'baby';
  const rec = { visited: [], recruited: [], streakCount: 0, treasures: 0, questsDone: 0, wins: 0 };
  const f = featuresSeen(s, rec, 1);
  assert.deepEqual(f, ['care']);
});

test('featuresSeen : niveau 2 → care + treats', () => {
  const s = newState(T0); s.stage = 'baby';
  const rec = { visited: [], recruited: [], streakCount: 0, treasures: 0, questsDone: 0, wins: 0 };
  const f = featuresSeen(s, rec, 2);
  assert.ok(f.includes('care'));
  assert.ok(f.includes('treats'));
});

test('featuresSeen : niveau 10 → care, treats, slide, dive, battle', () => {
  const s = newState(T0); s.stage = 'adult';
  const rec = { visited: [], recruited: [], streakCount: 0, treasures: 0, questsDone: 0, wins: 0 };
  const f = featuresSeen(s, rec, 10);
  assert.ok(f.includes('care'));
  assert.ok(f.includes('treats'));
  assert.ok(f.includes('slide'));
  assert.ok(f.includes('dive'));
  assert.ok(f.includes('battle'));
  assert.ok(!f.includes('world'), 'pas de visits');
});

test('featuresSeen : avec streak, victories, trésors → streak + wins + treasures', () => {
  const s = newState(T0); s.stage = 'adult';
  const rec = { visited: ['berge'], recruited: ['kiwi'], streakCount: 5, treasures: 2, questsDone: 3, wins: 1 };
  const f = featuresSeen(s, rec, 1);
  assert.ok(f.includes('streak'));
  assert.ok(f.includes('wins'));
  assert.ok(f.includes('treasures'));
  assert.ok(f.includes('quests'));
  assert.ok(f.includes('world'));
  assert.ok(f.includes('recruit'));
});

/* ---------------- telemetryPayload ---------------- */

test('telemetryPayload : structure correcte', () => {
  const s = newState(T0);
  s.name = 'Lila'; s.stage = 'baby'; s.telemetryId = 'abcdef1234567890';
  const rec = { streakCount: 7, visited: ['berge'], recruited: [], treasures: 0, questsDone: 0, wins: 0 };
  const fixedDay = () => '2026-07-25';
  const p = telemetryPayload(s, rec, 3, fixedDay);
  assert.equal(p.id, 'abcdef1234567890');
  assert.equal(p.day, '2026-07-25');
  assert.equal(p.level, 3);
  assert.equal(p.streak, 7);
  assert.ok(Array.isArray(p.features));
  assert.ok(p.features.includes('care'));
});

/* ---------------- migration (state.js) ---------------- */

test('migration : vieille save sans telemetry reçoit les champs par défaut', () => {
  const old = newState(T0);
  delete old.telemetry;
  delete old.telemetryId;
  delete old.lastTelemetryDay;
  const mem = { petite_loutre_v2: JSON.stringify(old) };
  const storage = { getItem: k => mem[k] ?? null, setItem: () => {}, removeItem: () => {} };
  const back = loadState(storage);
  assert.equal(back.telemetry, true, 'opt-in par défaut');
  assert.equal(back.telemetryId, null, 'ID pas encore généré');
  assert.equal(back.lastTelemetryDay, null, 'pas encore envoyé');
});

test('migration : save existante avec telemetry=false conservé', () => {
  const old = newState(T0);
  old.telemetry = false;
  old.telemetryId = 'preexisting';
  const mem = { petite_loutre_v2: JSON.stringify(old) };
  const storage = { getItem: k => mem[k] ?? null, setItem: () => {}, removeItem: () => {} };
  const back = loadState(storage);
  assert.equal(back.telemetry, false, 'opt-out conservé');
  assert.equal(back.telemetryId, 'preexisting');
});
