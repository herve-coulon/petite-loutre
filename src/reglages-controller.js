// Contrôleur des « Réglages » — extrait de main.js (audit M5, tranche 14).
// Le panneau d'options : son/musique/volume, accessibilité (gros texte,
// animations réduites), rappels push, statistiques anonymes, dialogues vivants,
// cycle de vie complet, export/import de sauvegarde, et le passage de relais
// (reset). Déplacement verbatim : les corps sont ceux de main.js, seuls les
// accès globaux passent par le contexte injecté. Le point délicat — l'IMPORT
// d'une sauvegarde, qui rerelie s/rec du jeu — reste dans main.js (hook
// importSave) : ici on ne fait qu'y renvoyer le code saisi.
import { setMuted, setVolume, sfx, vibrate } from './audio.js';
import { exportSave } from './state.js';
import { isRealOtter } from './lineage.js';
import { isIOS, isStandalone } from './pwa.js';
import * as push from './push.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
let s = null, rec = null, mg = null;
function sync() { s = ctx.getState(); rec = ctx.getRecords(); mg = ctx.getMinigame(); }

// Raccourcis vers les helpers restés dans main.js.
const syncMusic = () => ctx.syncMusic();
const applyA11y = () => ctx.applyA11y();
const updateA11yLabels = () => ctx.updateA11yLabels();
const updateVolumeLabel = () => ctx.updateVolumeLabel();
const persist = () => ctx.persist();
const persistRec = () => ctx.persistRec();

const livingLabel = () => { const b = $('b-living'); if (b) b.textContent = '🗣️ DIALOGUES VIVANTS : ' + (s && s.livingDialogues ? 'OUI' : 'NON'); };
const lifecycleLabel = () => { const b = $('b-lifecycle'); if (b) b.textContent = '🌿 CYCLE DE VIE COMPLET : ' + (rec && rec.lifecycle ? 'OUI' : 'NON'); };

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupReglages(hooks) { ctx = hooks; }

/** Ouvre le panneau des réglages (rafraîchit tous les libellés au passage). */
export function openSettings() {
  sync();
  sfx.press();
  $('exp-code').value = s ? exportSave(s, rec) : '';
  $('imp-code').value = '';
  $('b-music').textContent = '🎵 MUSIQUE : ' + (s && s.music !== false ? 'OUI' : 'NON');
  updateVolumeLabel();
  updateA11yLabels();
  $('b-push').textContent = '🔔 RAPPELS : ' + (s && s.push ? 'OUI' : 'NON');
  $('b-telemetry').textContent = '📊 STATISTIQUES ANONYMES : ' + (s && s.telemetry !== false ? 'OUI' : 'NON');
  livingLabel();
  lifecycleLabel();
  ui.showOverlay('ovl-set');
}

