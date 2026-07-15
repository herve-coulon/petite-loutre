// Rendu canvas 160x120 (mis à l'échelle en CSS, image-rendering: pixelated).
import { PAL, SPRITES } from './sprites.js';
import { HATCH_MS, MIN, SEC, SEASON_FX } from './constants.js';
import { hatById } from './accessories.js';
import { furById } from './skins.js';
import { moodOf, pickIdle, canIdle, IDLE_FRAMES } from './mood.js';
import { dailyEvent, butterflyPos } from './events.js';
import { dayKey } from './quests.js';
import { seasonInfo, treatAvailable, TREAT_POS } from './seasons.js';
import { itemById, RARITIES, ITEMS } from './items.js';
import { LANE_X, SLIDE_OTTER_Y } from './toboggan.js';

export const CANVAS_W = 160, CANVAS_H = 120;
export const OTTER_X = 64;
export const GROUND_Y = 96;
// jeton de nourriture posé sur la berge : on l'attrape et on le glisse jusqu'à la loutre
export const FOOD_POS = { x: 16, y: 86, w: 20, h: 10 };

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
    if (px >= p.x - 2 && px <= p.x + 10 && py >= p.y - 2 && py <= p.y + 10) return i;
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
  let wanderSeed = 1;         // avance à chaque nouvelle cible (choix pseudo-aléatoire stable)
  let lastFrame = 0;          // dernier numéro de frame vu (pour les appels externes)

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

  /** Petit « +5 » doré qui s'envole (gain d'XP). */
  function xpText(txt, stage) {
    particles.push({
      x: OTTER_X + 34, y: otterY(stage) + 4,
      vx: 0.12, vy: -0.45, life: 48, kind: 'xp', txt
    });
  }

  /* ---------------- Vie du décor : libellule, luciole, poissons sauteurs ---------------- */
  function drawAmbient(mg, frame, night) {
    if (!night) {
      // libellule qui zigzague au-dessus de la berge
      const ax = 80 + Math.sin(frame / 37) * 55 + Math.sin(frame / 13) * 8;
      const ay = 68 + Math.sin(frame / 23) * 7;
      ctx.fillStyle = '#3f9fb8';
      ctx.fillRect(ax, ay, 4, 1);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      const w = (frame >> 1) % 2; // battement d'ailes
      ctx.fillRect(ax + 1, ay - 1 - w, 2, 1);
      ctx.fillRect(ax + 1, ay + 1 + w, 2, 1);
    } else {
      // luciole qui pulse doucement
      const ax = 46 + Math.sin(frame / 41) * 34;
      const ay = 72 + Math.sin(frame / 17) * 6;
      ctx.fillStyle = (frame >> 3) % 2 ? '#ffd94a' : '#f2913d';
      ctx.fillRect(ax, ay, 2, 2);
    }

    // poisson qui bondit hors de la rivière (jamais pendant la pêche : ce serait un leurre)
    if (mg) { jumpFish = null; return; }
    if (!jumpFish && frame >= nextJumpAt) {
      jumpFish = { x: 16 + Math.random() * 118, dir: Math.random() < 0.5 ? -1 : 1, start: frame };
      splashAt(jumpFish.x, 108);
    }
    if (jumpFish) {
      const p = (frame - jumpFish.start) / 46;
      if (p >= 1) {
        splashAt(jumpFish.x + jumpFish.dir * 14, 108);
        jumpFish = null;
        nextJumpAt = frame + 420 + Math.random() * 600;
      } else {
        const fx2 = jumpFish.x + jumpFish.dir * p * 14;
        const fy2 = 108 - Math.sin(p * Math.PI) * 15;
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
      const y = ((frame * speed + i * 37) % 116);
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

  // La loutre au repos dans sa tanière (calme : respiration, clignement, visage paisible).
  function drawDenOtter(s, frame) {
    const spr = SPRITES[s.stage] || SPRITES.adult;
    const fur = furById(s.fur).map;
    const ox = 64, oy = 62;
    const breathing = !reduced && !s.gameOver;
    if (breathing) {
      const b = Math.sin(frame / 32), sy = 1 + b * 0.02, sx = 1 - b * 0.012;
      const cx = ox + 16, cyf = oy + spr.length * 2;
      ctx.save(); ctx.translate(cx, cyf); ctx.scale(sx, sy); ctx.translate(-cx, -cyf);
    }
    drawSprite(spr, ox, oy, 2, fur);
    drawRim(spr, ox, oy, 2, 'rgba(255,224,150,.42)', 'rgba(0,0,0,.24)'); // baignée dans la lueur chaude
    if (breathing) ctx.restore();
    if (s.hat) { const hat = hatById(s.hat); if (hat) drawSprite(hat.rows, ox, oy - hat.rows.length * 2 + 4, 2); }
    drawFace(s, s.sleeping ? 'dodo' : 'contente', ox, oy, frame, fur, false);
    const ey = oy + (s.stage === 'baby' ? 10 : 8);
    const bp = frame % 220, dbl = ((frame / 220) | 0) % 3 === 0;
    const blink = !s.sleeping && (bp < 6 || (dbl && bp > 11 && bp < 17));
    if (s.sleeping || blink) {
      ctx.fillStyle = (fur && fur.B) || PAL.B; ctx.fillRect(ox + 4, ey, 6, 2); ctx.fillRect(ox + 22, ey, 6, 2);
      ctx.fillStyle = (fur && fur.D) || PAL.D; ctx.fillRect(ox + 4, ey + 1, 6, 1); ctx.fillRect(ox + 22, ey + 1, 6, 1);
    }
    if (s.sleeping) {
      ctx.fillStyle = '#ffffff'; ctx.font = '9px monospace';
      const ph = (frame >> 4) % 3;
      ctx.fillText('z', ox + 34, oy - 2 + ph); ctx.fillText('Z', ox + 40, oy - 8 + ph);
    }
  }

  // La tanière : mur de terre, plancher, tapis, lanterne, étagères de trésors, nid.
  function drawDen(s, frame, fx, c) {
    const owned = fx.owned || [];
    ctx.fillStyle = '#33231a'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (let y = 4; y < 88; y += 6) for (let x = 6; x < CANVAS_W; x += 11) { // texture de terre
      ctx.fillStyle = ((x + y) % 2) ? 'rgba(255,220,170,.045)' : 'rgba(0,0,0,.06)';
      ctx.fillRect(x + ((y >> 1) % 3), y, 2, 2);
    }
    // plancher + lattes
    ctx.fillStyle = '#4a3221'; ctx.fillRect(0, 90, CANVAS_W, 30);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(0, 90, CANVAS_W, 2);
    ctx.fillStyle = '#5a3f2a';
    for (let x = 8; x < CANVAS_W; x += 22) ctx.fillRect(x, 92, 1, 28);
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
  }

  function render(s, mg, frame, fx) {
    fx = fx || {};
    lastFrame = frame;
    const now = new Date();
    const season = seasonInfo(now);
    const c = applySeason(skyColors(now.getHours()), season);

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
      const g = ctx.createLinearGradient(0, 0, 0, 60);
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

    // rivière animée
    ctx.fillStyle = c.water; ctx.fillRect(0, 104, CANVAS_W, 16);
    // écume de rive (liseré clair) + fond légèrement dégradé
    ctx.fillStyle = mix(c.water, '#0a1830', 0.35); ctx.fillRect(0, 116, CANVAS_W, 4);
    ctx.fillStyle = mix(c.water, '#ffffff', 0.4); ctx.fillRect(0, 104, CANVAS_W, 1);
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

    if (!s) return;

    // décor de berge choisi
    if (s.decor && s.decor !== 'aucun') drawDecor(s.decor, c, frame);

    if (s.gameOver) {
      if ((frame >> 4) % 2 === 0) drawSprite(SPRITES.heart, 74, 100, 1);
      drawParticles();
      return;
    }

    // partie bouder chez le héron : la berge est calme, le grand oiseau veille
    if (s.away) {
      drawSprite(SPRITES.heron, 66, 68, 2);
      if ((frame >> 4) % 2 === 0) { // il pense à elle…
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(94, 62, 2, 2); ctx.fillRect(98, 59, 2, 2); ctx.fillRect(102, 56, 2, 2);
      }
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(26, 16, 108, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('chez le héron… soins ' + (s.awayCare || 0) + '/3', 32, 25);
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
    if (!mg && s.stage !== 'egg') drawDailyEvent(s, frame, c.night);

    // adversaire de combat (dessiné à droite, en miroir)
    if (fx.foe) {
      const fspr = SPRITES[fx.foe.stage] || SPRITES.baby;
      const fy = GROUND_Y - fspr.length * 2 + ((frame >> 4) % 2 ? -2 : 0);
      drawSprite(fspr, 112, fy, 2, furById(fx.foe.fur).map, true);
      const fhat = fx.foe.hat && hatById(fx.foe.hat);
      if (fhat) drawSprite(fhat.rows, 112, fy - fhat.rows.length * 2 + 4, 2, null, true);
    }

    // plongée : la loutre est sous l'eau, on ne voit que des bulles
    if (fx.diving) {
      ctx.fillStyle = 'rgba(210,240,255,.9)';
      const ph = (frame >> 3) % 8;
      ctx.fillRect(70, 112 - ph, 3, 3);
      ctx.fillRect(78, 116 - ((frame >> 2) % 6), 2, 2);
      ctx.fillRect(64, 114 - ((frame >> 4) % 4), 2, 2);
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(40, 18, 80, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('🤿 plongée en cours…', 44, 27);
      drawParticles();
      return;
    }

    // cacas
    const slots = [[28, 90], [118, 92], [44, 98]];
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
    if (!idleAnim && calm && frame >= nextIdleAt) idleAnim = { kind: pickIdle(), start: frame };
    const yawning = !!idleAnim && idleAnim.kind === 'baille';

    // loutre / œuf
    const spr = SPRITES[s.stage];
    // éclosion : plus l'œuf approche, plus il se fissure et tremble tout seul
    const eggProg = s.stage === 'egg' ? Math.max(0, Math.min(1, (Date.now() - s.born) / HATCH_MS)) : 0;
    const crack = s.stage === 'egg' ? eggCrackLevel(eggProg) : 0;
    // balade tranquille sur la berge (coupée : sommeil/œuf/absente/mini-jeu/combat/plongée/mvt réduit)
    const canRoam = s.stage !== 'egg' && !s.sleeping && !s.away && !s.gameOver && !mg && !fx.foe && !fx.diving && !reduced && !idleAnim;
    let walking = false;
    if (canRoam) {
      if (frame >= otterDwell && Math.abs(otterWX - otterTarget) < 0.5) {
        wanderSeed = (wanderSeed * 1103515245 + 12345) & 0x7fffffff; // LCG : cible stable, pas de Math.random
        otterTarget = 42 + (wanderSeed % 45);       // 42..86 : reste sur la berge, plein cadre
        otterDwell = frame + 150 + (wanderSeed % 260);
      }
      const d = otterTarget - otterWX;
      if (Math.abs(d) > 0.5) { otterWX += Math.sign(d) * Math.min(0.4, Math.abs(d)); walking = true; }
    } else if (mg || fx.foe) {
      // combat / mini-jeu : la loutre revient au centre (position attendue par la scène)
      otterWX += (OTTER_X - otterWX) * 0.2;
    }
    // sinon (manie, sommeil, mvt réduit) : elle reste où elle est — pas de recentrage forcé
    // rebond : petit pas de dandinement en marchant, sinon léger sautillement
    const bounce = (s.sleeping || s.stage === 'egg' || yawning) ? 0
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

    // ombre de contact au sol : ancre la loutre (rétrécit et s'éclaircit quand elle saute)
    if (s.stage !== 'egg' && !s.away) {
      const lift = Math.max(0, GROUND_Y - (oy + spr.length * 2));
      const w = 24 - lift * 2, sx0 = ox + 16 - (w >> 1);
      ctx.fillStyle = 'rgba(16,26,16,' + (0.26 - lift * 0.03).toFixed(2) + ')';
      ctx.fillRect(sx0 + 2, GROUND_Y - 1, w - 4, 2);
      ctx.fillRect(sx0, GROUND_Y, w, 1);
    }

    // squash & stretch (ancré aux pieds, tout le corps + chapeau suivent)
    const sqT = 1 - Math.max(0, squashUntil - Date.now()) / SQUASH_MS;
    const squashing = sqT < 1 && s.stage !== 'egg';
    // respiration douce quand elle est tranquille (la poitrine se soulève)
    const breathing = !squashing && !reduced && s.stage !== 'egg' && !s.gameOver;
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

    drawSprite(spr, ox, oy, 2, s.stage === 'egg' ? null : fur);
    // relief lumineux (jour : soleil chaud ; nuit : lune froide et discrète)
    drawRim(spr, ox, oy, 2,
      c.night ? 'rgba(200,214,255,.28)' : 'rgba(255,246,205,.5)',
      'rgba(0,0,0,.22)');
    if (crack > 0) drawEggCracks(ox, oy, crack, frame);

    // chapeau équipé (posé sur la tête, suit le rebond)
    if (s.stage !== 'egg' && s.hat) {
      const hat = hatById(s.hat);
      if (hat) drawSprite(hat.rows, ox, oy - hat.rows.length * 2 + 4, 2);
    }

    // manie en cours (grattage, caillou…) puis visage de l'humeur
    if (idleAnim) drawIdle(idleAnim.kind, frame - idleAnim.start, ox, oy, fur);
    if (s.stage !== 'egg') drawFace(s, mood, ox, oy, frame, fur, yawning);

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
      ctx.fillStyle = 'rgba(20,30,60,.35)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (mg.fish) {
        const fy = mg.fish.y + ((frame >> 2) % 2);
        drawSprite(SPRITES.fish, mg.fish.x, fy, 1);
      }
      const left = Math.max(0, (mg.endsAt - Date.now()) / SEC);
      ctx.fillStyle = 'rgba(15,18,26,.8)'; ctx.fillRect(0, 0, CANVAS_W, 11);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('PÊCHE  ' + left.toFixed(0) + 's   score:' + mg.score, 6, 9);
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

    // roseaux de premier plan : silhouettes qui encadrent la scène (parallaxe/profondeur)
    if (!mg) {
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
    ctx.fillStyle = '#2f6db0'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // courant qui file vers le bas (sensation de vitesse)
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    const off = (frame * 4) % 24;
    for (let y = -24 + off; y < CANVAS_H; y += 24) {
      for (const lx of LANE_X) ctx.fillRect(lx - 1, y, 2, 12);
    }
    // écume qui sépare les couloirs
    ctx.fillStyle = 'rgba(200,230,255,.22)';
    for (const bx of [60, 100]) ctx.fillRect(bx, 0, 1, CANVAS_H);
    // obstacles et poissons
    for (const it of mg.items) {
      const ix = LANE_X[it.lane];
      if (it.kind === 'fish') {
        drawSprite(SPRITES.fish, ix - 5, it.y - 2, 1);
      } else {
        ctx.fillStyle = '#6b6f78'; ctx.fillRect(ix - 6, it.y - 4, 12, 9);
        ctx.fillStyle = '#8a909b'; ctx.fillRect(ix - 4, it.y - 4, 6, 3);
        ctx.fillStyle = '#4c5058'; ctx.fillRect(ix - 6, it.y + 3, 12, 2);
      }
    }
    // la loutre dans son couloir, avec un peu de ballotement + gerbe d'eau
    const ox = LANE_X[mg.lane] - 16;
    const oy = SLIDE_OTTER_Y - 22 + ((frame >> 2) % 2);
    const spr = SPRITES[s.stage] || SPRITES.child;
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(ox + 6, oy + 26, 4, 3); ctx.fillRect(ox + 20, oy + 25, 4, 3);
    drawSprite(spr, ox, oy, 2, fur);
    // flash rouge bref sur un choc
    if (mg.bumpAt && Date.now() - mg.bumpAt < 260) {
      ctx.fillStyle = 'rgba(229,72,77,.28)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // bandeau : temps + score
    const left = Math.max(0, (mg.endsAt - Date.now()) / SEC);
    ctx.fillStyle = 'rgba(15,18,26,.8)'; ctx.fillRect(0, 0, CANVAS_W, 11);
    ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
    ctx.fillText('TOBOGGAN  ' + left.toFixed(0) + 's   score:' + mg.score, 6, 9);
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
      } else if (p.kind === 'xp') {
        ctx.fillStyle = p.life > 12 ? '#ffd94a' : '#c9a94a'; // s'estompe en fin de vie
        ctx.font = 'bold 7px monospace';
        ctx.fillText(p.txt, p.x, p.y);
      }
    });
  }

  function setReduced(b) { reduced = !!b; }

  // Boîte de la loutre à sa position vivante (pour le tap-to-câlin, qui bouge avec elle).
  function otterBox(stage) {
    const sp = SPRITES[stage] || SPRITES.baby;
    return { x: Math.round(otterWX), y: otterY(stage), w: 32, h: sp.length * 2 };
  }

  // Appel : la loutre rejoint le point touché (on tape la berge/l'eau, elle vient),
  // puis flâne un moment sur place avant de reprendre sa balade.
  function callTo(px) {
    otterTarget = Math.max(42, Math.min(86, Math.round(px - 16)));
    otterDwell = lastFrame + 260;
  }

  return { render, spawn, splashAt, burst, squash, xpText, setReduced, otterBox, callTo };
}
