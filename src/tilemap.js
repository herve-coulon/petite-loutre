// Le monde en tuiles : atlas Kenney (CC0, cf. assets/CREDITS.txt), cartes des
// ZONES reliées entre elles, auto-tuilage des berges et collisions.
// Module PUR (aucun DOM, aucun canvas) : cartes et déplacements sont testables.

export const TILE = 16;        // taille d'une tuile dans la feuille
export const SHEET_M = 1;      // marge entre les tuiles de la feuille

/** Tuiles nommées -> [colonne, ligne] dans assets/tileset.png. */
export const T = {
  grass: [5, 0], grass2: [5, 1], dirt: [6, 0],
  water: [0, 0], waterAlt: [1, 0],
  // berges : bloc 3x3 (coins + bords) autour de l'eau
  bankNW: [2, 0], bankN: [3, 0], bankNE: [4, 0],
  bankW: [2, 1], bankC: [3, 1], bankE: [4, 1],
  bankSW: [2, 2], bankS: [3, 2], bankSE: [4, 2],
  // végétation
  tree: [13, 9], pine: [16, 9], bush: [25, 9], flower: [24, 9],
  lily: [25, 11], sprout: [22, 10]
};

/** Tuiles d'INTÉRIEUR, pour la tanière (terrier de terre au plancher de bois). */
export const TD = {
  wall: [6, 0], wallAlt: [6, 1],     // terre du terrier
  floor: [5, 4], floorAlt: [5, 5],   // plancher de bois chaud
  shelf: [30, 0], shelfFull: [31, 0],
  bed: [29, 4], barrel: [28, 5], crate: [28, 2], chest: [28, 6],
  candle: [20, 7], sack: [26, 2],
  picture: [23, 8], mirror: [24, 8]  // de quoi habiller le mur
};

/* ---------------- Les cartes ----------------
   Légende : '.'/',' herbe · 'd' terre · '~' eau · 'T' arbre · 'p' sapin
             'b' buisson · 'f' fleurs · 's' pousse
   Les bords ouverts (cases praticables en lisière) mènent à la zone voisine. */

// LA CLAIRIÈRE : le cœur de la vallée. Rivière au centre, sentier à l'ouest.
// Ouvertures : au nord vers la forêt, à l'est vers le lac.
const CLAIRIERE = [
  'TTTTTTTTTT....TTTTTTTT........',
  'TT..........,....TTTT.........',
  'T....ffff....~~~~....pp.......',
  'T...........~~~~~~....pp......',
  '....bb.....~~~~~~~~....p......',
  '..........~~~~~~~~~~..........',
  '.....dd...~~~~~~~~~~.....bb...',
  '....dddd..~~~~~~~~~~..........',
  '...dd......~~~~~~~~...ffff....',
  '..dd........~~~~~~............',
  '..dd.........~~~~.......TTTT..',
  '..dd.........~~~~.......TTTT..',
  '..dd.........~~~~.............',
  '..dddddd.....~~~~....bb.......',
  '.......dd....~~~~.............',
  '........dd...~~~~......ffff...',
  '.........dd..~~~~.............',
  '..........dd.~~~~.......pp....',
  '...........dd~~~~.......pp....',
  '............d~~~~.............',
  '.............~~~~....TTT......',
  '....bb.......~~~~....TTT......',
  '.............~~~~.............',
  '....ffff.....~~~~......bb.....',
  '.............~~~~.............',
  '..TTTT.......~~~~....ffff.....',
  '..TTTT.......~~~~.............',
  '.............~~~~.............',
  '......ss.....~~~~......ss.....',
  'TTTTTTTT.....~~~~.......TTTTTT'   // la rivière file au sud, vers le vallon
];

