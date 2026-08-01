// Pixel art : chaque sprite est une grille de caractères -> couleurs de PAL.
// '.' = transparent. Validé par les tests (largeur constante, couleurs connues).
export const PAL = {
  D: '#2b1c13', B: '#9a6238', C: '#f3ddb6', K: '#1c110b',
  W: '#fffaf0', G: '#7d93a6', g: '#c6d3dd', q: '#6f4526',
  O: '#f2913d', R: '#e5484d', P: '#e69684', U: '#4a6fae',
  Y: '#f2c14e',
  V: '#8fae72', v: '#6f8f57'   // verts du manifest v2 (ILL / ILL2) — faune & bestiaire pixel
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


/* ─────────────────── Bestiaire & faune en PIXEL (É2) ───────────────────
 * Grilles 16 px dans la palette du kit — copiées telles quelles depuis la
 * planche validée du designer (patch_bestiaire_pixel.js). Fin des emoji dans
 * le monde (charte DA, règle 4). Tout profil regarde à DROITE ; miroir via le
 * paramètre `flip` de drawSprite. */
export const SPRITES_BESTIAIRE = {
  crLapin: [
    '..DD........',
    '.DCBD.DD....',
    '.DCBDDCBD...',
    '.DCBDCBD....',
    '..DCCCCD....',
    '.DCCKCCCD...',
    '.DCCCCPCD...',
    '..DCCCCD....',
    '.DCCCCCCD...',
    'DCCBCCCCCD..',
    'DCCBCCCCBD..',
    '.DDDDDDDD...'
  ],
  crRenard: [
    '..DD............',
    '.DOOD.......DD..',
    '.DOKOD.....DOOD.',
    '..DOOODDDDDOOOD.',
    '...DOOOOOOOOOD..',
    '....DOOOOOKOOD..',
    '.....DOOOOWWOD..',
    '....DOOOOODWWD..',
    '...DOOOOOD.DD...',
    '...DOOOOOD..DWWD',
    '...DOODDOODDOOWD',
    '....DDD..DDDDDD.'
  ],
  crHeron: [
    '.......DggD.',
    '......DgKgYD',
    '......DggYYD',
    '.......DgD..',
    '......DgD...',
    '......DgD...',
    '.....DgD....',
    '.DGGDgGD....',
    'DGGGGgGGD...',
    'DGGGGGGGGD..',
    '.DGGGGGGD...',
    '..DDGGDD....',
    '....DKD.....',
    '....DK......',
    '....DKD.....',
    '...DKKD.....'
  ],
  crCastor: [
    '......DD..DD...',
    '.....DBBDDBBD..',
    '.....DBBBBBBD..',
    '.....DBKBBKBD..',
    'DDD..DBBBBBBD..',
    'DqqD.DBBKBBBD..',
    'DqqDDBBDWWDBD..',
    'DqqqDBBBWWBBD..',
    'DqqDDBCCCCBBD..',
    'DDD.DBBDDDBBD..',
    '....DDD...DDD..'
  ],
  crOurs: [
    '..DD......DD....',
    '.DqqD....DqqD...',
    '.DqqqDDDDqqqD...',
    '.DqqqqqqqqqqD...',
    '.DqKqqqqqKqD....',
    '.DqqqCCCqqqD....',
    '..DqCCKCCqqD....',
    '..DqqCCCqqqqD...',
    '.DqqqqqqqqqqqD..',
    'DqqqqqqqqqqqqD..',
    'DqqqqqqqqqqqqD..',
    'DqqDqqqqDqqqD...',
    'DqqD.DqqD.DqqD..',
    '.DD...DD...DD...'
  ],
  crSanglier: [
    '....DDDDD.......',
    '...DqDqDqDD.....',
    '..DqqqqqqqqDD...',
    '.DqqqqqqqqqqqD..',
    'DqqqqqqqqKqqqD..',
    'DqDqqqqqqqqqPD..',
    '.DqqqqqqqqWDPD..',
    '.DqqqqqqqqWDD...',
    '.DqqDqqqqDqqD...',
    '.DqqD.DqqD.DD...',
    '..DD...DD.......'
  ],
  crHibou: [
    '.DD.....DD.',
    '.DBD...DBD.',
    '..DBBBBBD..',
    '.DBCCCCCBD.',
    '.DBCYCYCBD.',
    '.DBCKCKCBD.',
    '.DBCCOCCBD.',
    '.DBBCCCBBD.',
    '.DBBBBBBBD.',
    '.DBqBBBqBD.',
    '..DBBBBBD..',
    '...DYDYD...',
    '....D.D....'
  ],
  crAigle: [
    'DD...............',
    'DqDD.............',
    'DqqqDD......DD...',
    '.DqqqqDDDDDWWD...',
    '.DqqqqqqqqDWKWD..',
    '..DqqqqqqqqWWYD..',
    '..DqqqqqqqqWDYD..',
    '.DqqqqqqqqqqDD...',
    'DqqDDqqqqqqD.....',
    'DD..DqqqqDD......',
    '.....DYDYD.......',
    '......D.D........'
  ],
};

export const SPRITES_FAUNE = {
  abeille: [
    '..WW....',
    '.WDDW...',
    '.DYKYD..',
    'DYKYKYD.',
    '.DYKYD..',
    '..DDD...',
    '........',
    '........'
  ],
  araignee: [
    'D..DD..D',
    '.DDKKDD.',
    '..DKKD..',
    '.DKKKKD.',
    'D.DKKD.D',
    '.D.DD.D.',
    'D......D',
    '........'
  ],
  baleine: [
    '..W.....',
    '..DW....',
    '.DUUDDD.',
    'DUUUUUUD',
    'DUKUUUUD',
    'DUUUUUDD',
    '.DUUUD..',
    '..DDD...'
  ],
  canard: [
    '...DDD..',
    '..DVVVD.',
    '..DVKVDY',
    '..DVVDY.',
    '.DBBBVD.',
    'DBBBBBD.',
    'DCBBBD..',
    '.DDDD...'
  ],
  cerf: [
    'D.D..D.D',
    '.DDBBDD.',
    '..DBKBD.',
    '..DBBD..',
    '.DBCBBD.',
    'DBCBBBD.',
    '.DBDBD..',
    '.D...D..'
  ],
  chauvesouris: [
    'DD....DD',
    'DKDD.DDK',
    'DKKDDDKK',
    '.DKKKKD.',
    '..DKKD..',
    '..DKKD..',
    '...DD...',
    '........'
  ],
  chenille: [
    '........',
    '......DD',
    '..DDDDVD',
    '.DVVVVVD',
    'DVKVVVD.',
    'DVVDVDD.',
    '.DD.D...',
    '........'
  ],
  chevre: [
    '.DqDDqD.',
    '..DggD..',
    '..DgKgD.',
    '..DggD..',
    '.DggggD.',
    'DgggggD.',
    '.DgDgD..',
    '.D...D..'
  ],
  coccinelle: [
    '..DD....',
    '.DKKD...',
    'DRKRRD..',
    'DRRKRD..',
    'DRKRRD..',
    '.DRRD...',
    '..DD....',
    '........'
  ],
  crabe: [
    'DD....DD',
    'DRD..DRD',
    '.DRDDRD.',
    '.DRRRRD.',
    'DRRKKRRD',
    'DRRRRRRD',
    '.DRDDRD.',
    '.D....D.'
  ],
  criquet: [
    '........',
    '......DD',
    '..DDDVKD',
    '.DVVVVD.',
    'DVVVVVD.',
    '.DvDvD..',
    '..D.D...',
    '.D...D..'
  ],
  cygne: [
    '..DWWD..',
    '.DWKWDO.',
    '.DWWDO..',
    '..DWD...',
    '.DWWWD..',
    'DWWWWWD.',
    '.DWWWWD.',
    '..DDDD..'
  ],
  dauphin: [
    '....DD..',
    '...DGGD.',
    '..DGGGDD',
    '.DGKGGGD',
    'DGGGGGD.',
    '.DWWGD..',
    '..DDD...',
    '........'
  ],
  ecureuil: [
    '..DDD...',
    '.DOOOD..',
    'DOOOODD.',
    'DOODDOKD',
    'DOODOOD.',
    '.DODOCD.',
    '.DDOOD..',
    '...DD...'
  ],
  escargot: [
    '........',
    '..DDD...',
    '.DBqBD..',
    'DBqBqBDD',
    'DBBqBDCD',
    '.DBBDCCD',
    '..DDCCD.',
    '...DDD..'
  ],
  flamant: [
    '..DPPD..',
    '.DPKPKD.',
    '..DPD...',
    '...DPD..',
    '..DPPPD.',
    '.DPPPPD.',
    '..DDPD..',
    '...DD...'
  ],
  grenouille: [
    '.DD..DD.',
    'DVWDDWVD',
    'DVKDDKVD',
    '.DVVVVD.',
    'DVVVVVVD',
    'DVCCCCVD',
    '.DvDDvD.',
    '..D..D..'
  ],
  lezard: [
    '........',
    'DD......',
    'DVDD....',
    '.DVVDDDD',
    '..DVVVKD',
    '.DVDVD..',
    '.D..D...',
    '........'
  ],
  manchot: [
    '..DDD...',
    '.DKWKD..',
    '.DKKKDO.',
    '.DKWWKD.',
    'DKWWWKD.',
    'DKWWWKD.',
    '.DKWKD..',
    '..ODO...'
  ],
  oiseau: [
    '........',
    '..DDD...',
    '.DUKUDD.',
    '.DUUUDYD',
    'DUUWWUD.',
    '.DUWWD..',
    '..DUD...',
    '..D.D...'
  ],
  ourspolaire: [
    '..DD.DD.',
    '.DWWDWWD',
    '.DWWWWD.',
    '.DWKWWD.',
    'DWWWWWDD',
    'DWWWWWWD',
    'DWWDWWD.',
    '.DD.DD..'
  ],
  papillon: [
    '.OD..DO.',
    'ODODDODO',
    'ODODDODO',
    '.ODKKDO.',
    '.ODKKDO.',
    'ODODDODO',
    '.OD..DO.',
    '........'
  ],
  phoque: [
    '........',
    '..DDDD..',
    '.DggggD.',
    'DgKgggDD',
    'DggggggD',
    '.DgggggD',
    '..DDDDD.',
    '.D..D...'
  ],
  poissontropical: [
    '........',
    '...DDD..',
    '..DYUYDD',
    '.DYUYUKD',
    '..DYUYDD',
    '...DDD..',
    '........',
    '........'
  ],
  rat: [
    '........',
    '........',
    '..DDD.DD',
    '.DGKGDD.',
    'DGGGGGD.',
    '.DGGGDC.',
    '..DDDCC.',
    '........'
  ],
  requin: [
    '...DD...',
    '..DGGD..',
    '.DGGGDD.',
    'DGKGGGGD',
    'DGGGGGDD',
    '.DWWGD..',
    '..DD.D..',
    '........'
  ],
  scarabee: [
    '........',
    '...DD...',
    '..DKKD..',
    '.DUDUD..',
    'D.DUDU.D',
    '.DUDUD..',
    'D..DD..D',
    '........'
  ],
  tortue: [
    '........',
    '..DDDD..',
    '.DvVvVD.',
    'DVvVvVDD',
    'DVVVVVDC',
    '.DDDDDDD',
    '..DC.CD.',
    '........'
  ],
};
