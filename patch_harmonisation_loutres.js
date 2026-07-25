// ============================================================================
// PATCH HARMONISATION DES LOUTRES — v2 (base : handoff designer, 25/07/2026)
// ============================================================================
// LE MODÈLE : le kit du designer (« Pixel otter designs », = assets/otter/ du
// repo, vérifié identique octet par octet). UNE loutre, trois usages :
//   • BERGE / TANIÈRE ..... kit natif (strips, inchangé)
//   • MONDE (vallée) ...... minis de PROFIL ci-dessous, dérivées de walk_strip
//                           (réduction + vote majoritaire, retouches à la main)
//   • PORTRAITS ........... minis de FACE ci-dessous, dérivées de idle_strip
//                           (duel, profil, HUD, cartes de rencontre — chapeaux OK)
// Préviews validées : preview_side_final.png · preview_minis_v3.png
//
// D'AUTRES ANIMATIONS ARRIVENT (annoncé) : voir §6 — otter-art.js devient
// piloté par le manifest pour que chaque nouvelle strip s'intègre SANS code.
// ============================================================================

// ---- 1) src/sprites.js : PAL aux couleurs du manifest (mêmes lettres) ------
export const PAL = {
  D: '#2b1c13', B: '#9a6238', C: '#f3ddb6', K: '#1c110b',
  W: '#fffaf0', G: '#7d93a6', g: '#c6d3dd', q: '#6f4526',
  O: '#f2913d', R: '#e5484d', P: '#e69684', U: '#4a6fae',
  Y: '#f2c14e'
};

// ---- 2) src/sprites.js : grilles de PROFIL (le monde marche de profil) -----
// Dessinées vers la DROITE comme walk_strip ; flip X pour l'autre sens
// (drawFigure reçoit déjà `flip` : brancher stage+'Side' / stage+'SideWalk').
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

// ---- 3) src/sprites.js : grilles de FACE (portraits, chapeaux compatibles) -
// Remplacent les anciennes baby/child/adult(+Walk) pour paintOtter :
// renommer en xxxFace et faire pointer paintOtter dessus.
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
// (les variantes xxxWalk de face deviennent inutiles : le monde marche de
//  profil, les portraits ne marchent pas — les supprimer.)

// ---- 4) src/skins.js : ajouter « q » à chaque map de pelage ----------------
//   choco    map: { B: '#5d3a22', C: '#c9a06b', D: '#2a1a0e', q: '#422918' }
//   doree    map: { B: '#c99a3d', C: '#f4e3b2', D: '#6b4e1a', q: '#906e2b' }
//   blanche  map: { B: '#d3dfe9', C: '#ffffff', D: '#4f6170', q: '#97a0a7' }
//   nuit     map: { B: '#3d4c6e', C: '#9fb0d0', D: '#1c2438', q: '#2b364f' }
//   rose     map: { B: '#d97ba6', C: '#f7d4e3', D: '#7a3a58', q: '#9c5877' }
//   braise   map: { B: '#b5502a', C: '#f2b28c', D: '#571d0c', q: '#82391e' }
//   lagune   map: { B: '#2f7f86', C: '#9fe6dd', D: '#12454c', q: '#215b60' }

// ---- 5) Fin des emojis-loutre (UI structurelle) ----------------------------
// a) HUD .av-face 🦦        -> canvas, paintOtter(cv, s, 2)   (pelage+chapeau vivants)
// b) Carte de rencontre 🦦  -> canvas, paintOtter(cv, foe, 4)
// c) Écran-titre 🦦         -> frame idle 0 du kit sur canvas ×3 entier,
//                              image-rendering: pixelated, fallback emoji.
// d) Œuf au ton du kit      -> palOver { G: '#e0c091', g: '#f8ead2' } au rendu.

// ---- 6) Handoff v2 : 8 nouvelles anims à intégrer --------------------------
// Le bundle « Pixel otter designs 2 » (livré le 25/07) remplace assets/otter/ :
// strips originales inchangées octet pour octet, manifest v2 (jump loop:false
// corrigé, 11 couleurs d'accent ajoutées), et 8 anims neuves + skins silver :
//   sleep  4f@2fps  50x36  couchée, Zz          -> action Dodo
//   dream  4f@2fps  60x42  dort + bulle poisson -> sommeil profond (et, plus
//                          tard, le « souvenir » de la lignée, §5.8 audit)
//   wake   4f@3fps  52x56  one-shot réveil      -> fin du dodo
//   hungry 3f@3fps  52x56  bave + bulle poisson -> faim < 25
//   sick   4f@4fps  40x52  joues vertes         -> santé basse / maladie
//   hurt   2f@7fps  40x52  one-shot touché      -> coup reçu (duel, chasseur)
//   cold   4f@10fps 40x52  frisson, truffe bleue-> hiver dehors
//   hot    2f@3fps  40x52  langue, sueur        -> canicule d'été (events)
// À faire :
//   • copier le handoff v2 dans assets/otter/ (strips + manifest.json) ;
//   • otter-art.js : ANIMS construit depuis assets/otter/manifest.json
//     (fetch au boot, constantes en fallback) — nouvelle anim = zéro code ;
//   • étendre animForMood() : le sélecteur existe déjà (otter-art.js:183),
//     y brancher le mapping ci-dessus depuis l'état (faim, santé, sommeil,
//     saison/événement, coup reçu) ; hurt/wake/jump = one-shots (loop:false) ;
//   • étendre SPLIT (dérivation bébé/jeune par retrait de lignes) aux poses
//     verticales neuves (hungry, sick, cold, hot : axis y) ; sleep/dream de
//     profil : axis x ;
//   • Note : swim inclut les lignes d'eau dans l'image (le designer propose
//     un réexport sans — utile pour la nage libre du §5.2 de l'audit).
