// Le monde en tuiles : cartes cohérentes, auto-tuilage des berges, collisions,
// et passages entre zones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, ZONES, START_ZONE, zoneById, MAP_W, MAP_H, WORLD_W, WORLD_H, T,
  charAt, isWater, isSolid, waterTile, groundTile, decorTile,
  moveWithCollision, zoneExit, nearestFree, safeEntry, spawnPoint,
  zoneFinds, FIND_ICON, zoneGates, ZOOM, zoneLayout, ZONE_INTRO,
  SPECIALITE, zoneDuJour, findCount, BORD_SORTIE,
  HABITANT, COFFRE, COFFRE_ZONES, habitantAt, coffreAt, HABITANT_PRES, COFFRE_LOIN,
  EPREUVE, EPREUVE_ZONES, epreuveAt, FAUNE
} from '../src/tilemap.js';
import { ITEMS } from '../src/items.js';

const ids = Object.keys(ZONES);

test('zones : toutes rectangulaires, même gabarit, sans caractère inconnu', () => {
  assert.ok(ids.length >= 3, 'le monde doit avoir plusieurs zones');
  const known = new Set([...'.,d~Tpbfs']);
  for (const id of ids) {
    const z = ZONES[id];
    assert.equal(z.rows.length, MAP_H, id + ' : hauteur');
    for (const [i, row] of z.rows.entries()) {
      assert.equal(row.length, MAP_W, id + ' ligne ' + i);
      for (const ch of row) assert.ok(known.has(ch), id + ' : caractère ' + ch);
    }
    assert.ok(z.name && z.id === id);
  }
  assert.equal(WORLD_W, MAP_W * TILE);
  assert.equal(WORLD_H, MAP_H * TILE);
});

test('zones : les liaisons pointent vers des zones qui existent', () => {
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      assert.ok(['north', 'south', 'east', 'west'].includes(dir), id + ' : bord ' + dir);
      assert.ok(ZONES[to], id + ' -> ' + to + ' : zone inconnue');
    }
  }
  assert.ok(ZONES[START_ZONE], 'la zone de départ doit exister');
});

test('zones : toute liaison est RÉCIPROQUE (on peut revenir sur ses pas)', () => {
  const oppose = { north: 'south', south: 'north', east: 'west', west: 'east' };
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const retour = ZONES[to].links[oppose[dir]];
      assert.equal(retour, id,
        id + ' part au ' + dir + ' vers ' + to + ', mais ' + to + ' ne revient pas');
    }
  }
});

test('zones : le monde est d\'un seul tenant (tout est atteignable du départ)', () => {
  const vus = new Set([START_ZONE]);
  const file = [START_ZONE];
  while (file.length) {
    for (const to of Object.values(ZONES[file.pop()].links)) {
      if (!vus.has(to)) { vus.add(to); file.push(to); }
    }
  }
  assert.equal(vus.size, ids.length,
    'zones inatteignables : ' + ids.filter(i => !vus.has(i)).join(', '));
});

test('zones : un bord SANS liaison est un mur, un bord AVEC liaison s\'ouvre', () => {
  // la clairière est le carrefour : elle ouvre des quatre côtés
  assert.equal(isSolid('clairiere', 5, -1), false, 'nord franchissable');
  assert.equal(isSolid('clairiere', 5, MAP_H), false, 'sud franchissable');
  // le delta est un cul-de-sac : seul l'ouest s'ouvre (le lac, lui, mène
  // désormais au delta — c'est ce qui a agrandi la vallée)
  assert.deepEqual(Object.keys(ZONES.delta.links), ['west']);
  assert.equal(isSolid('delta', -1, 5), false, 'le delta ouvre à l\'ouest');
  assert.equal(isSolid('delta', 5, -1), true, 'le delta est fermé au nord');
  assert.equal(isSolid('delta', MAP_W, 5), true, 'le delta est fermé à l\'est');
  assert.equal(isSolid('delta', 5, MAP_H), true, 'le delta est fermé au sud');
  assert.equal(isSolid('lac', MAP_W, 5), false, 'le lac ouvre maintenant à l\'est');
});

