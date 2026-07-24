// Techniques de combat et progression : le duel est dur, mais JOUER doit
// mesurablement rapprocher du niveau. Ces tests fixent ce contrat par la mesure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNIQUES, techniqueById, unlockedTechniques, combatBuffs } from '../src/skills.js';
import { newBattle, stepBattle, duelInput, makeFighter, wildFoe } from '../src/battle.js';
import { newState } from '../src/state.js';
import { equipBonus, FURS } from '../src/skins.js';
import { HATS } from '../src/accessories.js';
import { ITEMS } from '../src/items.js';
import { COFFRE_ZONES, EPREUVE_ZONES } from '../src/tilemap.js';

const T0 = 1700000000000;
const base = () => Object.assign(newState(T0), { stage: 'adult', health: 90, fun: 70, energy: 60 });

/** Joue un duel réflexe entier, joueur simulé parant avec un décalage fixe (ms). */
function simulate(b, offset) {
  let t = 0; const DT = 16; let aimed = null;
  while (!b.over && t < 90000) {
    t += DT; stepBattle(b, t);
    if (b.phase === 'wind') {
      if (aimed === null) aimed = b.impactAt + offset;
      if (t >= aimed && t < aimed + DT) { duelInput(b, 'parry', t); aimed = null; }
    } else if (b.phase === 'opening') { duelInput(b, 'strike', t); }
    else { aimed = null; }
  }
  return b;
}

test('techniques : définitions complètes, identifiants uniques, effets connus', () => {
  const vus = new Set();
  const effetsConnus = new Set([
    'riposte', 'force', 'frappe', 'encaisse', 'fenetre', 'comboDepart', 'secondSouffle',
    'pad', 'duree', 'amorti'
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
    wins: 100, battles: 200, xp: 500000, gamesTotal: 40, slidesTotal: 40,
    chests: [...COFFRE_ZONES], epreuves: [...EPREUVE_ZONES]
  };
  assert.equal(unlockedTechniques(complet).length, TECHNIQUES.length, 'tout doit être atteignable');
});

test('techniques : les effets se cumulent sans s\'écraser', () => {
  const b = combatBuffs({ wins: 100, battles: 200, xp: 500000,
    chests: [...COFFRE_ZONES], epreuves: [...EPREUVE_ZONES] });
  assert.ok(b.riposte > 1 && b.force > 1 && b.encaisse < 1);
  assert.ok(b.frappe > 1, 'la percée renforce la frappe d\'ouverture');
  assert.ok(b.fenetre > 1, 'la maîtrise élargit la fenêtre de parade');
  assert.ok(b.comboDepart >= 1, 'le départ lancé donne un cran de combo');
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

/**
 * Taux de victoire d'un joueur de PRÉCISION FIXE (même décalage de parade)
 * contre une championne de force donnée. À talent égal, seuls l'équipement et
 * les techniques bougent l'aiguille — c'est ce que ces tests mesurent.
 */
function taux(rec, equip, foeMult, offset, n = 40) {
  const me = Object.assign(base(), equip);
  const bonus = equipBonus(me), buffs = combatBuffs(rec);
  let w = 0;
  for (let i = 0; i < n; i++) {
    // la championne se cale sur la loutre NUE : c'est ce qui laisse l'équipement compter
    const carte = wildFoe(20, 'gardienne|' + i, makeFighter(me));
    const b = newBattle(me, carte, 'g' + i, { now: 0, level: 20, foeMult, bonus, buffs });
    if (simulate(b, offset).winner === 'me') w++;
  }
  return w / n;
}

test('progression : à talent égal, s\'équiper et s\'aguerrir fait franchir de plus haut', () => {
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
  // même joueur (parade à ~150 ms de l'impact : correcte mais pas parfaite),
  // même championne coriace (×1.6) : seule la progression change l'issue
  const fm = 1.6, off = 150;
  const d = taux(debutante.rec, debutante.eq, fm, off);
  const a = taux(assidue.rec, assidue.eq, fm, off);
  const m = taux(maitresse.rec, maitresse.eq, fm, off);
  assert.ok(a > d, 'jouer et s\'équiper doit aider (' + d.toFixed(2) + ' -> ' + a.toFixed(2) + ')');
  assert.ok(m >= a, 'et la maîtrise davantage (' + a.toFixed(2) + ' -> ' + m.toFixed(2) + ')');
  assert.ok(m > 0.5, 'au bout du chemin, une championne coriace tombe (' + m.toFixed(2) + ')');
});

test('progression : le point d\'entrée reste ouvert (on gagne ses premiers duels)', () => {
  // un joueur correct (parade à ~100 ms) doit battre un adversaire ordinaire,
  // sans aucune technique — sinon rien ne se débloquerait jamais
  const me = base();
  const bonus = equipBonus(me), buffs = combatBuffs({});
  let w = 0;
  for (let i = 0; i < 40; i++) {
    const carte = wildFoe(8, 'wild|' + i, makeFighter(me, bonus));
    const b = newBattle(me, carte, 'w' + i, { now: 0, level: 8, bonus, buffs });
    if (simulate(b, 100).winner === 'me') w++;
  }
  assert.ok(w / 40 > 0.5, 'un duel ordinaire doit être gagnable, même sans technique');
});

test('duel : la difficulté de l\'adversaire porte sur ses STATS, pas sur ses jauges', () => {
  // les jauges sont plafonnées à 100 : un multiplicateur y saturait, et les
  // « championnes » n'étaient guère plus fortes qu'une sauvage ordinaire
  const carte = { name: 'X', stage: 'adult', health: 100, fun: 100, energy: 80 };
  const normal = newBattle(base(), carte, 'g', { now: 0 });
  const dure = newBattle(base(), carte, 'g', { now: 0, foeMult: 1.6 });
  assert.ok(dure.foe.maxHp > normal.foe.maxHp, 'les PV doivent monter');
  assert.ok(dure.foe.atk > normal.foe.atk, 'l\'attaque aussi');
  assert.ok(dure.foe.atk < normal.me.maxHp, 'mais un seul coup ne doit pas être fatal');
});

test('technique : le départ lancé donne bien un cran de combo d\'entrée', () => {
  const sec = newBattle(base(), { name: 'X', stage: 'adult' }, 'g', { now: 0 });
  assert.equal(sec.combo, 0);
  const lance = newBattle(base(), { name: 'X', stage: 'adult' }, 'g', { now: 0, buffs: { comboDepart: 1 } });
  assert.equal(lance.combo, 1, 'un cran de combo d\'avance');
});
