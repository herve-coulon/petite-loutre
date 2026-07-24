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
 * Les cartes sont DESSINÉES en 30x30, puis éventuellement agrandies : chaque
 * case devient un carré de ZOOM x ZOOM tuiles.
 *
 * ZOOM valait 2 : cela doublait le territoire SANS doubler son contenu. Une
 * zone faisait alors 17 écrans pour neuf points d'intérêt — on traversait des
 * écrans d'herbe vide et le lieu voisin était à trois écrans de marche. Pire,
 * les points ancrés « en coordonnées de dessin » (les loutres sauvages) se
 * tassaient tous dans le quart haut-gauche : on pouvait explorer la moitié
 * d'une carte sans croiser âme qui vive. D'où « je n'ai qu'une seule carte,
 * c'est peu peuplé, il n'y a rien à faire ». À 1, une zone tient en ~4 écrans
 * et les ancrages retombent juste : on croise quelque chose sans cesse.
 */
export const ZOOM = 1;
/**
 * Ouvre un couloir praticable sur chaque bord LIÉ. Les trouées étaient taillées
 * à la main dans les cartes : fragiles, faciles à refermer sans s'en rendre
 * compte, et rien ne garantissait qu'une liaison déclarée soit franchissable.
 * On les DÉRIVE désormais des liaisons — déclarer un lien suffit à l'ouvrir.
 */
function ouvrirPassages(rows, links) {
  const h = rows.length, w = rows[0].length;
  const grille = rows.map(r => r.split(''));
  const creuser = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) grille[y][x] = '.';
    }
  };
  const LARG = 4, PROF = 6;              // couloir large et assez profond pour rejoindre le terrain
  const cx = Math.floor(w / 2) - Math.floor(LARG / 2);
  const cy = Math.floor(h / 2) - Math.floor(LARG / 2);
  if (links.north) creuser(cx, 0, cx + LARG - 1, PROF - 1);
  if (links.south) creuser(cx, h - PROF, cx + LARG - 1, h - 1);
  if (links.west) creuser(0, cy, PROF - 1, cy + LARG - 1);
  if (links.east) creuser(w - PROF, cy, w - 1, cy + LARG - 1);
  return grille.map(r => r.join(''));
}

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

// LE DELTA : là où la rivière se répand avant de partir. Bancs de sable, bras
// d'eau et cris d'oiseaux. Ouverture à l'ouest vers le lac.
const CARTE_DELTA = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T....~~~~......~~~~..........T',
  'T...~~~~~~....~~~~~~.....ss..T',
  'T..~~~~~~~~..~~~~~~~~........T',
  'T...~~~~~~....~~~~~~.........T',
  'T....~~~~......~~~~....bb....T',
  'T.............................',
  'T.....ss.........ss...........',
  'T.............................',
  'T..~~~~~~..........~~~~~~....T',
  'T.~~~~~~~~........~~~~~~~~...T',
  'T..~~~~~~..........~~~~~~....T',
  'T............ss..............T',
  'T.....bb.....................T',
  'T.............................',
  'T....~~~~~~~~~~~~~~~~........T',
  'T...~~~~~~~~~~~~~~~~~~.......T',
  'T....~~~~~~~~~~~~~~~~........T',
  'T............................T',
  'T.......ss..........bb.......T',
  'T............................T',
  'T..~~~~~........~~~~~........T',
  'T.~~~~~~~......~~~~~~~.......T',
  'T..~~~~~........~~~~~........T',
  'T............................T',
  'T....ss..............ss......T',
  'T............................T',
  'T.......bb...........ss......T',
  'T............................T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