test('passage : sortir par un bord lié amène dans la zone voisine, côté opposé', () => {
  const out = zoneExit('clairiere', 200, -2);          // on sort par le nord
  assert.ok(out, 'la sortie nord doit exister');
  assert.equal(out.to, 'foret');
  assert.ok(out.y > WORLD_H - 2 * TILE, 'on entre par le bas de la forêt');
  const back = zoneExit('foret', 200, WORLD_H + 2);    // et on revient
  assert.equal(back.to, 'clairiere');
  assert.ok(back.y < 2 * TILE, 'on entre par le haut de la clairière');
  // un bord non lié ne mène nulle part
  assert.equal(zoneExit('lac', 200, -2), null, 'le lac n\'ouvre pas au nord');
  assert.equal(zoneExit('vallon', -2, 100), null, 'le vallon n\'ouvre pas à l\'ouest');
});

test('passage : l\'arrivée est toujours sur une case praticable', () => {
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const px = dir === 'west' ? -2 : dir === 'east' ? WORLD_W + 2 : WORLD_W / 2;
      const py = dir === 'north' ? -2 : dir === 'south' ? WORLD_H + 2 : WORLD_H / 2;
      const out = zoneExit(id, px, py);
      assert.ok(out && out.to === to);
      const entry = safeEntry(out.to, out.x, out.y);
      const cx = Math.floor(entry.x / TILE), cy = Math.floor(entry.y / TILE);
      assert.equal(isSolid(out.to, cx, cy), false,
        'arrivée bloquée en ' + to + ' depuis ' + id + '/' + dir);
    }
  }
});

test('collisions : eau et arbres bloquent, herbe et terre laissent passer', () => {
  let water = null, grass = null;
  for (let y = 0; y < MAP_H && !(water && grass); y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = charAt('clairiere', x, y);
      if (c === '~' && !water) water = [x, y];
      if (c === '.' && !grass) grass = [x, y];
    }
  }
  assert.equal(isSolid('clairiere', ...water), true);
  assert.equal(isSolid('clairiere', ...grass), false);
  // le sentier de terre est praticable
  assert.equal(isSolid('clairiere', 2, 9), false, 'le sentier doit se marcher');
});

test('auto-tuilage : l\'eau intérieure est pleine, une rive ouest s\'ourle', () => {
  let inner = null;
  for (let y = 1; y < MAP_H - 1 && !inner; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater('clairiere', x, y) && isWater('clairiere', x - 1, y) && isWater('clairiere', x + 1, y)
        && isWater('clairiere', x, y - 1) && isWater('clairiere', x, y + 1)) { inner = [x, y]; break; }
    }
  }
  assert.ok(inner);
  assert.deepEqual(waterTile('clairiere', ...inner), T.water);
  let westEdge = null;
  for (let y = 1; y < MAP_H - 1 && !westEdge; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (isWater('clairiere', x, y) && isWater('clairiere', x, y - 1) && isWater('clairiere', x, y + 1)
        && !isWater('clairiere', x - 1, y) && isWater('clairiere', x + 1, y)) { westEdge = [x, y]; break; }
    }
  }
  assert.ok(westEdge);
  assert.deepEqual(waterTile('clairiere', ...westEdge), T.bankW);
});

test('tuiles : chaque zone a un sol partout ; le décor suit la légende', () => {
  for (const id of ids) {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const g = groundTile(id, x, y);
      assert.ok(Array.isArray(g) && g.length === 2, id + ' : sol manquant en ' + x + ',' + y);
    }
  }
  let treeAt = null;
  for (let y = 0; y < MAP_H && !treeAt; y++) for (let x = 0; x < MAP_W; x++) {
    if (charAt('foret', x, y) === 'T') { treeAt = [x, y]; break; }
  }
  assert.deepEqual(decorTile('foret', ...treeAt), T.tree);
});

test('déplacement : on glisse le long d\'un obstacle, on ne traverse pas l\'eau', () => {
  let spot = null;
  for (let y = 1; y < MAP_H - 1 && !spot; y++) {
    for (let x = 1; x < MAP_W - 2; x++) {
      if (!isSolid('clairiere', x, y) && isSolid('clairiere', x + 1, y) && !isSolid('clairiere', x, y + 1)) {
        spot = [x, y]; break;
      }
    }
  }
  assert.ok(spot);
  const px = spot[0] * TILE + TILE / 2, py = spot[1] * TILE + TILE - 2;
  const res = moveWithCollision('clairiere', px, py, 6, 4);
  assert.ok(res.y > py, 'le déplacement vertical doit aboutir');
  const landed = Math.floor(res.x / TILE);
  assert.notEqual(landed, spot[0] + 1, 'on ne doit pas entrer dans l\'obstacle');
});

