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
 * Chaque zone a son INTÉRÊT propre, pour que s'éloigner du foyer paie :
 *  - `find`  : ce qu'on y ramasse au sol (nature + quantité) ;
 *  - `boost` : les loutres sauvages y sont d'autant plus fortes qu'on va loin.
 */
export const ZONES = {
  clairiere: {
    id: 'clairiere', name: 'La clairière', rows: CLAIRIERE, start: [8, 22],
    links: { north: 'foret', east: 'lac', west: 'roseaux', south: 'vallon' },
    find: { kind: 'poisson', count: 3 }, boost: 0
  },
  foret: {
    id: 'foret', name: 'La forêt', rows: FORET, start: [14, 27],
    links: { south: 'clairiere', west: 'cascade' },
    find: { kind: 'champignon', count: 3 }, boost: 2
  },
  cascade: {
    id: 'cascade', name: 'La cascade', rows: CASCADE, start: [20, 5],
    links: { east: 'foret', south: 'roseaux' },
    find: { kind: 'gemme', count: 2 }, boost: 4
  },
  roseaux: {
    id: 'roseaux', name: 'Les roseaux', rows: ROSEAUX, start: [15, 1],
    links: { north: 'cascade', east: 'clairiere' },
    find: { kind: 'coquillage', count: 3 }, boost: 1
  },
  lac: {
    id: 'lac', name: 'Le grand lac', rows: LAC, start: [2, 24],
    links: { west: 'clairiere' },
    find: { kind: 'tresor', count: 2 }, boost: 3
  },
  vallon: {
    id: 'vallon', name: 'Le vallon', rows: VALLON, start: [8, 2],
    links: { north: 'clairiere' },
    find: { kind: 'fleur', count: 3 }, boost: 1
  }
};

/** Ce que chaque trouvaille montre à l'écran. */
export const FIND_ICON = {
  poisson: '🐟', champignon: '🍄', gemme: '💎',
  coquillage: '🐚', tresor: '🎁', fleur: '🌼'
};

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
  for (let guard = 0; out.length < z.find.count && guard < 600; guard++) {
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

export const MAP_W = CLAIRIERE[0].length;
export const MAP_H = CLAIRIERE.length;
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
