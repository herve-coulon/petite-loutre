// La Crue (É5b) — logique pure : clé de semaine ISO, Crue déterministe par semaine,
// et surtout « deux joueurs, même semaine → même Crue » (exigence du brief).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isoWeekKey, crueOfWeek, medalFor, medalRank, bestMedal, crueReward, claimCrueRewards,
  CRUE_WEATHERS, MEDALS
} from '../src/crue.js';

test('semaine ISO : format YYYY-Www, stable sur une même semaine, change à la suivante', () => {
  // 2026-08-03 = lundi ; 2026-08-09 = dimanche → même semaine ISO
  assert.match(isoWeekKey(new Date('2026-08-03T12:00:00Z')), /^\d{4}-W\d{2}$/);
  assert.equal(isoWeekKey(new Date('2026-08-03T00:00:00Z')), isoWeekKey(new Date('2026-08-09T23:00:00Z')));
  assert.notEqual(isoWeekKey(new Date('2026-08-09T00:00:00Z')), isoWeekKey(new Date('2026-08-10T00:00:00Z')));
  // bord d'année ISO : le 2025-12-29 (lundi) appartient à la semaine 1 de 2026
  assert.equal(isoWeekKey(new Date('2025-12-29T00:00:00Z')), '2026-W01');
});

const ZONES = ['clairiere', 'foret', 'cascade', 'lac', 'gorge', 'lagon', 'mine', 'cimes'];
const SKILLS = ['charge', 'esquive', 'morsure', 'cri', 'plongeon', 'tourbillon'];

test('Crue : déterministe par semaine, et IDENTIQUE pour deux joueurs la même semaine', () => {
  const a = crueOfWeek('2026-W31', ZONES, SKILLS);
  const b = crueOfWeek('2026-W31', ZONES, SKILLS);   // « autre joueur », même semaine
  assert.deepEqual(a, b, 'même semaine → Crue identique (seed = semaine)');
  const c = crueOfWeek('2026-W32', ZONES, SKILLS);
  assert.notDeepEqual(a, c, 'semaine suivante → autre Crue');
});

test('Crue : contenu valide (lieu de la vallée, météo connue, championne renforcée, talents visibles)', () => {
  const cr = crueOfWeek('2026-W31', ZONES, SKILLS);
  assert.ok(ZONES.includes(cr.zone), 'un vrai lieu de la vallée');
  assert.ok(CRUE_WEATHERS.includes(cr.weather));
  assert.ok(cr.weatherLabel && cr.weatherLabel.length);
  assert.ok(cr.name && cr.name.length);
  assert.ok(cr.powerMult >= 1.5 && cr.powerMult <= 2.0, 'championne nettement renforcée');
  assert.ok(cr.talents.length >= 1 && cr.talents.length <= 2, 'talents visibles');
  assert.equal(new Set(cr.talents).size, cr.talents.length, 'pas de talent en double');
  assert.ok(cr.talents.every(t => SKILLS.includes(t)));
  assert.equal(cr.tiers.length, 3);
  assert.deepEqual(cr.tiers.map(t => t.medal), MEDALS);
  assert.equal(cr.seed, 'crue|2026-W31');
});

test('médailles : selon PV restants, on ne garde que la meilleure', () => {
  assert.equal(medalFor(false, 1), 'none');    // défaite = pas de médaille
  assert.equal(medalFor(true, 0.9), 'or');
  assert.equal(medalFor(true, 0.6), 'argent');
  assert.equal(medalFor(true, 0.2), 'bronze');
  assert.ok(medalRank('or') > medalRank('argent') && medalRank('argent') > medalRank('bronze'));
  assert.equal(bestMedal('bronze', 'or'), 'or');
  assert.equal(bestMedal('argent', 'bronze'), 'argent');
});

test('récompenses : matériaux + gemmes croissants, jamais de puissance', () => {
  const b = crueReward('bronze'), a = crueReward('argent'), o = crueReward('or');
  assert.ok(o.gems > a.gems && a.gems > b.gems, 'gemmes croissantes');
  assert.equal(b.dupesTier, 'commun'); assert.equal(a.dupesTier, 'rare'); assert.equal(o.dupesTier, 'epique');
  for (const r of [b, a, o]) {
    assert.ok(r.dupes >= 1, 'des matériaux d\'atelier');
    // jamais de stat/puissance dans une récompense de Crue
    assert.ok(!('atq' in r) && !('pv' in r) && !('power' in r) && !('xp' in r));
  }
  assert.deepEqual(crueReward('none'), { gems: 0, dupes: 0, dupesTier: null });
});

test('réclamation : cumulative (or crédite bronze+argent+or), une seule fois par semaine', () => {
  const prog = { week: '2026-W31', best: 'none', claimed: [] };
  const rec = { gems: 40, dupes: { commun: 3 } };
  // premier « or » : crédite les trois paliers
  const r1 = claimCrueRewards(prog, rec, 'or');
  assert.deepEqual(r1.granted, ['bronze', 'argent', 'or']);
  assert.equal(r1.gems, 3 + 6 + 12);
  assert.equal(rec.gems, 40 + 21);
  assert.equal(prog.best, 'or');
  assert.deepEqual(prog.claimed.sort(), ['argent', 'bronze', 'or']);
  assert.equal(rec.dupes.commun, 4);   // +1 (bronze) ; +rare +epique
  assert.equal(rec.dupes.rare, 1);
  assert.equal(rec.dupes.epique, 1);
  // rejouer la même semaine ne recrédite RIEN
  const r2 = claimCrueRewards(prog, rec, 'or');
  assert.deepEqual(r2.granted, []);
  assert.equal(r2.gems, 0);
  assert.equal(rec.gems, 61, 'aucune double récompense');
});

test('réclamation : progression bronze puis or ne crédite QUE les paliers manquants', () => {
  const prog = { week: '2026-W31', best: 'none', claimed: [] };
  const rec = { gems: 0, dupes: {} };
  const b = claimCrueRewards(prog, rec, 'bronze');
  assert.deepEqual(b.granted, ['bronze']);
  assert.equal(rec.gems, 3);
  // on revient plus fort : seuls argent + or restent à prendre
  const o = claimCrueRewards(prog, rec, 'or');
  assert.deepEqual(o.granted, ['argent', 'or']);
  assert.equal(rec.gems, 3 + 6 + 12);
  assert.equal(prog.best, 'or');
});