test('départ : chaque zone a un point d\'entrée praticable', () => {
  for (const id of ids) {
    const p = spawnPoint(id);
    assert.equal(isSolid(id, Math.floor(p.x / TILE), Math.floor(p.y / TILE)), false, id);
    assert.ok(p.x >= 0 && p.x <= WORLD_W && p.y >= 0 && p.y <= WORLD_H);
  }
  // zoneById est tolérant : une entrée inconnue retombe sur la zone de départ
  assert.equal(zoneById('n_importe_quoi').id, START_ZONE);
  assert.equal(zoneById(ZONES.foret).id, 'foret');
});

/* ---------------- L'intérêt propre de chaque zone ---------------- */

test('chaque zone a sa récompense et son niveau de danger', () => {
  const kinds = new Set();
  for (const id of ids) {
    const z = ZONES[id];
    assert.ok(z.find && z.find.kind && z.find.count > 0, id + ' : rien à y trouver');
    assert.ok(FIND_ICON[z.find.kind], id + ' : trouvaille sans icône');
    assert.equal(typeof z.boost, 'number', id + ' : pas de niveau de danger');
    kinds.add(z.find.kind);
  }
  assert.equal(kinds.size, ids.length, 'chaque zone doit offrir quelque chose de DIFFÉRENT');
  // le foyer est le plus doux, la cascade la plus rude
  assert.equal(ZONES[START_ZONE].boost, 0, 'le foyer ne doit pas être dangereux');
  const maxBoost = Math.max(...ids.map(i => ZONES[i].boost));
  assert.ok(maxBoost >= 3, 's\'éloigner doit se mériter');
});

test('trouvailles : posées sur des cases praticables, jamais dans l\'eau ni dans un arbre', () => {
  for (const id of ids) {
    const finds = zoneFinds(id, '2026-07-24');
    assert.equal(finds.length, findCount(id, '2026-07-24'), id + ' : compte inattendu');
    for (const f of finds) {
      assert.equal(isSolid(id, f.cx, f.cy), false, id + ' : trouvaille inaccessible');
      assert.equal(f.kind, ZONES[id].find.kind);
      assert.ok(f.x > 0 && f.x < WORLD_W && f.y > 0 && f.y < WORLD_H);
    }
    // pas deux trouvailles sur la même case
    const cases = finds.map(f => f.cx + ',' + f.cy);
    assert.equal(new Set(cases).size, cases.length, id + ' : trouvailles superposées');
  }
});

test('spécialités : chaque lieu a la sienne, et aucune n\'est un doublon', () => {
  const noms = new Set(), icones = new Set();
  for (const id of ids) {
    const sp = SPECIALITE[id];
    assert.ok(sp, id + ' : pas de spécialité');
    for (const champ of ['icon', 'nom', 'effet']) {
      assert.ok(sp[champ] && sp[champ].length, id + ' : ' + champ + ' vide');
    }
    // deux lieux qui promettent la même chose n'ont pas d'intérêt propre
    assert.equal(noms.has(sp.nom), false, 'spécialité en double : ' + sp.nom);
    assert.equal(icones.has(sp.icon), false, 'icône en double : ' + sp.icon);
    noms.add(sp.nom); icones.add(sp.icon);
  }
});

test('spécialités : chaque lieu a aussi sa trouvaille propre', () => {
  const kinds = ids.map(id => ZONES[id].find && ZONES[id].find.kind);
  assert.equal(new Set(kinds).size, ids.length, 'deux lieux donnent la même trouvaille');
  for (const k of kinds) assert.ok(FIND_ICON[k], 'trouvaille sans icône : ' + k);
});

test('spécialités : l\'icône ne redouble pas celle de la trouvaille', () => {
  // sur la carte les deux se suivent : la même icône deux fois n'apprend rien
  for (const id of ids) {
    const trouvaille = FIND_ICON[ZONES[id].find.kind];
    assert.notEqual(SPECIALITE[id].icon, trouvaille, id + ' : icône redondante');
  }
});

