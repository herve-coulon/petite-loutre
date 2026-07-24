// Les sprites de la loutre : kit d'animations fourni par le design
// (assets/otter/*.png, cf. assets/CREDITS.txt). Ce module charge les
// spritesheets, les découpe, et décline la fourrure dans les pelages du jeu.
//
// Deux règles imposées par le handoff, à ne jamais enfreindre :
//   • rendu NEAREST (aucun lissage) ;
//   • mise à l'échelle en multiples ENTIERS de la grille native.
// Les strips sont exportées ×4 : on les redescend donc exactement à ×1, ce qui
// est un sous-échantillonnage entier — chaque pixel natif est un bloc 4×4 plein.

export const ART_SCALE = 4;   // facteur d'export des strips

/** Les animations, telles que décrites par le manifeste du kit. */
export const ANIMS = {
  idle:  { file: 'idle_strip.png',  w: 160, h: 200, frames: 2, fps: 2 },
  walk:  { file: 'walk_strip.png',  w: 168, h: 144, frames: 4, fps: 8 },
  swim:  { file: 'swim_strip.png',  w: 184, h: 104, frames: 2, fps: 6 },
  jump:  { file: 'jump_strip.png',  w: 168, h: 168, frames: 3, fps: 6 },
  happy: { file: 'happy_strip.png', w: 160, h: 200, frames: 2, fps: 3 }
};

/** Les teintes de fourrure de la loutre d'origine, du plus sombre au plus clair. */
const FUR_KEYS = ['#573619', '#6f4526', '#9a6238', '#b8804f', '#caa06e'];
/** …et les teintes de ventre / museau. */
const BELLY_KEYS = ['#e0c091', '#f3ddb6', '#fbeccf', '#f8ead2'];

/**
 * Les pelages du jeu, exprimés comme un REMAP de palette (même procédé que le
 * skin « silver » du kit). Cinq tons de fourrure du plus sombre au plus clair,
 * puis quatre tons de ventre. `null` = on garde la fourrure d'origine.
 */
export const FUR_REMAP = {
  roux: null,
  choco: {
    fur: ['#3b2415', '#4e2f1b', '#6b4526', '#875a35', '#a67848'],
    belly: ['#d2ac82', '#e8cfa6', '#f3e2c2', '#efe0c4']
  },
  doree: {
    fur: ['#7a5410', '#9a6d16', '#c08f22', '#dbae3c', '#efcb69'],
    belly: ['#efd49a', '#fbeec2', '#fff7da', '#fdf3d6']
  },
  neige: {
    fur: ['#8a8f99', '#a3a8b3', '#c2c7d1', '#dadee6', '#eef1f6'],
    belly: ['#dfe3ea', '#f0f3f8', '#fbfcfe', '#f6f8fb']
  },
  nuit: {
    fur: ['#1f2740', '#2b3555', '#3d4a72', '#54628f', '#7381ad'],
    belly: ['#b9c2da', '#d7ddec', '#ecf0f8', '#e6ebf5']
  },
  bonbon: {
    fur: ['#8a2f52', '#a83e68', '#c85a86', '#e07ca6', '#f0a3c3'],
    belly: ['#f3c9da', '#fbe2ec', '#fff2f7', '#fdedf4']
  },
  braise: {
    fur: ['#6d2410', '#8c3414', '#b04c1c', '#cf6d2c', '#e79a4e'],
    belly: ['#efc19a', '#fbdcbb', '#fff0d9', '#fdead0']
  }
};

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Construit la table « couleur d'origine -> couleur du pelage ». */
function remapTable(furId) {
  const r = FUR_REMAP[furId];
  if (!r) return null;
  const table = new Map();
  FUR_KEYS.forEach((k, i) => { if (r.fur[i]) table.set(k.toLowerCase(), hexToRgb(r.fur[i])); });
  BELLY_KEYS.forEach((k, i) => { if (r.belly && r.belly[i]) table.set(k.toLowerCase(), hexToRgb(r.belly[i])); });
  return table;
}

const key2 = (r, g, b) => (r << 16) | (g << 8) | b;

/**
 * Applique un remap de palette à une image et renvoie un canvas hors écran.
 * Sans table (pelage roux), on renvoie l'image telle quelle.
 */
function tintedCanvas(img, table, doc) {
  const c = doc.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  if (!table) return c;
  const lut = new Map();
  for (const [hex, rgb] of table) {
    const [r, g, b] = hexToRgb(hex);
    lut.set(key2(r, g, b), rgb);
  }
  const data = x.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;                       // transparent : on n'y touche pas
    const to = lut.get(key2(p[i], p[i + 1], p[i + 2]));
    if (to) { p[i] = to[0]; p[i + 1] = to[1]; p[i + 2] = to[2]; }
  }
  x.putImageData(data, 0, 0);
  return c;
}

