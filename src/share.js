// Résultat quotidien à partager, façon Wordle : trois cases, un niveau, une
// flamme — et le lien du jeu. Zéro image, zéro serveur. Module PUR.
import { dailyQuests } from './quests.js';
import { levelFromXp, titleFor } from './level.js';

export const SHARE_URL = 'herve-coulon.github.io/petite-loutre';

export function dailyShareText(s, rec, now = Date.now()) {
  const d = new Date(now);
  const dd = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  const qd = s && s.qDaily;
  const quests = qd ? dailyQuests(qd.date) : [];
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
