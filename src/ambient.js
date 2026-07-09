// Lit d'ambiance PROCÉDURAL (WebAudio, zéro fichier) : le fond sonore vivant de
// la berge. Eau qui clapote en permanence, oiseaux au printemps/été le jour,
// grillons l'été/automne la nuit, vent l'automne/hiver. Branché sur le bus
// d'ambiance (donc « ducké » sous les actions, réglé par le volume maître).
import { audioCtx, ambientBus, isMuted } from './audio.js';
import { seasonFor } from './seasons.js';
import { isNightHour } from './music.js';

/** Quelles couches sont actives selon la saison et l'heure. PUR, testé. */
export function ambientPlan(season, night) {
  return {
    water: true,
    birds:    !night && (season === 'printemps' || season === 'ete'),
    crickets:  night && (season === 'ete' || season === 'automne'),
    wind:     (season === 'automne' || season === 'hiver')
  };
}

let active = false, timer = null;
let noiseBuf = null;
let water = null, waterFilt = null, waterLfo = null, waterGain = null;
let wind = null, windFilt = null, windGain = null;

function noise(ac) {
  if (noiseBuf) return noiseBuf;
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0; // bruit « brun » : plus doux, plus naturel que le blanc
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  noiseBuf = buf;
  return buf;
}

function startBeds(ac) {
  const bus = ambientBus(); if (!bus) return;
  // Eau : bruit brun filtré passe-bas, avec un LFO lent sur la coupure -> clapotis.
  water = ac.createBufferSource(); water.buffer = noise(ac); water.loop = true;
  waterFilt = ac.createBiquadFilter(); waterFilt.type = 'lowpass'; waterFilt.frequency.value = 480; waterFilt.Q.value = 0.7;
  waterGain = ac.createGain(); waterGain.gain.value = 0.05;
  waterLfo = ac.createOscillator(); waterLfo.frequency.value = 0.15;
  const lfoAmt = ac.createGain(); lfoAmt.gain.value = 180;
  waterLfo.connect(lfoAmt); lfoAmt.connect(waterFilt.frequency);
  water.connect(waterFilt); waterFilt.connect(waterGain); waterGain.connect(bus);
  water.start(); waterLfo.start();

  // Vent : bruit passe-bande, gain modulé par gestes de rafale (réglé au tick).
  wind = ac.createBufferSource(); wind.buffer = noise(ac); wind.loop = true;
  windFilt = ac.createBiquadFilter(); windFilt.type = 'bandpass'; windFilt.frequency.value = 700; windFilt.Q.value = 0.8;
  windGain = ac.createGain(); windGain.gain.value = 0;
  wind.connect(windFilt); windFilt.connect(windGain); windGain.connect(bus);
  wind.start();
}

function stopBeds() {
  for (const n of [water, waterLfo, wind]) { try { n && n.stop(); } catch (e) {} }
  water = waterLfo = wind = waterFilt = waterGain = windFilt = windGain = null;
}

// Événements transitoires ---------------------------------------------------
function chirp(ac, bus) {
  const t = ac.currentTime + Math.random() * 0.4;
  const base = 2000 + Math.random() * 1400;
  const n = 2 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = base * (1 + i * 0.06);
    const tt = t + i * 0.06;
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(0.05, tt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
    o.connect(g); g.connect(bus);
    o.start(tt); o.stop(tt + 0.09);
  }
}

function cricket(ac, bus) {
  const t = ac.currentTime + Math.random() * 0.6;
  for (let i = 0; i < 3; i++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 4600 + Math.random() * 300;
    const tt = t + i * 0.05;
    g.gain.setValueAtTime(0.02, tt);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03);
    o.connect(g); g.connect(bus);
    o.start(tt); o.stop(tt + 0.04);
  }
}

function tick() {
  const ac = audioCtx(); if (!ac || isMuted()) return;
  const bus = ambientBus(); if (!bus) return;
  const plan = ambientPlan(seasonFor(new Date()), isNightHour(new Date().getHours()));
  // vent : présence continue, montée douce quand actif, coupée sinon
  if (windGain) windGain.gain.setTargetAtTime(plan.wind ? 0.035 : 0, ac.currentTime, 1.2);
  // oiseaux / grillons : de temps en temps
  if (plan.birds && Math.random() < 0.35) chirp(ac, bus);
  if (plan.crickets && Math.random() < 0.5) cricket(ac, bus);
}

/** Allume/éteint le lit d'ambiance (idempotent), comme la musique. */
export function setActive(want) {
  if (want === active) return;
  if (want) {
    const ac = audioCtx();
    if (!ac || ac.state !== 'running') return; // pas encore débloqué -> on retentera
    active = true;
    startBeds(ac);
    tick();
    timer = setInterval(tick, 2200);
  } else {
    active = false;
    if (timer) { clearInterval(timer); timer = null; }
    stopBeds();
  }
}

export const isPlaying = () => active;
