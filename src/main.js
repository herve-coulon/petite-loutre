// Orchestrateur : relie simulation, rendu, UI, audio et PWA.
import { SEC, MIN, clamp, TREAT_CD, DIVE_MS } from './constants.js';
import { bumpQuest, completedQuests, ensureDaily } from './quests.js';
import {
  newState, saveState, loadState, clearSave,
  loadRecords, saveRecords, exportSave, importSave
} from './state.js';
import { stepSim, simulateOffline, ageMs } from './sim.js';
import { newGame, tickGame, clickGame } from './minigame.js';
import { makeRenderer, OTTER_X, otterY } from './render.js';
import { sfx, vibrate, setMuted } from './audio.js';
import * as ui from './ui.js';
import { registerSW, setupInstall, requestPersistentStorage } from './pwa.js';
import { unlockedHats, hatById } from './accessories.js';
import { unlockedFurs, unlockedDecors } from './skins.js';
import { newAchievements } from './achievements.js';
import { encodeCard, decodeCard, newBattle, playTurn } from './battle.js';
import { makeCard, CARD_URL } from './photocard.js';

const $ = id => document.getElementById(id);
const now = () => Date.now();
const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();

let s = null;
let rec = null;               // records globaux (toutes loutres confondues)
let prevHats = new Set();     // pour détecter les nouveaux déblocages
let mg = null;
let battle = null;
let frame = 0;
let wobbleUntil = 0, lastWarm = 0, lastPet = 0, lastSave = 0, lastTickAt = now();

const cv = $('cv');
const R = makeRenderer(cv);

/* ---------------- Événements de simulation -> retours joueur ---------------- */
function applyEvents(events, offline = false) {
  for (const ev of events) {
    if (ev.type === 'hatch') {
      ui.showNaming();
      if (!offline) { sfx.hatch(); R.burst('confetti', 26, 'egg'); }
      continue;
    }
    if (ev.type === 'die') {
      rec.otters++;
      rec.bestAge = Math.max(rec.bestAge, ageMs(s, s.diedAt || now()));
      checkUnlocks();
      ui.showGameOver(s);
      if (!offline) sfx.over();
      continue;
    }
    if (offline) continue; // le reste est résumé au retour
    const msg = ui.liveEventMessage(ev, s);
    if (msg) ui.log(msg);
    if (ev.type === 'evolve') {
      ui.toast('✨ ' + s.name + ' a grandi ! ✨');
      sfx.evolve();
      R.burst('confetti', 40, s.stage); // pluie de confettis d'évolution
    }
    if (ev.type === 'sick') sfx.sad();
  }
}

/* ---------------- Actions ---------------- */
function diving() { return s && (s.divingUntil || 0) > now(); }
function busy() { return !s || s.gameOver || s.stage === 'egg' || mg || diving(); }
function press() { vibrate(10); }
const isChildPlus = () => s && (s.stage === 'child' || s.stage === 'adult');