// LA GORGE : une faille étroite entre deux parois d'arbres, un torrent au fond.
// Ouverture au nord vers le vallon.
const GORGE = [
  'TTTTTTTTTTTTT......TTTTTTTTTTT',
  'TTTTTTTTTTT..........TTTTTTTTT',
  'TTTTTTTTT....~~~~......TTTTTTT',
  'TTTTTTTT.....~~~~.......TTTTTT',
  'TTTTTTT..bb..~~~~........TTTTT',
  'TTTTTT.......~~~~.........TTTT',
  'TTTTT........~~~~..........TTT',
  'TTTT....ss...~~~~...........TT',
  'TTT..........~~~~............T',
  'TT...........~~~~............T',
  'TT....bb.....~~~~.....ss.....T',
  'TT...........~~~~............T',
  'TT...........~~~~............T',
  'TT..ss.......~~~~............T',
  'TT...........~~~~......bb....T',
  'TT...........~~~~............T',
  'TT...........~~~~............T',
  'TTT..........~~~~...........TT',
  'TTT...bb.....~~~~....ss.....TT',
  'TTTT.........~~~~..........TTT',
  'TTTT.........~~~~..........TTT',
  'TTTTT........~~~~.........TTTT',
  'TTTTT...ss...~~~~.........TTTT',
  'TTTTTT.......~~~~........TTTTT',
  'TTTTTT.......~~~~........TTTTT',
  'TTTTTTT......~~~~.......TTTTTT',
  'TTTTTTT..bb..~~~~.......TTTTTT',
  'TTTTTTTT.....~~~~......TTTTTTT',
  'TTTTTTTTT....~~~~.....TTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

// LA SAPINIÈRE : des sapins serrés, sombres, où la lumière tombe en aiguilles.
// Ouverture au sud vers la forêt.
const SAPINIERE = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'Tppp....ppp.....ppp.....pppppT',
  'Tpp......pp......pp......ppppT',
  'T....ss.....pp.......ss......T',
  'T...........pp...............T',
  'Tpp.....ppp......ppp.....pp..T',
  'Tpp.....ppp......ppp.....pp..T',
  'T............................T',
  'T...bb.........ss.......bb...T',
  'T............................T',
  'Tppp......pp.......pp.....pppT',
  'Tppp......pp.......pp.....pppT',
  'T............................T',
  'T......ss........~~~~........T',
  'T...............~~~~~~.......T',
  'T................~~~~........T',
  'T............................T',
  'Tpp....ppp....pp....ppp....ppT',
  'Tpp....ppp....pp....ppp....ppT',
  'T............................T',
  'T....ss.......bb........ss...T',
  'T............................T',
  'Tppp.....pp......pp......pppTT',
  'Tppp.....pp......pp......pppTT',
  'T............................T',
  'T........ss..........bb......T',
  'T............................T',
  'Tpp...ppp.....ppp.....ppp..ppT',
  'Tpp...ppp.....ppp.....ppp..ppT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT'
];

export const ZONES = {
  clairiere: {
    id: 'clairiere', name: 'La clairière', rows: expand(CLAIRIERE, ZOOM), start: [8 * ZOOM, 22 * ZOOM],
    links: { north: 'foret', east: 'lac', west: 'roseaux', south: 'vallon' },
    find: { kind: 'poisson', count: 3 }, boost: 0
  },
  foret: {
    id: 'foret', name: 'La forêt', rows: expand(FORET, ZOOM), start: [14 * ZOOM, 27 * ZOOM],
    links: { south: 'clairiere', west: 'cascade', north: 'sapiniere' },
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
    links: { west: 'clairiere', east: 'delta' },
    find: { kind: 'tresor', count: 2 }, boost: 3
  },
  vallon: {
    id: 'vallon', name: 'Le vallon', rows: expand(VALLON, ZOOM), start: [8 * ZOOM, 2 * ZOOM],
    links: { north: 'clairiere', south: 'gorge' },
    find: { kind: 'fleur', count: 3 }, boost: 1
  },
  delta: {
    id: 'delta', name: 'Le delta', rows: expand(CARTE_DELTA, ZOOM), start: [3 * ZOOM, 14 * ZOOM],
    links: { west: 'lac' },
    find: { kind: 'crabe', count: 3 }, boost: 5
  },
  gorge: {
    id: 'gorge', name: 'La gorge', rows: expand(GORGE, ZOOM), start: [15 * ZOOM, 1 * ZOOM],
    links: { north: 'vallon' },
    find: { kind: 'silex', count: 3 }, boost: 3
  },
  sapiniere: {
    id: 'sapiniere', name: 'La sapinière', rows: expand(SAPINIERE, ZOOM), start: [15 * ZOOM, 28 * ZOOM],
    links: { south: 'foret' },
    find: { kind: 'baie', count: 3 }, boost: 2
  }
};
// Chaque bord LIÉ est ouvert d'office : déclarer une liaison suffit désormais à
// la rendre franchissable, sans dépendre d'une trouée taillée à la main.
for (const z of Object.values(ZONES)) z.rows = ouvrirPassages(z.rows, z.links);


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
      'La rivière y coule sans se presser — un endroit pour souffler.'] },
  delta: { emoji: '🌅', title: 'Le delta',
    lines: ['La rivière se répand, hésite, se divise en mille bras.',
      'Des bancs de sable, des crabes, et le vent qui sent déjà le sel.'] },
  gorge: { emoji: '⛰️', title: 'La gorge',
    lines: ['Deux parois se resserrent ; le torrent gronde tout au fond.',
      'On avance à l\'étroit, entre la pierre et l\'eau vive.'] },
  sapiniere: { emoji: '🌲', title: 'La sapinière',
    lines: ['Les sapins montent droit et serrés, la lumière tombe en aiguilles.',
      'Il fait frais ici, et l\'on n\'entend que ses propres pas.'] }
};

