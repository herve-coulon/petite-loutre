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
  /**
   * Les images d'un stade JEUNE (bébé, jeune) : dérivées de l'adulte au premier
   * appel puis gardées en cache. `null` pour l'adulte, qui se dessine
   * directement depuis sa planche.
   */
  art.young = {};
  art.stageFrames = (name, furId, stage) => {
    if (!STAGE_TRIM[stage]) return null;                // adulte (ou stade inconnu)
    const sheet = art.sheetFor(name, furId);
    if (!sheet) return null;
    const k = name + '|' + (furId || 'roux') + '|' + stage;
    if (!art.young[k]) art.young[k] = deriveStage(sheet, name, stage, document);
    return art.young[k];
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

/* ─────────────────────── Les stades jeunes ───────────────────────
 * Le kit ne fournit qu'une morphologie : l'adulte. Plutôt que redessiner un
 * bébé dans un autre style — l'écueil qui rendait la loutre incohérente — on
 * le DÉRIVE de l'adulte, comme le fait le dessin animé : on garde la tête
 * intacte et on raccourcit le corps. Grosse tête + petit corps = bébé.
 *
 * Le rétrécissement retire des LIGNES et des COLONNES entières, choisies parmi
 * les plus redondantes (celles qui ressemblent le plus à leur voisine). C'est
 * la façon dont on redimensionne du pixel art sans le flouter : aucun pixel
 * n'est rééchantillonné, le contour et la palette restent intacts.
 */

/** Où couper tête et corps dans chaque pose, et de quel côté est la tête. */
const SPLIT = {
  idle:  { axis: 'y', at: 21 },   // de face : tête au-dessus, corps en dessous
  happy: { axis: 'y', at: 21 },
  walk:  { axis: 'x', at: 20 },   // de profil : corps à gauche, tête à droite
  jump:  { axis: 'x', at: 20 },
  swim:  { axis: 'x', at: 20 }
};

/**
 * Combien retirer, par stade. `face` agit sur le corps sous la tête ; `profil`
 * raccourcit les pattes (lignes) et la longueur du torse (colonnes). La tête
 * n'est JAMAIS touchée : c'est elle qui donne l'air enfantin.
 */
export const STAGE_TRIM = {
  adult: null,                          // la référence : rien à retirer
  child: { face: { rows: 4, cols: 2 }, profil: { rows: 2, cols: 5 } },
  baby:  { face: { rows: 9, cols: 5 }, profil: { rows: 5, cols: 11 } }
};

/** Les stades rendus avec le kit (l'œuf n'en fait pas partie). */
export const ART_STAGES = ['baby', 'child', 'adult'];

const px = (d, w, x, y) => {
  const i = (y * w + x) * 4;
  return (d[i + 3] << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
};

/**
 * Les `n` indices les plus redondants d'une bande : on compare chaque ligne (ou
 * colonne) à sa voisine et on retire d'abord les plus semblables, en recalculant
 * après chaque retrait pour ne pas creuser un trou au même endroit.
 */
function redundantIndices(data, w, h, axis, from, to, n) {
  const alive = [];
  for (let i = from; i < to; i++) alive.push(i);
  const diff = (a, b) => {
    let c = 0;
    if (axis === 'y') { for (let x = 0; x < w; x++) if (px(data, w, x, a) !== px(data, w, x, b)) c++; }
    else { for (let y = 0; y < h; y++) if (px(data, w, a, y) !== px(data, w, b, y)) c++; }
    return c;
  };
  const out = [];
  for (let k = 0; k < n && alive.length > 1; k++) {
    let best = 0, bestCost = Infinity;
    for (let i = 0; i < alive.length - 1; i++) {
      const c = diff(alive[i], alive[i + 1]);
      if (c < bestCost) { bestCost = c; best = i; }
    }
    out.push(alive[best]);
    alive.splice(best, 1);
  }
  return new Set(out);
}

/**
 * Recopie un morceau d'image en sautant les lignes et colonnes retirées
 * (indices exprimés dans le repère de l'image ENTIÈRE).
 */
function cropCarve(src, x0, y0, w, h, dropRows, dropCols, doc) {
  const keepY = [], keepX = [];
  for (let y = y0; y < y0 + h; y++) if (!dropRows.has(y)) keepY.push(y);
  for (let x = x0; x < x0 + w; x++) if (!dropCols.has(x)) keepX.push(x);
  const c = doc.createElement('canvas');
  c.width = Math.max(1, keepX.length); c.height = Math.max(1, keepY.length);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let j = 0; j < keepY.length; j++) {
    for (let i = 0; i < keepX.length; i++) {
      g.drawImage(src, keepX[i], keepY[j], 1, 1, i, j, 1, 1);
    }
  }
  return c;
}

/** Les bornes horizontales du contenu d'un canvas (ou null s'il est vide). */
function spanX(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let min = w, max = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 16) { if (x < min) min = x; if (x > max) max = x; }
  }
  return max < 0 ? null : { min, max, cx: (min + max) / 2 };
}

/** Empile la tête (intacte) sur le corps rétréci, centres alignés. */
function stackHeadBody(head, body, doc) {
  const hs = spanX(head), bs = spanX(body);
  const hcx = hs ? hs.cx : head.width / 2, bcx = bs ? bs.cx : body.width / 2;
  const hx = Math.max(0, Math.round(bcx - hcx)), bx = Math.max(0, Math.round(hcx - bcx));
  const c = doc.createElement('canvas');
  c.width = Math.max(hx + head.width, bx + body.width);
  c.height = head.height + body.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(head, hx, 0);
  g.drawImage(body, bx, head.height);
  return c;
}

