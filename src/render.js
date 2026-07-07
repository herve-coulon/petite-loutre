// Rendu canvas 160x120 (mis à l'échelle en CSS, image-rendering: pixelated).
import { PAL, SPRITES } from './sprites.js';
import { HATCH_MS, MIN, SEC } from './constants.js';
import { hatById } from './accessories.js';
import { furById } from './skins.js';
import { moodOf, pickIdle, canIdle, IDLE_FRAMES } from './mood.js';

export const CANVAS_W = 160, CANVAS_H = 120;
export const OTTER_X = 64;
export const GROUND_Y = 96;

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

export function makeRenderer(cv) {
  const ctx = cv.getContext('2d');
  let particles = [];
  let squashUntil = 0;
  let idleAnim = null;                              // {kind, start} — petite manie en cours
  let nextIdleAt = 400 + Math.random() * 700;       // en frames
  let jumpFish = null;                              // {x, dir, start} — poisson qui saute
  let nextJumpAt = 300 + Math.random() * 500;

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

  function render(s, mg, frame, fx) {
    fx = fx || {};
    const c = skyColors(new Date().getHours());
    ctx.fillStyle = c.sky; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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
      ctx.fillStyle = '#ffd94a';
      ctx.fillRect(128, 10, 12, 12); ctx.fillRect(126, 12, 16, 8); ctx.fillRect(130, 8, 8, 16);
    }

    // collines + berge
    ctx.fillStyle = c.hill2;
    ctx.fillRect(0, 54, CANVAS_W, 50);
    for (let x = 0; x < CANVAS_W; x += 16) ctx.fillRect(x, 50 - ((x / 16) % 3) * 2, 16, 8);
    ctx.fillStyle = c.hill; ctx.fillRect(0, 62, CANVAS_W, 42);
    ctx.fillStyle = c.hill2;
    for (let x = 4; x < CANVAS_W; x += 22) ctx.fillRect(x, 66 + ((x * 7) % 18), 2, 3);

    // rivière animée
    ctx.fillStyle = c.water; ctx.fillRect(0, 104, CANVAS_W, 16);
    ctx.fillStyle = c.wave;
    const off = (frame >> 3) % 16;
    for (let x = -16; x < CANVAS_W; x += 16) {
      ctx.fillRect(x + off, 107, 8, 2);
      ctx.fillRect(x + off + 8, 113, 8, 2);
    }

    if (!s) return;

    // décor de berge choisi
    if (s.decor && s.decor !== 'aucun') drawDecor(s.decor, c, frame);

    if (s.gameOver) {
      if ((frame >> 4) % 2 === 0) drawSprite(SPRITES.heart, 74, 100, 1);
      drawParticles();
      return;
    }

    const fur = furById(s.fur).map;

    // vie du décor (libellule le jour, luciole la nuit, poissons bondissants)
    drawAmbient(mg, frame, c.night);

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
    const bounce = (s.sleeping || s.stage === 'egg' || yawning) ? 0 : ((frame >> 4) % 2 === 0 ? 0 : -2);
    let ox = OTTER_X, oy = otterY(s.stage) + bounce;
    if (s.stage === 'egg' && fx.wobble) ox += ((frame >> 1) % 2 === 0 ? -2 : 2);
    if (s.sick && (frame >> 2) % 6 === 0) ox += 1;
    if (idleAnim && idleAnim.kind === 'gratte') ox += (frame >> 2) % 2; // frisson de grattage

    // squash & stretch (ancré aux pieds, tout le corps + chapeau suivent)
    const sqT = 1 - Math.max(0, squashUntil - Date.now()) / SQUASH_MS;
    const squashing = sqT < 1 && s.stage !== 'egg';
    if (squashing) {
      const { sx, sy } = squashScale(sqT);
      const cx = ox + 16, cyf = otterY(s.stage) + spr.length * 2;
      ctx.save();
      ctx.translate(cx, cyf);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -cyf);
    }

    drawSprite(spr, ox, oy, 2, s.stage === 'egg' ? null : fur);

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
      const blink = !s.sleeping && (frame % 90) < 6;
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

    if (squashing) ctx.restore();

    // décompte éclosion
    if (s.stage === 'egg') {
      const left = Math.max(0, HATCH_MS - (Date.now() - s.born));
      const mm = Math.floor(left / MIN), ss = Math.floor((left % MIN) / SEC);
      ctx.fillStyle = 'rgba(15,18,26,.65)'; ctx.fillRect(52, 18, 56, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.font = '8px monospace';
      ctx.fillText('éclosion ' + mm + ':' + String(ss).padStart(2, '0'), 55, 27);
    }

    // mini-jeu pêche
    if (mg) {
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

    drawParticles();
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

  return { render, spawn, splashAt, burst, squash, xpText };
}