// LA CASCADE : au nord-ouest, la chute qui alimente la rivière.
// Ouvertures : à l'est vers la forêt, au sud vers les roseaux.
const CASCADE = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TT~~~~~~~~~~TTTTTTTTTTTTTTTTTT',
  'TT~~~~~~~~~~TT.........TTTTTTT',
  'TT~~~~~~~~~~T....ff.......TTTT',
  'TT~~~~~~~~~~..................',
  'TT~~~~~~~~~~..bb..............',
  'TT~~~~~~~~~~..................',
  'T.~~~~~~~~~~..................',
  'T..~~~~~~~~..........TT......T',
  'T...~~~~~~..........TT.......T',
  'T....~~~~...........TT.......T',
  'T....~~~~....................T',
  'T....~~~~......ff............T',
  'T....~~~~....................T',
  'T....~~~~........bb..........T',
  'T....~~~~....................T',
  'T....~~~~...........TT.......T',
  'T....~~~~...........TT.......T',
  'T....~~~~....................T',
  'T....~~~~.......ss...........T',
  'T....~~~~....................T',
  'T....~~~~..........ff........T',
  'T....~~~~....................T',
  'T....~~~~....TT..............T',
  'T....~~~~....TT..............T',
  'T....~~~~....................T',
  'T....~~~~........bb..........T',
  'T....~~~~....................T',
  'T....~~~~....................T',
  'TTTTT~~~~TTTT......TTTTTTTTTTT'
];