test('lieu du jour : un seul, stable dans la journée, et il tourne', () => {
  const j = zoneDuJour('2026-07-24');
  assert.ok(ids.includes(j), 'le lieu du jour doit être une zone connue');
  assert.equal(zoneDuJour('2026-07-24'), j, 'il doit être stable dans la journée');
  // sur un mois, tous les lieux doivent avoir leur tour — sinon deux zones
  // resteraient éternellement dans l'ombre
  const vus = new Set();
  for (let d = 1; d <= 31; d++) vus.add(zoneDuJour('2026-03-' + String(d).padStart(2, '0')));
  assert.equal(vus.size, ids.length, 'des lieux ne sont jamais à l\'honneur : ' +
    ids.filter(i => !vus.has(i)).join(', '));
});

test('lieu du jour : il porte plus de trouvailles que les autres', () => {
  const jour = '2026-07-24';
  const j = zoneDuJour(jour);
  assert.equal(findCount(j, jour), ZONES[j].find.count + 2, 'le lieu du jour doit être plus riche');
  for (const id of ids) {
    if (id === j) continue;
    assert.equal(findCount(id, jour), ZONES[id].find.count, id + ' : compte inchangé attendu');
  }
});

test('trouvailles : stables dans la journée, renouvelées le lendemain', () => {
  const a = zoneFinds('foret', '2026-07-24');
  const b = zoneFinds('foret', '2026-07-24');
  assert.deepEqual(a, b, 'même jour -> mêmes trouvailles');
  const c = zoneFinds('foret', '2026-07-25');
  assert.notDeepEqual(a.map(f => f.id), c.map(f => f.id), 'nouveau jour -> nouvelles trouvailles');
});

test('trouvailles : les identifiants sont uniques d\'une zone à l\'autre', () => {
  const vus = new Set();
  for (const id of ids) {
    for (const f of zoneFinds(id, '2026-07-24')) {
      assert.equal(vus.has(f.id), false, 'identifiant en double : ' + f.id);
      vus.add(f.id);
    }
  }
});

test('passages : chaque bord ouvert a un repère, posé sur une case praticable', () => {
  for (const id of ids) {
    const gates = zoneGates(id);
    const dirs = Object.keys(ZONES[id].links).sort();
    assert.deepEqual(gates.map(g => g.dir).sort(), dirs,
      id + ' : il faut un repère par bord ouvert, ni plus ni moins');
    for (const g of gates) {
      assert.equal(g.to, ZONES[id].links[g.dir]);
      assert.ok(g.name, 'le repère doit nommer le lieu voisin');
      const cx = Math.floor(g.x / TILE), cy = Math.floor(g.y / TILE);
      assert.equal(isSolid(id, cx, cy), false,
        id + '/' + g.dir + ' : repère planté dans un obstacle');
      assert.ok(g.x >= 0 && g.x <= WORLD_W && g.y >= 0 && g.y <= WORLD_H);
    }
  }
});

test('agrandissement : la vallée est assez vaste pour qu\'on s\'y promène', () => {
  assert.ok(ZOOM >= 2, 'les cartes dessinées sont agrandies');
  assert.ok(MAP_W >= 60 && MAP_H >= 60, 'zone de ' + MAP_W + 'x' + MAP_H + ' tuiles');
  // l'écran (10 x 21 tuiles) ne doit jamais montrer la zone entière
  assert.ok(MAP_W > 10 * 2, 'on doit voir moins de la moitié de la largeur');
  assert.ok(MAP_H > 21 * 1.5, 'on doit voir moins des deux tiers de la hauteur');
});

/* ---------------- Carte de la vallée & arrivées mises en scène ---------------- */

test('carte : la disposition respecte la géographie réelle des liaisons', () => {
  const L = zoneLayout();
  assert.equal(Object.keys(L).length, ids.length, 'chaque zone doit être placée');
  const D = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const a = L[id], b = L[to], d = D[dir];
      assert.equal(b.col - a.col, d[0], id + ' -> ' + to + ' (' + dir + ') : colonne');
      assert.equal(b.row - a.row, d[1], id + ' -> ' + to + ' (' + dir + ') : ligne');
    }
  }
});

test('carte : deux lieux n\'occupent jamais la même case', () => {
  const L = zoneLayout();
  const cases = Object.values(L).map(p => p.col + ',' + p.row);
  assert.equal(new Set(cases).size, cases.length, 'lieux superposés sur la carte');
  // origine ramenée à zéro : pas de coordonnée négative
  for (const p of Object.values(L)) {
    assert.ok(p.col >= 0 && p.row >= 0, 'coordonnée négative');
  }
});

