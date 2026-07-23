// La vallée en tuiles : atlas Kenney (CC0, cf. assets/CREDITS.txt), carte du
// monde, auto-tuilage des berges et collisions. Module PUR (aucun DOM, aucun
// canvas) : la carte et les règles de déplacement sont testables.

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

/**
 * La carte de la vallée. Une rivière descend du nord (un lac) vers le sud, un
 * sentier de terre serpente sur la rive ouest, des bosquets ferment l'horizon.
 * Légende : '.'/',' herbe · 'd' terre · '~' eau · 'T' arbre · 'p' sapin
 *           'b' buisson · 'f' fleurs · 's' pousse
 */
export const MAP_ROWS = [
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
  '.............~~~~.............'
];

export const MAP_W = MAP_ROWS[0].length;
export const MAP_H = MAP_ROWS.length;
/** Dimensions du monde en pixels. */
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Le caractère de la carte en (cx, cy) ; hors carte -> arbre (mur naturel). */
export function charAt(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return 'T';
  return MAP_ROWS[cy][cx];
}

export const isWater = (cx, cy) => charAt(cx, cy) === '~';
/** Ce qui bloque le passage : l'eau, les arbres/sapins et le hors-carte. */
export function isSolid(cx, cy) {
  const c = charAt(cx, cy);
  return c === '~' || c === 'T' || c === 'p';
}

/**
 * Auto-tuilage d'une case d'eau : on choisit dans le bloc 3x3 des berges selon
 * les voisins, pour que la rive s'ourle proprement autour de la rivière.
 */
export function waterTile(cx, cy) {
  const up = isWater(cx, cy - 1), down = isWater(cx, cy + 1);
  const left = isWater(cx - 1, cy), right = isWater(cx + 1, cy);
  if (up && down && left && right) return T.water;      // plein bain
  const row = !up ? 0 : (!down ? 2 : 1);
  const col = !left ? 0 : (!right ? 2 : 1);
  return [[T.bankNW, T.bankN, T.bankNE],
          [T.bankW, T.bankC, T.bankE],
          [T.bankSW, T.bankS, T.bankSE]][row][col];
}

/** La tuile de SOL d'une case (l'eau est auto-tuilée, le reste est de l'herbe). */
export function groundTile(cx, cy) {
  const c = charAt(cx, cy);
  if (c === '~') return waterTile(cx, cy);
  if (c === 'd') return T.dirt;
  return ((cx + cy) % 7 === 0) ? T.grass2 : T.grass;   // herbe légèrement variée
}

/** La tuile de DÉCOR posée sur le sol, ou null. */
export function decorTile(cx, cy) {
  const c = charAt(cx, cy);
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
export function moveWithCollision(px, py, dx, dy, r = 5) {
  let nx = px, ny = py;
  const free = (x, y) => {
    // on teste les quatre coins de la boîte des pieds
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - 3) / TILE), y1 = Math.floor((y + 1) / TILE);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (isSolid(cx, cy)) return false;
    }
    return true;
  };
  if (dx && free(px + dx, py)) nx = px + dx;
  if (dy && free(nx, py + dy)) ny = py + dy;
  return { x: nx, y: ny };
}

/** Clairière de départ : au milieu de la vallée, la rivière à quelques pas à l'est. */
export const START = [8, 22];

/** Une position de départ sûre : la clairière, ou la première case libre proche. */
export function spawnPoint() {
  const toPx = (cx, cy) => ({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE - 2 });
  if (!isSolid(START[0], START[1])) return toPx(START[0], START[1]);
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cx = START[0] + dx, cy = START[1] + dy;
      if (!isSolid(cx, cy)) return toPx(cx, cy);
    }
  }
  return toPx(2, 2);
}
