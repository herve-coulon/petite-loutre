import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEST_POOL, dailyQuests, isEligible, ensureDaily, bumpQuest, completedQuests, dayKey
} from '../src/quests.js';

/* ── isEligible ────────────────────────────────────────────────────────── */

describe('isEligible', () => {
  it('sans need : toujours éligible', () => {
    assert.ok(isEligible({ id: 'a' }, null));
    assert.ok(isEligible({ id: 'a', need: undefined }, { level: 1 }));
  });

  it('need.level : blocage sous le seuil', () => {
    const q = { id: 'b', need: { level: 10 } };
    assert.ok(!isEligible(q, { level: 1 }));
    assert.ok(!isEligible(q, { level: 9 }));
    assert.ok(isEligible(q, { level: 10 }));
    assert.ok(isEligible(q, { level: 20 }));
  });

  it('need.feature : exige la présence dans unlocked', () => {
    const q = { id: 'c', need: { feature: 'battle' } };
    assert.ok(!isEligible(q, { level: 1, unlocked: [] }));
    assert.ok(isEligible(q, { level: 1, unlocked: ['battle'] }));
    assert.ok(isEligible(q, { level: 1, unlocked: ['slide', 'battle'] }));
  });

  it('need.world : exige d\'être dans le monde', () => {
    const q = { id: 'd', need: { world: true } };
    assert.ok(!isEligible(q, { level: 5, world: false }));
    assert.ok(isEligible(q, { level: 5, world: true }));
  });

  it('besoin combiné (level + feature)', () => {
    const q = { id: 'e', need: { level: 10, feature: 'battle' } };
    assert.ok(!isEligible(q, { level: 5, unlocked: ['battle'], world: true }));
    assert.ok(!isEligible(q, { level: 10, unlocked: [], world: true }));
    assert.ok(isEligible(q, { level: 10, unlocked: ['battle'], world: true }));
  });
});

/* ── Pool de quêtes ────────────────────────────────────────────────────── */

describe('QUEST_POOL', () => {
  it('au moins 20 entrées', () => {
    assert.ok(QUEST_POOL.length >= 20, 'pool size = ' + QUEST_POOL.length);
  });

  it('toutes les entrées ont les champs requis', () => {
    for (const q of QUEST_POOL) {
      assert.ok(q.id, 'id manquant');
      assert.ok(q.icon, 'icon manquante pour ' + q.id);
      assert.ok(q.label, 'label manquant pour ' + q.id);
      assert.ok(q.key, 'key manquante pour ' + q.id);
      assert.ok(q.target > 0, 'target invalide pour ' + q.id);
    }
  });

  it('ids uniques', () => {
    const ids = QUEST_POOL.map(q => q.id);
    assert.equal(new Set(ids).size, ids.length, 'doublon dans les ids');
  });
});

/* ── dailyQuests : déterminisme ────────────────────────────────────────── */

describe('dailyQuests', () => {
  it('même date + même ctx = mêmes quêtes', () => {
    const a = dailyQuests('2026-07-25', { level: 1, unlocked: [], world: false });
    const b = dailyQuests('2026-07-25', { level: 1, unlocked: [], world: false });
    assert.deepEqual(a.map(q => q.id), b.map(q => q.id));
  });

  it('date différente → généralement des quêtes différentes', () => {
    const a = dailyQuests('2026-07-25', { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true });
    const b = dailyQuests('2026-07-26', { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true });
    const sameCount = a.filter((q, i) => q.id === b[i]?.id).length;
    assert.ok(sameCount < 3, 'les deux jours donnent les mêmes 3 quêtes');
  });

  it('toujours 3 quêtes', () => {
    for (let d = 1; d <= 30; d++) {
      const date = '2026-08-' + String(d).padStart(2, '0');
      const qs = dailyQuests(date, { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true });
      assert.equal(qs.length, 3, date);
    }
  });

  it('ctx optionnel (défaut permissif) : pas d\'erreur', () => {
    const qs = dailyQuests('2026-07-25');
    assert.equal(qs.length, 3);
  });

  it('trois activités DISTINCTES : jamais deux quêtes de même clé le même jour', () => {
    for (let d = 1; d <= 60; d++) {
      const date = '2026-09-' + String((d % 30) + 1).padStart(2, '0') + '-' + d;
      const qs = dailyQuests(date, { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true });
      const keys = qs.map(q => q.key);
      assert.equal(new Set(keys).size, keys.length, 'clés dupliquées le ' + date + ' : ' + keys.join(','));
    }
  });
});

/* ── dailyQuests : jamais d\'inéligible dans le résultat ───────────────── */

