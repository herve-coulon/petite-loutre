// Résultat quotidien à partager, façon Wordle : trois cases, un niveau, une
// flamme — et le lien du jeu. Zéro image, zéro serveur. Module PUR.
import { dailyQuests } from './quests.js';
import { levelFromXp, titleFor } from './level.js';
import { UNLOCK_LEVEL } from './constants.js';

export const SHARE_URL = 'herve-coulon.github.io/petite-loutre';

export function dailyShareText(s, rec, now = Date.now()) {
  const d = new Date(now);
  const dd = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  const qd = s && s.qDaily;
  const niveau = Math.max(levelFromXp((rec && rec.xp) || 0).level, (rec && rec.levelReached) || 1);
  const unlocked = [];
  if (niveau >= UNLOCK_LEVEL.treat) unlocked.push('treat');
  if (niveau >= UNLOCK_LEVEL.slide) unlocked.push('slide');
  if (niveau >= UNLOCK_LEVEL.dive) unlocked.push('dive');
  if (niveau >= UNLOCK_LEVEL.battle) unlocked.push('battle');
  const ctx = { level: niveau, unlocked, world: !!(s && s.place === 'monde') };
  const quests = qd ? dailyQuests(qd.date, ctx) : [];
  const boxes = quests.map(q => (qd.done.includes(q.id) ? '✅' : '⬜')).join('') || '⬜⬜⬜';
  const done = qd ? qd.done.length : 0;
  const L = levelFromXp((rec && rec.xp) || 0);

  let txt = '🦦 Ma Petite Loutre — ' + dd + '\n';
  txt += 'Quêtes du jour : ' + boxes + ' ' + done + '/3\n';
  txt += 'NIV ' + L.level + ' · ' + titleFor(L.level);
  if ((rec && rec.streakCount) >= 2) txt += ' · 🔥' + rec.streakCount + ' j';
  txt += '\n' + SHARE_URL;
  return txt;
}
