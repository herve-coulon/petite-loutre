// Rendu canvas 160x120 (mis à l'échelle en CSS, image-rendering: pixelated).
import { PAL, SPRITES } from './sprites.js';
import { HATCH_MS, MIN, SEC, SEASON_FX } from './constants.js';
import { hatById } from './accessories.js';
import { furById } from './skins.js';
import { moodOf, pickIdle, canIdle, IDLE_FRAMES } from './mood.js';
import { dailyEvent, butterflyPos } from './events.js';
import { dayKey } from './quests.js';
import { seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { WATER_Y, TELL_MS, COMBO_STEP as FISH_COMBO_STEP, GOBE_MS as FISH_GOBE_MS, fishProgress } from './minigame.js';
import { itemById, RARITIES, ITEMS } from './items.js';
import { LANE_X, SLIDE_OTTER_Y, COMBO_STEP, GOBE_MS, VIES_MAX, slideProgress } from './toboggan.js';
import { TILE, SHEET_M, WORLD_W, WORLD_H, T, TD, FIND_ICON, FAUNE, groundTile, decorTile, zoneGates } from './tilemap.js';
import { otterArt, drawAnim, frameAt, animForMood, ANATOMY, ANIMS } from './otter-art.js';

// Le kit de sprites dessinés (assets/otter/) : il remplace la grille de pixels
// pour la loutre ADULTE, là où elle est grande à l'écran (berge, tanière,
// portraits). Les stades jeunes et la vallée gardent la grille : le kit n'a
// qu'une morphologie, et à l'échelle des tuiles (16 px) il serait démesuré.
const ART = otterArt();
/**
 * Vrai si cette loutre-là doit être rendue avec le kit dessiné. Tous les stades
 * éclos en profitent : bébé et jeune sont DÉRIVÉS de l'adulte (tête intacte,
 * corps raccourci), donc du même trait — l'œuf, lui, reste peint à la main.
 */
function usesArt(o) { return !!(o && o.stage && o.stage !== 'egg' && ART.ready); }

// Canvas PORTRAIT plein écran (ratio ~ écran mobile) : le ciel occupe le haut,
// l'eau le bas, la berge au milieu. La scène de base est dessinée pour un sol à
// y=96 puis DÉCALÉE de BERGE_SHIFT vers le bas ; le ciel/l'eau s'étendent pour
// remplir. Ainsi tout l'environnement vit sur tout l'écran.
export const CANVAS_W = 160, CANVAS_H = 346;
export const BERGE_SHIFT = 144;
export const OTTER_X = 64;
export const GROUND_Y = 96 + BERGE_SHIFT;   // 240
// jeton de nourriture posé sur la berge : on l'attrape et on le glisse jusqu'à la loutre
export const FOOD_POS = { x: 16, y: 86 + BERGE_SHIFT, w: 20, h: 10 };

// balle de jeu : posée sur la berge, on l'attrape et on la lance ; la loutre la rapporte
export const BALL_HOME = { x: 132, y: 92 + BERGE_SHIFT };

// Tanière : emplacements des trésors sur les étagères (9 colonnes × 3 rangées).
// Partagé par le rendu ET le hit-test (tape un trésor pour l'identifier).
export const DEN_SLOTS = (() => {
  const slots = [], cols = 9, x0 = 12, dx = 16, rows = [18, 33, 48];
  for (const y of rows) for (let cx = 0; cx < cols; cx++) slots.push({ x: x0 + cx * dx, y });
  return slots;
})();
/** Index du trésor touché sur l'étagère de la tanière, ou -1. */
export function denItemAt(px, py) {
  for (let i = 0; i < DEN_SLOTS.length; i++) {
    const p = DEN_SLOTS[i];
    const sy = p.y + BERGE_SHIFT;   // la scène tanière est décalée comme la berge
    if (px >= p.x - 2 && px <= p.x + 10 && py >= sy - 2 && py <= sy + 10) return i;
  }
  return -1;
}

/**
 * Éclosion cinématique : niveau de fissures de l'œuf selon la progression
 * (0 = intact … 3 = sur le point de craquer). PUR, testé.
 */
export function eggCrackLevel(progress) {
  if (progress >= 0.97) return 3;
  if (progress >= 0.82) return 2;
  if (progress >= 0.55) return 1;
  return 0;
}

export function otterY(stage) {
  const spr = SPRITES[stage] || SPRITES.baby;
  return GROUND_Y - spr.length * 2 + (stage === 'egg' ? 4 : 0);
}

/**
 * Peint une loutre (pelage + chapeau) dans un canvas quelconque : sert aux
 * portraits de l'arène de combat. Autonome — n'utilise pas le renderer du jeu.
 */
export function paintOtter(cv, o, sc = 3, flip = false) {
  if (!cv || !cv.getContext || !o) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const hatOf = o.hat ? hatById(o.hat) : null;
  if (usesArt(o)) {
    // Portrait au kit : la loutre debout, à l'échelle native ×sc. Le gabarit
    // dépend du stade (bébé et jeune sont plus petits).
    const young = ART.stageFrames && ART.stageFrames('idle', o.fur, o.stage);
    const an = (young && young.anatomy) || ANATOMY.idle;
    const w = young ? young.frames[0].width : ANIMS.idle.w / 4;
    const h = young ? young.frames[0].height : ANIMS.idle.h / 4;
    const top = hatOf ? hatOf.rows.length : 0;
    cv.width = w * sc; cv.height = (h + top) * sc;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.scale(sc, sc);
    drawAnim(ctx, ART, 'idle', 0, an.feet.x, top + h, o.fur, flip, o.stage);
    ctx.restore();
    if (hatOf) {
      // centré sur la tête du sprite (16 colonnes de chapeau)
      const hx = (an.headCx - 8) * sc;
      for (let j = 0; j < hatOf.rows.length; j++) {
        const row = hatOf.rows[j];
        for (let i = 0; i < row.length; i++) {
          const ch = row[flip ? row.length - 1 - i : i];
          const col = PAL[ch];
          if (!col || ch === '.') continue;
          ctx.fillStyle = col;
          ctx.fillRect(hx + i * sc, j * sc, sc, sc);
        }
      }
    }
    return;
  }
  const spr = SPRITES[o.stage] || SPRITES.adult;
  const fur = (furById(o.fur) || {}).map;
  const hat = o.hat ? hatById(o.hat) : null;
  const top = hat ? hat.rows.length : 0;                 // place pour le chapeau
  cv.width = spr[0].length * sc;
  cv.height = (spr.length + top) * sc;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const paint = (rows, ox, oy, pal) => {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[flip ? row.length - 1 - i : i];
        const col = (pal && pal[ch]) || PAL[ch];
        if (!col || ch === '.') continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + i * sc, oy + j * sc, sc, sc);
      }
    }
  };
  paint(spr, 0, top * sc, fur);
  if (hat) paint(hat.rows, 0, 0, null);
}

/* ---------------- Game feel : squash & stretch (fonction pure, testée) ---------------- */
export const SQUASH_MS = 320;
/** Enveloppe d'écrasement : t=0 écrasée, rebond étiré amorti, t>=1 repos exact. */
export function squashScale(t) {
  if (!(t >= 0) || t >= 1) return { sx: 1, sy: 1 };
  const amp = 0.3 * (1 - t);
  const sy = 1 - amp * Math.cos(t * Math.PI * 3);
  return { sx: 1 + (1 - sy) * 0.7, sy };
}

const CONFETTI_COLS = ['#e5484d', '#f2c14e', '#5fc9e0', '#8ad05f', '#e8608a', '#ffffff'];