// LES ROSEAUX : à l'ouest, un marais de mares peu profondes.
// Ouvertures : au nord vers la cascade, à l'est vers la clairière.
const ROSEAUX = [
  'TTTTTTTTTTTTT......TTTTTTTTTTT',
  'T............................T',
  'T..ss....~~~~......ss........T',
  'T........~~~~................T',
  'T...ss...~~~~.....ss.........T',
  'T................~~~~........T',
  'T....bb..........~~~~........T',
  'T................~~~~........T',
  'T.......ss...................T',
  'T..~~~~..........ss..........T',
  'T..~~~~......................T',
  'T..~~~~...........~~~~.......T',
  'T.................~~~~.......T',
  'T....ss...........~~~~........',
  'T.............................',
  'T..........ss.................',
  'T............................T',
  'T...~~~~.....................T',
  'T...~~~~.......ss............T',
  'T...~~~~.....................T',
  'T..............~~~~..........T',
  'T....ss........~~~~..........T',
  'T..............~~~~..........T',
  'T............................T',
  'T.......ss........ss.........T',
  'T............................T',
  'T..bb........................T',
  'T..............ss............T',
  'T............................T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

// LE VALLON : au sud, une prairie douce que la rivière traverse.
// Ouverture : au nord vers la clairière.
const VALLON = [
  'TTTTTTTT.....~~~~.......TTTTTT',
  'T............~~~~............T',
  'T...ff.......~~~~............T',
  'T............~~~~............T',
  'T.....bb.....~~~~............T',
  'T............~~~~............T',
  'T............~~~~........bb..T',
  'T....TT......~~~~....TT......T',
  'T....TT......~~~~....TT......T',
  'T............~~~~............T',
  'T.......ff...~~~~............T',
  'T............~~~~............T',
  'T............~~~~.....ff.....T',
  'T..bb........~~~~............T',
  'T............~~~~............T',
  'T............~~~~............T',
  'T......ss....~~~~....ss......T',
  'T............~~~~............T',
  'T...TT.......~~~~............T',
  'T...TT.......~~~~............T',
  'T............~~~~............T',
  'T......ff....~~~~............T',
  'T............~~~~............T',
  'T............~~~~.....bb.....T',
  'T.....bb.....~~~~............T',
  'T............~~~~............T',
  'T..TT........~~~~....TT......T',
  'T..TT........~~~~....TT......T',
  'T......ss....~~~~............T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

// LA FORÊT : dense, des trouées, un étang. Ouverture au sud vers la clairière.
const FORET = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TT..TTTT......TTTT......TTTTTT',
  'T....TT...TT.....TT...TT....TT',
  'T.TT......TT..T...TT.......T.T',
  'T.TT..ff...........TT..bb..T.T',
  '.......TT...~~~~....TT.....T.T',
  '.T.TT..TT..~~~~~~...TT..TT...T',
  '....T......~~~~~~.......TT...T',
  '....T..bb...~~~~....ff.......T',
  'T.TTT........~~..........TT..T',
  'T.TT....TT.......TT......TT..T',
  'T.......TT.......TT..........T',
  'TT..ss...........TT...ss....TT',
  'T........TT.........TT.......T',
  'T..TT....TT.........TT..TT...T',
  'T..TT.......ff..........TT...T',
  'T.......TT..............TT...T',
  'T..bb...TT.....TT........bb..T',
  'T.......TT.....TT............T',
  'T..TT..........TT.....TT.....T',
  'T..TT.................TT.....T',
  'T.........TT.......TT........T',
  'T..ff.....TT.......TT....ff..T',
  'T.................TT.........T',
  'T..TT.............TT.....TT..T',
  'T..TT....................TT..T',
  'T........TT.........TT.......T',
  'T........TT.........TT.......T',
  'TT.....................ss...TT',
  'TTTTTTTTTTTT......TTTTTTTTTTTT'
];

// LE GRAND LAC : une vaste étendue d'eau bordée de rives.
// Ouverture à l'ouest vers la clairière.
const LAC = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T..........................TTT',
  'T...ff........................',
  'T..........~~~~~~~~~~.........',
  'T.......~~~~~~~~~~~~~~~~......',
  'T.....~~~~~~~~~~~~~~~~~~~~....',
  'T....~~~~~~~~~~~~~~~~~~~~~~...',
  'T...~~~~~~~~~~~~~~~~~~~~~~~~..',
  '....~~~~~~~~~~~~~~~~~~~~~~~~..',
  '...~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '...~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '..~~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '..~~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '..~~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '..~~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '..~~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '...~~~~~~~~~~~~~~~~~~~~~~~~~~.',
  '...~~~~~~~~~~~~~~~~~~~~~~~~~..',
  '....~~~~~~~~~~~~~~~~~~~~~~~...',
  '.....~~~~~~~~~~~~~~~~~~~~~....',
  'T.....~~~~~~~~~~~~~~~~~~~.....',
  'T.......~~~~~~~~~~~~~~~.......',
  'T..bb......~~~~~~~~~..........',
  'T.............................',
  'T....ss................ff.....',
  'T.............................',
  'T..TT....................TT...',
  'T..TT....................TT...',
  'T........bb..........ss.......',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

/**
 * Les zones du monde et leurs liaisons. `links` donne la zone atteinte en
 * sortant par ce bord ; un bord sans liaison est infranchissable.
 * `start` = case d'arrivée par défaut (en coords de tuiles).
 */
/**
 * Les cartes sont DESSINÉES en 30x30 (lisible à écrire et à relire), puis
 * agrandies : chaque case devient un carré de ZOOM x ZOOM tuiles. On double
 * ainsi le territoire sans doubler le travail d'écriture — et les sentiers
 * gagnent de la largeur au passage.
 */
export const ZOOM = 2;
function expand(rows, k) {
  const out = [];
  for (const row of rows) {
    let large = '';
    for (const ch of row) large += ch.repeat(k);
    for (let i = 0; i < k; i++) out.push(large);
  }
  return out;
}

/**
 * Chaque zone a son INTÉRÊT propre, pour que s'éloigner du foyer paie :
 *  - `find`  : ce qu'on y ramasse au sol (nature + quantité) ;
 *  - `boost` : les loutres sauvages y sont d'autant plus fortes qu'on va loin.
 */
export const ZONES = {
  clairiere: {
    id: 'clairiere', name: 'La clairière', rows: expand(CLAIRIERE, ZOOM), start: [8 * ZOOM, 22 * ZOOM],
    links: { north: 'foret', east: 'lac', west: 'roseaux', south: 'vallon' },
    find: { kind: 'poisson', count: 3 }, boost: 0
  },
  foret: {
    id: 'foret', name: 'La forêt', rows: expand(FORET, ZOOM), start: [14 * ZOOM, 27 * ZOOM],
    links: { south: 'clairiere', west: 'cascade' },
    find: { kind: 'champignon', count: 3 }, boost: 2
  },
  cascade: {
    id: 'cascade', name: 'La cascade', rows: expand(CASCADE, ZOOM), start: [20 * ZOOM, 5 * ZOOM],
    links: { east: 'foret', south: 'roseaux' },
    find: { kind: 'gemme', count: 2 }, boost: 4
  },
  roseaux: {
    id: 'roseaux', name: 'Les roseaux', rows: expand(ROSEAUX, ZOOM), start: [15 * ZOOM, 1 * ZOOM],
    links: { north: 'cascade', east: 'clairiere' },
    find: { kind: 'coquillage', count: 3 }, boost: 1
  },
  lac: {
    id: 'lac', name: 'Le grand lac', rows: expand(LAC, ZOOM), start: [2 * ZOOM, 24 * ZOOM],
    links: { west: 'clairiere' },
    find: { kind: 'tresor', count: 2 }, boost: 3
  },
  vallon: {
    id: 'vallon', name: 'Le vallon', rows: expand(VALLON, ZOOM), start: [8 * ZOOM, 2 * ZOOM],
    links: { north: 'clairiere' },
    find: { kind: 'fleur', count: 3 }, boost: 1
  }
};

/**
 * L'arrivée dans un lieu, la PREMIÈRE fois : une petite carte qui plante le
 * décor. Découvrir un endroit doit être un moment, pas une ligne de journal.
 */
export const ZONE_INTRO = {
  clairiere: { emoji: '🌿', title: 'La clairière',
    lines: ['La rivière descend en chantant entre les herbes hautes.',
      'C\'est ici que tout commence — le cœur de la vallée.'] },
  foret: { emoji: '🌲', title: 'La forêt',
    lines: ['Les sapins se resserrent et la lumière se fait rare.',
      'Sous les fougères, des champignons attendent d\'être trouvés.'] },
  cascade: { emoji: '💧', title: 'La cascade',
    lines: ['Un grondement d\'eau blanche : la chute qui nourrit la rivière.',
      'Dans l\'écume, quelque chose scintille… et les loutres d\'ici sont coriaces.'] },
  roseaux: { emoji: '🌾', title: 'Les roseaux',
    lines: ['Un marais tranquille, criblé de mares peu profondes.',
      'La vase garde de beaux coquillages pour qui prend le temps de chercher.'] },
  lac: { emoji: '🏞️', title: 'Le grand lac',
    lines: ['L\'eau s\'ouvre d\'un coup, immense et calme.',
      'On raconte que le fond du lac cache des trésors.'] },
  vallon: { emoji: '🌼', title: 'Le vallon',
    lines: ['La vallée s\'adoucit en une prairie fleurie.',
      'La rivière y coule sans se presser — un endroit pour souffler.'] }
};

/** Ce que chaque trouvaille montre à l'écran. */
export const FIND_ICON = {
  poisson: '🐟', champignon: '🍄', gemme: '💎',
  coquillage: '🐚', tresor: '🎁', fleur: '🌼'
};

/**
 * Ce que chaque lieu a de PROPRE. Sans cela la vallée n'était qu'une suite de
 * prés : on ramassait trois objets et plus rien ne distinguait un lieu d'un
 * autre. Chaque zone répond désormais à un besoin précis du jeu, et le dit.
 */
export const SPECIALITE = {
  clairiere: { icon: '🤝', nom: 'Le carrefour',
    effet: 'toutes les loutres de la vallée y passent : c\'est ici qu\'on recrute' },
  foret: { icon: '🍽️', nom: 'Le garde-manger',
    effet: 'les champignons des fougères nourrissent et font mûrir' },
  cascade: { icon: '🚿', nom: 'La grande douche',
    effet: 'l\'écume décrasse d\'un coup — et laisse des gemmes' },
  roseaux: { icon: '🍬', nom: 'La réserve',
    effet: 'la vase garde les coquillages dont on fait les friandises' },
  lac: { icon: '🗝️', nom: 'Les fonds',
    effet: 'le seul endroit où l\'on remonte de vrais trésors' },
  vallon: { icon: '😌', nom: 'Le pré du repos',
    effet: 'on s\'y délasse : l\'entrain et l\'énergie reviennent' }
};

/**
 * Le lieu à l'honneur du jour : il porte plus de trouvailles, et elles
 * rapportent double. C'est ce qui donne une raison d'aller QUELQUE PART
 * aujourd'hui plutôt que de tourner en rond. PUR : déterminé par la date.
 */
export function zoneDuJour(dayKey) {
  const ids = Object.keys(ZONES);
  return ids[Math.floor(rngFrom('jour|' + dayKey)() * ids.length)];
}

/** Combien de trouvailles porte une zone ce jour-là (le lieu du jour en a plus). */
export function findCount(zone, dayKey) {
  const z = zoneById(zone);
  if (!z.find) return 0;
  return z.find.count + (zoneDuJour(dayKey) === z.id ? 2 : 0);
}

const DELTA = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

/**
 * La disposition de la vallée, DÉDUITE des liaisons (parcours en largeur depuis
 * la zone de départ) plutôt que codée à la main : impossible qu'elle mente sur
 * la géographie réelle. Retourne { id: {col, row} }, origine ramenée à (0,0).
 */
export function zoneLayout() {
  const pos = { [START_ZONE]: { col: 0, row: 0 } };
  const file = [START_ZONE];
  while (file.length) {
    const id = file.shift();
    const here = pos[id];
    for (const [dir, to] of Object.entries(zoneById(id).links)) {
      if (pos[to]) continue;
      const d = DELTA[dir];
      pos[to] = { col: here.col + d[0], row: here.row + d[1] };
      file.push(to);
    }
  }
  const cols = Object.values(pos).map(p => p.col), rows = Object.values(pos).map(p => p.row);
  const minC = Math.min(...cols), minR = Math.min(...rows);
  const out = {};
  for (const [id, p] of Object.entries(pos)) out[id] = { col: p.col - minC, row: p.row - minR };
  return out;
}

/** Petit générateur seedé, pour que les trouvailles du jour soient les mêmes. */
function rngFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

/**
 * Les trouvailles du jour dans une zone : posées sur des cases praticables,
 * identiques toute la journée (graine = zone + jour). PUR.
 */
export function zoneFinds(zone, dayKey) {
  const z = zoneById(zone);
  if (!z.find) return [];
  const rnd = rngFrom('find|' + z.id + '|' + dayKey);
  const out = [];
  const cible = findCount(z.id, dayKey);
  for (let guard = 0; out.length < cible && guard < 900; guard++) {
    const cx = Math.floor(rnd() * MAP_W), cy = Math.floor(rnd() * MAP_H);
    if (isSolid(z, cx, cy)) continue;
    if (out.some(f => f.cx === cx && f.cy === cy)) continue;
    out.push({
      id: z.id + '|' + dayKey + '|' + out.length,
      kind: z.find.kind, cx, cy,
      x: cx * TILE + TILE / 2, y: cy * TILE + TILE - 2
    });
  }
  return out;
}

export const START_ZONE = 'clairiere';
/** La zone (objet) depuis son id, un objet zone, ou n'importe quoi -> repli. */
export const zoneById = (z) => (z && z.rows) ? z : (ZONES[z] || ZONES[START_ZONE]);

// dimensions de la carte JOUÉE (donc après agrandissement), pas de la source
export const MAP_W = CLAIRIERE[0].length * ZOOM;
export const MAP_H = CLAIRIERE.length * ZOOM;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Le caractère de la carte en (cx, cy) ; hors carte -> arbre (mur naturel). */
export function charAt(zone, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return 'T';
  return zoneById(zone).rows[cy][cx];
}

export const isWater = (zone, cx, cy) => charAt(zone, cx, cy) === '~';

/**
 * Ce qui bloque : l'eau, les arbres/sapins. Hors carte, on bloque SAUF si la
 * zone a une liaison de ce côté — c'est ainsi qu'on passe d'une zone à l'autre.
 */
export function isSolid(zone, cx, cy) {
  const z = zoneById(zone);
  if (cx < 0) return !z.links.west;
  if (cx >= MAP_W) return !z.links.east;
  if (cy < 0) return !z.links.north;
  if (cy >= MAP_H) return !z.links.south;
  const c = z.rows[cy][cx];
  return c === '~' || c === 'T' || c === 'p';
}

/**
 * Auto-tuilage d'une case d'eau : on choisit dans le bloc 3x3 des berges selon
 * les voisins, pour que la rive s'ourle proprement autour de l'eau.
 */
export function waterTile(zone, cx, cy) {
  const up = isWater(zone, cx, cy - 1), down = isWater(zone, cx, cy + 1);
  const left = isWater(zone, cx - 1, cy), right = isWater(zone, cx + 1, cy);
  if (up && down && left && right) return T.water;      // plein bain
  const row = !up ? 0 : (!down ? 2 : 1);
  const col = !left ? 0 : (!right ? 2 : 1);
  return [[T.bankNW, T.bankN, T.bankNE],
          [T.bankW, T.bankC, T.bankE],
          [T.bankSW, T.bankS, T.bankSE]][row][col];
}

/** La tuile de SOL d'une case (l'eau est auto-tuilée, le reste est de l'herbe). */
export function groundTile(zone, cx, cy) {
  const c = charAt(zone, cx, cy);
  if (c === '~') return waterTile(zone, cx, cy);
  if (c === 'd') return T.dirt;
  return ((cx + cy) % 7 === 0) ? T.grass2 : T.grass;   // herbe légèrement variée
}

/** La tuile de DÉCOR posée sur le sol, ou null. */
export function decorTile(zone, cx, cy) {
  const c = charAt(zone, cx, cy);
  if (c === 'T') return T.tree;
  if (c === 'p') return T.pine;
  if (c === 'b') return T.bush;
  if (c === 'f') return T.flower;
  if (c === 's') return T.sprout;
  return null;
}

/**
 * Déplacement avec collisions : on tente l'axe X puis l'axe Y séparément, ce
 * qui permet de glisser le long d'un obstacle au lieu de s'y coller.
 * (px, py) = pieds de la loutre, en pixels monde. r = demi-largeur du corps.
 */
export function moveWithCollision(zone, px, py, dx, dy, r = 5) {
  let nx = px, ny = py;
  const free = (x, y) => {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - 3) / TILE), y1 = Math.floor((y + 1) / TILE);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (isSolid(zone, cx, cy)) return false;
    }
    return true;
  };
  if (dx && free(px + dx, py)) nx = px + dx;
  if (dy && free(nx, py + dy)) ny = py + dy;
  return { x: nx, y: ny };
}

