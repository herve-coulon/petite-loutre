import { test } from 'node:test';
import assert from 'node:assert';
import {
  SEASON_GIFTS, seasonGiftKey, seasonGift, giftClaimed,
  giftClaimable, claimSeasonGift, giftsCollected, addSeasonTreat
} from '../src/seasonpass.js';
import { loadRecords, REC_KEY } from '../src/state.js';

// Dates repères (mois 0 = janvier) : chaque saison a son cadeau.
const spring = new Date(2026, 3, 15);  // avril
const summer = new Date(2026, 6, 15);  // juillet
const winter = new Date(2026, 0, 15);  // janvier

test('cadeaux : un par saison, avec id/emoji/nom', () => {
  for (const k of ['printemps', 'ete', 'automne', 'hiver']) {
    assert.ok(SEASON_GIFTS[k] && SEASON_GIFTS[k].id && SEASON_GIFTS[k].emoji && SEASON_GIFTS[k].name);
  }
  assert.equal(seasonGift(summer).id, SEASON_GIFTS.ete.id);
});

test('clé : dépend de la saison ET de l\'année', () => {
  assert.equal(seasonGiftKey(summer), 'ete-2026');
  assert.equal(seasonGiftKey(spring), 'printemps-2026');
  assert.notEqual(seasonGiftKey(new Date(2027, 6, 1)), seasonGiftKey(summer), 'année suivante = nouvelle clé');
});

test('réclamation : nécessite d\'avoir joué CETTE saison (pas le total à vie)', () => {
  const fresh = { treatsBySeason: {} };
  assert.ok(!giftClaimable(fresh, summer), 'pas de cadeau sans preuve de jeu');
  const played = {}; addSeasonTreat(played, 1, summer);
  assert.ok(giftClaimable(played, summer), 'jouable après un trésor récolté cet été');
});

test('bug corrigé : une nouvelle saison n\'est PAS réclamable avant d\'y avoir joué', () => {
  // on joue l'été (treatsTotal monte), on prend le cadeau d'été…
  const rec = {}; addSeasonTreat(rec, 3, summer);
  claimSeasonGift(rec, summer);
  // …l'hiver arrive : bien que treatsTotal > 0, le cadeau d'hiver reste bloqué
  assert.ok(rec.treatsTotal >= 3, 'le total à vie est bien > 0');
  assert.ok(!giftClaimable(rec, winter), 'l\'hiver n\'est pas offert sur la foi de l\'été');
  // il faut récolter EN HIVER pour l'obtenir
  addSeasonTreat(rec, 1, winter);
  assert.ok(giftClaimable(rec, winter), 'réclamable une fois l\'hiver joué');
});

test('réclamation : une seule fois par saison, mais rejouable la saison suivante', () => {
  const rec = {};
  addSeasonTreat(rec, 3, summer);
  addSeasonTreat(rec, 1, winter);
  const g = claimSeasonGift(rec, summer);
  assert.equal(g.id, SEASON_GIFTS.ete.id, 'on reçoit le cadeau d\'été');
  assert.ok(giftClaimed(rec, summer));
  assert.equal(claimSeasonGift(rec, summer), null, 'pas deux fois le même été');
  assert.ok(giftClaimable(rec, winter), 'l\'hiver a son propre cadeau');
  assert.equal(claimSeasonGift(rec, winter).id, SEASON_GIFTS.hiver.id);
  assert.equal(giftsCollected(rec), 2, 'deux cadeaux collectionnés');
});

test('addSeasonTreat : compte le total à vie ET la saison courante', () => {
  const rec = {};
  addSeasonTreat(rec, 2, summer);
  addSeasonTreat(rec, 1, winter);
  assert.equal(rec.treatsTotal, 3, 'total à vie cumulé');
  assert.equal(rec.treatsBySeason[seasonGiftKey(summer)], 2, 'été compté à part');
  assert.equal(rec.treatsBySeason[seasonGiftKey(winter)], 1, 'hiver compté à part');
});

test('migration douce : vieille save en cours de saison garde son cadeau (one-shot)', () => {
  const store = (rec) => ({ getItem: k => k === REC_KEY ? JSON.stringify(rec) : null, setItem() {}, removeItem() {} });
  // vieille save v1 : a des trésors (a joué) mais AUCUN treatsBySeason
  const migre = loadRecords(store({ v: 1, treatsTotal: 4 }));
  assert.equal(typeof migre.treatsBySeason, 'object', 'champ normalisé');
  assert.ok(giftClaimable(migre), 'saison courante créditée : le cadeau n\'est pas volé');
  // vieille save SANS trésor : rien n'est crédité
  const vierge = loadRecords(store({ v: 1, treatsTotal: 0 }));
  assert.deepEqual(vierge.treatsBySeason, {}, 'aucun crédit sans preuve de jeu');
  assert.ok(!giftClaimable(vierge), 'pas de cadeau offert à une save neuve');
});

test('robustesse : tolérant à un rec incomplet', () => {
  assert.equal(giftClaimed({}, summer), false);
  assert.equal(giftClaimable(null, summer), false);
  assert.equal(giftsCollected({}), 0);
});
