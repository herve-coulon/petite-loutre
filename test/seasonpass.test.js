import { test } from 'node:test';
import assert from 'node:assert';
import {
  SEASON_GIFTS, seasonGiftKey, seasonGift, giftClaimed,
  giftClaimable, claimSeasonGift, giftsCollected
} from '../src/seasonpass.js';

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

test('réclamation : nécessite d\'avoir joué (au moins un trésor de saison)', () => {
  const fresh = { treatsTotal: 0 };
  assert.ok(!giftClaimable(fresh, summer), 'pas de cadeau sans preuve de jeu');
  const played = { treatsTotal: 1 };
  assert.ok(giftClaimable(played, summer), 'jouable après un trésor récolté');
});

test('réclamation : une seule fois par saison, mais rejouable la saison suivante', () => {
  const rec = { treatsTotal: 3, seasonGifts: {} };
  const g = claimSeasonGift(rec, summer);
  assert.equal(g.id, SEASON_GIFTS.ete.id, 'on reçoit le cadeau d\'été');
  assert.ok(giftClaimed(rec, summer));
  assert.equal(claimSeasonGift(rec, summer), null, 'pas deux fois le même été');
  // une autre saison reste réclamable
  assert.ok(giftClaimable(rec, winter), 'l\'hiver a son propre cadeau');
  assert.equal(claimSeasonGift(rec, winter).id, SEASON_GIFTS.hiver.id);
  assert.equal(giftsCollected(rec), 2, 'deux cadeaux collectionnés');
});

test('robustesse : tolérant à un rec incomplet', () => {
  assert.equal(giftClaimed({}, summer), false);
  assert.equal(giftClaimable(null, summer), false);
  assert.equal(giftsCollected({}), 0);
});