/**
 * A-t-on franchi un bord vers une zone voisine ? Retourne la zone d'arrivée et
 * la position d'entrée (on ressort du côté opposé), ou null.
 */
export function zoneExit(zone, px, py) {
  const z = zoneById(zone);
  const M = TILE;                       // on entre d'une tuile dans la zone
  if (px < 0 && z.links.west) return { to: z.links.west, x: WORLD_W - M, y: py };
  if (px > WORLD_W && z.links.east) return { to: z.links.east, x: M, y: py };
  if (py < 0 && z.links.north) return { to: z.links.north, x: px, y: WORLD_H - M };
  if (py > WORLD_H && z.links.south) return { to: z.links.south, x: px, y: M };
  return null;
}

/** La case praticable la plus proche de (cx, cy), en pixels monde. */
export function nearestFree(zone, cx, cy) {
  const toPx = (x, y) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE - 2 });
  for (let r = 0; r < Math.max(MAP_W, MAP_H); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      if (!isSolid(zone, x, y)) return toPx(x, y);
    }
  }
  return toPx(1, 1);
}

/**
 * Les PASSAGES d'une zone : pour chaque bord ouvert, le milieu de la brèche
 * praticable, en pixels monde. Sans repère visible, on croit la carte close —
 * c'est exactement ce qui donnait l'impression d'un monde minuscule.
 */
