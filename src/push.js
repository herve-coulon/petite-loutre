// Rappels push : le jeu calcule ses prochains rendez-vous (faim, héron, quêtes)
// et les dépose sur un petit serveur qui les enverra au bon moment, app fermée.
// Calcul PUR et testé ; la partie navigateur est tolérante (no-op sans support).
import { R, RS, H, MIN, AWAY_CARE_NEEDED } from './constants.js';

export const PUSH_URL = 'https://wjpoojscmnbgofymcmvz.supabase.co/functions/v1/push';
// Clés PUBLIQUES par nature (l'anon key Supabase et la clé VAPID publique).
const PUSH_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqcG9vanNjbW5iZ29meW1jbXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDkzODYsImV4cCI6MjA5OTA4NTM4Nn0.zJ_ejAWgNqLP1UHRn-vm7jO2_K-ozSrsOOcCaTFU2RE';
export const VAPID_PUBLIC = 'BO3ajTr2eSVNGUq2xw5E5WFpMYJTkR4v8aOkz0waKofSM2qg7U9WncoByEwo4uimjWR9nCt1EYhAazf0CX-uV4U';

/* ---------------- Calcul des rappels (pur) ---------------- */

/**
 * Les prochains rendez-vous de la loutre, calculés depuis l'état.
 * Max 4, triés, bornés à 8 jours (le rattrapage hors-ligne plafonne à 7).
 */
export function nextReminders(s, now = Date.now()) {
  if (!s || s.gameOver || s.stage === 'egg') return [];
  const name = s.name || 'Ta loutre';
  const list = [];

  if (s.away) {
    const readyAt = Math.max(s.awayNextCare || 0, now + MIN);
    list.push({
      at: readyAt,
      title: name + ' t\'attend chez le héron 🪶',
      body: 'Il acceptera un nouveau poisson (' + (s.awayCare || 0) + '/' + AWAY_CARE_NEEDED + ') — va la chercher !',
      tag: 'heron'
    });
  } else if (s.sleeping) {
    const hrs = Math.max(0, (100 - s.energy) / RS.energyGain);
    list.push({
      at: now + hrs * H,
      title: name + ' vient de se réveiller ☀️',
      body: 'Pleine d\'énergie et prête à jouer !',
      tag: 'reveil'
    });
  } else if (s.hunger > 15) {
    const hrs = (s.hunger - 15) / R.hunger;
    list.push({
      at: now + hrs * H,
      title: name + ' commence à avoir faim 🐟',
      body: 'Un poisson frais la rendrait très heureuse.',
      tag: 'faim'
    });
  } else {
    list.push({
      at: now + 10 * MIN,
      title: name + ' a très faim ! 🐟',
      body: 'Sa jauge de faim est presque vide…',
      tag: 'faim'
    });
  }

  // nouvelles quêtes + surprise : le matin suivant le passage de minuit UTC
  const d = new Date(now);
  let next7 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 7, 0, 0);
  if (now >= next7) next7 += 24 * H;
  list.push({
    at: next7,
    title: 'Nouvelles quêtes du jour ! 🏆',
    body: 'Trois défis frais et une surprise t\'attendent au bord de la rivière.',
    tag: 'quetes'
  });

  return list
    .filter(r => r.at > now && r.at < now + 8 * 24 * H)
    .sort((a, b) => a.at - b.at)
    .slice(0, 4);
}

/* ---------------- Navigateur (tolérant partout) ---------------- */

export function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function api(body) {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + PUSH_ANON,
      'apikey': PUSH_ANON
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

/** Demande la permission puis abonne ce navigateur. @returns 'ok'|'refuse'|'indisponible' */
export async function enablePush() {
  if (!pushSupported()) return 'indisponible';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'refuse';
    const reg = await navigator.serviceWorker.ready;
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToU8(VAPID_PUBLIC)
    });
    return 'ok';
  } catch (e) { return 'indisponible'; }
}

/**
 * Remet les rappels d'aplomb : si la permission est toujours accordée mais que
 * le navigateur a perdu l'abonnement (fréquent sur iOS après une mise à jour ou
 * une longue inactivité), on se ré-abonne, puis on redépose les rendez-vous.
 * Sans ça l'échec est silencieux : les réglages affichent « OUI » et rien n'arrive.
 * @returns 'ok' | 'refuse' | 'indisponible'
 */
export async function ensureSubscribed(s, now = Date.now()) {
  if (!pushSupported()) return 'indisponible';
  try {
    if (Notification.permission !== 'granted') return 'refuse';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(VAPID_PUBLIC)
      });
    }
    await api({ action: 'subscribe', sub: sub.toJSON(), reminders: nextReminders(s, now) });
    return 'ok';
  } catch (e) { return 'indisponible'; }
}

/** Dépose les prochains rappels sur le serveur (no-op sans abonnement). */
export async function syncReminders(s, now = Date.now()) {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    await api({ action: 'subscribe', sub: sub.toJSON(), reminders: nextReminders(s, now) });
    return true;
  } catch (e) { return false; }
}

/** Coupe les rappels : désabonne le navigateur et efface côté serveur. */
export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api({ action: 'unsubscribe', endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (e) {}
}