function actTreat() {
  if (busy() || s.sleeping || !isChildPlus()) return;
  const t = now();
  const CD = TREAT_CD;
  if (t - (s.lastTreat || 0) < CD) {
    const left = Math.ceil((CD - (t - s.lastTreat)) / MIN);
    ui.log('Plus de friandises pour l\'instant… (encore ' + left + ' min)');
    return;
  }
  press();
  s.lastTreat = t;
  s.hunger = clamp(s.hunger + 10, 0, 100);
  s.fun = clamp(s.fun + 8, 0, 100);
  R.spawn('heart', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  R.burst('sparkle', 5, s.stage);
  sfx.happy();
  ui.log(s.name + ' savoure sa brochette de baies ! 🍡');
  afterAct();
  quest('treats');
}

function actDive() {
  if (busy() || s.sleeping || s.stage !== 'adult') return;
  press();
  s.divingUntil = now() + DIVE_MS;
  sfx.wash();
  ui.log(s.name + ' plonge chercher un trésor… retour dans 15 min ! 🤿');
  afterAct();
}

function resolveDive() {
  s.divingUntil = 0;
  rec.treasures++;
  s.fun = clamp(s.fun + 15, 0, 100);
  s.hunger = clamp(s.hunger - 8, 0, 100);
  const finds = ['une perle nacrée 🦪', 'un coquillage rare 🐚', 'une pièce ancienne 🪙', 'un caillou qui brille ✨'];
  ui.log(s.name + ' remonte avec ' + finds[Math.floor(Math.random() * finds.length)] + ' !');
  R.burst('sparkle', 10, s.stage);
  sfx.hatch(); vibrate([15, 30, 15]);
  persist();
  checkUnlocks();
}

function actFeed() {
  if (busy() || s.sleeping) return;
  press();
  if (s.hunger > 92) { ui.log(s.name + ' n\'a plus faim du tout !'); return; }
  s.hunger = clamp(s.hunger + 30, 0, 100);
  s.fun = clamp(s.fun + 2, 0, 100);
  s.fed++;
  rec.mealsTotal++;
  s.nextPoop = Math.min(s.nextPoop, now() + (2 + Math.random() * 2) * 60 * MIN);
  R.spawn('fish', s.stage); R.spawn('heart', s.stage); R.spawn('heart', s.stage);
  sfx.eat();
  ui.log('Miam ! ' + s.name + ' dévore un poisson frais. 🐟');
  afterAct();
  quest('meals');
}

function actWash() {
  if (busy() || s.sleeping) return;
  press();
  const hadPoop = s.poops.length > 0;
  s.poops = [];
  s.clean = 100;
  s.washed++;
  rec.bathsTotal++;
  for (let i = 0; i < 10; i++) R.spawn('bubble', s.stage);
  R.burst('sparkle', 4, s.stage);
  sfx.wash();
  ui.log(hadPoop ? 'Grand nettoyage ! Tout est propre. ✨' : s.name + ' barbote dans son bain. 🫧');
  afterAct();
  quest('washes');
}

function actSleep() {
  if (busy()) return;
  press();
  s.sleeping = !s.sleeping;
  if (s.sleeping) {
    rec.sleepsTotal++;
    sfx.sleep(); ui.log(s.name + ' se blottit pour dormir… 💤');
    afterAct();
    quest('sleeps');
    return;
  }
  sfx.press(); ui.log(s.name + ' se réveille et s\'étire.');
  afterAct();
  checkUnlocks();
}

function actHeal() {
  if (busy()) return;
  if (!s.sick) { ui.log(s.name + ' n\'est pas malade.'); return; }
  press();
  s.sick = false;
  s.health = clamp(s.health + 20, 0, 100);
  s.healed++;
  R.spawn('heart', s.stage);
  R.burst('sparkle', 8, s.stage);
  R.squash();
  sfx.heal();
  ui.log('Le médicament fait effet. ' + s.name + ' va mieux ! 💊');
  afterAct();
}

function actWarm() {
  if (!s || s.stage !== 'egg' || s.gameOver) return;
  const t = now();
  if (t - lastWarm < 700) return;
  lastWarm = t;
  press();
  s.born -= 5 * SEC; // rapproche l'éclosion
  wobbleUntil = t + 450;
  sfx.warm();
  ui.log('Tu réchauffes doucement l\'œuf… il frémit !');
}

function pet() {
  if (busy() || s.sleeping) return;
  const t = now();
  R.squash(); // la loutre s'écrase puis rebondit sous la caresse
  R.spawn('heart', s.stage);
  if (t - lastPet > 20 * SEC) {
    lastPet = t;
    s.fun = clamp(s.fun + 3, 0, 100);
    R.spawn('heart', s.stage);
    sfx.happy();
    ui.log(s.name + ' adore les caresses ! 💛');
    quest('pets');
  } else {
    sfx.press();
  }
}

function actPlay() {
  if (busy() || s.sleeping) return;
  if (s.energy < 12) { ui.log(s.name + ' est trop fatiguée pour jouer…'); return; }
  press();
  mg = newGame(now());
  sfx.press();
  ui.log('Partie de pêche ! Attrape les poissons en les touchant !');
  ui.updateHUD(s, mg);
}

function endGame(res) {
  const sc = res.score, tot = res.total;
  s.fun = clamp(s.fun + 8 + sc * 5, 0, 100);
  s.energy = clamp(s.energy - 8, 0, 100);
  s.hunger = clamp(s.hunger - 4, 0, 100);
  s.played++;
  rec.gamesTotal++;
  rec.fishTotal += sc;
  if (sc >= tot && tot >= 5) rec.perfectGames++;
  mg = null;
  if (sc >= tot && tot >= 5) R.burst('confetti', 24, s.stage);       // partie parfaite !
  else if (sc >= tot - 1 && sc > 0) R.burst('sparkle', 8, s.stage);
  if (sc >= tot - 1) { sfx.happy(); ui.log('Pêche royale : ' + sc + ' poisson' + (sc > 1 ? 's' : '') + ' ! ' + s.name + ' est ravie ! 🎉'); }
  else if (sc > 0) { sfx.eat(); ui.log(sc + ' poisson' + (sc > 1 ? 's' : '') + ' attrapé' + (sc > 1 ? 's' : '') + ' ! Pas mal !'); }
  else { sfx.sad(); ui.log('Aucun poisson… ils étaient rusés aujourd\'hui.'); }
  persist();
  ui.updateHUD(s, mg);
  quest('games');
  if (sc > 0) quest('fish', sc);
}

/* ---------------- Canvas (pêche, caresses, œuf) ---------------- */
function onCanvasPointer(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (cv.width / r.width);
  const y = (e.clientY - r.top) * (cv.height / r.height);
  const pad = e.pointerType === 'touch' ? 8 : 4; // hitbox élargie au doigt

  if (mg) {
    if (clickGame(mg, x, y, pad)) { R.splashAt(x, y); sfx.catch(); vibrate(8); }
    return;
  }
  if (s && !s.gameOver) {
    if (s.stage === 'egg') { actWarm(); return; }
    const ox = OTTER_X, oy = otterY(s.stage);
    if (x >= ox - 4 && x <= ox + 36 && y >= oy - 4 && y <= oy + 40) pet();
  }
}

/* ---------------- Persistance ---------------- */
function persist() { saveState(s, storage, now()); }
function persistRec() { saveRecords(rec, storage); }
/** Après chaque action joueur : sauvegarde + HUD à jour immédiatement. */
function afterAct() { persist(); ui.updateHUD(s, mg); }

/** Détecte chapeaux et succès nouvellement débloqués -> toast + son. */
function checkUnlocks() {
  const nowUnlocked = unlockedHats(rec);
  for (const id of nowUnlocked) {
    if (!prevHats.has(id)) {
      const h = hatById(id);
      ui.toast('🎩 Débloqué : ' + h.name + ' !');
      if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
      sfx.evolve(); vibrate([15, 30, 15]);
    }
  }
  prevHats = new Set(nowUnlocked);

  const got = newAchievements(s, rec);
  for (const a of got) {
    ui.toast(a.icon + ' Succès : ' + a.name + ' !');
    if (s && !s.gameOver && s.stage !== 'egg') R.burst('sparkle', 12, s.stage);
    sfx.happy(); vibrate(20);
  }
  persistRec();
}

/** Progression de quête + récompense immédiate si terminée. */
function quest(key, n = 1) {
  if (!s || s.stage === 'egg' || s.gameOver) return;
  bumpQuest(s, key, n, now());
  for (const q of completedQuests(s, rec, now())) {
    s.fun = clamp(s.fun + 10, 0, 100);
    R.spawn('heart', s.stage);
    R.burst('sparkle', 10, s.stage);
    ui.toast(q.icon + ' Quête du jour réussie : ' + q.label + ' !');
    sfx.hatch(); vibrate([10, 30, 10]);
  }
  persistRec();
  checkUnlocks();
}

/* ---------------- Carte photo partageable ---------------- */
let cardCv = null; // canvas de la dernière carte générée

function openPhoto() {
  if (!s || s.gameOver) { ui.toast('📸 Pas de loutre à photographier…'); return; }
  if (s.stage === 'egg') { ui.toast('📸 Attends que ta loutre soit née !'); return; }
  sfx.press(); vibrate(10);
  cardCv = makeCard(s, rec, document);
  let url = '';
  try { url = cardCv && cardCv.toDataURL('image/png'); } catch (e) {}
  $('photo-img').src = url || '';
  // le partage natif n'existe pas partout (desktop) -> bouton masqué, il reste "Enregistrer"
  $('btn-photo-share').classList.toggle('hidden', typeof navigator.share !== 'function');
  ui.showOverlay('ovl-photo');
}

async function sharePhoto() {
  if (!s) return;
  const text = 'Voici ' + (s.name || 'ma loutre') + ', ma petite loutre 🦦 Viens élever la tienne : ' + CARD_URL;
  try {
    let files = null;
    if (cardCv && cardCv.toBlob && typeof File === 'function') {
      const blob = await new Promise(res => { try { cardCv.toBlob(res, 'image/png'); } catch (e) { res(null); } });
      if (blob) files = [new File([blob], 'ma-petite-loutre.png', { type: 'image/png' })];
    }
    if (files && navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: 'Ma Petite Loutre', text });
    } else {
      await navigator.share({ title: 'Ma Petite Loutre', text, url: CARD_URL });
    }
    ui.toast('📸 Carte partagée !');
  } catch (e) { /* partage annulé par le joueur : silence */ }
}