export function zoneGates(zone) {
  const z = zoneById(zone);
  const out = [];
  const milieu = (cases) => cases[(cases.length / 2) | 0];
  for (const [dir, to] of Object.entries(z.links)) {
    const libres = [];
    if (dir === 'north' || dir === 'south') {
      const cy = dir === 'north' ? 0 : MAP_H - 1;
      for (let cx = 0; cx < MAP_W; cx++) if (!isSolid(z, cx, cy)) libres.push(cx);
      if (!libres.length) continue;
      out.push({ dir, to, name: zoneById(to).name,
        x: (milieu(libres) + 0.5) * TILE, y: (dir === 'north' ? 0.5 : MAP_H - 0.5) * TILE });
    } else {
      const cx = dir === 'west' ? 0 : MAP_W - 1;
      for (let cy = 0; cy < MAP_H; cy++) if (!isSolid(z, cx, cy)) libres.push(cy);
      if (!libres.length) continue;
      out.push({ dir, to, name: zoneById(to).name,
        x: (dir === 'west' ? 0.5 : MAP_W - 0.5) * TILE, y: (milieu(libres) + 0.5) * TILE });
    }
  }
  return out;
}

/** Position d'arrivée sûre dans une zone, au plus près du point visé. */
export function safeEntry(zone, px, py) {
  const cx = Math.max(0, Math.min(MAP_W - 1, Math.floor(px / TILE)));
  const cy = Math.max(0, Math.min(MAP_H - 1, Math.floor(py / TILE)));
  return nearestFree(zone, cx, cy);
}

/** Le point de départ d'une zone (sa clairière d'entrée). */
export function spawnPoint(zone) {
  const z = zoneById(zone);
  return nearestFree(z, z.start[0], z.start[1]);
}
