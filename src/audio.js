// Bips 8-bit (WebAudio) + retour haptique. Tolérant : jamais d'erreur si absent.
let AC = null;
let muted = false;

export function setMuted(m) { muted = !!m; }
export function isMuted() { return muted; }

function ctx() {
  if (!AC) {
    try {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (C) AC = new C();
    } catch (e) {}
  }
  // iOS : l'audio doit être (re)démarré après un geste utilisateur
  if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
  return AC;
}

/** Contexte audio partagé (musique + sfx : un seul AudioContext, iOS oblige). */
export function audioCtx() { return ctx(); }

// v2.5.1 : volume par défaut remonté — sur un haut-parleur de téléphone,
// l'ancien réglage (0.045) était à peine audible.
export function beep(freq, dur = 0.09, delay = 0, type = 'square', vol = 0.08) {
  if (muted) return;
  const ac = ctx(); if (!ac) return;
  try {
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}

export function vibrate(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

export const sfx = {
  press:  () => beep(520, 0.05),
  eat:    () => { beep(392, 0.07); beep(494, 0.07, 0.09); },
  happy:  () => { beep(523, 0.07); beep(659, 0.07, 0.08); beep(784, 0.1, 0.16); },
  wash:   () => { beep(740, 0.06); beep(880, 0.09, 0.07, 'sine'); },
  sleep:  () => { beep(330, 0.12, 0, 'sine'); beep(262, 0.16, 0.13, 'sine'); },
  heal:   () => { beep(440, 0.08); beep(554, 0.08, 0.09); beep(659, 0.12, 0.18); },
  hatch:  () => { [523, 587, 659, 784, 1047].forEach((f, i) => beep(f, 0.09, i * 0.09)); },
  evolve: () => { [392, 523, 659, 784].forEach((f, i) => beep(f, 0.1, i * 0.1)); },
  sad:    () => { beep(294, 0.12); beep(220, 0.2, 0.14); },
  catch:  () => beep(988, 0.06),
  warm:   () => beep(600 + Math.random() * 100, 0.05),
  over:   () => { [392, 330, 262, 196].forEach((f, i) => beep(f, 0.18, i * 0.18, 'triangle')); }
};