/**
 * Charge le kit et prépare un jeu d'images par pelage.
 * Tolérant hors navigateur (tests Node) : renvoie un objet « pas prêt ».
 */
export function loadOtterArt(base = './assets/otter/') {
  const art = { ready: false, sheets: {}, tinted: {} };
  if (typeof Image === 'undefined' || typeof document === 'undefined') return art;
  let pending = Object.keys(ANIMS).length;
  for (const [name, a] of Object.entries(ANIMS)) {
    const img = new Image();
    img.onload = () => {
      art.sheets[name] = img;
      if (--pending === 0) art.ready = true;
    };
    img.onerror = () => { if (--pending === 0) art.ready = true; };
    img.src = base + a.file;
  }
  /** L'image d'une animation, teintée pour un pelage (mise en cache). */
  art.sheetFor = (name, furId) => {
    const img = art.sheets[name];
    if (!img) return null;
    const id = furId || 'roux';
    if (!FUR_REMAP[id]) return img;                     // pelage inconnu -> d'origine
    const k = name + '|' + id;
    if (!art.tinted[k]) art.tinted[k] = tintedCanvas(img, remapTable(id), document);
    return art.tinted[k];
  };
  return art;
}

/**
 * L'image source d'une frame : rectangle à découper dans la strip, et taille
 * NATIVE de destination (÷ ART_SCALE) pour un rendu net.
 */
export function frameRect(name, frame) {
  const a = ANIMS[name];
  if (!a) return null;
  const i = ((frame % a.frames) + a.frames) % a.frames;
  return { sx: i * a.w, sy: 0, sw: a.w, sh: a.h, dw: a.w / ART_SCALE, dh: a.h / ART_SCALE };
}

/** L'image à jouer à l'instant `t` (ms), selon le fps de l'animation. */
export function frameAt(name, t) {
  const a = ANIMS[name];
  if (!a) return 0;
  return Math.floor((t / 1000) * a.fps) % a.frames;
}

/**
 * Anatomie mesurée sur les sprites (coordonnées NATIVES, origine coin haut
 * gauche de l'image). Sert à poser le chapeau et les bulles d'humeur sans
 * tâtonner : `feet` est le point d'ancrage centre-bas de l'animation.
 */
export const ANATOMY = {
  idle:  { feet: { x: 20, y: 50 }, headTop: 4, headCx: 20, headW: 27 },
  happy: { feet: { x: 20, y: 50 }, headTop: 4, headCx: 19, headW: 29 },
  walk:  { feet: { x: 21, y: 36 }, headTop: 2, headCx: 28, headW: 15 },
  jump:  { feet: { x: 21, y: 41 }, headTop: 9, headCx: 28, headW: 15 },
  swim:  { feet: { x: 23, y: 21 }, headTop: 2, headCx: 29, headW: 34 }
};

/** L'animation à jouer pour une humeur donnée (le kit n'en offre que deux). */
export function animForMood(mood) {
  return mood === 'contente' ? 'happy' : 'idle';
}

let shared = null;
/** L'instance partagée du kit : chargée une seule fois pour toute l'appli. */
export function otterArt() {
  if (!shared) shared = loadOtterArt();
  return shared;
}

/**
 * Dessine une image d'animation, ancrée PAR LES PIEDS en (x, y) — c'est
 * l'ancre du kit (centre-bas), la seule qui garde la loutre posée au sol quand
 * l'animation change de hauteur (la marche est plus basse que la pose debout).
 * @returns {{x:number,y:number,w:number,h:number}|null} la boîte dessinée,
 *          pour y accrocher chapeau et bulles.
 */
export function drawAnim(ctx, art, name, frame, x, y, furId, flip) {
  if (!ctx || !art) return null;
  const sheet = art.sheetFor && art.sheetFor(name, furId);
  const r = frameRect(name, frame);
  if (!sheet || !r) return null;
  const an = ANATOMY[name] || { feet: { x: r.dw / 2, y: r.dh } };
  const ox = Math.round(x - (flip ? r.dw - an.feet.x : an.feet.x));
  const oy = Math.round(y - an.feet.y);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(ox + r.dw, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, 0, 0, r.dw, r.dh);
  } else {
    ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, ox, oy, r.dw, r.dh);
  }
  ctx.restore();
  return { x: ox, y: oy, w: r.dw, h: r.dh };
}