describe('dailyQuests filtrage', () => {
  it('niveau 1 : aucune quête nécessitant un niveau > 1', () => {
    const ctx = { level: 1, unlocked: [], world: false };
    for (let d = 1; d <= 60; d++) {
      const date = '2026-09-' + String(d).padStart(2, '0');
      const qs = dailyQuests(date, ctx);
      for (const q of qs) {
        if (q.need && q.need.level) {
          assert.ok(q.need.level <= 1,
            q.id + ' (need.level=' + q.need.level + ') ne devrait pas apparaître au niv 1, date=' + date);
        }
        if (q.need && q.need.feature) {
          assert.ok(ctx.unlocked.includes(q.need.feature),
            q.id + ' (need.feature=' + q.need.feature + ') ne devrait pas apparaître sans unlock, date=' + date);
        }
        if (q.need && q.need.world) {
          assert.ok(ctx.world,
            q.id + ' (need.world) ne devrait pas apparaître hors du monde, date=' + date);
        }
      }
    }
  });

  it('niveau 20, monde ouvert, toutes features : toutes éligibles', () => {
    const ctx = { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true };
    for (let d = 1; d <= 30; d++) {
      const date = '2026-10-' + String(d).padStart(2, '0');
      const qs = dailyQuests(date, ctx);
      assert.equal(qs.length, 3, date);
      for (const q of qs) {
        assert.ok(isEligible(q, ctx),
          q.id + ' devrait être éligible au niv 20, date=' + date);
      }
    }
  });

  it('monde fermé : aucune quête need.world', () => {
    const ctx = { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: false };
    for (let d = 1; d <= 30; d++) {
      const date = '2026-11-' + String(d).padStart(2, '0');
      const qs = dailyQuests(date, ctx);
      for (const q of qs) {
        assert.ok(!q.need || !q.need.world,
          q.id + ' (need.world) ne devrait pas apparaître hors du monde');
      }
    }
  });

  it('remplacement déterministe : même ctx = même résultat même si des quêtes sont filtrées', () => {
    const ctx1 = { level: 3, unlocked: ['slide'], world: false };
    const ctx2 = { level: 3, unlocked: ['slide'], world: false };
    for (let d = 1; d <= 30; d++) {
      const date = '2026-12-' + String(d).padStart(2, '0');
      const a = dailyQuests(date, ctx1);
      const b = dailyQuests(date, ctx2);
      assert.deepEqual(a.map(q => q.id), b.map(q => q.id), date);
    }
  });

  it('ctx différent peut donner un résultat différent (preuve de filtrage)', () => {
    // Trouver une date où le tirage sans filtre contient au moins une quête monde
    const ctxNoWorld = { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: false };
    const ctxWorld = { level: 20, unlocked: ['treat', 'slide', 'dive', 'battle'], world: true };
    let foundDiff = false;
    for (let d = 1; d <= 60; d++) {
      const date = '2026-01-' + String(d).padStart(2, '0');
      const a = dailyQuests(date, ctxNoWorld);
      const b = dailyQuests(date, ctxWorld);
      if (a.map(q => q.id).join() !== b.map(q => q.id).join()) {
        foundDiff = true;
        break;
      }
    }
    assert.ok(foundDiff, 'au moins une date devrait donner des résultats différents avec/without monde');
  });
});

/* ── Compatibilité backward : completedQuests sans ctx ─────────────────── */

describe('completedQuests', () => {
  it('fonctionne sans ctx (rétrocompatibilité)', () => {
    const s = { qDaily: { date: '2026-07-25', progress: { meals: 3 }, done: [] } };
    const rec = { questsDone: 0 };
    const got = completedQuests(s, rec);
    // On ne peut pas prédire quelles quêtes sont tirées, mais la fonction ne plante pas
    assert.ok(Array.isArray(got));
  });

  it('fonctionne avec ctx', () => {
    // La date doit être CELLE DU JOUR : completedQuests appelle ensureDaily, qui
    // réinitialise la journée si sa date ne correspond pas à `now`. Coder une
    // date en dur cassait le test tous les jours sauf un. On se cale sur
    // aujourd'hui pour rester déterministe quelle que soit la date d'exécution.
    const now = Date.now();
    const date = dayKey(now);
    const ctx = { level: 1, unlocked: [], world: false };
    const qs = dailyQuests(date, ctx);
    // On remplit la progress pour toutes les quêtes tirées
    const s = { qDaily: { date, progress: {}, done: [] } };
    for (const q of qs) s.qDaily.progress[q.key] = q.target + 10;
    const rec = { questsDone: 0 };
    const got = completedQuests(s, rec, now, ctx);
    assert.equal(got.length, 3, 'les 3 quêtes devraient être terminées');
    assert.equal(rec.questsDone, 3);
  });

  it('ctx bas niveau : seules les quêtes éligibles sont vérifiées', () => {
    const date = '2026-07-26';
    const ctx = { level: 1, unlocked: [], world: false };
    const qs = dailyQuests(date, ctx);
    assert.equal(qs.length, 3);
    // Toutes les quêtes tirées au niv 1 sont éligibles
    for (const q of qs) {
      assert.ok(isEligible(q, ctx), q.id + ' devrait être éligible au niv 1');
    }
  });
});