/** Mélange deux couleurs hex (#rrggbb), t=0 -> a, t=1 -> b. Pour la brume/perspective. */
function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function makeRenderer(cv) {
  const ctx = cv.getContext('2d');
  let particles = [];
  let squashUntil = 0;
  let vignette = null; // dégradé de vignettage, créé une fois (taille fixe)
  let reduced = false; // accessibilité : mouvement réduit -> moins de particules/tremblements
  let idleAnim = null;                              // {kind, start} — petite manie en cours
  let nextIdleAt = 400 + Math.random() * 700;       // en frames
  let jumpFish = null;                              // {x, dir, start} — poisson qui saute
  let nextJumpAt = 300 + Math.random() * 500;
  // balade : la loutre flâne sur la berge (position vivante, bord gauche du sprite)
  let otterWX = OTTER_X;
  let otterTarget = OTTER_X;
  let otterDwell = 0;         // frame jusqu'à laquelle elle reste sur place
  let otterFace = 1;          // sens du regard en marchant (+1 droite, -1 gauche)
  let otterDist = 0;          // chemin parcouru sur la berge : cadence le pas
  let otterWalkedAt = -999;   // dernière frame où elle avançait vraiment
  const FOULEE = 4.5;         // pixels parcourus par image du cycle de marche
  // toboggan : couloir courant, et le saut joué au changement de couloir
  let slideMg = null, slideLane = null, slideX = LANE_X[1], slideHopAt = -999;
  // Passage d'une zone à l'autre : rideau + nom du lieu. Sans lui on se
  // retrouvait ailleurs d'une image à l'autre, sans transition ni repère.
  let passage = { at: -99999, nom: '', emoji: '' };
  const PASSAGE_MS = 900;
  const HOP_FRAMES = 15;
  let wanderSeed = 1;         // avance à chaque nouvelle cible (choix pseudo-aléatoire stable)
  let lastFrame = 0;          // dernier numéro de frame vu (pour les appels externes)
  // balle de jeu (ball-fetch). states : idle (au repos) / held (dans la main) /
  // flying (en vol) / resting (retombée, à rapporter) / carried (dans la gueule).
  let ball = { state: 'idle', x: BALL_HOME.x, y: BALL_HOME.y, sx: 0, sy: 0, t: 0 };
  let fetchDone = 0;          // livraisons en attente de récompense (consommées par le jeu)

  // Relief : liseré lumineux sur le bord tourné vers l'astre (haut-droite) + occlusion
  // sous le ventre. Dessiné par-dessus le sprite -> volume sans retoucher les grilles.
  function drawRim(rows, x, y, sc, lightCol, occCol) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        const up = j > 0 ? rows[j - 1][i] : '.';
        const right = i < row.length - 1 ? rows[j][i + 1] : '.';
        const down = j < rows.length - 1 ? rows[j + 1][i] : '.';
        if (up === '.' || right === '.') {
          ctx.fillStyle = lightCol;
          if (up === '.') ctx.fillRect(x + i * sc, y + j * sc, sc, 1);
          if (right === '.') ctx.fillRect(x + i * sc + sc - 1, y + j * sc, 1, sc);
        }
        if (down === '.') { ctx.fillStyle = occCol; ctx.fillRect(x + i * sc, y + j * sc + sc - 1, sc, 1); }
      }
    }
  }

  function drawSprite(rows, x, y, sc = 2, palOver = null, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      const w = row.length;
      for (let i = 0; i < w; i++) {
        const ch = row[flip ? w - 1 - i : i];
        const c = (palOver && palOver[ch]) || PAL[ch];
        if (!c || ch === '.') continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + i * sc, y + j * sc, sc, sc);
      }
    }
  }

  // Fissures de l'œuf, dessinées par-dessus le sprite (coords en px canvas 1:1).
  // level 1 : fêlure fine ; 2 : elle s'étend ; 3 : ça craque + lueur qui filtre.
  function drawEggCracks(ox, oy, level, frame) {
    const px = (cx, cy) => ctx.fillRect(ox + cx, oy + cy, 2, 2);
    ctx.fillStyle = PAL.K; // trait sombre
    px(14, 6); px(16, 8); px(14, 10); px(16, 12);           // zigzag central
    if (level >= 2) { px(18, 14); px(12, 12); px(20, 10); px(10, 16); px(22, 16); }
    if (level >= 3) {
      px(14, 14); px(18, 18); px(12, 20); px(20, 20); px(16, 22);
      // lueur clignotante qui s'échappe des fêlures
      if ((frame >> 3) % 2 === 0) {
        ctx.fillStyle = PAL.C;
        px(15, 9); px(15, 13); px(17, 15);
      }
    }
  }

  function drawDecor(id, c, frame) {
    if (id === 'nenuphars') {
      ctx.fillStyle = '#4f9134';
      const b = (frame >> 4) % 2;
      ctx.fillRect(18, 106 + b, 9, 3); ctx.fillRect(21, 105 + b, 3, 1);
      ctx.fillRect(132, 111 - b, 8, 3);
      ctx.fillStyle = '#f0a1a1'; ctx.fillRect(21, 103 + b, 3, 3);
    } else if (id === 'lanterne') {
      ctx.fillStyle = '#3b2416'; ctx.fillRect(146, 74, 2, 24);
      ctx.fillStyle = '#e5484d'; ctx.fillRect(142, 66, 10, 10);
      ctx.fillStyle = (frame >> 3) % 2 ? '#ffd94a' : '#f2913d';
      ctx.fillRect(145, 69, 4, 4);
    } else if (id === 'fanions') {
      ctx.fillStyle = '#3b2416'; ctx.fillRect(4, 58, 152, 1);
      const cols = ['#e5484d', '#f2c14e', '#5fc9e0', '#8ad05f', '#e8608a'];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(10 + i * 19, 59, 5, 4); ctx.fillRect(11 + i * 19, 63, 3, 2);
      }
    } else if (id === 'baies') {
      ctx.fillStyle = '#3f6d2c';
      ctx.fillRect(6, 82, 18, 12); ctx.fillRect(9, 78, 12, 6);
      ctx.fillStyle = '#5a4a9e';
      ctx.fillRect(10, 84, 2, 2); ctx.fillRect(17, 81, 2, 2); ctx.fillRect(14, 88, 2, 2);
    } else if (id === 'feu') {
      // feu de camp qui crépite (récompense de niveau 3)
      ctx.fillStyle = '#3b2416';
      ctx.fillRect(100, 96, 12, 3); ctx.fillRect(102, 94, 8, 2);
      const fl = (frame >> 2) % 3;
      ctx.fillStyle = '#e5484d'; ctx.fillRect(103, 88 - fl, 6, 6 + fl);
      ctx.fillStyle = '#f2913d'; ctx.fillRect(104, 90 - ((frame >> 3) % 2), 4, 4);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(105, 92, 2, 2);
      if ((frame >> 4) % 3 === 0) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(107, 84 - fl, 1, 1); }
    }
  }

  function spawn(kind, stage) {
    const y0 = stage === 'egg' ? 70 : otterY(stage);
    particles.push({
      x: OTTER_X + Math.random() * 28, y: y0 - Math.random() * 8,
      vx: -0.3 + Math.random() * 0.6, vy: -(0.4 + Math.random() * 0.4),
      life: 40, kind
    });
  }
  function splashAt(x, y) {
    particles.push({ x, y, vx: 0, vy: -0.6, life: 20, kind: 'splash' });
  }

  /** Rafale généreuse : confettis qui retombent, étincelles qui montent… */
  function burst(kind, n, stage) {
    if (reduced) n = Math.min(n, 4); // mouvement réduit : à peine un clin d'œil
    const y0 = (stage === 'egg' ? 78 : otterY(stage)) + 10;
    for (let i = 0; i < n; i++) {
      if (kind === 'confetti') {
        particles.push({
          x: OTTER_X + 16 - 22 + Math.random() * 44, y: y0 - 26 - Math.random() * 14,
          vx: -0.9 + Math.random() * 1.8, vy: -(0.8 + Math.random() * 1.2),
          g: 0.045, life: 55 + Math.floor(Math.random() * 30), kind,
          col: CONFETTI_COLS[i % CONFETTI_COLS.length]
        });
      } else if (kind === 'sparkle') {
        particles.push({
          x: OTTER_X + 16 - 20 + Math.random() * 40, y: y0 - 6 - Math.random() * 24,
          vx: -0.25 + Math.random() * 0.5, vy: -(0.15 + Math.random() * 0.35),
          life: 30 + Math.floor(Math.random() * 16), kind
        });
      } else spawn(kind, stage);
    }
  }

  /** Squash & stretch au prochain rendu (caresse, réception d'un soin…). */
  function squash() { squashUntil = Date.now() + SQUASH_MS; }

  /** Chiffre/mot juteux qui jaillit et retombe (pop-in + fondu). col = couleur. */
  function pop(txt, col, stage, dx = 34) {
    particles.push({
      x: OTTER_X + dx, y: otterY(stage) + 2,
      vx: 0.05, vy: -0.5, life: 46, max: 46, kind: 'pop', txt, col: col || '#ffd94a'
    });
  }
  /** Petit « +5 » doré qui s'envole (gain d'XP). */
  function xpText(txt, stage) { pop(txt, '#ffd94a', stage, 34); }

  /** Onde de choc pixel qui s'ouvre à l'impact (ponctue une action). */
  function ring(stage) {
    particles.push({ x: OTTER_X + 16, y: otterY(stage) + 16, vx: 0, vy: 0, life: 15, max: 15, kind: 'ring' });
  }

  /* ---------------- Vie du décor : libellule, luciole, poissons sauteurs ---------------- */
  function drawAmbient(mg, frame, night) {
    if (!night) {
      // libellule qui zigzague au-dessus de la berge
      const ax = 80 + Math.sin(frame / 37) * 55 + Math.sin(frame / 13) * 8;
      const ay = 68 + BERGE_SHIFT + Math.sin(frame / 23) * 7;
      ctx.fillStyle = '#3f9fb8';
      ctx.fillRect(ax, ay, 4, 1);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      const w = (frame >> 1) % 2; // battement d'ailes
      ctx.fillRect(ax + 1, ay - 1 - w, 2, 1);
      ctx.fillRect(ax + 1, ay + 1 + w, 2, 1);
    } else {
      // luciole qui pulse doucement
      const ax = 46 + Math.sin(frame / 41) * 34;
      const ay = 72 + BERGE_SHIFT + Math.sin(frame / 17) * 6;
      ctx.fillStyle = (frame >> 3) % 2 ? '#ffd94a' : '#f2913d';
      ctx.fillRect(ax, ay, 2, 2);
    }

    // poisson qui bondit hors de la rivière (jamais pendant la pêche : ce serait un leurre)
    if (mg) { jumpFish = null; return; }
    if (!jumpFish && frame >= nextJumpAt) {
      jumpFish = { x: 16 + Math.random() * 118, dir: Math.random() < 0.5 ? -1 : 1, start: frame };
      splashAt(jumpFish.x, 108 + BERGE_SHIFT);
    }
    if (jumpFish) {
      const p = (frame - jumpFish.start) / 46;
      if (p >= 1) {
        splashAt(jumpFish.x + jumpFish.dir * 14, 108 + BERGE_SHIFT);
        jumpFish = null;
        nextJumpAt = frame + 420 + Math.random() * 600;
      } else {
        const fx2 = jumpFish.x + jumpFish.dir * p * 14;
        const fy2 = 108 + BERGE_SHIFT - Math.sin(p * Math.PI) * 15;
        drawSprite(SPRITES.fish, fx2, fy2, 1, null, jumpFish.dir > 0);
      }
    }
  }

  /* ---------------- Événement du jour ---------------- */
  function drawDailyEvent(s, frame, night) {
    const id = dailyEvent(dayKey()).id;
    if (id === 'papillon') {
      if (s.qDaily && s.qDaily.progress && s.qDaily.progress.papillon) return; // déjà attrapé
      const { x, y } = butterflyPos(frame);
      const w = (frame >> 1) % 2;
      ctx.fillStyle = '#e8608a';
      ctx.fillRect(x - 2 - w, y - 1, 2, 3); ctx.fillRect(x + 1 + w, y - 1, 2, 3);
      ctx.fillStyle = '#20160f'; ctx.fillRect(x, y, 1, 2);
    } else if (id === 'pluie') {
      ctx.fillStyle = 'rgba(190,220,255,.55)';
      for (let i = 0; i < 14; i++) {
        const rx = (i * 23 + ((frame * 2) % 46)) % 160;
        const ry = (frame * 3 + i * 31) % 100;
        ctx.fillRect(rx, ry, 1, 4);
      }
      ctx.fillStyle = '#e5484d'; ctx.fillRect(24, 88, 6, 3); ctx.fillRect(139, 92, 5, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(26, 91, 2, 3); ctx.fillRect(140, 95, 2, 2);
      ctx.fillRect(25, 88, 1, 1); ctx.fillRect(141, 92, 1, 1);
    } else if (id === 'heron') {
      drawSprite(SPRITES.heron, 138, 82, 1, null, true); // il pêche au loin
    } else if (id === 'canetons') {
      ctx.fillStyle = '#f2c14e';
      for (let i = 0; i < 3; i++) {
        const dx2 = (((frame >> 1) + 176 - i * 13) % 176) - 8;
        const dy2 = 106 + (((frame >> 3) + i) % 2);
        ctx.fillRect(dx2, dy2, 4, 3); ctx.fillRect(dx2 + 3, dy2 - 2, 2, 2);
      }
    } else if (id === 'arcenciel' && !night) {
      const cols = ['#e5484d', '#f2913d', '#f2c14e', '#8ad05f', '#5fc9e0'];
      for (let x = 10; x < 150; x += 2) {
        const d = Math.abs(x - 80);
        const base = Math.sqrt(Math.max(0, 4900 - d * d)) * 0.55;
        for (let i = 0; i < cols.length; i++) {
          const y = 68 - base + i * 2;
          if (y > 8 && y < 58) { ctx.fillStyle = cols[i]; ctx.fillRect(x, y, 2, 2); }
        }
      }
    }
  }

  /* ---------------- Petites manies (idle) ---------------- */
  function drawIdle(kind, t, ox, oy, fur) {
    const B = (fur && fur.B) || PAL.B, D = (fur && fur.D) || PAL.D;
    if (kind === 'gratte') {
      // patte qui gratte le flanc, un nuage de poussière s'échappe
      const up = (t >> 2) % 2;
      ctx.fillStyle = B;
      ctx.fillRect(ox - 2, oy + 18 - up, 4, 6);
      ctx.fillStyle = D;
      ctx.fillRect(ox - 2, oy + 23 - up, 4, 1);
      if ((t >> 3) % 2) {
        ctx.fillStyle = '#c9bfae';
        ctx.fillRect(ox - 5, oy + 22, 1, 1);
        ctx.fillRect(ox - 7, oy + 19, 1, 1);
      }
    } else if (kind === 'caillou') {
      // jongle avec un caillou (deux lancers par cycle)
      const half = IDLE_FRAMES.caillou / 2;
      const p = (t % half) / half;
      const py = Math.sin(p * Math.PI) * 14;
      ctx.fillStyle = '#9a9a8c';
      ctx.fillRect(ox + 14, oy + 8 - py, 3, 3);
      ctx.fillStyle = '#6e6e62';
      ctx.fillRect(ox + 15, oy + 10 - py, 2, 1);
    }
    // 'baille' : tout se joue sur le visage (yeux fermés, grande bouche)
  }

  /* ---------------- Visage selon l'humeur ---------------- */
  function drawFace(s, mood, ox, oy, frame, fur, yawning) {
    if (!mood || mood === 'dodo') return; // paupières de sommeil gérées ailleurs
    const baby = s.stage === 'baby';
    const ey = oy + (baby ? 10 : 8);   // ligne des yeux
    const my = oy + (baby ? 14 : 12);  // truffe (KK)
    const lidCol = (fur && fur.B) || PAL.B;

    if (yawning) {
      ctx.fillStyle = lidCol;
      ctx.fillRect(ox + 4, ey, 6, 2); ctx.fillRect(ox + 22, ey, 6, 2);
      ctx.fillStyle = PAL.K; ctx.fillRect(ox + 13, my + 2, 6, 5);
      ctx.fillStyle = PAL.P; ctx.fillRect(ox + 14, my + 5, 4, 2);
      return;
    }
    if (mood === 'contente') {
      // grand sourire + joues roses
      ctx.fillStyle = PAL.K;
      ctx.fillRect(ox + 11, my + 2, 2, 2);
      ctx.fillRect(ox + 19, my + 2, 2, 2);
      ctx.fillRect(ox + 13, my + 4, 6, 2);
      ctx.fillStyle = PAL.P;
      ctx.fillRect(ox + 4, my, 2, 2); ctx.fillRect(ox + 26, my, 2, 2);
    } else if (mood === 'affamee') {
      // bouche ouverte qui réclame, sourcils inquiets, goutte d'envie
      ctx.fillStyle = PAL.K; ctx.fillRect(ox + 13, my + 3, 6, 4);
      ctx.fillStyle = PAL.P; ctx.fillRect(ox + 14, my + 5, 4, 2);
      ctx.fillStyle = PAL.D;
      ctx.fillRect(ox + 4, ey - 2, 3, 1); ctx.fillRect(ox + 7, ey - 3, 3, 1);
      ctx.fillRect(ox + 25, ey - 2, 3, 1); ctx.fillRect(ox + 22, ey - 3, 3, 1);
      if ((frame >> 4) % 2) { ctx.fillStyle = PAL.W; ctx.fillRect(ox + 20, my + 6, 1, 2); }
    } else if (mood === 'boudeuse') {
      // moue à l'envers + sourcils froncés
      ctx.fillStyle = PAL.K;
      ctx.fillRect(ox + 13, my + 2, 6, 2);
      ctx.fillRect(ox + 11, my + 4, 2, 2);
      ctx.fillRect(ox + 19, my + 4, 2, 2);
      ctx.fillStyle = PAL.D;
      ctx.fillRect(ox + 4, ey - 3, 3, 1); ctx.fillRect(ox + 7, ey - 2, 3, 1);
      ctx.fillRect(ox + 25, ey - 3, 3, 1); ctx.fillRect(ox + 22, ey - 2, 3, 1);
    } else if (mood === 'malade') {
      // yeux mi-clos, petite bouche tombante
      ctx.fillStyle = lidCol;
      ctx.fillRect(ox + 4, ey, 6, 1); ctx.fillRect(ox + 22, ey, 6, 1);
      ctx.fillStyle = PAL.K; ctx.fillRect(ox + 13, my + 3, 6, 1);
    }
    // 'neutre' : le sprite de base suffit
  }

  function skyColors(hour) {
    const night = hour >= 21 || hour < 7;
    const dusk = (hour >= 19 && hour < 21) || (hour >= 7 && hour < 8);
    if (night) return { sky: '#1b2440', hill: '#2c4433', hill2: '#233828', water: '#1e3a5f', wave: '#31558a', night: true };
    if (dusk) return { sky: '#f2b28c', hill: '#5f9e4a', hill2: '#4a8340', water: '#4a6fae', wave: '#7d9fd4', night: false };
    return { sky: '#9fd9e8', hill: '#7ac74f', hill2: '#5aa63d', water: '#3f7fd1', wave: '#7db4e8', night: false };
  }

  // La saison repeint la berge (et la rivière l'hiver) par-dessus l'heure du jour.
  function applySeason(c, season) {
    const t = season && (c.night ? season.night : season.day);
    return t ? Object.assign(c, t) : c;
  }

  // Ambiance saisonnière : feuilles/pétales/neige qui tombent en continu.
  // Déterministe (comme la pluie) : positions dérivées de frame + indice.
  function drawSeasonAmbient(kind, frame) {
    if (!kind) return;
    const N = kind === 'neige' ? 11 : 7;
    for (let i = 0; i < N; i++) {
      const sway = Math.sin((frame + i * 30) / 22) * (kind === 'feuilles' ? 6 : 3);
      const x = ((i * 27 + 13 + sway) % 160 + 160) % 160;
      const speed = kind === 'neige' ? 0.6 : 0.9;
      const y = ((frame * speed + i * 37) % (GROUND_Y + 8));   // tombe jusqu'à la berge
      if (kind === 'neige') {
        ctx.fillStyle = (i + (frame >> 5)) % 4 ? '#eef6ff' : '#cdddef';
        ctx.fillRect(x, y, 2, 2);
      } else if (kind === 'feuilles') {
        const cols = ['#e07a2d', '#c94f3d', '#e0b23d'];
        ctx.fillStyle = cols[i % cols.length];
        if ((frame >> 3) % 2) ctx.fillRect(x, y, 3, 2);
        else ctx.fillRect(x, y, 2, 3);
      } else { // pétales de printemps
        ctx.fillStyle = (i % 2) ? '#f5b8d0' : '#f7cede';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // Trésor de saison du jour : cadeau thématique à toucher (une fois par jour).
  function drawSeasonTreat(key, frame) {
    const bx = TREAT_POS.x, by = TREAT_POS.y + ((frame >> 4) % 2); // léger balancement
    if ((frame >> 3) % 3 === 0) { // scintille pour attirer l'œil
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(bx + 8, by - 3, 1, 2); ctx.fillRect(bx - 3, by + 5, 2, 1);
    }
    if (key === 'chataigne') {
      ctx.fillStyle = '#6b3f1d'; ctx.fillRect(bx + 3, by + 6, 10, 8); ctx.fillRect(bx + 5, by + 4, 6, 3);
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(bx + 5, by + 8, 5, 4);
      ctx.fillStyle = '#e6c79a'; ctx.fillRect(bx + 5, by + 13, 6, 1);
    } else if (key === 'bonhomme') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 3, by + 7, 10, 8); ctx.fillRect(bx + 5, by + 1, 6, 6);
      ctx.fillStyle = '#20160f'; ctx.fillRect(bx + 6, by + 3, 1, 1); ctx.fillRect(bx + 9, by + 3, 1, 1);
      ctx.fillStyle = '#f2913d'; ctx.fillRect(bx + 7, by + 4, 2, 1);
      ctx.fillStyle = '#3b6ea5'; ctx.fillRect(bx + 6, by + 9, 1, 1); ctx.fillRect(bx + 9, by + 11, 1, 1);
    } else if (key === 'fleur') {
      ctx.fillStyle = '#3f9d3a'; ctx.fillRect(bx + 7, by + 8, 2, 7); ctx.fillRect(bx + 3, by + 11, 4, 2);
      ctx.fillStyle = '#f078a8';
      ctx.fillRect(bx + 6, by + 2, 4, 4); ctx.fillRect(bx + 3, by + 4, 4, 4); ctx.fillRect(bx + 9, by + 4, 4, 4); ctx.fillRect(bx + 6, by + 7, 4, 3);
      ctx.fillStyle = '#ffd94a'; ctx.fillRect(bx + 7, by + 5, 2, 2);
    } else if (key === 'pasteque') {
      ctx.fillStyle = '#e5484d'; ctx.fillRect(bx + 3, by + 5, 10, 7);
      ctx.fillStyle = '#2f7d34'; ctx.fillRect(bx + 2, by + 11, 12, 3);
      ctx.fillStyle = '#8ad05f'; ctx.fillRect(bx + 3, by + 11, 10, 1);
      ctx.fillStyle = '#20160f'; ctx.fillRect(bx + 5, by + 7, 1, 1); ctx.fillRect(bx + 8, by + 6, 1, 1); ctx.fillRect(bx + 10, by + 8, 1, 1);
    }
  }

  /* ---------------- Tanière : le second lieu, cosy, qu'on décore de ses trésors ---------------- */

  // Petite gemme facettée (couleur = rareté du trésor).
  function drawGem(x, y, col) {
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 1, y + 8, 6, 1); // ombre sur l'étagère
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y, 6, 7); ctx.fillRect(x, y + 2, 8, 3);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 1, y + 5, 6, 2);      // base plus sombre
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + 2, y + 1, 2, 1); // éclat
  }

  // Astuce d'onboarding : flèche jaune qui rebondit vers une cible (geste à découvrir).
  function drawHint(h, frame) {
    const hx = Math.round(h.x), ty = Math.round(h.y);
    const bob = reduced ? 0 : Math.round(Math.abs(Math.sin(frame / 9)) * 3);
    ctx.fillStyle = 'rgba(255,224,102,' + (0.4 + (reduced ? 0 : Math.sin(frame / 6) * 0.18)).toFixed(2) + ')';
    ctx.fillRect(hx - 2, ty - 2, 4, 4); // halo pulsé sur la cible
    const dark = '#5a4410';
    if (h.up) {                          // sous la cible, pointe vers le haut
      const y0 = ty + 8 + bob;
      ctx.fillStyle = dark; ctx.fillRect(hx - 2, y0 - 2, 4, 12);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(hx - 1, y0 + 3, 2, 6);
      ctx.fillRect(hx - 4, y0 + 2, 9, 1); ctx.fillRect(hx - 3, y0 + 1, 7, 1); ctx.fillRect(hx - 2, y0, 5, 1); ctx.fillRect(hx - 1, y0 - 1, 2, 1);
    } else {                             // au-dessus de la cible, pointe vers le bas
      const y0 = ty - 15 - bob;
      ctx.fillStyle = dark; ctx.fillRect(hx - 2, y0 - 1, 4, 12);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(hx - 1, y0, 2, 6);
      ctx.fillRect(hx - 4, y0 + 6, 9, 1); ctx.fillRect(hx - 3, y0 + 7, 7, 1); ctx.fillRect(hx - 2, y0 + 8, 5, 1); ctx.fillRect(hx - 1, y0 + 9, 2, 1);
    }
  }

  // Balle de jeu (ball-fetch) : petite balle ronde bicolore (corail + crème),
  // reflet en haut, liseré foncé en bas, avec son ombre projetée au sol.
  function drawBall(b) {
    const bx = Math.round(b.x), by = Math.round(b.y);
    // ombre : sous la balle au repos, projetée sur la berge pendant le vol
    const groundY = (b.state === 'flying') ? GROUND_Y + 2 : by + 6;
    const shW = (b.state === 'flying') ? 5 : 8;
    ctx.fillStyle = 'rgba(16,26,16,.18)'; ctx.fillRect(bx - (shW >> 1), groundY, shW, 2);
    // corps rond (rayon 4) : bande crème verticale, reste corail
    const R = 4;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + 1) continue;
      ctx.fillStyle = (dx >= -1 && dx <= 0) ? '#f4ead0' : '#e8804a';
      ctx.fillRect(bx + dx, by + dy, 1, 1);
    }
    ctx.fillStyle = 'rgba(38,54,78,.22)'; ctx.fillRect(bx - 2, by + R, 4, 1);      // volume (bas)
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(bx - 2, by - 3, 2, 1);    // reflet
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(bx - 3, by - 2, 1, 1);
  }

  // La loutre au repos dans sa tanière (calme : respiration, clignement, visage paisible).
  function drawDenOtter(s, frame) {
    const spr = SPRITES[s.stage] || SPRITES.adult;
    const fur = furById(s.fur).map;
    const ox = 64, oy = 62;
    const artOn = usesArt(s);
    const feetY = oy + spr.length * 2;      // même sol dans les deux voies
    const breathing = !reduced && !s.gameOver;
    if (breathing) {
      const b = Math.sin(frame / 32), sy = 1 + b * 0.02, sx = 1 - b * 0.012;
      const cx = ox + 16, cyf = feetY;
      ctx.save(); ctx.translate(cx, cyf); ctx.scale(sx, sy); ctx.translate(-cx, -cyf);
    }
    let headCx = ox + 16, headTop = oy, box = null;
    if (artOn) {
      box = drawAnim(ctx, ART, 'idle', frameAt('idle', Date.now()), ox + 16, feetY, s.fur, false, s.stage);
      if (box) { headCx = box.x + box.anatomy.headCx; headTop = box.y + box.anatomy.headTop; }
    } else {
      drawSprite(spr, ox, oy, 2, fur);
      drawRim(spr, ox, oy, 2, 'rgba(255,224,150,.42)', 'rgba(0,0,0,.24)'); // baignée dans la lueur chaude
    }
    if (breathing) ctx.restore();
    if (s.hat) { const hat = hatById(s.hat); if (hat) drawSprite(hat.rows, headCx - 16, headTop - hat.rows.length * 2 + 4, 2); }
    if (!artOn) drawFace(s, s.sleeping ? 'dodo' : 'contente', ox, oy, frame, fur, false);
    // paupières : calées sur les yeux du sprite en cours (grille ou kit)
    const ey = box ? box.y + 12 : oy + (s.stage === 'baby' ? 10 : 8);
    const lx = box ? box.x + 9 : ox + 4, rx = box ? box.x + 24 : ox + 22;
    const bp = frame % 220, dbl = ((frame / 220) | 0) % 3 === 0;
    const blink = !s.sleeping && (bp < 6 || (dbl && bp > 11 && bp < 17));
    if (s.sleeping || blink) {
      ctx.fillStyle = (fur && fur.B) || PAL.B; ctx.fillRect(lx, ey, 6, 2); ctx.fillRect(rx, ey, 6, 2);
      ctx.fillStyle = (fur && fur.D) || PAL.D; ctx.fillRect(lx, ey + 1, 6, 1); ctx.fillRect(rx, ey + 1, 6, 1);
    }
    if (s.sleeping) {
      ctx.fillStyle = '#ffffff'; ctx.font = '9px monospace';
      const ph = (frame >> 4) % 3;
      const zx = box ? box.x + box.w + 2 : ox + 34;
      ctx.fillText('z', zx, headTop + 6 + ph); ctx.fillText('Z', zx + 6, headTop + ph);
    }
  }

  // La tanière : mur de terre, plancher, tapis, lanterne, étagères de trésors, nid.
  function drawDen(s, frame, fx, c) {
    const owned = fx.owned || [];
    const S = BERGE_SHIFT;   // même règle plein écran que la berge
    // Fond plein écran : mur de terre qui monte jusqu'en haut, plancher qui
    // descend jusqu'en bas — en tuiles, ou peint en repli.
    const tiled = drawDenTiles(S);
    if (!tiled) {
      ctx.fillStyle = '#33231a'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#4a3221'; ctx.fillRect(0, 90 + S, CANVAS_W, CANVAS_H - (90 + S));
    }
    ctx.save(); ctx.translate(0, S);
    if (!tiled) {   // --- repli peint ---
    for (let y = 4 - S; y < 88; y += 6) for (let x = 6; x < CANVAS_W; x += 11) { // texture de terre (jusqu'en haut)
      ctx.fillStyle = ((x + y) % 2) ? 'rgba(255,220,170,.045)' : 'rgba(0,0,0,.06)';
      ctx.fillRect(x + (((y % 6 + 6) >> 1) % 3), y, 2, 2);
    }
    // plancher + lattes
    ctx.fillStyle = '#4a3221'; ctx.fillRect(0, 90, CANVAS_W, 30);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 90, CANVAS_W, 2);
    ctx.fillStyle = '#5a3f2a';
    for (let x = 8; x < CANVAS_W; x += 22) ctx.fillRect(x, 92, 1, 28);
    }   // --- fin du repli peint ---
    // tapis douillet
    ctx.fillStyle = '#7a4a5a'; ctx.fillRect(38, 104, 84, 12);
    ctx.fillStyle = '#94586c'; ctx.fillRect(42, 106, 76, 3);
    ctx.fillStyle = '#5f3a48'; ctx.fillRect(38, 114, 84, 2);
    // lanterne suspendue (coin) + halo chaud
    const lx = 146, ly = 6;
    ctx.fillStyle = 'rgba(255,214,120,.12)';
    ctx.fillRect(lx - 22, ly - 2, 40, 62); ctx.fillRect(lx - 14, ly, 26, 84);
    ctx.fillStyle = '#3a2a16'; ctx.fillRect(lx, 0, 2, 6);
    ctx.fillStyle = '#c98a2a'; ctx.fillRect(lx - 4, ly, 10, 11);
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(lx - 2, ly + 2, 6, 7);
    if ((frame >> 4) % 2) { ctx.fillStyle = '#fff3c8'; ctx.fillRect(lx, ly + 3, 2, 3); }
    // étagères
    for (const sy of [26, 41, 56]) {
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(8, sy, 144, 3);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(8, sy + 3, 144, 1);
    }
    // trésors possédés (gemmes colorées par rareté)
    owned.forEach((id, i) => {
      if (i >= DEN_SLOTS.length) return;
      const it = itemById(id); if (!it) return;
      drawGem(DEN_SLOTS[i].x, DEN_SLOTS[i].y, RARITIES[it.rarity].color);
    });
    // compteur de collection
    ctx.fillStyle = '#e9c98a'; ctx.font = '7px monospace';
    ctx.fillText(owned.length + '/' + ITEMS.length + ' tresors', 9, 12);
    // nid douillet
    ctx.fillStyle = '#7a5a24'; ctx.fillRect(52, 94, 60, 6);
    ctx.fillStyle = '#9a7a2e'; ctx.fillRect(56, 92, 52, 3);
    // la loutre au repos
    drawDenOtter(s, frame);
    ctx.restore();
  }

  // ── MONDE : la vallée en tuiles (atlas Kenney CC0), caméra qui suit la loutre ──
  // (hors navigateur — tests Node — il n'y a pas d'Image : on reste en repli)
  let tiles = null, tilesReady = false;
  if (typeof Image !== 'undefined') {
    tiles = new Image();
    tiles.onload = () => { tilesReady = true; };
    tiles.src = './assets/tileset.png';
  }

  /** Colle une tuile [col,row] de l'atlas à l'écran en (dx, dy). */
  function blit(t, dx, dy) {
    if (!t) return;
    ctx.drawImage(tiles, t[0] * (TILE + SHEET_M), t[1] * (TILE + SHEET_M), TILE, TILE,
      dx | 0, dy | 0, TILE, TILE);
  }

  /**
   * Passe graphique de la TANIÈRE : mur de terre du terrier et plancher de bois
   * en tuiles, plus quelques meubles au sol sur les côtés (la loutre dort au
   * centre). Étagères, tapis, lanterne et nid restent peints : ils sont calés
   * sur les emplacements de trésors. Coords ÉCRAN.
   */
  function drawDenTiles(S) {
    if (!tilesReady) return false;
    const FLOOR_TOP = 90 + S;                  // 234 : la ligne du plancher
    for (let y = 0; y < FLOOR_TOP; y += 16) {
      for (let x = 0; x < CANVAS_W; x += 16) {
        blit((((x + y) / 16) % 4 === 0) ? TD.wallAlt : TD.wall, x, y);
      }
    }
    for (let y = FLOOR_TOP; y < CANVAS_H; y += 16) {
      for (let x = 0; x < CANVAS_W; x += 16) {
        blit((((x + y) / 16) % 3 === 0) ? TD.floorAlt : TD.floor, x, y);
      }
    }
    // le haut du mur n'est pas une paroi nue : on l'habille
    blit(TD.picture, 26, 96); blit(TD.mirror, 118, 96);
    blit(TD.sack, 8, 128); blit(TD.crate, 136, 128);
    // meubles posés au sol, sur les côtés
    blit(TD.barrel, 2, FLOOR_TOP - 16);
    blit(TD.crate, 20, FLOOR_TOP - 16);
    blit(TD.chest, 140, FLOOR_TOP - 16);
    // le terrier est un lieu chaud et clos : on assombrit le mur vers le haut
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
    g.addColorStop(0, 'rgba(20,10,4,.55)');
    g.addColorStop(1, 'rgba(20,10,4,.05)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, FLOOR_TOP);
    return true;
  }

  /**
   * Passe graphique de la BERGE : le sol et la rivière en tuiles (atlas Kenney).
   * Le ciel reste peint — il vit avec l'heure et la saison. Dessiné en coords
   * ÉCRAN (pas de décalage). Retourne false si l'atlas n'est pas encore là,
   * auquel cas l'ancien décor peint prend le relais.
   */
  function drawBergeTiles(c, season, frame) {
    if (!tilesReady) return false;
    const WATER_TOP = GROUND_Y + 8;          // 248 : la ligne d'eau
    const GRASS_TOP = WATER_TOP - 112;       // 7 rangées : la clairière respire
    for (let y = GRASS_TOP; y < WATER_TOP; y += 16) {
      for (let x = 0; x < CANVAS_W; x += 16) {
        blit((((x + y) / 16) % 5 === 0) ? T.grass2 : T.grass, x, y);
      }
    }
    // lisière de forêt à l'horizon : essences alternées et hauteurs décalées,
    // avec quelques trouées — sinon la rangée fait grille mécanique
    for (let i = 0, x = -8; x < CANVAS_W; x += 16, i++) {
      blit((i % 3 === 1) ? T.tree : T.pine, x, GRASS_TOP - 8 - (i % 2 ? 2 : 0));
    }
    for (let i = 0, x = 0; x < CANVAS_W; x += 16, i++) {
      if (i % 4 !== 2) blit(T.tree, x, GRASS_TOP + 8 + (i % 3 === 0 ? 2 : 0));
    }
    // quelques arbres isolés sur les côtés, le centre reste dégagé pour la loutre
    for (const tx of [0, 144]) blit(T.tree, tx, GRASS_TOP + 40);
    for (const bx of [16, 128]) blit(T.bush, bx, GRASS_TOP + 60);
    if (season.key !== 'hiver') for (const fx2 of [40, 104]) blit(T.flower, fx2, GRASS_TOP + 44);
    // la rive s'ourle sur la première rangée d'eau, puis la rivière descend
    for (let x = 0; x < CANVAS_W; x += 16) blit(T.bankN, x, WATER_TOP);
    for (let y = WATER_TOP + 16; y < CANVAS_H; y += 16) {
      for (let x = 0; x < CANVAS_W; x += 16) blit(T.water, x, y);
    }
    // ambiance : la nuit et l'hiver teintent les tuiles (l'atlas, lui, est fixe)
    const wash = c.night ? 'rgba(24,34,70,.44)'
      : season.key === 'hiver' ? 'rgba(226,238,255,.20)'
        : season.key === 'automne' ? 'rgba(224,138,58,.12)' : null;
    if (wash) { ctx.fillStyle = wash; ctx.fillRect(0, GRASS_TOP, CANVAS_W, CANVAS_H - GRASS_TOP); }
    return true;
  }

  // Dessine une loutre (joueuse ou sauvage) à l'échelle des tuiles (16 px).
  function drawFigure(otterLike, px, py, frame, walking, flip) {
    const stage = otterLike.stage || 'adult';
    // cycle de marche : on alterne la pose de repos et le pas
    const pas = walking && (frame >> 3) % 2 === 1;
    const spr = (pas && SPRITES[stage + 'Walk']) || SPRITES[stage] || SPRITES.adult;
    const fur = furById(otterLike.fur).map;
    const w = spr[0].length, h = spr.length;                 // échelle 1 = une tuile de large
    const bob = walking ? (Math.sin(frame / 5) < 0 ? 1 : 0) : 0;   // pas chaloupé
    const ox = Math.round(px - w / 2), oy = Math.round(py - h + bob);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(ox + 3, py - 2, w - 6, 2);                  // ombre au sol
    drawSprite(spr, ox, oy, 1, fur, flip);
    return oy;
  }

  function drawWorld(s, frame, fx) {
    const w = fx.world;
    if (!tilesReady || !w) {                                  // atlas pas encore chargé
      ctx.fillStyle = '#7fbf5f'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }
    // caméra centrée sur la loutre, bornée aux limites du monde
    const camX = Math.max(0, Math.min(WORLD_W - CANVAS_W, Math.round(w.px - CANVAS_W / 2)));
    const camY = Math.max(0, Math.min(WORLD_H - CANVAS_H, Math.round(w.py - CANVAS_H / 2)));
    const c0 = Math.floor(camX / TILE), c1 = Math.ceil((camX + CANVAS_W) / TILE);
    const r0 = Math.floor(camY / TILE), r1 = Math.ceil((camY + CANVAS_H) / TILE);

    const zone = w.zone || 'clairiere';
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      blit(groundTile(zone, cx, cy), cx * TILE - camX, cy * TILE - camY);
    }
    // décor + loutres, triés par profondeur (y) pour que ça passe devant/derrière
    const figs = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const d = decorTile(zone, cx, cy);
      if (d) figs.push({ y: cy * TILE + TILE, fn: () => blit(d, cx * TILE - camX, cy * TILE - camY) });
    }
    // PASSAGES : une flèche et le nom du lieu voisin, pour qu'on sache
    // qu'il y a un ailleurs — sans repère, la vallée paraît close.
    for (const g of zoneGates(zone)) {
      const gx = g.x - camX, gy = g.y - camY;
      if (gx < -30 || gx > CANVAS_W + 30 || gy < -30 || gy > CANVAS_H + 30) continue;
      const puls = Math.sin(frame / 16) * 2;
      const fleche = { north: '▲', south: '▼', east: '▶', west: '◀' }[g.dir];
      ctx.textAlign = 'center';
      ctx.font = '9px system-ui,sans-serif';
      const w = ctx.measureText(g.name).width + 8;
      // calé sur la largeur du libellé, sinon le nom déborde de l'écran
      const ax = Math.max(w / 2 + 2, Math.min(CANVAS_W - w / 2 - 2, gx));
      const ay = Math.max(20, Math.min(CANVAS_H - 8, gy));
      ctx.fillStyle = 'rgba(20,30,50,.55)';
      ctx.fillRect(Math.round(ax - w / 2), Math.round(ay - 15), Math.round(w), 10);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(g.name, Math.round(ax), Math.round(ay - 7));
      ctx.font = '10px system-ui,sans-serif';
      const dy = g.dir === 'north' ? -puls : g.dir === 'south' ? puls : 0;
      const dx = g.dir === 'west' ? -puls : g.dir === 'east' ? puls : 0;
      ctx.fillText(fleche, Math.round(ax + dx), Math.round(ay + 4 + dy));
      ctx.textAlign = 'left';
    }

    // FAUNE d'ambiance : elle dérive lentement, sans état ni collision — sa
    // position se déduit de l'horloge et du lieu. Décorative, mais c'est elle
    // qui fait la différence entre une vallée et une suite de prés vides.
    const faune = FAUNE[zone] || [];
    for (let i = 0; i < faune.length * 2; i++) {
      const g = (zone.charCodeAt(0) * 37 + i * 911) % 1000;
      const t = frame / 60 + i * 1.7;
      const bx = (g * 3.1 + Math.sin(t / 3) * 90) % WORLD_W;
      const by = (g * 7.3 + Math.cos(t / 4) * 70) % WORLD_H;
      const sx = bx - camX, sy = by - camY;
      if (sx < -20 || sx > CANVAS_W + 20 || sy < -20 || sy > CANVAS_H + 20) continue;
      figs.push({ y: by, fn: () => {
        ctx.globalAlpha = 0.9;
        ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(faune[i % faune.length], Math.round(sx), Math.round(sy + Math.sin(t * 2) * 2));
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      } });
    }

    // trouvailles au sol : elles flottent doucement pour attirer l'œil
    for (const f of (w.finds || [])) {
      figs.push({ y: f.y, fn: () => {
        const bob = Math.sin((frame + f.cx * 9) / 14) * 1.5;
        const sx = f.x - camX, sy = f.y - camY + bob;
        ctx.fillStyle = 'rgba(0,0,0,.16)';
        ctx.fillRect(Math.round(sx - 4), Math.round(f.y - camY), 8, 2);
        ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(FIND_ICON[f.kind] || '✨', Math.round(sx), Math.round(sy));
        ctx.textAlign = 'left';
      } });
    }
    // le coffre du lieu : il brille doucement pour se laisser repérer de loin
    if (w.coffre) {
      const c = w.coffre;
      figs.push({ y: c.y, fn: () => {
        const cx = c.x - camX, cy = c.y - camY;
        const lueur = 0.25 + 0.2 * Math.sin(frame / 18);
        ctx.fillStyle = 'rgba(255,214,90,' + lueur.toFixed(2) + ')';
        ctx.fillRect(Math.round(cx - 8), Math.round(cy - 12), 16, 14);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(Math.round(cx - 5), Math.round(cy - 1), 10, 2);
        ctx.font = '13px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🧰', Math.round(cx), Math.round(cy));
        ctx.textAlign = 'left';
      } });
    }
    // LE CHASSEUR. Il doit se voir venir : sa silhouette est haute et sombre,
    // son alerte est marquée d'un « ! » rouge, et sa poursuite d'un halo. Une
    // menace qu'on ne voit pas arriver n'est pas une menace, c'est une punition.
    if (w.chasseur) {
      const c = w.chasseur;
      figs.push({ y: c.y, fn: () => {
        const cx = c.x - camX, cy = c.y - camY;
        if (c.etat === 'poursuite') {                 // halo d'alarme
          ctx.fillStyle = 'rgba(229,72,77,' + (0.14 + 0.08 * Math.sin(frame / 6)).toFixed(2) + ')';
          ctx.fillRect(Math.round(cx - 12), Math.round(cy - 20), 24, 24);
        }
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.fillRect(Math.round(cx - 5), Math.round(cy - 1), 10, 2);
        drawSprite(SPRITES.chasseur, Math.round(cx - 8), Math.round(cy - 15), 1, null, c.facing < 0);
        if (c.etat === 'alerte' || c.etat === 'poursuite') {
          const bond = c.etat === 'alerte' ? (Math.sin(frame / 4) < 0 ? 1 : -1) : 0;
          ctx.fillStyle = '#e5484d';
          ctx.font = 'bold 13px system-ui,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('!', Math.round(cx), Math.round(cy - 20 + bond));
          ctx.textAlign = 'left';
        }
      } });
    }
    // la championne du lieu : une vraie loutre, avec les épées au-dessus —
    // on doit voir de loin que celle-là, on ne l'aborde pas comme les autres
    if (w.epreuve) {
      const e = w.epreuve;
      figs.push({ y: e.y, fn: () => {
        const ex = e.x - camX, ey = e.y - camY;
        drawFigure({ stage: 'adult', fur: e.fur }, ex, ey, frame, false, true);
        const by = ey - 22 + (Math.sin(frame / 12) < 0 ? 1 : 0);
        ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(e.vaincue ? '🏅' : '⚔️', Math.round(ex), Math.round(by));
        ctx.textAlign = 'left';
      } });
    }
    // l'habitant du lieu : posté chez lui, avec sa bulle de parole
    if (w.pnj) {
      const p = w.pnj;
      figs.push({ y: p.y, fn: () => {
        const px = p.x - camX, py = p.y - camY;
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(Math.round(px - 5), Math.round(py - 1), 10, 2);
        ctx.font = '15px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.emoji, Math.round(px), Math.round(py));
        ctx.font = '9px system-ui,sans-serif';
        ctx.fillText('💬', Math.round(px), Math.round(py - 18 + (Math.sin(frame / 14) < 0 ? 1 : 0)));
        ctx.textAlign = 'left';
      } });
    }
    for (const o of w.otters) {
      if (o.gone) continue;
      const ox = o.wx != null ? o.wx : o.x;
      figs.push({ y: o.y, fn: () => {
        drawFigure(o, ox - camX, o.y - camY, frame, false, o.facing < 0);
        const by = o.y - camY - 20 + (Math.sin(frame / 12) < 0 ? 1 : 0);
        ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('💬', ox - camX, by); ctx.textAlign = 'left';
      } });
    }
    figs.push({ y: w.py, fn: () => drawFigure(s, w.px - camX, w.py - camY, frame, w.walking, w.facing < 0) });
    figs.sort((a, b) => a.y - b.y).forEach(f => f.fn());

    // LISIÈRES : sur chaque bord relié, une étiquette collée au bord de
    // l'ÉCRAN — et la toucher suffit à partir (cf. sortieVisee dans main.js).
    // Les repères plantés sur les passages ne se voient que si l'on est déjà
    // près du bord : sans ces étiquettes, on croit la carte close et l'on ne
    // découvre jamais qu'il y a un ailleurs.
    for (const g of zoneGates(zone)) {
      const nom = g.name;
      ctx.save();
      ctx.font = 'bold 8px system-ui,sans-serif';
      ctx.textAlign = 'center';
      const larg = Math.max(34, ctx.measureText(nom).width + 14);
      ctx.globalAlpha = 0.72 + 0.14 * Math.sin(frame / 20);
      if (g.dir === 'north' || g.dir === 'south') {
        // en haut le bandeau de nom et les jauges, en bas le journal : posées
        // au ras du bord, les étiquettes passaient dessous et devenaient
        // illisibles. On les cale juste en deçà (cf. MONDE_HAUT dans main.js).
        const y = g.dir === 'north' ? 49 : CANVAS_H - 33;
        ctx.fillStyle = 'rgba(18,32,46,.62)';
        ctx.fillRect(Math.round(CANVAS_W / 2 - larg / 2), y, Math.round(larg), 11);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText((g.dir === 'north' ? '▲ ' : '▼ ') + nom, CANVAS_W / 2, y + 8);
      } else {
        // texte tourné, comme un panneau routier : la largeur de l'écran (160)
        // ne laisse pas la place d'écrire un nom à plat sur les côtés
        ctx.translate(g.dir === 'west' ? 8 : CANVAS_W - 8, CANVAS_H / 2);
        ctx.rotate(g.dir === 'west' ? -Math.PI / 2 : Math.PI / 2);
        ctx.fillStyle = 'rgba(18,32,46,.62)';
        ctx.fillRect(Math.round(-larg / 2), -6, Math.round(larg), 11);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText('▲ ' + nom, 0, 2);
      }
      ctx.restore();
    }

    // RIDEAU DE PASSAGE : deux volets qui se referment puis s'ouvrent, avec le
    // nom du lieu. Le voyage se voit, au lieu de se produire entre deux images.
    const dt = Date.now() - passage.at;
    if (dt >= 0 && dt < PASSAGE_MS) {
      const k = dt / PASSAGE_MS;
      // 0 -> 1 : fermeture jusqu'à mi-course, puis ouverture
      const couvre = k < 0.5 ? (k / 0.5) : (1 - (k - 0.5) / 0.5);
      const h = Math.round(CANVAS_H / 2 * Math.min(1, couvre * 1.25));
      ctx.fillStyle = '#12202e';
      ctx.fillRect(0, 0, CANVAS_W, h);
      ctx.fillRect(0, CANVAS_H - h, CANVAS_W, h);
      if (couvre > 0.55) {
        ctx.globalAlpha = Math.min(1, (couvre - 0.55) / 0.3);
        ctx.textAlign = 'center';
        ctx.font = '18px system-ui,sans-serif';
        ctx.fillText(passage.emoji, CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.fillStyle = '#ffe9a8';
        ctx.font = 'bold 11px system-ui,sans-serif';
        ctx.fillText(passage.nom, CANVAS_W / 2, CANVAS_H / 2 + 12);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
  }

  function render(s, mg, frame, fx) {
    fx = fx || {};
    lastFrame = frame;
    const now = new Date();
    const season = seasonInfo(now);
    const c = applySeason(skyColors(now.getHours()), season);

    // Le Monde : balade libre dans la vallée pour rencontrer d'autres loutres.
    if (s && s.place === 'monde' && !mg && !s.gameOver) {
      drawWorld(s, frame, fx);
      drawParticles();
      paintVignette();
      return;
    }

    // La tanière : second lieu, cosy, où l'on retrouve la loutre et sa collection.
    if (s && s.place === 'taniere' && !mg && s.stage !== 'egg' && !s.away && !s.gameOver) {
      drawDen(s, frame, fx, c);
      drawParticles();
      paintVignette();
      return;
    }

    // ciel en dégradé vertical (plus profond en haut, plus clair vers l'horizon)
    const skyTop = c.night ? mix(c.sky, '#05060f', 0.4) : mix(c.sky, '#173766', 0.3);
    const skyBot = c.night ? mix(c.sky, '#161d33', 0.25) : mix(c.sky, '#eaf3ff', 0.24);
    try {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y - 44);
      g.addColorStop(0, skyTop); g.addColorStop(1, skyBot);
      ctx.fillStyle = g;
    } catch (e) { ctx.fillStyle = c.sky; }
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // astre + étoiles
    if (c.night) {
      ctx.fillStyle = '#e8e8d0';
      ctx.fillRect(126, 12, 10, 10); ctx.fillRect(124, 14, 14, 6);
      ctx.fillStyle = c.sky; ctx.fillRect(130, 14, 8, 6);
      ctx.fillStyle = '#ffffff';
      [[14, 10], [38, 22], [70, 8], [96, 18], [120, 30], [52, 14], [145, 8], [24, 32]].forEach(p => {
        if ((frame >> 4) % 2 === 0 || (p[0] + p[1]) % 3) ctx.fillRect(p[0], p[1], 1, 1);
      });
    } else {
      // soleil + halo doux
      ctx.fillStyle = 'rgba(255,236,150,.28)';
      ctx.fillRect(122, 6, 24, 24); ctx.fillRect(118, 10, 32, 16); ctx.fillRect(126, 2, 16, 32);
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(128, 10, 12, 12); ctx.fillRect(126, 12, 16, 8); ctx.fillRect(130, 8, 8, 16);
    }

    // nuages qui dérivent lentement (le jour) — profondeur du ciel
    if (!c.night) {
      const cloud = (cx, cy, w) => {
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillRect(cx, cy, w, 3); ctx.fillRect(cx + 3, cy - 2, w - 6, 3); ctx.fillRect(cx + 5, cy + 2, w - 12, 2);
      };
      const d = frame >> 3;
      cloud(((d * 0.25) % 200) - 30, 14, 22);
      cloud((150 - (d * 0.16) % 200 + 200) % 200 - 20, 26, 15);
    }

    // --- BERGE (collines, herbe, eau) : dessinée pour un sol à y=96 puis
    //     décalée vers le bas ; l'eau s'étend jusqu'au bas de l'écran. ---
    const tiled = drawBergeTiles(c, season, frame);   // sol + rivière en tuiles
    ctx.save(); ctx.translate(0, BERGE_SHIFT);
    if (!tiled) {   // --- repli peint (atlas pas encore chargé) ---
    // collines LOINTAINES : perspective atmosphérique (plus claires, brumeuses)
    const far = mix(c.hill2, c.sky, 0.5);
    ctx.fillStyle = far;
    for (let x = 0; x < CANVAS_W; x += 4) {
      const top = 46 + Math.round(Math.sin(x / 23) * 4 + Math.sin(x / 9) * 2);
      ctx.fillRect(x, top, 4, 58 - top);
    }
    // brume d'horizon
    ctx.fillStyle = c.night ? 'rgba(200,210,235,.05)' : 'rgba(255,255,255,.13)';
    ctx.fillRect(0, 49, CANVAS_W, 8);

    // collines + berge (proches)
    ctx.fillStyle = c.hill2;
    ctx.fillRect(0, 54, CANVAS_W, 50);
    for (let x = 0; x < CANVAS_W; x += 16) ctx.fillRect(x, 50 - ((x / 16) % 3) * 2, 16, 8);
    ctx.fillStyle = c.hill; ctx.fillRect(0, 62, CANVAS_W, 42);
    ctx.fillStyle = c.hill2;
    for (let x = 4; x < CANVAS_W; x += 22) ctx.fillRect(x, 66 + ((x * 7) % 18), 2, 3);

    // texture d'herbe : brins clairs/foncés (déterministe -> ne scintille pas)
    const grassLo = mix(c.hill, '#0f2a18', 0.32), grassHi = mix(c.hill, '#f0ffe0', 0.16);
    for (let x = 2; x < CANVAS_W; x += 5) {
      const bh = 2 + ((x * 13) % 3);
      ctx.fillStyle = ((x >> 2) % 2) ? grassLo : grassHi;
      ctx.fillRect(x, 100 - bh, 1, bh);
    }
    // bande humide plus foncée le long de la berge
    ctx.fillStyle = mix(c.hill, '#0c2416', 0.42);
    ctx.fillRect(0, 101, CANVAS_W, 3);
    // petites fleurs éparses (sur les côtés, couleur selon la saison)
    const fcol = season.key === 'hiver' ? '#e4edf5' : season.key === 'automne' ? '#e5843a' : '#f2d24e';
    for (const [fx2, fy2] of [[16, 90], [30, 97], [110, 88], [132, 95], [146, 90]]) {
      ctx.fillStyle = fcol; ctx.fillRect(fx2, fy2, 2, 2);
      ctx.fillStyle = mix(fcol, '#ffffff', 0.45); ctx.fillRect(fx2, fy2, 1, 1);
    }

    // rivière animée — étendue jusqu'au bas de l'écran, plus profonde vers le bas
    const waterBot = CANVAS_H - BERGE_SHIFT;            // bas de l'eau (coords locales)
    ctx.fillStyle = c.water; ctx.fillRect(0, 104, CANVAS_W, waterBot - 104);
    ctx.fillStyle = mix(c.water, '#0a1830', 0.30); ctx.fillRect(0, waterBot - 46, CANVAS_W, 46);
    ctx.fillStyle = mix(c.water, '#0a1830', 0.5); ctx.fillRect(0, waterBot - 18, CANVAS_W, 18);
    ctx.fillStyle = mix(c.water, '#ffffff', 0.4); ctx.fillRect(0, 104, CANVAS_W, 1);
    }   // --- fin du repli peint ---
    ctx.fillStyle = c.wave;
    const off = (frame >> 3) % 16;
    for (let x = -16; x < CANVAS_W; x += 16) {
      ctx.fillRect(x + off, 107, 8, 2);
      ctx.fillRect(x + off + 8, 113, 8, 2);
    }
    // fines rides (2e couche, dérive plus lente -> profondeur de l'eau)
    ctx.fillStyle = mix(c.water, c.wave, 0.55);
    const off2 = (frame >> 4) % 24;
    for (let x = -24; x < CANVAS_W; x += 24) {
      ctx.fillRect(x - off2 + 12, 110, 6, 1);
      ctx.fillRect(x - off2, 116, 5, 1);
    }
    // scintillement du soleil sur l'eau (le jour), aligné sous l'astre
    if (!c.night) {
      ctx.fillStyle = 'rgba(255,244,190,.5)';
      for (let y = 105; y < 118; y += 2) {
        if (((y + (frame >> 2)) >> 1) % 2) ctx.fillRect(130 + ((y * 3) % 5), y, 3, 1);
      }
    }
    ctx.restore(); // fin de la berge décalée

    if (!s) return;

    // décor de berge choisi (dessiné en coords berge -> décalé comme la berge)
    if (s.decor && s.decor !== 'aucun') {
      ctx.save(); ctx.translate(0, BERGE_SHIFT); drawDecor(s.decor, c, frame); ctx.restore();
    }

    if (s.gameOver) {
      ctx.save(); ctx.translate(0, BERGE_SHIFT);   // scène calée sur la berge décalée
      if ((frame >> 4) % 2 === 0) drawSprite(SPRITES.heart, 74, 100, 1);
      ctx.restore();
      drawParticles();
      return;
    }

    // partie bouder chez le héron : la berge est calme, le grand oiseau veille
    if (s.away) {
      ctx.save(); ctx.translate(0, BERGE_SHIFT);   // sinon le héron flotte dans le ciel
      drawSprite(SPRITES.heron, 66, 68, 2);
      if ((frame >> 4) % 2 === 0) { // il pense à elle…
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(94, 62, 2, 2); ctx.fillRect(98, 59, 2, 2); ctx.fillRect(102, 56, 2, 2);
      }
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(26, 16, 108, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('chez le héron… soins ' + (s.awayCare || 0) + '/3', 32, 25);
      ctx.restore();
      drawParticles();
      return;
    }

    const fur = furById(s.fur).map;

    // vie du décor (libellule le jour, luciole la nuit, poissons bondissants)
    drawAmbient(mg, frame, c.night);

    // ambiance saisonnière : feuilles / pétales / neige qui tombent (pas pendant la pêche)
    if (!mg && !reduced) drawSeasonAmbient(season.ambient, frame);

    // trésor de saison du jour, à récolter (disparaît une fois pris)
    if (!mg && s.stage !== 'egg' && season.treat && treatAvailable(s)) {
      drawSeasonTreat(season.treat.id, frame);
    }

    // événement du jour (surprise déterministe par date, jamais pendant la pêche)
    if (!mg && s.stage !== 'egg') {
      ctx.save(); ctx.translate(0, BERGE_SHIFT); drawDailyEvent(s, frame, c.night); ctx.restore();
    }

    // adversaire de combat (dessiné à droite, en miroir)
    if (fx.foe) {
      const fspr = SPRITES[fx.foe.stage] || SPRITES.baby;
      const fy = GROUND_Y - fspr.length * 2 + ((frame >> 4) % 2 ? -2 : 0);
      drawSprite(fspr, 112, fy, 2, furById(fx.foe.fur).map, true);
      const fhat = fx.foe.hat && hatById(fx.foe.hat);
      if (fhat) drawSprite(fhat.rows, 112, fy - fhat.rows.length * 2 + 4, 2, null, true);
    }

    // Plongée : elle est partie pêcher au large. On la voit dériver sur le dos
    // à la surface, et replonger — les bulles montent depuis l'eau.
    // (Elles étaient dessinées vers y=112, en coordonnées d'AVANT le décalage
    // plein écran : elles flottaient dans le ciel, à 130 px au-dessus de l'eau.)
    if (fx.diving) {
      const t = Date.now();
      const derive = Math.sin(t / 2600);              // va-et-vient lent d'une rive à l'autre
      const cx = Math.round(CANVAS_W / 2 + derive * 42);
      // au large, bien DANS la rivière : sur la ligne de rive elle paraissait
      // échouée sur la berge, à moitié sur l'herbe
      const cy = WATER_Y + 30;
      const sous = Math.sin(t / 1500) < -0.55;        // par moments elle disparaît sous l'eau
      if (!sous) {
        drawAnim(ctx, ART, 'swim', frameAt('swim', t), cx, cy, s.fur,
          Math.cos(t / 2600) < 0, s.stage);
      } else {
        // remous à sa place le temps qu'elle est dessous
        ctx.strokeStyle = 'rgba(210,240,255,.5)'; ctx.lineWidth = 1;
        const r = 4 + ((frame >> 2) % 8);
        ctx.beginPath(); ctx.ellipse(cx, cy - 3, r, r * 0.35, 0, 0, 6.283); ctx.stroke();
      }
      // bulles : elles remontent vers elle depuis le fond
      ctx.fillStyle = 'rgba(210,240,255,.9)';
      ctx.fillRect(cx - 12, cy + 30 - ((frame >> 3) % 14), 3, 3);
      ctx.fillRect(cx + 6, cy + 34 - ((frame >> 2) % 18), 2, 2);
      ctx.fillRect(cx - 3, cy + 26 - ((frame >> 4) % 11), 2, 2);
      // bandeau au-dessus de la rivière : en haut d'écran il passait DERRIÈRE
      // l'en-tête (niveau, gemmes) et devenait illisible
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(36, GROUND_Y - 34, 88, 13);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('🤿 plongée en cours…', 40, GROUND_Y - 24);
      drawParticles();
      return;
    }

    // cacas (sur la berge -> décalés comme elle)
    const slots = [[28, 90 + BERGE_SHIFT], [118, 92 + BERGE_SHIFT], [44, 98 + BERGE_SHIFT]];
    s.poops.forEach((slot, i) => {
      const p = slots[(slot + i) % 3];
      drawSprite(SPRITES.poop, p[0], p[1], 2);
      if ((frame >> 3) % 2 === 0) {
        ctx.fillStyle = '#5a5a4a';
        ctx.fillRect(p[0] + 14, p[1] - 4, 1, 1); ctx.fillRect(p[0] - 2, p[1] - 2, 1, 1);
      }
    });

    // humeur du moment + petites manies quand tout va bien
    const mood = moodOf(s);
    const calm = !mg && !fx.foe && !fx.diving && !s.sleeping && s.stage !== 'egg' && canIdle(mood);
    if (idleAnim && (!calm || frame - idleAnim.start >= IDLE_FRAMES[idleAnim.kind])) {
      idleAnim = null;
      nextIdleAt = frame + 500 + Math.random() * 900;
    }
    if (!idleAnim && calm && frame >= nextIdleAt && ball.state === 'idle') idleAnim = { kind: pickIdle(), start: frame };
    const yawning = !!idleAnim && idleAnim.kind === 'baille';

    // loutre / œuf
    const spr = SPRITES[s.stage];
    // éclosion : plus l'œuf approche, plus il se fissure et tremble tout seul
    const eggProg = s.stage === 'egg' ? Math.max(0, Math.min(1, (Date.now() - s.born) / HATCH_MS)) : 0;
    const crack = s.stage === 'egg' ? eggCrackLevel(eggProg) : 0;
    let walking = false;
    const wxAvant = otterWX;   // pour mesurer le chemin réellement parcouru
    // ball-fetch : la balle lancée décrit un arc, retombe, puis la loutre la rapporte
    const ballActive = s.stage !== 'egg' && !s.sleeping && !s.away && !s.gameOver && !mg && !fx.foe && !fx.diving;
    if (!ballActive && ball.state !== 'idle' && ball.state !== 'held') {
      ball.state = 'idle'; ball.x = BALL_HOME.x; ball.y = BALL_HOME.y; // partie interrompue -> la balle revient
    }
    if (ball.state === 'flying') {
      ball.t = Math.min(1, ball.t + 0.045);
      ball.x = ball.sx + (ball.tx - ball.sx) * ball.t;
      ball.y = ball.sy + (ball.ty - ball.sy) * ball.t - 34 * Math.sin(Math.PI * ball.t); // cloche
      if (ball.t >= 1) { ball.state = 'resting'; ball.x = ball.tx; ball.y = ball.ty; }
    }
    let fetching = false;
    if (ballActive && (ball.state === 'resting' || ball.state === 'carried')) {
      fetching = true;
      const targetX = ball.state === 'resting' ? ball.x - 16 : OTTER_X; // va à la balle, puis rentre
      const d = targetX - otterWX;
      if (Math.abs(d) > 1) { otterWX += Math.sign(d) * Math.min(0.9, Math.abs(d)); walking = true; otterFace = Math.sign(d); } // course vive
      else if (ball.state === 'resting') ball.state = 'carried';                    // ramassée
      else { ball.state = 'idle'; ball.x = BALL_HOME.x; ball.y = BALL_HOME.y; fetchDone++; } // rapportée !
    }
    // balade tranquille sur la berge (coupée : fetch/sommeil/œuf/absente/mini-jeu/combat/plongée/mvt réduit)
    const canRoam = !fetching && s.stage !== 'egg' && !s.sleeping && !s.away && !s.gameOver && !mg && !fx.foe && !fx.diving && !reduced && !idleAnim;
    if (canRoam) {
      if (frame >= otterDwell && Math.abs(otterWX - otterTarget) < 0.5) {
        wanderSeed = (wanderSeed * 1103515245 + 12345) & 0x7fffffff; // LCG : cible stable, pas de Math.random
        otterTarget = 42 + (wanderSeed % 45);       // 42..86 : reste sur la berge, plein cadre
        otterDwell = frame + 150 + (wanderSeed % 260);
      }
      const d = otterTarget - otterWX;
      if (Math.abs(d) > 0.5) { otterWX += Math.sign(d) * Math.min(0.4, Math.abs(d)); walking = true; otterFace = Math.sign(d); }
    } else if (!fetching && (mg || fx.foe)) {
      // combat / mini-jeu : la loutre revient au centre (position attendue par la scène)
      otterWX += (OTTER_X - otterWX) * 0.2;
    }
    // sinon (manie, sommeil, mvt réduit) : elle reste où elle est — pas de recentrage forcé

    // Le pas est cadencé par le CHEMIN PARCOURU, pas par le temps : sinon les
    // pattes s'agitent à vide pendant qu'elle avance lentement (patinage), ce
    // qui est exactement ce qui rendait la marche laide.
    otterDist += Math.abs(otterWX - wxAvant);
    if (walking) otterWalkedAt = frame;
    // et on garde la pose de marche un court instant après l'arrêt, sinon elle
    // clignote entre profil et face à chaque micro-pause
    const enMarche = walking || (frame - otterWalkedAt) < 10;

    // rebond : petit pas de dandinement en marchant, sinon léger sautillement.
    // Les sprites du kit s'animent déjà tout seuls : leur ajouter un sautillement
    // faisait trembler la loutre sur place.
    const artOn = usesArt(s);
    const bounce = (artOn || s.sleeping || s.stage === 'egg' || yawning) ? 0
      : walking ? ((frame >> 2) % 2 === 0 ? 0 : -1)
      : ((frame >> 4) % 2 === 0 ? 0 : -2);
    let ox = Math.round(otterWX), oy = otterY(s.stage) + bounce;
    // tremblement : provoqué (réchauffage/secousse) ou spontané quand ça va craquer
    // (le tremblement spontané est coupé en mouvement réduit)
    if (s.stage === 'egg' && (fx.wobble || (crack >= 3 && !reduced))) ox += ((frame >> 1) % 2 === 0 ? -2 : 2);
    else if (s.stage === 'egg' && crack >= 2 && !reduced && (frame >> 2) % 4 === 0) ox += 1;
    if (s.sick && (frame >> 2) % 6 === 0) ox += 1;
    if (idleAnim && idleAnim.kind === 'gratte') ox += (frame >> 2) % 2; // frisson de grattage

    // stress saisonnier (télégraphe l'effet santé) : froid -> grelotte, chaud -> transpire
    const alive = s.stage !== 'egg' && !s.sleeping && !s.away && !s.gameOver && !mg;
    const coldStress = alive && season.key === 'hiver' && (s.energy < SEASON_FX.COLD_LOW_ENERGY || s.sick);
    const heatStress = alive && season.key === 'ete' && s.clean < SEASON_FX.HEAT_OVERHEAT_CLEAN;
    if (coldStress) ox += (frame >> 1) % 2 === 0 ? -1 : 1; // grelottement rapide

    // ombre de contact au sol : ancre la loutre (rétrécit et s'éclaircit quand
    // elle saute). Les sprites du kit portent DÉJÀ leur ombre : en dessiner une
    // seconde faisait flotter la loutre sur deux ombres superposées.
    if (s.stage !== 'egg' && !s.away && !artOn) {
      const lift = Math.max(0, GROUND_Y - (oy + spr.length * 2));
      const w = 24 - lift * 2, sx0 = ox + 16 - (w >> 1);
      ctx.fillStyle = 'rgba(16,26,16,' + (0.26 - lift * 0.03).toFixed(2) + ')';
      ctx.fillRect(sx0 + 2, GROUND_Y - 1, w - 4, 2);
      ctx.fillRect(sx0, GROUND_Y, w, 1);
    }

    // squash & stretch (ancré aux pieds, tout le corps + chapeau suivent)
    const sqT = 1 - Math.max(0, squashUntil - Date.now()) / SQUASH_MS;
    const squashing = sqT < 1 && s.stage !== 'egg';
    // respiration douce quand elle est tranquille (la poitrine se soulève) —
    // inutile avec le kit, dont la pose de repos respire déjà d'elle-même
    const breathing = !squashing && !reduced && !artOn && s.stage !== 'egg' && !s.gameOver;
    if (squashing || breathing) {
      let sx, sy;
      if (squashing) { ({ sx, sy } = squashScale(sqT)); }
      else { const b = Math.sin(frame / 32); sy = 1 + b * 0.02; sx = 1 - b * 0.012; }
      const cx = ox + 16, cyf = otterY(s.stage) + spr.length * 2;
      ctx.save();
      ctx.translate(cx, cyf);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -cyf);
    }

    // Le corps : kit dessiné dès l'éclosion, grille de pixels pour l'œuf.
    // headCx/headTop : où poser le chapeau, quelle que soit la voie.
    let box = null, headCx = ox + 16, headTop = oy;
    if (artOn) {
      // en marche elle se met de profil (le kit marche de côté), sinon elle
      // nous fait face ; l'humeur choisit entre la pose calme et la joyeuse
      const anim = enMarche ? 'walk' : animForMood(mood);
      const fr = enMarche ? Math.floor(otterDist / FOULEE) : frameAt(anim, Date.now());
      const flip = enMarche && otterFace < 0;
      box = drawAnim(ctx, ART, anim, fr, ox + 16, GROUND_Y + bounce, s.fur, flip, s.stage);
      if (box) {
        const an = box.anatomy;
        headCx = flip ? box.x + box.w - an.headCx : box.x + an.headCx;
        headTop = box.y + an.headTop;
      }
    } else {
      // cycle de marche : la 2e image du pas quand elle se déplace vraiment
      const marche = walking && SPRITES[s.stage + 'Walk'] && (frame >> 2) % 2 === 1;
      drawSprite(marche ? SPRITES[s.stage + 'Walk'] : spr, ox, oy, 2, s.stage === 'egg' ? null : fur);
      // relief lumineux (jour : soleil chaud ; nuit : lune froide et discrète)
      drawRim(spr, ox, oy, 2,
        c.night ? 'rgba(200,214,255,.28)' : 'rgba(255,246,205,.5)',
        'rgba(0,0,0,.22)');
      headCx = ox + 16; headTop = oy;
    }
    if (crack > 0) drawEggCracks(ox, oy, crack, frame);

    // chapeau équipé (posé sur la tête, suit le rebond)
    if (s.stage !== 'egg' && s.hat) {
      const hat = hatById(s.hat);
      if (hat) drawSprite(hat.rows, headCx - 16, headTop - hat.rows.length * 2 + 4, 2);
    }

    // manie en cours (grattage, caillou…) puis visage de l'humeur
    // (le kit a son visage dessiné : rien à repeindre par-dessus)
    if (idleAnim) drawIdle(idleAnim.kind, frame - idleAnim.start, box ? box.x + 5 : ox, box ? box.y + 12 : oy, fur);
    if (s.stage !== 'egg' && !artOn) drawFace(s, mood, ox, oy, frame, fur, yawning);

    // paupières (sommeil / clignement)
    if (s.stage !== 'egg') {
      // clignement naturel : ~toutes les 3,7 s, avec un double-clignement de temps en temps
      const bp = frame % 220;
      const dbl = ((frame / 220) | 0) % 3 === 0;
      const blink = !s.sleeping && (bp < 6 || (dbl && bp > 11 && bp < 17));
      if (s.sleeping || blink) {
        const ey = oy + (s.stage === 'baby' ? 10 : 8);
        ctx.fillStyle = (fur && fur.B) || PAL.B;
        ctx.fillRect(ox + 4, ey, 6, 2); ctx.fillRect(ox + 22, ey, 6, 2);
        ctx.fillStyle = (fur && fur.D) || PAL.D;
        ctx.fillRect(ox + 4, ey + 1, 6, 1); ctx.fillRect(ox + 22, ey + 1, 6, 1);
      }
    }

    // saleté / maladie / sommeil / alerte
    if (s.stage !== 'egg' && s.clean < 30) {
      ctx.fillStyle = '#54452e';
      ctx.fillRect(ox + 6, oy + 18, 2, 2); ctx.fillRect(ox + 24, oy + 22, 2, 2); ctx.fillRect(ox + 14, oy + 26, 2, 2);
    }
    if (s.sick) {
      ctx.fillStyle = '#9dc76a';
      const gy = oy - 8 + ((frame >> 4) % 2);
      ctx.fillRect(ox - 10, gy, 8, 5); ctx.fillRect(ox - 8, gy - 3, 5, 3);
    }
    if (s.sleeping) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '9px monospace';
      const ph = (frame >> 4) % 3;
      ctx.fillText('z', ox + 34, oy - 2 + ph);
      ctx.fillText('Z', ox + 40, oy - 8 + ph);
      if (ph === 2) ctx.fillText('Z', ox + 47, oy - 14);
    }
    if (!s.sleeping && s.stage !== 'egg' && !mg) {
      const urgent = s.hunger < 20 || s.fun < 20 || s.clean < 20 || s.health < 35;
      if (urgent && (frame >> 4) % 2 === 0) {
        ctx.fillStyle = '#e5484d';
        ctx.fillRect(ox + 36, oy - 14, 3, 8); ctx.fillRect(ox + 36, oy - 4, 3, 3);
      }
    }

    // froid : cristaux de givre + petit nuage de souffle glacé (contraste sur la neige)
    if (coldStress) {
      ctx.fillStyle = (frame >> 3) % 2 ? '#4f92c9' : '#3a6ea5';
      const gy = oy + ((frame >> 3) % 2);
      ctx.fillRect(ox - 8, gy + 2, 2, 2); ctx.fillRect(ox - 6, gy, 1, 1); ctx.fillRect(ox - 10, gy, 1, 1);
      ctx.fillRect(ox + 34, gy + 6, 2, 2); ctx.fillRect(ox + 37, gy + 4, 1, 1);
      // buée devant le museau, qui perle par bouffées
      if ((frame >> 4) % 2 === 0) {
        ctx.fillStyle = 'rgba(230,240,255,.75)';
        ctx.fillRect(ox + 30, oy + 4, 3, 2); ctx.fillRect(ox + 33, oy + 3, 2, 2);
      }
    }
    // chaud : gouttes de sueur qui perlent et tombent
    if (heatStress) {
      ctx.fillStyle = '#7ec8ff';
      const d = (frame >> 2) % 6;
      ctx.fillRect(ox + 30, oy + 2 + d, 2, 3);           // goutte qui glisse
      if (d > 3) ctx.fillRect(ox - 2, oy + 4 + (d - 3) * 2, 2, 3);
    }

    // trésor équipé : une lueur de sa rareté orbite près d'elle
    if (s.gear && s.stage !== 'egg' && !s.away && !s.gameOver && !mg) {
      const it = itemById(s.gear);
      if (it) {
        const ang = frame / 22;
        const gx = ox + 16 + Math.round(Math.cos(ang) * 22);
        const gy = oy + 4 + Math.round(Math.sin(ang) * 9);
        ctx.fillStyle = RARITIES[it.rarity].color;
        ctx.fillRect(gx, gy, 2, 2);
        if ((frame >> 3) % 2 === 0) {
          ctx.fillRect(gx - 1, gy, 1, 1); ctx.fillRect(gx + 2, gy, 1, 1);
          ctx.fillRect(gx, gy - 1, 1, 1); ctx.fillRect(gx, gy + 2, 1, 1);
        }
      }
    }

    if (squashing || breathing) ctx.restore();

    // décompte éclosion (bascule en « ça craque ! » sur la toute fin)
    if (s.stage === 'egg') {
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(46, 18, 68, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      if (crack >= 3) {
        ctx.fillText((frame >> 3) % 2 ? 'ça craque !!' : 'ça CRAQUE !!', 52, 27);
      } else {
        const left = Math.max(0, HATCH_MS - (Date.now() - s.born));
        const mm = Math.floor(left / MIN), ss = Math.floor((left % MIN) / SEC);
        ctx.fillText('éclosion ' + mm + ':' + String(ss).padStart(2, '0'), 52, 27);
      }
    }

    // mini-jeu : toboggan (esquive) ou pêche (cible)
    if (mg && mg.mode === 'slide') {
      drawSlide(mg, frame, s, fur);
    } else if (mg) {
      const now = Date.now();
      // Nuit de pêche : la berge s'assombrit, l'eau (en bas) est le terrain de jeu.
      ctx.fillStyle = 'rgba(20,30,60,.30)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = 'rgba(12,20,44,.16)'; ctx.fillRect(0, WATER_Y, CANVAS_W, CANVAS_H - WATER_Y);
      // ligne de surface, pour bien lire d'où sortent les poissons
      ctx.fillStyle = 'rgba(210,240,255,.55)'; ctx.fillRect(0, WATER_Y - 1, CANVAS_W, 1);

      // ONDULATIONS d'annonce : un rond qui s'ouvre là où un poisson va jaillir
      for (const t of (mg.tells || [])) {
        const k = Math.min(1, (now - t.at) / TELL_MS);
        const r = 3 + k * 11;
        ctx.strokeStyle = t.kind === 'gold'
          ? 'rgba(255,214,90,' + (1 - k * 0.35).toFixed(2) + ')'
          : 'rgba(225,245,255,' + (0.95 - k * 0.35).toFixed(2) + ')';
        ctx.lineWidth = t.kind === 'gold' ? 2 : 1;
        ctx.beginPath(); ctx.ellipse(t.x + 5, WATER_Y, r, r * 0.4, 0, 0, 6.283); ctx.stroke();
      }

      // éclaboussure à la surface (jaillissement / replongeon)
      if (mg.splash && now - mg.splash.t < 380) {
        const st = (now - mg.splash.t) / 380;
        ctx.fillStyle = 'rgba(233,223,192,' + (0.8 * (1 - st)).toFixed(2) + ')';
        const r = 3 + st * 9;
        ctx.fillRect(mg.splash.x - r, WATER_Y - 1, r * 2, 2);
        ctx.fillRect(mg.splash.x - r + 1, WATER_Y - 4, 2, 3);
        ctx.fillRect(mg.splash.x + r - 3, WATER_Y - 4, 2, 3);
      }

      // les poissons qui bondissent (orientés selon leur sens)
      // La gueule de la loutre, vers laquelle filent les prises. Elle se recentre
      // pendant la pêche, donc on lit sa position RÉELLE de cette image.
      const gueuleX = Math.round(otterWX) + 16, gueuleY = GROUND_Y - 26;
      for (const f of (mg.fishes || [])) {
        const fx2 = Math.round(f.x), fy2 = Math.round(f.y);
        // GOBÉ : happé vers la loutre, il rétrécit et s'efface, ses points
        // s'envolent. Auparavant il disparaissait net, et l'éclaboussure était
        // dessinée à la SURFACE de l'eau — loin du poisson pris en plein vol.
        if (f.got) {
          const k = Math.min(1, (now - f.gotAt) / FISH_GOBE_MS);
          const doux = k * k * (3 - 2 * k);
          const gx = f.x + (gueuleX - f.x) * doux;
          const gy = f.y + (gueuleY - f.y) * doux;
          const taille = 1 - doux;
          ctx.save();
          ctx.globalAlpha = 1 - doux * 0.85;
          ctx.translate(gx, gy);
          ctx.scale(Math.max(0.05, taille), Math.max(0.05, taille));
          drawSprite(SPRITES.fish, 0, 0, 1,
            f.kind === 'gold' ? { B: '#ffd94a', D: '#c9922a', W: '#fff6cd' } : null, f.dir > 0);
          ctx.restore();
          ctx.globalAlpha = 1 - doux;
          ctx.fillStyle = 'rgba(255,255,255,.85)';       // gouttelettes d'envol
          ctx.fillRect(Math.round(gx - 3 - doux * 4), Math.round(gy - 3 - doux * 5), 2, 2);
          ctx.fillRect(Math.round(gx + 5 + doux * 3), Math.round(gy - 1 - doux * 7), 1, 1);
          if (f.pts) {
            ctx.font = '8px monospace'; ctx.textAlign = 'center';
            ctx.fillStyle = f.kind === 'gold' ? '#ffd94a' : '#eaf7d8';
            ctx.fillText('+' + f.pts, Math.round(gx + 5), Math.round(gy - 7 - doux * 14));
            ctx.textAlign = 'left';
          }
          ctx.globalAlpha = 1;
          continue;
        }
        if (f.kind === 'gold') {
          ctx.fillStyle = 'rgba(255,226,120,.30)'; ctx.fillRect(fx2 - 4, fy2 - 4, 18, 14);
          drawSprite(SPRITES.fish, fx2, fy2, 1, { B: '#ffd94a', D: '#c9922a', W: '#fff6cd' }, f.dir > 0);
        } else {
          drawSprite(SPRITES.fish, fx2, fy2, 1, null, f.dir > 0);
        }
      }

      // flashs : doré pris, ou poisson manqué
      if (mg.goldAt && now - mg.goldAt < 300) {
        ctx.fillStyle = 'rgba(255,214,90,.20)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }
      if (mg.missAt && now - mg.missAt < 240) {
        ctx.fillStyle = 'rgba(120,150,190,.16)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // bandeau : temps, points, série en cours
      const left = Math.max(0, (mg.endsAt - now) / SEC);
      ctx.fillStyle = 'rgba(15,18,26,.8)'; ctx.fillRect(0, 0, CANVAS_W, 13);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText(left.toFixed(0) + 's', 6, 10);
      ctx.fillText('score ' + mg.score, 34, 10);
      if (mg.combo >= 2) {
        ctx.fillStyle = mg.combo >= FISH_COMBO_STEP ? '#ffd94a' : '#cfe8ff';
        ctx.fillText('x' + mg.combo, CANVAS_W - 28, 10);
      }
      ctx.fillStyle = 'rgba(255,233,168,.75)';
      ctx.fillRect(0, 13, Math.round(CANVAS_W * (1 - fishProgress(mg, now))), 2);
    }

    // jeton de nourriture (poisson) : posé sur la berge quand elle a faim, ou suivant
    // le doigt quand on le glisse vers elle (interaction directe)
    if (!mg && s.stage !== 'egg') {
      const drag = fx.dragFood;
      if (drag || s.hunger < 92) {
        const tx = drag ? Math.round(drag.x) - 10 : FOOD_POS.x;
        const wiggle = drag ? 0 : Math.round(Math.sin(frame / 18));
        const ty = (drag ? Math.round(drag.y) - 5 : FOOD_POS.y) + wiggle;
        ctx.fillStyle = 'rgba(16,26,16,.22)';
        ctx.fillRect(tx + 3, (drag ? Math.round(drag.y) + 7 : FOOD_POS.y + 12), 14, 2);
        drawSprite(SPRITES.fish, tx, ty, 2);
        if (!drag && (frame >> 4) % 3 === 0) { // petite étincelle « prends-moi »
          ctx.fillStyle = '#fff6cd'; ctx.fillRect(tx + 20, FOOD_POS.y - 2, 1, 1);
        }
      }
    }

    // balle de jeu : socle sur la berge / en vol / dans la gueule (ball-fetch)
    if (!mg && s.stage !== 'egg' && !s.away) {
      if (ball.state === 'carried') { ball.x = ox + 16; ball.y = oy + 18; } // portée à la gueule
      drawBall(ball);
    }

    // astuce d'onboarding (flèche vers le geste à découvrir)
    if (!mg && fx.hint) drawHint(fx.hint, frame);

    // roseaux de premier plan : silhouettes qui encadrent la scène (parallaxe/profondeur)
    // -> au bord de l'eau, décalés comme la berge (sinon ils flottent dans le ciel)
    if (!mg) {
      ctx.save(); ctx.translate(0, BERGE_SHIFT);
      const reed = (bx, baseY, h, phase, lean) => {
        const sway = reduced ? 0 : Math.sin(frame / 38 + phase);
        ctx.fillStyle = '#152a17';
        for (let i = 0; i < h; i++) {
          const t = i / h, xx = bx + Math.round((lean + sway * 2) * t * t);
          ctx.fillRect(xx, baseY - i, 2, 1);
        }
        const tx = bx + Math.round(lean + sway * 2); // massette (épi) au sommet
        ctx.fillStyle = '#3f2a17'; ctx.fillRect(tx - 1, baseY - h - 5, 4, 6);
        ctx.fillStyle = '#5a3a22'; ctx.fillRect(tx - 1, baseY - h - 5, 2, 6);
      };
      reed(6, 118, 20, 0, 1); reed(12, 120, 26, 1.4, -1); reed(2, 116, 15, 2.1, 2);
      reed(150, 120, 24, 0.7, -1); reed(156, 117, 18, 2.6, 1);
      ctx.restore();
    }

    drawParticles();
    paintVignette();
  }

  // Vignettage doux : la scène paraît « éclairée » (bords légèrement assombris). Créé une fois.
  function paintVignette() {
    if (vignette === null) {
      try {
        vignette = ctx.createRadialGradient(CANVAS_W / 2, 52, 30, CANVAS_W / 2, 66, 118);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(8,10,18,.28)');
      } catch (e) { vignette = false; } // canvas sans dégradé (tests) : on s'en passe
    }
    if (vignette) { ctx.fillStyle = vignette; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
  }

  // Toboggan de rivière : rapides défilants, 3 couloirs, obstacles, la loutre glisse.
  function drawSlide(mg, frame, s, fur) {
    const now = Date.now();
    const speedP = slideProgress(mg, now);          // 0 -> 1 : la descente s'emballe
    // Le torrent, en tuiles : rives boisées de part et d'autre, eau au milieu.
    if (tilesReady) {
      for (let y = -16; y < CANVAS_H; y += 16) {
        for (let x = 0; x < CANVAS_W; x += 16) {
          const edge = (x < 16 || x >= CANVAS_W - 16);
          blit(edge ? T.grass : T.water, x, y);
        }
      }
      for (let y = -16; y < CANVAS_H; y += 16) {     // la rive s'ourle sur l'eau
        blit(T.bankW, 16, y); blit(T.bankE, CANVAS_W - 32, y);
      }
      for (let y = ((frame * 2) % 48) - 48; y < CANVAS_H; y += 48) {
        blit(T.tree, 0, y); blit(T.tree, CANVAS_W - 16, y);   // arbres qui défilent
      }
    } else {
      ctx.fillStyle = '#2f6db0'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // courant : traits qui filent, d'autant plus vite qu'on accélère
    ctx.fillStyle = 'rgba(255,255,255,.30)';
    const step = 26, off = (frame * (3 + speedP * 5)) % step;
    for (let y = -step + off; y < CANVAS_H; y += step) {
      for (const lx of LANE_X) ctx.fillRect(lx - 1, y, 2, 10 + speedP * 10);
    }

    // Position de la loutre, calculée AVANT les items : les poissons gobés sont
    // aspirés vers elle, il leur faut sa position de CETTE image.
    const cible = LANE_X[mg.lane];
    // nouvelle descente : on repart du couloir de départ, sans saut fantôme
    if (slideMg !== mg) { slideMg = mg; slideLane = mg.lane; slideX = cible; slideHopAt = -999; }
    if (slideLane !== mg.lane) { slideLane = mg.lane; slideHopAt = frame; }
    slideX += (cible - slideX) * 0.28;                 // glisse vers son couloir

    // obstacles et poissons
    for (const it of mg.items) {
      const ix = LANE_X[it.lane];
      // GOBÉ : happé vers la gueule de la loutre, il rétrécit et s'efface, et
      // ses points s'envolent. Auparavant il poursuivait sa descente à
      // l'identique — rien ne disait qu'il avait été pris.
      if (it.got) {
        const k = Math.min(1, (now - it.gotAt) / GOBE_MS);
        const doux = k * k * (3 - 2 * k);              // départ et arrivée adoucis
        const gx = ix + (slideX - ix) * doux;
        const gy = it.y + (SLIDE_OTTER_Y - it.y) * doux;
        const taille = 1 - doux;
        ctx.save();
        ctx.globalAlpha = 1 - doux * 0.85;
        ctx.translate(gx, gy);
        ctx.scale(Math.max(0.05, taille), Math.max(0.05, taille));
        const pal = it.kind === 'gold' ? { B: '#ffd94a', D: '#c9922a', W: '#fff6cd' } : null;
        drawSprite(SPRITES.fish, -5, -2, 1, pal);
        ctx.restore();
        // petites bulles de gorgée
        ctx.globalAlpha = 1 - doux;
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fillRect(Math.round(gx - 4 - doux * 3), Math.round(gy - 4 - doux * 6), 2, 2);
        ctx.fillRect(Math.round(gx + 3 + doux * 3), Math.round(gy - 2 - doux * 8), 1, 1);
        ctx.globalAlpha = 1;
        // les points gagnés, qui montent
        if (it.pts) {
          ctx.font = '8px monospace'; ctx.textAlign = 'center';
          ctx.globalAlpha = 1 - doux;
          ctx.fillStyle = it.kind === 'gold' ? '#ffd94a' : '#eaf7d8';
          ctx.fillText('+' + it.pts, Math.round(gx), Math.round(gy - 8 - doux * 12));
          ctx.globalAlpha = 1; ctx.textAlign = 'left';
        }
        continue;
      }
      if (it.kind === 'rock') {
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(ix - 7, it.y + 5, 14, 3);
        ctx.fillStyle = '#6b6f78'; ctx.fillRect(ix - 6, it.y - 4, 12, 9);
        ctx.fillStyle = '#8a909b'; ctx.fillRect(ix - 4, it.y - 4, 6, 3);
        ctx.fillStyle = '#4c5058'; ctx.fillRect(ix - 6, it.y + 3, 12, 2);
        ctx.fillStyle = 'rgba(255,255,255,.45)';     // gerbe autour du rocher
        ctx.fillRect(ix - 9, it.y + 2, 3, 2); ctx.fillRect(ix + 6, it.y, 3, 2);
      } else if (it.kind === 'gold') {
        const tw = (frame >> 2) % 2 ? 1 : 0;
        ctx.fillStyle = 'rgba(255,226,120,.35)'; ctx.fillRect(ix - 8, it.y - 5, 16, 12);
        drawSprite(SPRITES.fish, ix - 5, it.y - 2, 1, { B: '#ffd94a', D: '#c9922a', W: '#fff6cd' });
        if (tw) { ctx.fillStyle = '#fff6cd'; ctx.fillRect(ix + 5, it.y - 4, 2, 2); }
      } else {
        drawSprite(SPRITES.fish, ix - 5, it.y - 2, 1);
      }
    }

    const saut = frame - slideHopAt;
    const enSaut = saut < HOP_FRAMES;
    const ox = Math.round(slideX) - 16;
    const oy = SLIDE_OTTER_Y - 22 + ((frame >> 2) % 2);
    ctx.fillStyle = 'rgba(255,255,255,.55)';           // gerbe d'eau autour d'elle
    ctx.fillRect(ox + 4, oy + 26, 5, 3); ctx.fillRect(ox + 21, oy + 25, 5, 3);
    ctx.fillRect(ox - 2, oy + 20, 3, 2); ctx.fillRect(ox + 31, oy + 18, 3, 2);
    if (usesArt(s)) {
      const cy = SLIDE_OTTER_Y + 4 + ((frame >> 2) % 2);
      if (enSaut) {
        // l'arc du kit joué une fois, penchée du côté où elle saute
        const i = Math.min(ANIMS.jump.frames - 1, Math.floor(saut / (HOP_FRAMES / ANIMS.jump.frames)));
        drawAnim(ctx, ART, 'jump', i, Math.round(slideX), cy, s.fur, cible < slideX, s.stage);
      } else {
        drawAnim(ctx, ART, 'swim', frameAt('swim', Date.now()), Math.round(slideX), cy, s.fur, false, s.stage);
      }
    } else {
      drawSprite(SPRITES[s.stage] || SPRITES.child, ox, oy, 2, fur);
    }

    // flashs : rouge au choc, doré sur un poisson d'or
    if (mg.bumpAt && now - mg.bumpAt < 260) {
      ctx.fillStyle = 'rgba(229,72,77,.28)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (mg.goldAt && now - mg.goldAt < 320) {
      ctx.fillStyle = 'rgba(255,214,90,.22)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // bandeau : temps restant, score, et l'élan en cours
    const left = Math.max(0, (mg.endsAt - now) / SEC);
    ctx.fillStyle = 'rgba(15,18,26,.8)'; ctx.fillRect(0, 0, CANVAS_W, 13);
    ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
    ctx.fillText(left.toFixed(0) + 's', 6, 10);
    ctx.fillText('score ' + mg.score, 30, 10);
    // Les VIES restantes : sans elles à l'écran, l'éjection tomberait comme un
    // couperet sans prévenir. Elles clignotent quand il n'en reste qu'une.
    const vies = mg.vies != null ? mg.vies : VIES_MAX;
    const criAlerte = vies === 1 && (frame >> 3) % 2 === 0;
    for (let i = 0; i < VIES_MAX; i++) {
      const hx = CANVAS_W - 46 + i * 10;
      if (i < vies) {
        ctx.fillStyle = criAlerte ? '#ff9a8f' : '#e5484d';
        ctx.fillRect(hx + 1, 4, 2, 1); ctx.fillRect(hx + 5, 4, 2, 1);
        ctx.fillRect(hx, 5, 8, 2);
        ctx.fillRect(hx + 1, 7, 6, 1);
        ctx.fillRect(hx + 2, 8, 4, 1);
        ctx.fillRect(hx + 3, 9, 2, 1);
      } else {
        ctx.fillStyle = 'rgba(255,233,168,.28)';       // cœur perdu, en creux
        ctx.fillRect(hx, 5, 8, 1); ctx.fillRect(hx + 3, 9, 2, 1);
        ctx.fillRect(hx, 5, 1, 3); ctx.fillRect(hx + 7, 5, 1, 3);
      }
    }
    if (mg.combo >= 2) {
      ctx.fillStyle = mg.combo >= COMBO_STEP ? '#ffd94a' : '#cfe8ff';
      ctx.fillText('x' + mg.combo, CANVAS_W - 78, 10);
    }
    // jauge de temps : elle se vide, on sent l'arrivée
    ctx.fillStyle = 'rgba(255,233,168,.75)';
    ctx.fillRect(0, 13, Math.round(CANVAS_W * (1 - speedP)), 2);
  }

  function drawParticles() {
    particles = particles.filter(p => p.life-- > 0);
    particles.forEach(p => {
      if (p.g) p.vy += p.g; // gravité (confettis)
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'heart') drawSprite(SPRITES.heart, p.x, p.y, 1);
      else if (p.kind === 'fish') drawSprite(SPRITES.fish, p.x, p.y, 1);
      else if (p.kind === 'bubble') {
        ctx.fillStyle = 'rgba(210,240,255,.85)';
        ctx.fillRect(p.x, p.y, 3, 3); ctx.fillRect(p.x + 1, p.y - 1, 1, 1);
      } else if (p.kind === 'splash') {
        ctx.fillStyle = '#cfe9ff';
        ctx.fillRect(p.x - 2, p.y, 2, 2); ctx.fillRect(p.x + 2, p.y - 2, 2, 2); ctx.fillRect(p.x, p.y - 4, 2, 2);
      } else if (p.kind === 'confetti') {
        ctx.fillStyle = p.col;
        if ((p.life >> 2) % 2) ctx.fillRect(p.x, p.y, 2, 3); // virevolte
        else ctx.fillRect(p.x - 1, p.y + 1, 3, 2);
      } else if (p.kind === 'sparkle') {
        ctx.fillStyle = (p.life >> 2) % 2 ? '#ffe9a8' : '#ffffff';
        ctx.fillRect(p.x, p.y - 1, 1, 3); ctx.fillRect(p.x - 1, p.y, 3, 1);
      } else if (p.kind === 'pop') {
        const age = (p.max || 46) - p.life;
        const sc = age < 6 ? 0.5 + age * 0.11 : (p.life < 8 ? 1 + (8 - p.life) * 0.03 : 1); // pop-in
        ctx.save();
        ctx.globalAlpha = p.life < 12 ? p.life / 12 : 1;
        ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(sc, sc);
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(18,14,8,.75)'; ctx.fillText(p.txt, 0, 1); // liseré lisible
        ctx.fillStyle = p.col; ctx.fillText(p.txt, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      } else if (p.kind === 'ring') {
        const age = (p.max || 15) - p.life, rad = Math.round(3 + age * 1.5);
        ctx.fillStyle = 'rgba(255,255,255,' + (p.life / (p.max || 15) * 0.55).toFixed(2) + ')';
        ctx.fillRect(p.x - rad, p.y, 2, 1); ctx.fillRect(p.x + rad - 1, p.y, 2, 1);
        ctx.fillRect(p.x, p.y - rad, 1, 2); ctx.fillRect(p.x, p.y + rad - 1, 1, 2);
        const d = Math.round(rad * 0.7);
        ctx.fillRect(p.x - d, p.y - d, 1, 1); ctx.fillRect(p.x + d, p.y - d, 1, 1);
        ctx.fillRect(p.x - d, p.y + d, 1, 1); ctx.fillRect(p.x + d, p.y + d, 1, 1);
      }
    });
  }

  function setReduced(b) { reduced = !!b; }

  // Boîte de la loutre à sa position vivante (pour le tap-to-câlin, qui bouge avec elle).
  // Au kit elle est plus grande que l'ancienne grille : la zone tactile suit,
  // sinon on tape à côté de la tête.
  function otterBox(stage) {
    if (usesArt({ stage })) {
      const y = ART.stageFrames && ART.stageFrames('idle', 'roux', stage);
      const h = y ? y.frames[0].height : ANIMS.idle.h / 4;
      const w = y ? y.frames[0].width : ANIMS.idle.w / 4;
      return { x: Math.round(otterWX) + 16 - (w >> 1), y: GROUND_Y - h, w, h };
    }
    const sp = SPRITES[stage] || SPRITES.baby;
    return { x: Math.round(otterWX), y: otterY(stage), w: 32, h: sp.length * 2 };
  }

  // Appel : la loutre rejoint le point touché (on tape la berge/l'eau, elle vient),
  // puis flâne un moment sur place avant de reprendre sa balade.
  function callTo(px) {
    otterTarget = Math.max(42, Math.min(86, Math.round(px - 16)));
    otterDwell = lastFrame + 260;
  }

  /* ---------------- Balle (ball-fetch) ---------------- */
  // La balle n'est saisissable qu'au repos sur son socle (state idle).
  function ballGrabbable(px, py) {
    if (ball.state !== 'idle') return false;
    return px >= ball.x - 8 && px <= ball.x + 8 && py >= ball.y - 8 && py <= ball.y + 8;
  }
  function grabBall(px, py) {
    if (!ballGrabbable(px, py)) return false;
    ball.state = 'held'; ball.x = px; ball.y = py; return true;
  }
  function dragBall(px, py) {
    if (ball.state === 'held') { ball.x = px; ball.y = py; }
  }
  // Lâcher -> la balle décrit un arc jusqu'au point de largage (sur la berge).
  function throwBall(px, py) {
    if (ball.state !== 'held') return;
    ball.sx = ball.x; ball.sy = ball.y;              // départ de l'arc
    ball.tx = Math.max(14, Math.min(150, px));       // atterrissage clampé à la berge
    ball.ty = Math.max(GROUND_Y - 18, Math.min(GROUND_Y + 4, py)); // sur le sol (post-décalage), pas dans le ciel
    ball.t = 0; ball.state = 'flying';
  }
  /** Vrai une seule fois quand la loutre vient de rapporter la balle (récompense). */
  function consumeFetch() { if (fetchDone > 0) { fetchDone--; return true; } return false; }

  /** Annonce le passage dans un lieu : rideau, nom, puis on rend la main. */
  function flashZone(nom, emoji) {
    if (reduced) return;                 // mouvement réduit : pas de rideau
    passage = { at: Date.now(), nom: nom || '', emoji: emoji || '🗺️' };
  }

  return {
    render, spawn, splashAt, burst, squash, xpText, pop, ring, setReduced, otterBox, callTo,
    ballGrabbable, grabBall, dragBall, throwBall, consumeFetch, flashZone
  };
}