/** Câble tous les boutons du panneau (appelé une fois au boot par main.js). */
export function wireReglages() {
  $('b-mute').addEventListener('click', () => {
    sync();
    s.mute = !s.mute; setMuted(s.mute); syncMusic(); persist(); ui.updateHUD(s, mg, rec);
  });
  $('b-music').addEventListener('click', () => {
    sync();
    s.music = s.music === false; // toggle
    $('b-music').textContent = '🎵 MUSIQUE : ' + (s.music ? 'OUI' : 'NON');
    syncMusic(); persist(); sfx.press();
  });
  $('b-volume').addEventListener('click', () => {
    sync();
    const levels = [0.35, 0.7, 1.0];
    const i = levels.findIndex(v => Math.abs(v - (s.volume ?? 0.7)) < 0.01);
    s.volume = levels[(i + 1) % levels.length];
    setVolume(s.volume);
    updateVolumeLabel();
    persist(); sfx.press();
  });
  $('b-bigtext').addEventListener('click', () => {
    sync();
    s.bigText = !s.bigText;
    applyA11y(); updateA11yLabels(); persist(); sfx.press();
  });
  $('b-motion').addEventListener('click', () => {
    sync();
    s.reduceMotion = !s.reduceMotion;
    applyA11y(); updateA11yLabels(); persist(); sfx.press();
  });
  $('b-push').addEventListener('click', async () => {
    sync();
    sfx.press();
    if (s.push) {
      s.push = false;
      $('b-push').textContent = '🔔 RAPPELS : NON';
      persist();
      push.disablePush();
      ui.toast('🔕 Rappels coupés.');
      return;
    }
    // iPhone/iPad : les notifications web n'existent QUE dans l'app installée sur
    // l'écran d'accueil et lancée depuis son icône — jamais dans un onglet Safari.
    if (isIOS() && !isStandalone()) {
      $('ios-hint').classList.remove('hidden');   // révèle la marche à suivre (Partager → écran d'accueil)
      ui.log('📲 Sur iPhone, les rappels ne marchent que dans l\'app installée : appuie sur Partager ⎋ en bas de Safari, choisis « Sur l\'écran d\'accueil », puis rouvre Loutre depuis son icône et réactive les rappels ici. (iOS 16.4+)');
      ui.toast('📲 iPhone : installe l\'app d\'abord (voir en bas).');
      return;
    }
    const res = await push.enablePush();
    if (res === 'ok') {
      s.push = true;
      $('b-push').textContent = '🔔 RAPPELS : OUI';
      persist();
      push.syncReminders(s);
      ui.toast('🔔 Rappels activés — elle saura te joindre !');
    } else if (res === 'refuse') {
      ui.toast(isIOS()
        ? 'Notifications refusées — Réglages iPhone › Loutre › Notifications pour les réautoriser.'
        : 'Notifications refusées — réactivable dans les réglages du navigateur.');
    } else {
      ui.toast(isIOS()
        ? 'Rappels indisponibles : il faut iOS 16.4 ou plus récent.'
        : 'Rappels indisponibles sur ce navigateur.');
    }
  });
  $('b-telemetry').addEventListener('click', () => {
    sync();
    sfx.press();
    s.telemetry = !s.telemetry;
    $('b-telemetry').textContent = '📊 STATISTIQUES ANONYMES : ' + (s.telemetry ? 'OUI' : 'NON');
    persist();
    ui.toast(s.telemetry ? '📊 Statistiques anonymes activées.' : '📊 Statistiques anonymes désactivées.');
  });
  $('b-living').addEventListener('click', () => {
    sync();
    sfx.press();
    s.livingDialogues = !s.livingDialogues;
    livingLabel();
    persist();
    ui.toast(s.livingDialogues
      ? '🗣️ Dialogues vivants activés — les habitants varient leur accueil.'
      : '🗣️ Dialogues vivants coupés — retour aux dialogues écrits.');
  });
  $('b-lifecycle').addEventListener('click', () => {
    sync();
    sfx.press();
    const on = !(rec && rec.lifecycle);
    if (on) {
      ui.askConfirm('Activer le cycle de vie complet ?\nTes loutres vieilliront et s\'en iront un jour, paisiblement et fêtées — jamais une défaite. La lignée continue à chaque fois. (Réversible ici à tout moment.)', () => {
        rec.lifecycle = true; persistRec(); lifecycleLabel();
        ui.toast('🌿 Cycle de vie complet activé — chaque vie compte.');
      });
    } else {
      rec.lifecycle = false; persistRec(); lifecycleLabel();
      ui.toast('🌿 Cycle de vie complet coupé — tes loutres restent auprès de toi.');
    }
  });
  $('b-reset').addEventListener('click', () => {
    sync();
    const passe = isRealOtter(s)
      ? (s.name || 'Ta loutre') + ' rejoindra la lignée (mémorial et portraits, dans le Carnet 📖) et un œuf reprendra le fil — la suivante héritera souvent de son caractère.'
      : 'Repartir d\'un nouvel œuf ?';
    ui.askConfirm('Passer le relais à une nouvelle loutre ?\n' + passe + '\n(chapeaux et succès conservés)', () => {
      ctx.clearSave();
      ctx.startNew();
    });
  });
  $('btn-copy').addEventListener('click', async () => {
    const code = $('exp-code').value;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
      try { $('exp-code').select(); ok = document.execCommand('copy'); } catch (e2) {}
    }
    ui.toast(ok ? '📋 Code copié !' : 'Copie impossible — sélectionne le texte à la main.');
  });
  // L'import RELIE de nouvelles s/rec au jeu -> le geste délicat reste dans main.js.
  $('btn-import').addEventListener('click', () => ctx.importSave($('imp-code').value));
  $('m-gear').addEventListener('click', () => { ui.hideOverlay('ovl-menu'); openSettings(); });
  $('btn-set-close').addEventListener('click', () => ui.hideOverlay('ovl-set'));
}
