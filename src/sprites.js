// Pixel art : chaque sprite est une grille de caractères -> couleurs de PAL.
// '.' = transparent. Validé par les tests (largeur constante, couleurs connues).
export const PAL = {
  D: '#2b1c13', B: '#9a6238', C: '#f3ddb6', K: '#1c110b',
  W: '#fffaf0', G: '#7d93a6', g: '#c6d3dd', q: '#6f4526',
  O: '#f2913d', R: '#e5484d', P: '#e69684', U: '#4a6fae',
  Y: '#f2c14e'
};

export const SPRITES = {
  egg: [
    '................',
    '......DDDD......',
    '....DDggggDD....',
    '...DggggggggD...',
    '..DggGGGgggggD..',
    '.DgggGGGGGggggD.',
    '.DggggGGGgggggD.',
    'DggggggggggggggD',
    'DgggGGggggGGgggD',
    'DggggggggggggggD',
    '.DggggggggggggD.',
    '.DggggggggggggD.',
    '..DggggggggggD..',
    '...DDggggggDD...',
    '.....DDDDDD.....',
    '................'
  ],
  poop: [
    '....q...',
    '..qqqq..',
    '.qqqqqq.',
    'qqqqqqqq'
  ],
  fish: [
    '...OO.....',
    '.OOOOOO..O',
    'OWKOOOOOOO',
    '.OOOOOO..O',
    '...OO.....'
  ],
  heart: [
    '.RR..RR.',
    'RRRRRRRR',
    'RRRRRRRR',
    '.RRRRRR.',
    '..RRRR..',
    '...RR...'
  ],
  heron: [
    '.....gg.....',
    '....gggK....',
    'OOOOgggg....',
    '.....ggg....',
    '.....gg.....',
    '.....gg.....',
    '....gggg....',
    '...GGgggg...',
    '..GGGggggg..',
    '..GGGGgggg..',
    '...GGGGgg...',
    '.....DD.....',
    '.....D.D....',
    '....DD.DD...'
  ],

  // LE CHASSEUR : silhouette d'homme, chapeau à large bord et fusil en travers.
  // Dessiné plutôt qu'emoji : à l'échelle des tuiles il doit se reconnaître de
  // loin et faire peur, ce qu'aucun emoji ne rend.
  chasseur: [
    '......KKKK......',
    '.....KKKKKK.....',
    '...KKKKKKKKKK...',
    '.....CCCCCC.....',
    '.....CKCCKC.....',
    '.....CCCCCC.....',
    '....DDDDDDDD....',
    '...DDDDDDDDDD...',
    '...DDDDDDDDDDqq.',
    '...DDDDDDDDDDq..',
    '...DDDDDDDDDD...',
    '....DDDDDDDD....',
    '....DD....DD....',
    '....DD....DD....',
    '....KK....KK....'
  ]
};