function savePhoto() {
  const url = $('photo-img').src;
  if (!url || !url.startsWith('data:')) { ui.toast('Image indisponible sur cet appareil…'); return; }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loutre-' + (s && s.name ? s.name.toLowerCase() : 'souvenir') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    ui.toast('💾 Carte enregistrée !');
  } catch (e) { ui.toast('Enregistrement impossible ici — fais une capture d\'écran !'); }
}

/* ---------------- Cycle de vie ---------------- */
function startNew() {
  s = newState(now());
  setMuted(s.mute);
  mg = null;
  ui.hideAllOverlays();
  ui.log('Garde l\'œuf au chaud… (touche-le ou utilise le bouton)');
  persist();
  ui.updateHUD(s, mg);
}

function tick() {
  if (!s) return;
  const t = now();
  const rawDt = t - lastTickAt;
  lastTickAt = t;
  if (rawDt > 30 * SEC) {
    // onglet en veille / app en arrière-plan -> rattrapage complet
    s.lastTick = t - rawDt;
    const { elapsed, events } = simulateOffline(s, t);
    applyEvents(events, true);
    const msg = ui.offlineSummary(s, elapsed, events);
    if (msg && elapsed > 10 * MIN) ui.log(msg);
  } else {
    applyEvents(stepSim(s, rawDt, { simNow: t }));
  }
  if (s.divingUntil && t >= s.divingUntil && !s.gameOver) resolveDive();
  if (s.stage !== 'egg' && ensureDaily(s, t)) persist(); // nouvelles quêtes du jour
  ui.updateHUD(s, mg);
  if (t - lastSave > 5 * SEC) {
    lastSave = t;
    persist();
    // record de longévité mis à jour en continu
    if (s.stage !== 'egg' && !s.gameOver) {
      const a = ageMs(s, t);
      if (a > rec.bestAge) { rec.bestAge = a; checkUnlocks(); }
    }
  }
}

