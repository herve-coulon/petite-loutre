// Carte photo partageable : une belle image de la loutre (nom, stade, chapeau,
// exploits du jour) à envoyer sur WhatsApp/Insta. Dessin canvas autonome,
// aucune requête DOM — le document est injecté, tout le reste est pur.
import { PAL, SPRITES } from './sprites.js';
import { STAGES, H, MIN } from './constants.js';
import { hatById } from './accessories.js';
import { furById } from './skins.js';
import { ageMs } from './sim.js';

export const CARD_W = 480, CARD_H = 600; // portrait 4:5, parfait pour les stories
export const CARD_URL = 'https://herve-coulon.github.io/petite-loutre/';

function fmtShort(ms) {
  const d = Math.floor(ms / (24 * H)), h = Math.floor((ms % (24 * H)) / H), m = Math.floor((ms % H) / MIN);
  if (d > 0) return d + ' j ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  return m + ' min';
}

/** Textes de la carte — pur, testé indépendamment du dessin. */
export function cardData(s, rec, now = Date.now()) {
  const p = (s.qDaily && s.qDaily.progress) || {};
  const done = (s.qDaily && s.qDaily.done && s.qDaily.done.length) || 0;
  const fish = p.fish || 0, meals = p.meals || 0;
  return {
    title: 'MA PETITE LOUTRE',
    name: (s.name || 'Loutre mystère').toUpperCase(),
    stageLine: (STAGES[s.stage] || '') + ' · ' + fmtShort(ageMs(s, now)),
    lines: [
      '🐟 Aujourd\'hui : ' + fish + ' poisson' + (fish > 1 ? 's' : '') + ' · ' + meals + ' repas',
      '🏆 Quêtes du jour : ' + done + '/3 réussies',
      '⏳ Record de vie : ' + (rec && rec.bestAge > 0 ? fmtShort(rec.bestAge) : 'l\'aventure commence')
    ],
    url: 'herve-coulon.github.io/petite-loutre'
  };
}

/** Blit d'un sprite texte -> rectangles (même convention que le rendu du jeu). */
function blit(ctx, rows, x, y, sc, palOver) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      const c = (palOver && palOver[ch]) || PAL[ch];
      if (!c || ch === '.') continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + i * sc, y + j * sc, sc, sc);
    }
  }
}

/** Dessine la carte complète dans un contexte 2D de CARD_W x CARD_H. */
export function drawCard(ctx, s, rec, now = Date.now()) {
  const d = cardData(s, rec, now);

  // fond + cadre
  ctx.fillStyle = '#191d28'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#2e3346'; ctx.fillRect(10, 10, CARD_W - 20, CARD_H - 20);
  ctx.fillStyle = '#f4c14f';
  ctx.fillRect(18, 18, CARD_W - 36, 3); ctx.fillRect(18, CARD_H - 21, CARD_W - 36, 3);
  ctx.fillRect(18, 18, 3, CARD_H - 36); ctx.fillRect(CARD_W - 21, 18, 3, CARD_H - 36);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4c14f';
  ctx.font = 'bold 26px "Courier New", Courier, monospace';
  ctx.fillText(d.title, CARD_W / 2, 54);

  // scène : ciel, soleil, collines, rivière (toujours une belle journée sur la carte)
  const SX = 30, SY = 74, SW = 420, SH = 296;
  ctx.fillStyle = '#9fd9e8'; ctx.fillRect(SX, SY, SW, SH);
  ctx.fillStyle = '#ffd94a';
  ctx.fillRect(SX + 336, SY + 24, 36, 36); ctx.fillRect(SX + 330, SY + 30, 48, 24); ctx.fillRect(SX + 342, SY + 18, 24, 48);
  ctx.fillStyle = '#5aa63d';
  ctx.fillRect(SX, SY + 130, SW, SH - 130);
  for (let x = 0; x < SW; x += 48) ctx.fillRect(SX + x, SY + 118 - ((x / 48) % 3) * 6, 48, 24);
  ctx.fillStyle = '#7ac74f'; ctx.fillRect(SX, SY + 154, SW, SH - 154);
  const RIVY = SY + SH - 54;
  ctx.fillStyle = '#3f7fd1'; ctx.fillRect(SX, RIVY, SW, 54);
  ctx.fillStyle = '#7db4e8';
  for (let x = 0; x < SW; x += 48) {
    if (x + 8 + 24 <= SW) ctx.fillRect(SX + x + 8, RIVY + 12, 24, 5);
    if (x + 30 + 24 <= SW) ctx.fillRect(SX + x + 30, RIVY + 34, 24, 5);
  }

  // la star, avec son pelage et son chapeau
  const spr = SPRITES[s.stage] || SPRITES.baby;
  const sc = 13;
  const ox = SX + Math.round((SW - 16 * sc) / 2);
  const oy = RIVY - spr.length * sc;
  const fur = s.stage === 'egg' ? null : furById(s.fur).map;
  blit(ctx, spr, ox, oy, sc, fur);
  if (s.stage !== 'egg' && s.hat) {
    const hat = hatById(s.hat);
    if (hat) blit(ctx, hat.rows, ox, oy - hat.rows.length * sc + 2 * sc, sc);
  }

  // identité
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Courier New", Courier, monospace';
  ctx.fillText(d.name, CARD_W / 2, 416);
  ctx.fillStyle = '#f4c14f';
  ctx.font = 'bold 15px "Courier New", Courier, monospace';
  ctx.fillText(d.stageLine, CARD_W / 2, 442);

  // exploits
  ctx.fillStyle = '#141822'; ctx.fillRect(40, 452, CARD_W - 80, 96);
  ctx.fillStyle = '#e8e4d8';
  ctx.font = '16px "Courier New", Courier, monospace';
  d.lines.forEach((line, i) => ctx.fillText(line, CARD_W / 2, 480 + i * 28));

  // invitation
  ctx.fillStyle = '#9aa0b4';
  ctx.font = '14px "Courier New", Courier, monospace';
  ctx.fillText('🦦 ' + d.url, CARD_W / 2, 568);
}

/** Fabrique le canvas de la carte (document injecté -> testable en jsdom). */
export function makeCard(s, rec, doc, now = Date.now()) {
  const cv = doc.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  drawCard(ctx, s, rec, now);
  return cv;
}