// Grilles de PROFIL (le monde marche de profil, flip X pour l'autre sens).
export const SPRITES_MONDE = {
  babySide: [
    '..............',
    '.......DDD....',
    '.......DBBDD..',
    '.......DBqCCK.',
    '....DDDBBqDDD.',
    '..D.DBBqBBD...',
    '.DD.DBBqqD....',
    '.DDDBBCCCD....',
    '....DCCCCD....',
    '...DDDDDDD....',
    '..............'
  ],
  babySideWalk: [
    '........D.....',
    '.......DDDD...',
    '.......DBBBD..',
    '.......DBqCCK.',
    '....DDDBBqDDD.',
    '.DD.DBBqqD....',
    '.DqDBBCCqD....',
    '..DDBCCCCD....',
    '....DCCCD.....',
    '....DDDDD.....',
    '..............'
  ],
  childSide: [
    '.................',
    '.........DD......',
    '.........DDDDD...',
    '.........DBBBBD..',
    '........DBBqBDD..',
    '........DBBqqCCD.',
    '.....DDDBqBqqDD..',
    '..DD.DBBqqqDD....',
    '..DqDBBBCCqD.....',
    '..DBBBBCCCCD.....',
    '...DDBBCCCCD.....',
    '.....DDDCCCD.....',
    '....DD..DDDD.....',
    '.................'
  ],
  childSideWalk: [
    '.................',
    '.........DDDD....',
    '.........DBBBD...',
    '.........DBBBBD..',
    '........DBBqqCCK.',
    '.....DDDDBBqqCDD.',
    '..DD.DBBBqBBDD...',
    '..DqDBBBqqqD.....',
    '..DqDBBBCCqD.....',
    '..DqDBBCCCCD.....',
    '...D.DBCCCqD.....',
    '......DDDBD......',
    '......D..DD......',
    '.................'
  ],
  adultSide: [
    '....................',
    '...........DD.......',
    '..........DqDDDD....',
    '...........DBBBBD...',
    '..........DBBBKBBD..',
    '..........DBBqqCDD..',
    '.......DDDDBBqqCCCD.',
    '..DD..DBBBBBBqqPDD..',
    '..DqDDBBBBqqBBqD....',
    '..DqqDBBBBqqqqD.....',
    '..DDqqBBBCCCqqD.....',
    '...DDBBBCCCCCqD.....',
    '....DDBBCCCCCD......',
    '.....DBBCCCCBD......',
    '.....DqBDCCDqBD.....',
    '.....DqD.DqD.DD.....',
    '.....DDD.DDD........'
  ],
  adultSideWalk: [
    '....................',
    '...........DD.......',
    '..........DqDDDD....',
    '...........DBBBBD...',
    '..........DBBBKBBD..',
    '..........DBBqqCDD..',
    '......DDDDDBBqqCCCD.',
    '..DD.DBBBBBBBqqPDD..',
    '..DqDDBBBBqqBBqD....',
    '...DqDBBBBqqqqD.....',
    '...DqqBBBCCCqqD.....',
    '...DDBBBCCCCCqD.....',
    '....DDBBCCCCCDD.....',
    '....DBBCCCCCBBD.....',
    '....DqBDDCCDDqBD....',
    '...DqD..DqD...DD....',
    '...DDD..DDD.........'
  ],
};

// Grilles de FACE (portraits, chapeaux compatibles).
export const SPRITES_PORTRAITS = {
  babyFace: [
    '................',
    '......DqD.......',
    '.....DDBDD......',
    '...DDBBBBBDD....',
    '..DBBBBBBBBBD...',
    '..DBKKBBBKKBD...',
    '.DBCKKCCCKKCBD..',
    '.DBPCCKKCCCPBD..',
    '.DBCCCqqCCCCBD..',
    '..DBCCCCCCCBD...',
    '..DqBBBBBBBqD...',
    '...DBCCCCCBDDD..',
    '...DBCCCCCBDqD..',
    '...DqBCCCBqqqD..',
    '...DBCD.DCBDD...',
    '....DD...DD.....'
  ],
  childFace: [
    '....DD....DD....',
    '...DBqD..DqBD...',
    '..DBBBBDDBBBBD..',
    '..DBBBBBBBBBBD..',
    '..DBKKBBBBKKBD..',
    '.DBCKKCCCCKKCBD.',
    '..DBPCCKKCCPBD..',
    '..DBCCCqqCCCBD..',
    '..DBCCCCCCCCBD..',
    '..DqBBBBBBBBqD..',
    '...DBCCCCCCBD...',
    '...DBqCCCCqBDD..',
    '...DBCCCCCCBqqD.',
    '...DqBCCCCBqqqD.',
    '...DBCD..DCBDD..',
    '....DD....DD....'
  ],
  adultFace: [
    '....DD....DD....',
    '...DBqD..DqBD...',
    '..DBBBBDDBBBBD..',
    '.DBBBBBBBBBBBBD.',
    '.DBBKKBBBBKKBBD.',
    'DBBCKKCCCCKKCBBD',
    '.DBPCCCKKCCCPBD.',
    '.DBCCCCqqCCCCBD.',
    '..DBCCCCCCCCBD..',
    '..DqBBBBBBBBqD..',
    '..DBBCCCCCCBBD..',
    '..DBqCCCCCCqBD..',
    '..DBqCCCCCCqBD..',
    '..DBBCCCCCCBBDD.',
    '..DBBCCCCCCBBqqD',
    '..DqBBBBBBBBqqqD',
    '..DBCCD..DCCBDD.',
    '...DDD....DDD...'
  ],
};
