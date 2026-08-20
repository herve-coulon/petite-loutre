// Contrôleur du « partage » (carte photo + résultat du jour) — extrait de main.js
// (audit M5, tranche 3). Domaine : générer et diffuser une carte souvenir, et
// partager/copier le résumé du jour. La génération d'image est pure (photocard.js),
// le texte du jour est pur (share.js) ; ici : l'orchestration UI/Web-Share via un
// contexte injecté par main.js — aucun accès à la portée de l'orchestrateur.
import { makeCard, CARD_URL } from './photocard.js';
import { dailyShareText } from './share.js';
import { ensureDaily } from './quests.js';
import * as ui from './ui.js';
import { sfx, vibrate } from './audio.js';

const $ = (id) => document.getElementById(id);
const now = () => Date.now();

// Contexte injecté au boot par main.js — les SEULS accès au jeu global.
let ctx = null;
const s = () => ctx && ctx.getState();
const rec = () => ctx && ctx.getRecords();

/** À appeler au boot (main.js) avec les accès au jeu global. */
export function setupShare(hooks) { ctx = hooks; }

let cardCv = null; // canvas de la dernière carte générée

export function openPhoto() {
  const st = s();
  if (!st || st.gameOver) { ui.toast('📸 Pas de loutre à photographier…'); return; }
  if (st.stage === 'egg') { ui.toast('📸 Attends que ta loutre soit née !'); return; }
  sfx.press(); vibrate(10);
  cardCv = makeCard(st, rec(), document);
  let url = '';
  try { url = cardCv && cardCv.toDataURL('image/png'); } catch (e) {}
  $('photo-img').src = url || '';
  // un seul bon chemin par plateforme :
  // - mobile (partage natif dispo) : PARTAGER — la feuille iOS/Android propose
  //   « Enregistrer l'image » ; le téléchargement direct est ignoré en PWA iOS
  // - desktop : ENREGISTRER (téléchargement classique)
  const hasShare = typeof navigator.share === 'function';
  $('btn-photo-share').classList.toggle('hidden', !hasShare);
  $('btn-photo-save').classList.toggle('hidden', hasShare);
  ui.showOverlay('ovl-photo');
}

export async function sharePhoto() {
  const st = s();
  if (!st) return;
  const text = 'Voici ' + (st.name || 'ma loutre') + ', ma petite loutre 🦦 Viens élever la tienne : ' + CARD_URL;
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

export function savePhoto() {
  const st = s();
  const url = $('photo-img').src;
  if (!url || !url.startsWith('data:')) { ui.toast('Image indisponible sur cet appareil…'); return; }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loutre-' + (st && st.name ? st.name.toLowerCase() : 'souvenir') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    ui.toast('💾 Carte enregistrée !');
  } catch (e) { ui.toast('Enregistrement impossible ici — fais une capture d\'écran !'); }
}

/** Ferme l'overlay carte photo et libère le canvas généré. */
export function closePhoto() { cardCv = null; ui.hideOverlay('ovl-photo'); }

/** Partage (ou copie) le résumé du jour — câblé sur le bouton du menu succès. */
export async function shareDayResult() {
  const st = s();
  if (!st) return;
  if (st.stage !== 'egg') ensureDaily(st, now());
  const text = dailyShareText(st, rec(), now());
  sfx.press(); vibrate(10);
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ text }); ui.toast('📣 Résultat partagé !'); } catch (e) { /* annulé */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    ui.toast('📋 Résultat copié — colle-le à tes amis !');
  } catch (e) {
    ui.toast('Partage indisponible sur cet appareil…');
  }
}
