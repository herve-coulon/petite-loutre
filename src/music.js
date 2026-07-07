// Musique chiptune. Le jour : thème d'aventure entraînant façon 8-bit
// (132 bpm, mélodie pleine, basse qui pompe à la noire, chapeau rythmique).
// La nuit : berceuse lente, une octave plus bas. Tolérant : sans AudioContext
// (tests, vieux navigateurs), tout est no-op.
import { audioCtx, isMuted } from './audio.js';

/* ---------------- Partitions (pures, testées) ---------------- */
// Grille de croches, 0 = silence. Fa majeur. 64 pas = 8 mesures de 4/4.
// Notes : F4 349, G4 392, A4 440, Bb4 466, C5 523, D5 587, E5 659, F5 698.

// Thème du jour : « l'exploration de la rivière » — hook affirmé, montée, cadence.
const DAY_MELODY = [
  349, 0, 349, 440, 523, 0, 440, 523,   // ta·ta ta ta — le hook
  587, 0, 523, 440, 392, 0, 440, 0,     // réponse descendante
  349, 0, 349, 440, 523, 0, 440, 523,   // hook repris
  587, 0, 659, 587, 523, 0, 0, 0,       // élan…
  698, 0, 659, 587, 523, 0, 587, 659,   // sommet, on dévale
  698, 0, 523, 0, 440, 0, 523, 0,       // écho du hook en haut
  392, 440, 466, 0, 587, 0, 523, 466,   // couleur si bémol, tension…
  440, 0, 523, 440, 349, 0, 0, 0        // …résolution en fa
];
// Basse à la noire (32 valeurs = 1 par 2 croches), fondamentale/quinte qui pompe.
const DAY_BASS = [
  87.31, 130.81, 87.31, 130.81,   // F
  65.41, 98.00, 65.41, 98.00,     // C
  87.31, 130.81, 87.31, 130.81,   // F
  65.41, 98.00, 65.41, 98.00,     // C
  73.42, 110.00, 73.42, 110.00,   // Dm
  87.31, 130.81, 87.31, 130.81,   // F
  116.54, 87.31, 65.41, 98.00,    // Bb -> C (cadence)
  87.31, 130.81, 98.00, 87.31     // F final
];

// Berceuse de nuit : l'air pentatonique doux d'origine (répété pour remplir la boucle).
const NIGHT_HALF = [
  349, 0, 440, 0, 523, 0, 440, 0, 392, 0, 440, 0, 349, 0, 0, 0,
  349, 0, 440, 0, 523, 0, 587, 0, 523, 0, 440, 0, 392, 0, 349, 0
];
const NIGHT_MELODY = [...NIGHT_HALF, ...NIGHT_HALF];
const NIGHT_BASS_HALF = [87.31, 130.81, 98, 87.31, 87.31, 130.81, 98, 87.31];
const NIGHT_BASS = NIGHT_BASS_HALF.flatMap(b => [b, b]);

export const DAY = { mel: DAY_MELODY, bass: DAY_BASS };
export const NIGHT = { mel: NIGHT_MELODY, bass: NIGHT_BASS };
export const LOOP = DAY_MELODY.length;

export const DAY_BPM = 132, NIGHT_BPM = 66;
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
  const score = night ? NIGHT : DAY;
  const dur = stepDur(night);
  while (nextT < ac.currentTime + 0.35) {
    if (nextT < ac.currentTime - 0.1) nextT = ac.currentTime + 0.05; // retard (onglet gelé)
    if (!isMuted()) {
      const m = score.mel[step];
      if (m) {
        if (night) note(ac, m / 2, nextT, dur * 0.92, 'triangle', 0.045);
        else note(ac, m, nextT, dur * 0.85, 'square', 0.05); // staccato punchy
      }
      // basse : à la noire le jour (ça pompe), à la blanche la nuit (ça berce)
      const bEvery = night ? 4 : 2;
      if (step % bEvery === 0) {
        note(ac, score.bass[(step / bEvery) | 0], nextT, dur * (night ? 3.6 : 1.7), 'triangle', 0.06);
      }
      // chapeau rythmique sur les temps, le jour seulement : la pulsation qui entraîne
      if (!night && step % 2 === 0) note(ac, 5600, nextT, 0.03, 'square', 0.012);
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
