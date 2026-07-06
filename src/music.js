// Musique chiptune : petite boucle en fa majeur pentatonique, douce et discrète.
// Deux ambiances : enjouée le jour, berceuse (plus lente, une octave plus bas) la nuit.
// Tolérant : sans AudioContext (tests, vieux navigateurs), tout est no-op.
import { audioCtx, isMuted } from './audio.js';

/* ---------------- Partition (pure, testée) ---------------- */
// 32 croches — 0 = silence. Fa majeur pentatonique : F G A C D.
export const MELODY = [
  349, 0, 440, 0, 523, 0, 440, 0, 392, 0, 440, 0, 349, 0, 0, 0,
  349, 0, 440, 0, 523, 0, 587, 0, 523, 0, 440, 0, 392, 0, 349, 0
];
// Une note de basse toutes les 4 croches (blanches) : F2 C3 G2 F2 …
export const BASS = [87.31, 130.81, 98, 87.31, 87.31, 130.81, 98, 87.31];
export const LOOP = MELODY.length;

export const DAY_BPM = 96, NIGHT_BPM = 66;
export const isNightHour = h => h >= 21 || h < 7;
/** Durée d'une croche en secondes. */
export const stepDur = night => 60 / (night ? NIGHT_BPM : DAY_BPM) / 2;

/* ---------------- Séquenceur ---------------- */
let timer = null, step = 0, nextT = 0, active = false;

function note(ac, freq, t, dur, type, vol) {
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.03);
  } catch (e) {}
}

function schedule() {
  const ac = audioCtx();
  if (!ac) return;
  const night = isNightHour(new Date().getHours());
  const dur = stepDur(night);
  while (nextT < ac.currentTime + 0.35) {
    if (nextT < ac.currentTime - 0.1) nextT = ac.currentTime + 0.05; // retard (onglet gelé)
    if (!isMuted()) {
      const m = MELODY[step];
      if (m) note(ac, night ? m / 2 : m, nextT, dur * 0.92, night ? 'triangle' : 'square', night ? 0.02 : 0.022);
      if (step % 4 === 0) {
        const b = BASS[(step / 4) | 0];
        note(ac, b, nextT, dur * 3.6, 'triangle', 0.03);
      }
    }
    nextT += dur;
    step = (step + 1) % LOOP;
  }
}

/**
 * Allume/éteint la boucle (idempotent). L'AudioContext n'existe qu'après un
 * premier geste utilisateur : tant qu'il n'est pas là, on réessaie au tick suivant.
 */
export function setActive(want) {
  if (want === active) return;
  if (want) {
    const ac = audioCtx();
    if (!ac || ac.state !== 'running') return; // pas encore débloqué -> on retentera
    active = true;
    step = 0;
    nextT = ac.currentTime + 0.08;
    schedule();
    timer = setInterval(schedule, 120);
  } else {
    active = false;
    if (timer) { clearInterval(timer); timer = null; }
  }
}

export const isPlaying = () => active;
