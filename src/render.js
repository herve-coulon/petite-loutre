// Rendu canvas 160x120 (mis à l'échelle en CSS, image-rendering: pixelated).
import { PAL, SPRITES } from './sprites.js';
import { HATCH_MS, MIN, SEC } from './constants.js';
import { hatById } from './accessories.js';

export const CANVAS_W = 160, CANVAS_H = 120;
export const OTTER_X = 64;
export const GROUND_Y = 96;

export function otterY(stage) {
  const spr = SPRITES[stage] || SPRITES.baby;
  return GROUND_Y - spr.length * 2 + (stage === 'egg' ? 4 : 0);
}

export function makeRenderer(cv) {
  const ctx = cv.getContext('2d');
  let particles = [];

  function drawSprite(rows, x, y, sc = 2) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = PAL[row[i]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + i * sc, y + j * sc, sc, sc);
      }
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

    if (s.gameOver) {
      if ((frame >> 4) % 2 === 0) drawSprite(SPRITES.heart, 74, 100, 1);
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

    // loutre / œuf
    const spr = SPRITES[s.stage];
    const bounce = (s.sleeping || s.stage === 'egg') ? 0 : ((frame >> 4) % 2 === 0 ? 0 : -2);
    let ox = OTTER_X, oy = otterY(s.stage) + bounce;
    if (s.stage === 'egg' && fx.wobble) ox += ((frame >> 1) % 2 === 0 ? -2 : 2);
    if (s.sick && (frame >> 2) % 6 === 0) ox += 1;
    drawSprite(spr, ox, oy, 2);

    // chapeau équipé (posé sur la tête, suit le rebond)
    if (s.stage !== 'egg' && s.hat) {
      const hat = hatById(s.hat);
      if (hat) drawSprite(hat.rows, ox, oy - hat.rows.length * 2 + 4, 2);
    }

    // paupières (sommeil / clignement)
    if (s.stage !== 'egg') {
      const blink = !s.sleeping && (frame % 90) < 6;
      if (s.sleeping || blink) {
        const ey = oy + (s.stage === 'baby' ? 10 : 8);
        ctx.fillStyle = PAL.B;
        ctx.fillRect(ox + 4, ey, 6, 2); ctx.fillRect(ox + 22, ey, 6, 2);
        ctx.fillStyle = PAL.D;
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
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'heart') drawSprite(SPRITES.heart, p.x, p.y, 1);
      else if (p.kind === 'fish') drawSprite(SPRITES.fish, p.x, p.y, 1);
      else if (p.kind === 'bubble') {
        ctx.fillStyle = 'rgba(210,240,255,.85)';
        ctx.fillRect(p.x, p.y, 3, 3); ctx.fillRect(p.x + 1, p.y - 1, 1, 1);
      } else if (p.kind === 'splash') {
        ctx.fillStyle = '#cfe9ff';
        ctx.fillRect(p.x - 2, p.y, 2, 2); ctx.fillRect(p.x + 2, p.y - 2, 2, 2); ctx.fillRect(p.x, p.y - 4, 2, 2);
      }
    });
  }

  return { render, spawn, splashAt };
}