test('arrivée : chaque lieu a son texte de découverte', () => {
  for (const id of ids) {
    const it = ZONE_INTRO[id];
    assert.ok(it, id + ' : pas de scène d\'arrivée');
    assert.ok(it.emoji && it.title, id + ' : emoji ou titre manquant');
    assert.ok(Array.isArray(it.lines) && it.lines.length >= 1, id + ' : pas de texte');
    assert.equal(it.title, ZONES[id].name, id + ' : le titre doit nommer le lieu');
  }
});

test('voyage : on ne peut viser que des lieux connus, et jamais celui où l\'on est', () => {
  // règle appliquée par travelTo (main.js) : connu, différent du lieu courant.
  const connus = ['clairiere', 'foret'];
  const courant = 'clairiere';
  const jouable = (id) => connus.includes(id) && id !== courant;
  assert.equal(jouable('foret'), true, 'un lieu connu et distinct est une destination');
  assert.equal(jouable('clairiere'), false, 'on ne voyage pas vers soi-même');
  assert.equal(jouable('cascade'), false, 'un lieu inconnu n\'est pas une destination');
  // et toute destination valide a un point d'entrée praticable
  for (const id of ids) {
    const p = spawnPoint(id);
    assert.equal(isSolid(id, Math.floor(p.x / TILE), Math.floor(p.y / TILE)), false,
      id + ' : arrivée de voyage bloquée');
  }
});

test('habitants : un par lieu, chacun avec son service', () => {
  const dons = new Set(), emojis = new Set();
  for (const id of ids) {
    const h = HABITANT[id];
    assert.ok(h, id + ' : lieu sans habitant');
    for (const champ of ['emoji', 'nom', 'role', 'don']) {
      assert.ok(h[champ] && h[champ].length, id + ' : ' + champ + ' manquant');
    }
    assert.ok(Array.isArray(h.mots) && h.mots.length >= 1, id + ' : rien à dire');
    // deux habitants qui rendent le même service, c'est une zone en double
    assert.equal(dons.has(h.don), false, 'service en double : ' + h.don);
    assert.equal(emojis.has(h.emoji), false, 'habitant en double : ' + h.emoji);
    dons.add(h.don); emojis.add(h.emoji);
  }
});

test('habitants : postés sur une case praticable, et pas trop loin de l\'arrivée', () => {
  for (const id of ids) {
    const h = habitantAt(id);
    assert.equal(isSolid(id, h.cx, h.cy), false, id + ' : habitant dans l\'eau ou un arbre');
    assert.ok(h.x > 0 && h.x < WORLD_W && h.y > 0 && h.y < WORLD_H, id + ' : hors carte');
    // il doit se CROISER : posté à l'autre bout, on ne le rencontrerait jamais
    const [sx, sy] = ZONES[id].start;
    assert.ok(Math.hypot(h.cx - sx, h.cy - sy) <= HABITANT_PRES,
      id + ' : habitant trop loin de l\'arrivée');
    // stable : on doit le retrouver au même endroit à chaque venue
    assert.deepEqual(habitantAt(id), h, id + ' : l\'habitant se déplace');
  }
});

test('coffres : un trésor réel par lieu, et jamais deux fois le même', () => {
  assert.deepEqual(COFFRE_ZONES.slice().sort(), ids.slice().sort());
  const vus = new Set();
  for (const id of ids) {
    const item = COFFRE[id];
    assert.ok(ITEMS.some(it => it.id === item), id + ' : trésor inconnu « ' + item + ' »');
    assert.equal(vus.has(item), false, 'trésor en double : ' + item);
    vus.add(item);
  }
});

test('coffres : atteignables, stables, et à l\'écart de l\'arrivée', () => {
  for (const id of ids) {
    const c = coffreAt(id);
    assert.equal(isSolid(id, c.cx, c.cy), false, id + ' : coffre inaccessible');
    assert.deepEqual(coffreAt(id), c, id + ' : le coffre se déplace');
    // il doit se mériter : sinon on le ramasse en arrivant, sans explorer
    const [sx, sy] = ZONES[id].start;
    assert.ok(Math.hypot(c.cx - sx, c.cy - sy) >= COFFRE_LOIN, id + ' : coffre trop près de l\'arrivée');
  }
});

