// Techniques de combat et progression : le duel est dur, mais JOUER doit
// mesurablement rapprocher du niveau. Ces tests fixent ce contrat par la mesure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUES, techniqueById, unlockedTechniques, combatBuffs } from '../src/skills.js';
import { newBattle, playTurn, makeFighter, wildFoe, foeIntent } from '../src/battle.js';
import { newState } from '../src/state.js';
import { equipBonus, FURS } from '../src/skins.js';
import { HATS } from '../src/accessories.js';
import { ITEMS } from '../src/items.js';
import { COFFRE_ZONES, EPREUVE_ZONES } from '../src/tilemap.js';

const T0 = 1700000000000;
const base = () => Object.assign(newState(T0), { stage: 'adult', health: 90, fun: 70, energy: 60 });

test('techniques : définitions complètes, identifiants uniques, effets connus', () => {
  const vus = new Set();
  const effetsConnus = new Set([
    'riposte', 'force', 'encaisse', 'elanDepart', 'elanMax', 'perceeForce', 'secondSouffle'
  ]);
  for (const t of TECHNIQUES) {
    for (const champ of ['id', 'icon', 'name', 'cond', 'desc']) {
      assert.ok(t[champ] && t[champ].length, t.id + ' : ' + champ + ' manquant');
    }
    assert.equal(typeof t.test, 'function', t.id + ' : pas de condition');
    assert.equal(vus.has(t.id), false, 'technique en double : ' + t.id);
    vus.add(t.id);
    const cles = Object.keys(t.effet || {});
    assert.ok(cles.length, t.id + ' : effet vide');
    // un effet non reconnu par combatBuffs serait silencieusement ignoré
    for (const k of cles) assert.ok(effetsConnus.has(k), t.id + ' : effet inconnu « ' + k + ' »');
    assert.equal(techniqueById(t.id), t);
  }
});

test('techniques : aucune n\'est acquise au départ, toutes le sont au bout du chemin', () => {
  assert.deepEqual(unlockedTechniques({}), [], 'rien de gratuit au premier jour');
  const complet = {
    wins: 100, battles: 200, xp: 500000,
    chests: [...COFFRE_ZONES], epreuves: [...EPREUVE_ZONES]
  };
  assert.equal(unlockedTechniques(complet).length, TECHNIQUES.length, 'tout doit être atteignable');
});

test('techniques : les effets se cumulent sans s\'écraser', () => {
  const b = combatBuffs({ wins: 100, battles: 200, xp: 500000,
    chests: [...COFFRE_ZONES], epreuves: [...EPREUVE_ZONES] });
  assert.ok(b.riposte > 1 && b.force > 1 && b.encaisse < 1);
  assert.ok(b.elanDepart >= 1 && b.elanMax >= 4);
  assert.ok(b.perceeForce > 0.5, 'la percée doit dépasser la valeur de base');
  assert.equal(b.secondSouffle, true);
});

test('équipement : chapeaux, pelages et légendaires pèsent en duel', () => {
  // sans cela on collectionnait des objets sans effet sur les combats
  const combat = o => ['pv', 'atq', 'vit'].some(k => o.bonus && o.bonus[k]);
  for (const h of HATS) assert.ok(combat(h), 'chapeau sans valeur de duel : ' + h.id);
  for (const f of FURS) {
    if (f.id === 'roux') continue;                 // le pelage d'origine reste neutre
    assert.ok(combat(f), 'pelage sans valeur de duel : ' + f.id);
  }
  for (const it of ITEMS.filter(i => i.rarity === 'legendaire')) {
    assert.ok(combat(it), 'légendaire sans valeur de duel : ' + it.id);
  }
});

test('équipement : s\'équiper rend réellement plus fort', () => {
  const nue = makeFighter(base());
  const paree = makeFighter(Object.assign(base(), { hat: 'laurier', fur: 'tresor', gear: 'coeur' }),
    equipBonus(Object.assign(base(), { hat: 'laurier', fur: 'tresor', gear: 'coeur' })));
  assert.ok(paree.maxHp > nue.maxHp, 'les PV doivent monter');
  assert.ok(paree.atk > nue.atk, 'l\'attaque doit monter');
});