/** Ce que chaque trouvaille montre à l'écran. */
export const FIND_ICON = {
  poisson: '🐟', champignon: '🍄', gemme: '💎',
  coquillage: '🐚', tresor: '🎁', fleur: '🌼',
  crabe: '🦀', silex: '🪨', baie: '🫐'
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
    effet: 'on s\'y délasse : l\'entrain et l\'énergie reviennent' },
  delta: { icon: '🌅', nom: 'Le grand large',
    effet: 'les crabes des bancs de sable valent cher, et remettent d\'aplomb' },
  gorge: { icon: '⚒️', nom: 'La faille',
    effet: 'les silex du torrent se monnaient bien — et forment le caractère' },
  sapiniere: { icon: '🌲', nom: 'Les aiguilles',
    effet: 'les baies y poussent en abondance : de quoi tenir longtemps' }
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

/**
 * LA FAUNE d'ambiance : de petites bêtes qui vaquent, propres à chaque lieu.
 * Purement décoratives — mais sans elles les zones restaient des prés vides où
 * seuls trois PNJ attendaient, immobiles. Une vallée doit grouiller un peu.
 */
export const FAUNE = {
  clairiere: ['🦋', '🐝', '🐞'],
  foret:     ['🦋', '🐦', '🐌'],
  cascade:   ['🐦', '🦋'],
  roseaux:   ['🦗', '🐸', '🦆'],
  lac:       ['🦆', '🐟', '🦢'],
  vallon:    ['🦋', '🐝', '🐇'],
  delta:     ['🦆', '🦀', '🐦'],
  gorge:     ['🦇', '🦎'],
  sapiniere: ['🐿️', '🐦', '🦉']
};

/**
 * L'HABITANT de chaque lieu. Une zone sans personne est un décor : celui-ci y
 * vit, on lui parle en s'approchant, et il rend UNE FOIS PAR JOUR le service
 * de son lieu — poussé plus loin que ce qu'une trouvaille peut donner.
 * `don` est lu par l'orchestrateur, qui seul touche à l'état du jeu.
 */
export const HABITANT = {
  clairiere: { emoji: '🦡', nom: 'Basile', role: 'le doyen du carrefour', don: 'piste',
    mots: ['Tout le monde passe par ici, petite. Moi, je regarde.',
      'Une vallée, ça se lit comme une piste : il faut savoir où renifler.'] },
  foret: { emoji: '🦉', nom: 'Hulotte', role: 'la gardienne des fougères', don: 'provisions',
    mots: ['Chut… sous les fougères, tout pousse en silence.',
      'Tu as l\'air affamée. Tiens, prends de mes réserves.'] },
  cascade: { emoji: '🦅', nom: 'Milan', role: 'le pêcheur de la chute', don: 'rincage',
    mots: ['L\'eau blanche décrasse mieux que dix bains tièdes.',
      'Passe sous la chute, tu ressortiras neuve.'] },
  roseaux: { emoji: '🐸', nom: 'Coasse', role: 'la commère du marais', don: 'friandise',
    mots: ['On entend tout, dans les roseaux. Tout !',
      'J\'avais mis de côté une petite douceur… la voilà.'] },
  lac: { emoji: '🦫', nom: 'Gaspard', role: 'l\'ingénieur du lac', don: 'gemme',
    mots: ['Un bon barrage, ça se pense avant de se bâtir.',
      'Le fond du lac rend ce qu\'on lui laisse le temps de rendre.'] },
  vallon: { emoji: '🦌', nom: 'Sylve', role: 'la calme du pré', don: 'repos',
    mots: ['Rien ne presse, dans le vallon. Rien.',
      'Souffle un peu. Tu repartiras plus vive.'] },
  delta: { emoji: '🦆', nom: 'Colvert', role: 'le rebouteux des bancs', don: 'remede',
    mots: ['J\'en ai vu, des bêtes amochées, remonter le courant.',
      'Montre-moi ça. Deux herbes, et il n\'y paraîtra plus.'] },
  gorge: { emoji: '🦇', nom: 'Vespertin', role: 'l\'ombre de la faille', don: 'lecon',
    mots: ['Ici, on n\'y voit rien. Alors on apprend à écouter.',
      'Retiens ceci, petite : le silence dit tout.'] },
  sapiniere: { emoji: '🐿️', nom: 'Noisette', role: 'la guetteuse des cimes', don: 'guet',
    mots: ['De là-haut, je vois toute la vallée. TOUTE.',
      'Et je vois surtout ce qui porte un chapeau et un fusil.'] }
};