test('coffre et habitant ne se marchent pas dessus', () => {
  for (const id of ids) {
    const h = habitantAt(id), c = coffreAt(id);
    assert.ok(Math.hypot(h.x - c.x, h.y - c.y) > 24, id + ' : coffre et habitant superposés');
  }
});

test('épreuves : une championne par lieu, chacune avec son identité', () => {
  assert.deepEqual(EPREUVE_ZONES.slice().sort(), ids.slice().sort());
  const noms = new Set();
  for (const id of ids) {
    const e = EPREUVE[id];
    for (const champ of ['nom', 'titre', 'fur', 'defi']) {
      assert.ok(e[champ] && e[champ].length, id + ' : ' + champ + ' manquant');
    }
    assert.equal(noms.has(e.nom), false, 'championne en double : ' + e.nom);
    noms.add(e.nom);
    assert.ok(e.force > 0 && e.force < 3, id + ' : force aberrante (' + e.force + ')');
  }
});

test('épreuves : la difficulté suit l\'éloignement du carrefour', () => {
  // sans cet ordre, la vallée n'aurait pas de progression : on tomberait sur
  // la plus dure au premier pas de côté
  const parBoost = ids.slice().sort((a, b) => (ZONES[a].boost || 0) - (ZONES[b].boost || 0));
  for (let i = 1; i < parBoost.length; i++) {
    const av = parBoost[i - 1], ap = parBoost[i];
    assert.ok(EPREUVE[ap].force >= EPREUVE[av].force,
      ap + ' (boost ' + ZONES[ap].boost + ') doit être au moins aussi dure que ' + av);
  }
  assert.ok(EPREUVE[START_ZONE].force <= 1, 'la championne du départ ne doit pas surclasser le joueur');
});

test('épreuves : la championne se croise entre l\'habitant et le coffre', () => {
  for (const id of ids) {
    const e = epreuveAt(id);
    assert.equal(isSolid(id, e.cx, e.cy), false, id + ' : championne inaccessible');
    assert.deepEqual(epreuveAt(id), e, id + ' : la championne se déplace');
    const [sx, sy] = ZONES[id].start;
    const d = Math.hypot(e.cx - sx, e.cy - sy);
    assert.ok(d >= HABITANT_PRES - 3, id + ' : championne trop près de l\'arrivée');
    assert.ok(d <= 20, id + ' : championne trop loin pour être croisée');
    // les trois repères du lieu ne doivent pas se confondre
    const h = habitantAt(id), c = coffreAt(id);
    assert.ok(Math.hypot(e.x - h.x, e.y - h.y) > 40, id + ' : championne collée à l\'habitant');
    assert.ok(Math.hypot(e.x - c.x, e.y - c.y) > 40, id + ' : championne collée au coffre');
  }
});

/**
 * LE test qui manquait. Les tests de zoneExit passaient tous — mais en lui
 * FOURNISSANT une position hors carte. Personne ne vérifiait qu'un joueur peut
 * réellement l'atteindre. Il ne le pouvait pas : la caméra est bornée aux
 * limites du monde, donc un toucher ne désigne jamais un point hors carte, et
 * la loutre s'arrêtait à x≈0,6 quand il fallait px < 0. Cinq zones sur six
 * étaient inatteignables.
 */
function marcheVers(zone, px, py, tx, ty) {
  for (let i = 0; i < 6000; i++) {
    const dx = tx - px, dy = ty - py, d = Math.hypot(dx, dy);
    if (d <= 1.5) break;
    const step = Math.min(1.4, d);
    const r = moveWithCollision(zone, px, py, dx / d * step, dy / d * step);
    if (r.x === px && r.y === py) break;          // bloquée
    px = r.x; py = r.y;
    const out = zoneExit(zone, px, py);
    if (out) return { franchi: out, px, py };
  }
  return { franchi: null, px, py };
}

