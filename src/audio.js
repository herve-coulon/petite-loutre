// Chaîne audio (WebAudio) : un vrai bus de mixage + retour haptique.
// Graphe : destination ← master(volume) ← { sfx, music, ambient }.
// Ça permet le réglage de volume et le ducking (baisser musique/ambiance
// sous un son marquant). Tolérant : jamais d'erreur si l'audio est absent.
let AC = null;
let master = null, busSfx = null, busMusic = null, busAmb = null;
let muted = false;
let volume = 0.7; // volume maître 0..1 (réglable dans ⚙️)

export function setMuted(m) { muted = !!m; }
export function isMuted() { return muted; }

const clamp01 = v => Math.max(0, Math.min(1, v));

function buildGraph(ac) {
  if (master) return;
  master = ac.createGain(); master.gain.value = volume; master.connect(ac.destination);
  busSfx = ac.createGain(); busSfx.connect(master);
  busMusic = ac.createGain(); busMusic.connect(master);
  busAmb = ac.createGain(); busAmb.connect(master);
}

function ctx() {
  if (!AC) {
    try {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (C) { AC = new C(); buildGraph(AC); }
    } catch (e) {}
  }
  // iOS : l'audio doit être (re)démarré après un geste utilisateur
  if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
  return AC;
}

/** Contexte audio partagé (un seul AudioContext, iOS oblige). */
export function audioCtx() { return ctx(); }

/** Bus où brancher les sons — la musique et l'ambiance vivent ici. */
export function sfxBus() { ctx(); return busSfx; }
export function musicBus() { ctx(); return busMusic; }
export function ambientBus() { ctx(); return busAmb; }

/** Volume maître 0..1 (persisté côté état). */
export function setVolume(v) { volume = clamp01(v); if (master) master.gain.setValueAtTime(volume, master.context.currentTime); }
export function getVolume() { return volume; }

/**
 * Duck : baisse brièvement musique + ambiance sous un son marquant,
 * puis remonte en douceur. Donne du relief au mixage.
 */
export function duck(amount = 0.55, attack = 0.02, release = 0.4) {
  const ac = AC; if (!ac || !busMusic) return;
  const t = ac.currentTime;
  for (const b of [busMusic, busAmb]) {
    try {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(clamp01(1 - amount), t + attack);
      b.gain.linearRampToValueAtTime(1, t + attack + release);
    } catch (e) {}
  }
}

/** Micro-variation de hauteur (±1,5 %) : deux mêmes SFX ne sonnent plus pareil. */
export function varyFreq(freq, rnd = Math.random) {
  return freq * (1 + (rnd() - 0.5) * 0.03);
}

// v2.5.1 : volume par défaut remonté (haut-parleur de téléphone).
export function beep(freq, dur = 0.09, delay = 0, type = 'square', vol = 0.08) {
  if (muted) return;
  const ac = ctx(); if (!ac) return;
  try {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = varyFreq(freq);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(busSfx || ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}

/**
 * Voix de la loutre : petit couinement (glissando aigu façon loutre).
 * `tone` module la hauteur -> joyeuse (>1), neutre (1), grognon (<1).
 */
export function chirp(tone = 1, rnd = Math.random) {
  if (muted) return;
  const ac = ctx(); if (!ac) return;
  try {
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    const base = 600 * tone * (1 + (rnd() - 0.5) * 0.06);
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(base * 1.08, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.connect(g); g.connect(busSfx || ac.destination);
    o.start(t); o.stop(t + 0.2);
  } catch (e) {}
}

export function vibrate(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

// Les sons marquants « ducken » musique + ambiance pour ressortir.
const D = (fn) => () => { duck(); fn(); };

export const sfx = {
  press:  () => beep(520, 0.05),
  chirp:      () => chirp(1),
  chirpHappy: D(() => chirp(1.35)),
  chirpSad:   () => chirp(0.72),
  eat:    D(() => { beep(392, 0.07); beep(494, 0.07, 0.09); }),
  happy:  D(() => { beep(523, 0.07); beep(659, 0.07, 0.08); beep(784, 0.1, 0.16); }),
  wash:   () => { beep(740, 0.06); beep(880, 0.09, 0.07, 'sine'); },
  sleep:  () => { beep(330, 0.12, 0, 'sine'); beep(262, 0.16, 0.13, 'sine'); },
  heal:   D(() => { beep(440, 0.08); beep(554, 0.08, 0.09); beep(659, 0.12, 0.18); }),
  hatch:  D(() => { [523, 587, 659, 784, 1047].forEach((f, i) => beep(f, 0.09, i * 0.09)); }),
  evolve: D(() => { [392, 523, 659, 784].forEach((f, i) => beep(f, 0.1, i * 0.1)); }),
  levelup: D(() => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.08, i * 0.07)); beep(1319, 0.16, 0.3); }),
  sad:    () => { beep(294, 0.12); beep(220, 0.2, 0.14); },
  catch:  () => beep(988, 0.06),
  warm:   () => beep(600 + Math.random() * 100, 0.05),
  over:   D(() => { [392, 330, 262, 196].forEach((f, i) => beep(f, 0.18, i * 0.18, 'triangle')); })
};