function loop() {
  frame++;
  if (mg) {
    const res = tickGame(mg, now());
    if (res) endGame(res);
  }
  R.render(s, mg, frame, {
    wobble: s && now() < wobbleUntil,
    diving: diving(),
    foe: battle ? battle.foe : null
  });
  requestAnimationFrame(loop);
}

/* ---------------- Boot ---------------- */
function boot() {
  registerSW();
  requestPersistentStorage();
  setupInstall($('b-install'), $('ios-hint'));

  rec = loadRecords(storage);
  prevHats = new Set(unlockedHats(rec));

  const prev = loadState(storage);
  if (prev) {
    s = prev;
    setMuted(s.mute);
    const { elapsed, events } = simulateOffline(s, now());
    applyEvents(events, true);
    if (s.gameOver) ui.showGameOver(s);
    else if (s.stage !== 'egg' && !s.name) ui.showNaming();
    else {
      const msg = ui.offlineSummary(s, elapsed, events);
      if (msg && elapsed > 10 * MIN) ui.log(msg);
      else if (s.stage === 'egg') ui.log('L\'œuf t\'attendait bien au chaud…');
      else ui.log('Content de te revoir, ' + s.name + ' aussi !');
    }
    persist();
  } else {
    ui.showOverlay('ovl-intro');
  }
  ui.updateHUD(s, mg);

  $('btn-start').addEventListener('click', () => { sfx.press(); vibrate(15); startNew(); });
  $('btn-name').addEventListener('click', () => {
    let n = $('name-input').value.trim();
    if (!n) n = 'Loutrette';
    s.name = n.slice(0, 12);
    ui.hideOverlay('ovl-name');
    ui.toast('💛 Bienvenue, ' + s.name + ' ! 💛');
    ui.log(s.name + ' est née ! Nourris-la, joue avec elle, et garde-la propre.');
    sfx.happy(); vibrate([15, 40, 15]);
    persist(); ui.updateHUD(s, mg);
  });
  $('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-name').click(); });
  $('btn-restart').addEventListener('click', () => { sfx.press(); startNew(); });

  $('b-feed').addEventListener('click', actFeed);
  $('b-play').addEventListener('click', actPlay);
  $('b-wash').addEventListener('click', actWash);
  $('b-sleep').addEventListener('click', actSleep);
  $('b-heal').addEventListener('click', actHeal);
  $('b-warm').addEventListener('click', actWarm);
  $('b-treat').addEventListener('click', actTreat);
  $('b-dive').addEventListener('click', actDive);

  // Combat de loutres (par code de défi)
  $('b-battle').addEventListener('click', () => {
    if (busy() || s.sleeping || !isChildPlus()) return;
    sfx.press();
    battle = null;
    ui.resetBattleUI(encodeCard(s));
    ui.showOverlay('ovl-battle');
  });
  $('bt-close').addEventListener('click', () => { battle = null; ui.hideOverlay('ovl-battle'); });
  $('bt-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('bt-mycode').value); ui.toast('📋 Code copié !'); }
    catch (e) { try { $('bt-mycode').select(); document.execCommand('copy'); ui.toast('📋 Code copié !'); } catch (e2) {} }
  });
  $('bt-start').addEventListener('click', () => {
    const card = decodeCard($('bt-foecode').value);
    if (!card) { ui.toast('❌ Code de combat invalide'); return; }
    battle = newBattle(s, card, encodeCard(s) + $('bt-foecode').value.trim());
    battle.log.push('Le combat commence ! ' + battle.me.name + ' vs ' + battle.foe.name);
    rec.battles++;
    persistRec();
    ui.shake(); // l'arène tremble !
    sfx.evolve(); vibrate([20, 40, 20]);
    ui.updateBattleUI(battle);
    quest('battles');
  });
  const doMove = (id) => {
    if (!battle || battle.over) return;
    playTurn(battle, id);
    vibrate(8); sfx.press();
    ui.updateBattleUI(battle);
    if (battle.over) {
      if (battle.winner === 'me') {
        rec.wins++;
        s.fun = clamp(s.fun + 12, 0, 100);
        sfx.happy(); ui.toast('🏆 Victoire de ' + battle.me.name + ' !');
      } else {
        s.fun = clamp(s.fun + 2, 0, 100);
        sfx.sad(); ui.toast('💔 Défaite… ça se rejouera !');
      }
      persist(); persistRec(); checkUnlocks();
    }
  };
  $('bt-splash').addEventListener('click', () => doMove('splash'));
  $('bt-roulade').addEventListener('click', () => doMove('roulade'));
  $('bt-calin').addEventListener('click', () => doMove('calin'));

  $('b-mute').addEventListener('click', () => {
    s.mute = !s.mute; setMuted(s.mute); persist(); ui.updateHUD(s, mg);
  });
  $('b-reset').addEventListener('click', () => {
    ui.askConfirm('Recommencer avec un nouvel œuf ? La loutre actuelle sera perdue (chapeaux et succès conservés).', () => {
      clearSave(storage);
      startNew();
    });
  });

  // Garde-robe (chapeaux, pelages, décors)
  const wardrobeHandlers = {
    onHat(id) {
      if (!s || !unlockedHats(rec).includes(id)) return;
      s.hat = (s.hat === id ? null : id);
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    },
    onFur(id) {
      if (!s || !unlockedFurs(rec).includes(id)) return;
      s.fur = id;
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    },
    onDecor(id) {
      if (!s || !unlockedDecors(rec).includes(id)) return;
      s.decor = id;
      sfx.press(); vibrate(10); persist();
      ui.renderWardrobe(s, rec, wardrobeHandlers);
    }
  };
  $('b-hats').addEventListener('click', () => {
    sfx.press();
    ui.renderWardrobe(s, rec, wardrobeHandlers);
    ui.showOverlay('ovl-hats');
  });
  $('btn-hats-close').addEventListener('click', () => ui.hideOverlay('ovl-hats'));

  // Carte photo
  $('b-photo').addEventListener('click', openPhoto);
  $('btn-photo-share').addEventListener('click', sharePhoto);
  $('btn-photo-save').addEventListener('click', savePhoto);
  $('btn-photo-close').addEventListener('click', () => { cardCv = null; ui.hideOverlay('ovl-photo'); });

  // Succès
  $('b-ach').addEventListener('click', () => {
    sfx.press();
    if (s && s.stage !== 'egg') ensureDaily(s, now());
    ui.renderAchievements(rec, s);
    ui.showOverlay('ovl-ach');
  });
  $('btn-ach-close').addEventListener('click', () => ui.hideOverlay('ovl-ach'));

  // Réglages : export / import / reset
  $('b-gear').addEventListener('click', () => {
    sfx.press();
    $('exp-code').value = s ? exportSave(s, rec) : '';
    $('imp-code').value = '';
    ui.showOverlay('ovl-set');
  });
  $('btn-set-close').addEventListener('click', () => ui.hideOverlay('ovl-set'));
  $('btn-copy').addEventListener('click', async () => {
    const code = $('exp-code').value;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
      try { $('exp-code').select(); ok = document.execCommand('copy'); } catch (e2) {}
    }
    ui.toast(ok ? '📋 Code copié !' : 'Copie impossible — sélectionne le texte à la main.');
  });
  $('btn-import').addEventListener('click', () => {
    const r = importSave($('imp-code').value);
    if (!r) { ui.toast('❌ Code invalide'); return; }
    ui.askConfirm('Remplacer la partie actuelle par celle du code ?', () => {
      s = r.s;
      rec = r.rec;
      setMuted(s.mute);
      prevHats = new Set(unlockedHats(rec));
      const { events } = simulateOffline(s, now());
      applyEvents(events, true);
      persist(); persistRec();
      ui.hideAllOverlays();
      if (s.gameOver) ui.showGameOver(s);
      else if (s.stage !== 'egg' && !s.name) ui.showNaming();
      ui.updateHUD(s, mg);
      ui.log('Sauvegarde importée. Re-bonjour, ' + (s.name || 'petit œuf') + ' ! 💛');
      sfx.happy();
    });
  });

  cv.addEventListener('pointerdown', onCanvasPointer);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  setInterval(tick, 1000);
  requestAnimationFrame(loop);
}

// Hooks de debug / tests automatisés
window.__loutre = {
  get state() { return s; },
  get records() { return rec; },
  get minigame() { return mg; },
  forceHatch() {
    if (s && s.stage === 'egg') {
      s.born = now() - 3 * MIN;
      applyEvents(stepSim(s, 1000, { simNow: now() }));
      ui.updateHUD(s, mg);
    }
  },
  step(ms) { applyEvents(stepSim(s, ms, { simNow: now() })); ui.updateHUD(s, mg); },
  startNew, actFeed, actWash, actSleep, actHeal, actPlay, actTreat, actDive,
  get battle() { return battle; }
};

boot();