/**
 * Le COFFRE de chaque lieu : un trésor unique, à l'écart, qu'on n'ouvre qu'une
 * fois. C'est ce qui donne une raison de fouiller une zone au-delà de ses
 * trouvailles du jour — six coffres, six trésors, une collection.
 */
export const COFFRE = {
  clairiere: 'trefle', foret: 'gland', cascade: 'bulle',
  roseaux: 'plume', lac: 'perle', vallon: 'luciole',
  delta: 'amulette', gorge: 'caillou_lune', sapiniere: 'boussole'
};

/** Toutes les zones qui recèlent un coffre (pour compter la collection). */
export const COFFRE_ZONES = Object.keys(COFFRE);

/**
 * L'ÉPREUVE de chaque lieu : une championne qui garde les lieux et qu'il faut
 * battre en duel. C'est le seul contenu de la vallée qu'on puisse RATER — le
 * reste se ramasse. `force` multiplie les statistiques de l'adversaire ; elle
 * suit le `boost` de la zone, pour que la vallée se durcisse à mesure qu'on
 * s'éloigne du carrefour.
 */
export const EPREUVE = {
  clairiere: { nom: 'Ondine', titre: 'la vive du carrefour', fur: 'roux', force: 0.95,
    defi: 'Personne ne traverse ma clairière sans me montrer ce qu\'il sait faire.' },
  roseaux: { nom: 'Vasouille', titre: 'la reine des mares', fur: 'choco', force: 1.05,
    defi: 'Dans mes roseaux, on avance à l\'oreille. Tu entends quoi, toi ?' },
  vallon: { nom: 'Pâquerette', titre: 'la douce du pré', fur: 'bonbon', force: 1.1,
    defi: 'On me dit tendre. On se trompe rarement deux fois.' },
  foret: { nom: 'Fougère', titre: 'l\'ombre des sapins', fur: 'nuit', force: 1.2,
    defi: 'Sous les arbres, je vois avant d\'être vue. À toi de jouer.' },
  lac: { nom: 'Abysse', titre: 'la gardienne des fonds', fur: 'neige', force: 1.3,
    defi: 'Le lac est profond. Toi, jusqu\'où descends-tu ?' },
  cascade: { nom: 'Écume', titre: 'l\'indomptée de la chute', fur: 'braise', force: 1.45,
    defi: 'Je vis dans le fracas. Si tu tiens debout ici, tu tiendras partout.' },
  sapiniere: { nom: 'Aiguille', titre: 'la sentinelle des sapins', fur: 'nuit', force: 1.20,
    defi: 'Sous mes arbres, on avance à découvert. Toi la première.' },
  gorge: { nom: 'Rocaille', titre: 'la dure de la faille', fur: 'choco', force: 1.30,
    defi: 'La pierre ne cède pas. Moi non plus. Essaie donc.' },
  delta: { nom: 'Marée', titre: 'la reine du grand large', fur: 'neige', force: 1.60,
    defi: 'Au bout de la vallée, il n\'y a plus que moi. Et la mer.' }
};

export const EPREUVE_ZONES = Object.keys(EPREUVE);

/** Où la championne attend : entre l'habitant et le coffre — on ne la rate pas,
 *  mais on ne lui tombe pas dessus en arrivant. */
