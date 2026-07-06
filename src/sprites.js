// Pixel art : chaque sprite est une grille de caractères -> couleurs de PAL.
// '.' = transparent. Validé par les tests (largeur constante, couleurs connues).
export const PAL = {
  D: '#3b2416', B: '#8a5a34', C: '#ecd7ae', K: '#20160f',
  W: '#ffffff', G: '#7d93a6', g: '#c6d3dd', q: '#6f4623',
  O: '#f2913d', R: '#e5484d', P: '#f0a1a1'
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
  baby: [
    '....DD....DD....',
    '...DBBD..DBBD...',
    '..DBBBBDDBBBBD..',
    '.DBBBBBBBBBBBBD.',
    '.DBBBBBBBBBBBBD.',
    'DBBWKBBBBBBWKBBD',
    'DBBBBBCCCCBBBBBD',
    'DBBBBCCKKCCBBBBD',
    '.DBBBCCCCCCBBBD.',
    '.DBBBBCCCCBBBBD.',
    '..DBBCCCCCCBBD..',
    '..DBBCCCCCCBBD..',
    '...DBBBBBBBBD...',
    '....DDDDDDDD....',
    '................',
    '................'
  ],
  child: [
    '....DD....DD....',
    '...DBBD..DBBD...',
    '..DBBBBDDBBBBD..',
    '.DBBBBBBBBBBBBD.',
    '.DBWKBBBBBBWKBD.',
    '.DBBBBCCCCBBBBD.',
    '.DBBBCCKKCCBBBD.',
    '..DBBCCCCCCBBD..',
    '..DBBBBBBBBBBD..',
    '.DBDBBCCCCBBDBD.',
    '.DBDBBCCCCBBDBD.',
    '..DDBBCCCCBBDD..',
    '...DBBBBBBBBD...',
    '...DBBBBBBBBD...',
    '..DBBD....DBBD..',
    '...DD......DD...'
  ],
  adult: [
    '....DD....DD....',
    '...DBBD..DBBD...',
    '..DBBBBDDBBBBD..',
    '.DBBBBBBBBBBBBD.',
    '.DBWKBBBBBBWKBD.',
    '.DBBBBCCCCBBBBD.',
    '.DBBBCCKKCCBBBD.',
    '..DBBCCCCCCBBD..',
    '..DBBBBBBBBBBD..',
    '.DBBBCCCCCCBBBD.',
    '.DBDBCCCCCCBDBD.',
    '.DBDBCCCCCCBDBD.',
    '..DDBCCCCCCBDD..',
    '..DBBCCCCCCBBD..',
    '..DBBBBBBBBBBD..',
    '..DBBBBBBBBBDDD.',
    '..DBBD..DBBDBBBD',
    '...DD....DD.DDD.'
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
  ]
};