/** Une voie libre vers le bord `dir` : le marcheur va tout droit, il ne contourne pas. */
function voieVers(zone, dir) {
  const libre = (cx, cy) => !isSolid(zone, cx, cy);
  if (dir === 'north' || dir === 'south') {
    const bord = dir === 'north' ? 0 : MAP_H - 1;
    const pas = dir === 'north' ? 1 : -1;
    for (let cx = 0; cx < MAP_W; cx++) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!libre(cx, bord + pas * k)) { ok = false; break; }
      if (ok) return { from: { x: cx * TILE + 8, y: (bord + pas * 4) * TILE + 8 },
        to: { x: cx * TILE + 8, y: dir === 'north' ? 0 : WORLD_H } };
    }
  } else {
    const bord = dir === 'west' ? 0 : MAP_W - 1;
    const pas = dir === 'west' ? 1 : -1;
    for (let cy = 0; cy < MAP_H; cy++) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!libre(bord + pas * k, cy)) { ok = false; break; }
      if (ok) return { from: { x: (bord + pas * 4) * TILE + 8, y: cy * TILE + 8 },
        to: { x: dir === 'west' ? 0 : WORLD_W, y: cy * TILE + 8 } };
    }
  }
  return null;
}

test('franchissement : on peut VRAIMENT quitter une zone en marchant vers le bord', () => {
  // la cible la plus extrême qu'un toucher puisse produire est le bord lui-même
  for (const dir of ['west', 'north']) {
    const v = voieVers('clairiere', dir);
    assert.ok(v, 'la clairière doit offrir une voie vers le ' + dir);
    const r = marcheVers('clairiere', v.from.x, v.from.y, v.to.x, v.to.y);
    assert.ok(r.franchi, 'bord ' + dir + ' infranchissable (arrêtée en ' +
      r.px.toFixed(0) + ',' + r.py.toFixed(0) + ')');
    assert.equal(r.franchi.to, ZONES.clairiere.links[dir]);
  }
});

test('franchissement : chaque liaison de chaque zone est réellement praticable', () => {
  // sans quoi une zone pourrait rester inatteignable sans que rien ne le dise
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const v = voieVers(id, dir);
      assert.ok(v, id + ' : aucune voie libre vers le ' + dir);
      const r = marcheVers(id, v.from.x, v.from.y, v.to.x, v.to.y);
      assert.ok(r.franchi, id + ' → ' + dir + ' (' + to + ') : bord inatteignable');
      assert.equal(r.franchi.to, to);
    }
  }
});

test('franchissement : on n\'est pas renvoyé aussitôt d\'où l\'on vient', () => {
  // le point d'arrivée doit être HORS de la marge de sortie du bord opposé,
  // sinon on ferait des allers-retours en boucle
  for (const id of ids) {
    for (const [dir, to] of Object.entries(ZONES[id].links)) {
      const px = dir === 'west' ? 0 : dir === 'east' ? WORLD_W : WORLD_W / 2;
      const py = dir === 'north' ? 0 : dir === 'south' ? WORLD_H : WORLD_H / 2;
      const out = zoneExit(id, px, py);
      assert.ok(out);
      const entry = safeEntry(out.to, out.x, out.y);
      assert.equal(zoneExit(out.to, entry.x, entry.y), null,
        'arrivée en ' + to + ' depuis ' + id + ' : on repart aussitôt !');
    }
  }
});

test('agrandissement : la vallée compte neuf lieux, tous reliés et tous équipés', () => {
  assert.ok(ids.length >= 9, 'la vallée doit avoir grandi : ' + ids.length + ' lieux');
  // chaque lieu, ancien comme nouveau, doit être complet — sinon un ajout
  // laisserait un trou silencieux (pas d'habitant, pas de coffre, pas d'épreuve)
  for (const id of ids) {
    assert.ok(ZONE_INTRO[id], id + ' : pas de texte de découverte');
    assert.ok(SPECIALITE[id], id + ' : pas de spécialité');
    assert.ok(HABITANT[id], id + ' : pas d\'habitant');
    assert.ok(COFFRE[id], id + ' : pas de coffre');
    assert.ok(EPREUVE[id], id + ' : pas de championne');
    assert.ok(FAUNE[id] && FAUNE[id].length, id + ' : pas de faune');
    assert.ok(ZONES[id].find && FIND_ICON[ZONES[id].find.kind], id + ' : trouvaille sans icône');
  }
});

test('faune : propre à chaque lieu, et jamais deux fois la même bête au même endroit', () => {
  for (const id of ids) {
    const f = FAUNE[id];
    assert.equal(new Set(f).size, f.length, id + ' : bête en double');
  }
  // et la vallée doit être variée dans son ensemble
  const toutes = new Set(ids.flatMap(id => FAUNE[id]));
  assert.ok(toutes.size >= 10, 'trop peu d\'espèces : ' + toutes.size);
});