/** Duels simulés contre une championne de force donnée, joueur au rythme mécanique. */
function tauxContreChampionne(rec, equip, force, n = 60) {
  const me = Object.assign(base(), equip);
  const bonus = equipBonus(me), buffs = combatBuffs(rec);
  let w = 0;
  for (let i = 0; i < n; i++) {
    // la championne se cale sur la loutre NUE : c'est ce qui laisse l'équipement compter
    const carte = wildFoe(20, 'gardienne|test', makeFighter(me));
    const b = newBattle(me, carte, 'g' + i, { bonus, buffs, foeMult: force });
    for (let t = 0; t < 60 && !b.over; t++) playTurn(b, ['elan', 'frappe', 'esquive'][t % 3]);
    if (b.winner === 'me') w++;
  }
  return w / n;
}

test('progression : jouer davantage franchit des championnes de plus en plus dures', () => {
  const debutante = { rec: {}, eq: {} };
  const assidue = {
    rec: { wins: 20, battles: 40, epreuves: ['a', 'b', 'c'], chests: ['a', 'b', 'c', 'd'] },
    eq: { fur: 'braise', hat: 'couronne', gear: 'cristal' }
  };
  const maitresse = {
    rec: { wins: 40, battles: 80, xp: 400000,
      epreuves: [...EPREUVE_ZONES], chests: [...COFFRE_ZONES] },
    eq: { fur: 'tresor', hat: 'laurier', gear: 'coeur' }
  };
  // la plus douce des championnes (0,95) reste hors de portée sans rien
  assert.ok(tauxContreChampionne(debutante.rec, debutante.eq, 0.95) < 0.5,
    'une débutante ne doit pas franchir une épreuve en jouant machinalement');
  // à mi-parcours on passe les premières, pas les dernières
  assert.ok(tauxContreChampionne(assidue.rec, assidue.eq, 1.05) > 0.5, 'les premières doivent tomber');
  assert.ok(tauxContreChampionne(assidue.rec, assidue.eq, 1.45) < 0.5, 'la dernière doit résister');
  // au bout du chemin, tout passe sauf la plus dure
  assert.ok(tauxContreChampionne(maitresse.rec, maitresse.eq, 1.30) > 0.5,
    'une loutre pleinement équipée doit franchir les avant-dernières');
});

test('progression : le point d\'entrée reste ouvert (on peut gagner ses premiers duels)', () => {
  // sans cela rien ne se débloquerait jamais : la progression serait verrouillée
  const me = base();
  const bonus = equipBonus(me), buffs = combatBuffs({});
  const contre = { frappe: 'esquive', esquive: 'elan', elan: 'frappe' };
  let w = 0;
  for (let i = 0; i < 60; i++) {
    const carte = wildFoe(8, 'wild|' + i, makeFighter(me, bonus));
    const b = newBattle(me, carte, 'w' + i, { bonus, buffs });
    for (let t = 0; t < 60 && !b.over; t++) playTurn(b, contre[foeIntent(b)]);
    if (b.winner === 'me') w++;
  }
  assert.ok(w / 60 > 0.5, 'un duel ordinaire doit être gagnable sans aucune technique');
});

test('duel : la difficulté de l\'adversaire porte sur ses STATS, pas sur ses jauges', () => {
  // les jauges sont plafonnées à 100 : un multiplicateur y saturait, et les
  // « championnes » n'étaient guère plus fortes qu'une sauvage ordinaire
  const carte = { name: 'X', stage: 'adult', health: 100, fun: 100, energy: 80 };
  const normal = newBattle(base(), carte, 'g');
  const dure = newBattle(base(), carte, 'g', { foeMult: 1.45 });
  assert.ok(dure.foe.maxHp > normal.foe.maxHp * 1.4, 'les PV doivent vraiment monter');
  assert.ok(dure.foe.atk > normal.foe.atk * 1.4, 'l\'attaque aussi');
});

test('technique : le départ lancé donne bien un cran d\'élan d\'entrée', () => {
  const sec = newBattle(base(), { name: 'X', stage: 'adult' }, 'g');
  assert.equal(sec.me.elan, 0);
  const lance = newBattle(base(), { name: 'X', stage: 'adult' }, 'g', { buffs: { elanDepart: 1 } });
  assert.equal(lance.me.elan, 1);
  assert.equal(lance.foe.elan, 0, 'l\'adversaire n\'en profite pas');
});