export function epreuveAt(zone) {
  const p = pointStable(zone, 'epreuve', 9, 20);
  const px = nearestFree(zone, p.cx, p.cy);
  return { ...px, cx: p.cx, cy: p.cy };
}

/** Distances à l'arrivée, en cases : l'habitant se croise, le coffre se cherche. */
export const HABITANT_PRES = 12;   // au plus, sinon on ne le rencontre jamais
export const COFFRE_LOIN = 14;     // au moins, sinon on le ramasse en arrivant

/**
 * Un point stable et praticable d'une zone, à une distance donnée du point
 * d'arrivée. La graine ne dépend PAS du jour : l'habitant et le coffre sont
 * toujours au même endroit, sinon on ne pourrait ni retrouver l'un ni
 * chercher l'autre.
 */
function pointStable(zone, graine, min, max) {
  const z = zoneById(zone);
  const rnd = rngFrom(graine + '|' + z.id);
  const [sx, sy] = z.start;
  let repli = null, meilleur = Infinity;
  for (let i = 0; i < 900; i++) {
    const cx = Math.floor(rnd() * MAP_W), cy = Math.floor(rnd() * MAP_H);
    if (isSolid(z, cx, cy)) continue;
    const d = Math.hypot(cx - sx, cy - sy);
    if (d >= min && d <= max) return { cx, cy };
    // repli : la case praticable qui rate la fourchette de moins
    const ecart = d < min ? min - d : d - max;
    if (ecart < meilleur) { meilleur = ecart; repli = { cx, cy }; }
  }
  return repli || { cx: sx, cy: sy };
}

/** Où se tient l'habitant : à portée de l'arrivée, on doit tomber dessus. */
export function habitantAt(zone) {
  const p = pointStable(zone, 'habitant', 5, HABITANT_PRES);
  const px = nearestFree(zone, p.cx, p.cy);
  return { ...px, cx: p.cx, cy: p.cy };
}

/** Où dort le coffre : à l'écart, il doit se mériter. */
export function coffreAt(zone) {
  const p = pointStable(zone, 'coffre', COFFRE_LOIN, Infinity);
  const px = nearestFree(zone, p.cx, p.cy);
  return { ...px, cx: p.cx, cy: p.cy };
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

/* ---------------- Itinéraire ---------------- */

/** Le point de marche au centre-bas d'une case (même repère que nearestFree). */
const casePx = (cx, cy) => ({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE - 2 });

/**
 * L'ITINÉRAIRE d'un point à un autre, en points de passage (pixels monde).
 *
 * La marche allait TOUT DROIT et renonçait au premier obstacle. Un arbre entre
 * la loutre et le bord suffisait donc à rendre une zone voisine inatteignable :
 * on tapait, elle se collait au tronc, on retapait, elle s'y recollait. Quatre
 * passages sur dix-huit étaient ainsi bouchés depuis le point d'arrivée — d'où
 * « les cartes ne s'enchaînent pas ». On calcule désormais un vrai chemin
 * (parcours en largeur sur les cases libres, 900 cases : instantané).
 *
 * Si la cible est inatteignable (dans l'eau, derrière un rocher), on retient la
 * case atteinte la PLUS PROCHE : la loutre s'approche au mieux au lieu de
 * refuser de bouger. Un point visé hors carte (c'est ainsi qu'on sort d'une
 * zone) est conservé en bout de chemin, pour que le bord soit bien franchi.
 */
export function findPath(zone, fromX, fromY, toX, toY) {
  const z = zoneById(zone);
  const dansCarte = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  const borne = (v, max) => Math.max(0, Math.min(max - 1, v));
  const sx = borne(Math.floor(fromX / TILE), MAP_W), sy = borne(Math.floor(fromY / TILE), MAP_H);
  const gx = borne(Math.floor(toX / TILE), MAP_W), gy = borne(Math.floor(toY / TILE), MAP_H);
  const dehors = !dansCarte(Math.floor(toX / TILE), Math.floor(toY / TILE));
  const fin = () => (dehors ? [{ x: toX, y: toY }] : []);
  if (sx === gx && sy === gy) return fin();

  const N = MAP_W * MAP_H;
  const prev = new Int32Array(N).fill(-1);
  const vu = new Uint8Array(N);
  const file = new Int32Array(N);
  let tete = 0, queue = 0;
  const depart = sy * MAP_W + sx;
  vu[depart] = 1; file[queue++] = depart;
  let atteint = -1, meilleur = depart, meilleurD = (gx - sx) ** 2 + (gy - sy) ** 2;

  while (tete < queue) {
    const cur = file[tete++];
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    if (cx === gx && cy === gy) { atteint = cur; break; }
    const d = (gx - cx) ** 2 + (gy - cy) ** 2;
    if (d < meilleurD) { meilleurD = d; meilleur = cur; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!dansCarte(nx, ny)) continue;
      const n = ny * MAP_W + nx;
      if (vu[n] || isSolid(z, nx, ny)) continue;
      vu[n] = 1; prev[n] = cur; file[queue++] = n;
    }
  }

  // on remonte la piste jusqu'au départ, puis on la remet à l'endroit
  const cases = [];
  for (let c = atteint >= 0 ? atteint : meilleur; c !== depart && c >= 0; c = prev[c]) {
    cases.push(c);
  }
  cases.reverse();

  // on ne garde que les VIRAGES : marcher case par case saccadait l'allure
  const pts = [];
  for (let i = 0; i < cases.length; i++) {
    const cx = cases[i] % MAP_W, cy = (cases[i] / MAP_W) | 0;
    const suiv = cases[i + 1];
    if (suiv !== undefined) {
      const nx = suiv % MAP_W, ny = (suiv / MAP_W) | 0;
      const px = i > 0 ? cases[i - 1] % MAP_W : cx - (nx - cx);
      const py = i > 0 ? (cases[i - 1] / MAP_W) | 0 : cy - (ny - cy);
      if ((nx - cx) === (cx - px) && (ny - cy) === (cy - py)) continue;  // tout droit
    }
    pts.push(casePx(cx, cy));
  }
  return pts.concat(fin());
}