/** Accole le torse rétréci et la tête intacte (pose de profil). */
function joinBodyHead(body, head, doc) {
  const c = doc.createElement('canvas');
  c.width = body.width + head.width;
  c.height = Math.max(body.height, head.height);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(body, 0, 0);
  g.drawImage(head, body.width, 0);
  return c;
}

/** Une image d'animation, à sa taille native, dans un canvas neuf. */
function nativeFrame(sheet, a, i, doc) {
  const c = doc.createElement('canvas');
  c.width = a.w / ART_SCALE; c.height = a.h / ART_SCALE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sheet, i * a.w, 0, a.w, a.h, 0, 0, c.width, c.height);
  return c;
}

/**
 * Relève l'anatomie d'un sprite en lisant ses pixels : pieds (centre-bas du
 * contenu), sommet et centre de la tête. Évite de tenir à jour des constantes
 * à la main pour chaque stade dérivé.
 */
export function measureSprite(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] <= 16) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { feet: { x: w >> 1, y: h }, headTop: 0, headCx: w >> 1, headW: 0 };
  // la tête : les 8 lignes sous le sommet du contenu
  let hMinX = w, hMaxX = -1;
  for (let y = minY; y < Math.min(h, minY + 8); y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] <= 16) continue;
    if (x < hMinX) hMinX = x; if (x > hMaxX) hMaxX = x;
  }
  return {
    feet: { x: Math.round((minX + maxX) / 2), y: maxY + 1 },
    headTop: minY,
    headCx: Math.round((hMinX + hMaxX) / 2),
    headW: hMaxX - hMinX + 1
  };
}

/**
 * Fabrique les images d'une animation pour un stade jeune. Les coupes sont
 * choisies UNE fois sur la première image puis appliquées à toutes les autres :
 * sans cela chaque image rétrécirait à sa façon et la loutre tremblerait en
 * marchant.
 */
function deriveStage(sheet, name, stage, doc) {
  const trim = STAGE_TRIM[stage];
  const a = ANIMS[name];
  const w = a.w / ART_SCALE, h = a.h / ART_SCALE;
  const split = SPLIT[name] || { axis: 'y', at: Math.round(h * 0.4) };
  const t = split.axis === 'y' ? trim.face : trim.profil;
  const vide = new Set();

  const ref = nativeFrame(sheet, a, 0, doc);
  const data = ref.getContext('2d').getImageData(0, 0, w, h).data;

  let dropRows, dropCols;
  if (split.axis === 'y') {
    // De face : on raccourcit et on affine le tronc, sous la tête.
    dropRows = redundantIndices(data, w, h, 'y', split.at, h - 4, t.rows);
    dropCols = redundantIndices(data, w, h, 'x', 0, w, t.cols);
  } else {
    // De profil : pattes plus courtes (lignes du bas, sur TOUTE la largeur pour
    // que les deux paires restent alignées) et torse plus court (colonnes).
    const hautDesPattes = Math.round(h * 0.62);
    dropRows = redundantIndices(data, w, h, 'y', hautDesPattes, h - 2, t.rows);
    dropCols = redundantIndices(data, w, h, 'x', 0, split.at, t.cols);
  }

  const frames = [];
  for (let i = 0; i < a.frames; i++) {
    const one = nativeFrame(sheet, a, i, doc);
    if (split.axis === 'y') {
      const tete = cropCarve(one, 0, 0, w, split.at, vide, vide, doc);
      const corps = cropCarve(one, 0, split.at, w, h - split.at, dropRows, dropCols, doc);
      frames.push(stackHeadBody(tete, corps, doc));
    } else {
      const corps = cropCarve(one, 0, 0, split.at, h, dropRows, dropCols, doc);
      const tete = cropCarve(one, split.at, 0, w - split.at, h, dropRows, vide, doc);
      frames.push(joinBodyHead(corps, tete, doc));
    }
  }
  return { frames, anatomy: measureSprite(frames[0]) };
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
export function drawAnim(ctx, art, name, frame, x, y, furId, flip, stage) {
  if (!ctx || !art) return null;
  const r = frameRect(name, frame);
  if (!r) return null;

  // Stade jeune : images dérivées, déjà découpées et à leur taille propre.
  const young = art.stageFrames && art.stageFrames(name, furId, stage);
  const src = young ? young.frames[((frame % young.frames.length) + young.frames.length) % young.frames.length] : null;
  const sheet = src || (art.sheetFor && art.sheetFor(name, furId));
  if (!sheet) return null;

  const w = src ? src.width : r.dw, h = src ? src.height : r.dh;
  const an = (young && young.anatomy) || ANATOMY[name] || { feet: { x: w / 2, y: h } };
  const ox = Math.round(x - (flip ? w - an.feet.x : an.feet.x));
  const oy = Math.round(y - an.feet.y);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(ox + w, oy);
    ctx.scale(-1, 1);
    if (src) ctx.drawImage(src, 0, 0);
    else ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  } else if (src) {
    ctx.drawImage(src, ox, oy);
  } else {
    ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, ox, oy, w, h);
  }
  ctx.restore();
  return { x: ox, y: oy, w, h, anatomy: an };
}