/**
 * A-t-on franchi un bord vers une zone voisine ? Retourne la zone d'arrivée et
 * la position d'entrée (on ressort du côté opposé), ou null.
 */
/**
 * Marge de franchissement. Il FALLAIT sortir de la carte (px < 0) pour changer
 * de zone… ce qui était impossible : la caméra est bornée aux limites du monde,
 * donc un toucher ne peut jamais désigner un point hors carte, et la loutre
 * s'arrêtait à x≈0,6. Résultat : cinq zones sur six étaient inatteignables, et
 * la carte ne proposait que les lieux DÉJÀ visités — qu'on ne pouvait donc
 * jamais découvrir. On franchit désormais en ATTEIGNANT le bord.
 */
export const BORD_SORTIE = 5;

export function zoneExit(zone, px, py) {
  const z = zoneById(zone);
  const M = TILE;                       // on entre d'une tuile dans la zone
  const B = BORD_SORTIE;
  if (px <= B && z.links.west) return { to: z.links.west, x: WORLD_W - M, y: py };
  if (px >= WORLD_W - B && z.links.east) return { to: z.links.east, x: M, y: py };
  if (py <= B && z.links.north) return { to: z.links.north, x: px, y: WORLD_H - M };
  if (py >= WORLD_H - B && z.links.south) return { to: z.links.south, x: px, y: M };
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
/**
 * Point d'arrivée dans une zone. Il est ensuite ÉCARTÉ des marges de sortie :
 * nearestFree cale sur le bas de la tuile (cy*TILE + TILE - 2), si bien qu'une
 * arrivée sur la dernière rangée tombait à y=958 — dans la marge du bord sud,
 * et l'on repartait aussitôt d'où l'on venait, en boucle.
 * Le recadrage vaut quelques pixels : on reste dans la même tuile, donc libre.
 */
export function safeEntry(zone, px, py) {
  const cx = Math.max(0, Math.min(MAP_W - 1, Math.floor(px / TILE)));
  const cy = Math.max(0, Math.min(MAP_H - 1, Math.floor(py / TILE)));
  const p = nearestFree(zone, cx, cy);
  const marge = BORD_SORTIE + 3;
  return {
    x: Math.max(marge, Math.min(WORLD_W - marge, p.x)),
    y: Math.max(marge, Math.min(WORLD_H - marge, p.y))
  };
}

/** Le point de départ d'une zone (sa clairière d'entrée). */
export function spawnPoint(zone) {
  const z = zoneById(zone);
  return nearestFree(z, z.start[0], z.start[1]);
}
