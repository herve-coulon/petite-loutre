// Lit d'ambiance PROCÉDURAL (WebAudio, zéro fichier) : le fond sonore vivant de
// la berge. Eau qui clapote en permanence, oiseaux au printemps/été le jour,
// grillons l'été/automne la nuit, vent l'automne/hiver. Branché sur le bus
// d'ambiance (donc « ducké » sous les actions, réglé par le volume maître).
import { audioCtx, ambientBus, isMuted } from './audio.js';
import { seasonFor } from './seasons.js';
import { isNightHour } from './music.js';

/** Quelles couches sont actives selon la saison, l'heure et la météo. PUR. */
export function ambientPlan(season, night, weather) {
  const wt = weather && weather.type;
  return {
    water: true,
    birds:    !night && (season === 'printemps' || season === 'ete'),
    crickets:  night && (season === 'ete' || season === 'automne'),
    wind:     (season === 'automne' || season === 'hiver') || wt === 'vent',
    rain:     wt === 'pluie' || wt === 'orage',
    thunder:  wt === 'orage',
    frogs:     night && season === 'printemps'
  };
}

let active = false, timer = null;
let noiseBuf = null;
let water = null, waterFilt = null, waterLfo = null, waterGain = null;
let wind = null, windFilt = null, windGain = null;
let rain = null, rainFilt = null, rainGain = null;
let weatherGetter = null; // injecté par setActive pour récupérer la météo courante

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

  // Pluie : bruit passe-haut, grésillement doux (comme de la pluie sur feuilles).
  rain = ac.createBufferSource(); rain.buffer = noise(ac); rain.loop = true;
  rainFilt = ac.createBiquadFilter(); rainFilt.type = 'highpass'; rainFilt.frequency.value = 3000; rainFilt.Q.value = 0.5;
  rainGain = ac.createGain(); rainGain.gain.value = 0;
  rain.connect(rainFilt); rainFilt.connect(rainGain); rainGain.connect(bus);
  rain.start();
}

function stopBeds() {
  for (const n of [water, waterLfo, wind, rain]) { try { n && n.stop(); } catch (e) {} }
  water = waterLfo = wind = rain = waterFilt = waterGain = windFilt = windGain = rainFilt = rainGain = null;
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

// Oiseaux variés : 3 patterns différents (alouette, mésange, merle)
function birdLark(ac, bus) {
  const t = ac.currentTime;
  for (let i = 0; i < 5; i++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    const f = 2800 + Math.sin(i * 1.3) * 600;
    o.frequency.setValueAtTime(f, t + i * 0.08);
    o.frequency.exponentialRampToValueAtTime(f * 1.15, t + i * 0.08 + 0.04);
    g.gain.setValueAtTime(0.0001, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.04, t + i * 0.08 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.05);
    o.connect(g); g.connect(bus);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.07);
  }
}

function birdTit(ac, bus) {
  const t = ac.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 3200 + i * 200;
    const tt = t + i * 0.12;
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.exponentialRampToValueAtTime(0.045, tt + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.035);
    o.connect(g); g.connect(bus);
    o.start(tt); o.stop(tt + 0.04);
  }
}

function birdBlackbird(ac, bus) {
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(1200, t);
  o.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
  o.frequency.exponentialRampToValueAtTime(1000, t + 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
  g.gain.setValueAtTime(0.05, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + 0.45);
}

// Grelots de rainette : 2 bursts bas et courts (printemps, nuit)
function frog(ac, bus) {
  const t = ac.currentTime + Math.random() * 0.8;
  for (let b = 0; b < 2; b++) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 380 + Math.random() * 60;
    const bt = t + b * 0.18;
    g.gain.setValueAtTime(0.0001, bt);
    g.gain.exponentialRampToValueAtTime(0.04, bt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.06);
    o.connect(g); g.connect(bus);
    o.start(bt); o.stop(bt + 0.07);
  }
}

// Tonerre : impact de basse (oscillateur sin 60Hz, decay rapide)
function thunder(ac, bus) {
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = 55 + Math.random() * 20;
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + 0.7);
  // overlay de bruit pour l'impact
  const n = ac.createBufferSource(); n.buffer = noise(ac);
  const nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 200;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.06, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  n.connect(nf); nf.connect(ng); ng.connect(bus);
  n.start(t); n.stop(t + 0.4);
}

function tick() {
  const ac = audioCtx(); if (!ac || isMuted()) return;
  const bus = ambientBus(); if (!bus) return;
  const wt = weatherGetter ? weatherGetter() : null;
  const plan = ambientPlan(seasonFor(new Date()), isNightHour(new Date().getHours()), wt);
  // lits continus : fondu doux
  if (windGain) windGain.gain.setTargetAtTime(plan.wind ? 0.035 : 0, ac.currentTime, 1.2);
  if (rainGain) rainGain.gain.setTargetAtTime(plan.rain ? 0.04 : 0, ac.currentTime, 0.8);
  // oiseaux / grillons / rainettes : de temps en temps
  if (plan.birds && Math.random() < 0.35) {
    const r = Math.random();
    if (r < 0.33) chirp(ac, bus);
    else if (r < 0.66) birdLark(ac, bus);
    else birdTit(ac, bus);
  }
  if (plan.crickets && Math.random() < 0.5) cricket(ac, bus);
  if (plan.frogs && Math.random() < 0.3) frog(ac, bus);
  // tonnerre : événement rare pendant orage (~5% par tick)
  if (plan.thunder && Math.random() < 0.05) thunder(ac, bus);
}

/** Allume/éteint le lit d'ambiance (idempotent). weatherFn: () => {type,...} */
export function setActive(want, weatherFn) {
  if (want === active) return;
  if (want) {
    const ac = audioCtx();
    if (!ac || ac.state !== 'running') return;
    active = true;
    weatherGetter = weatherFn || null;
    startBeds(ac);
    tick();
    timer = setInterval(tick, 2200);
  } else {
    active = false;
    weatherGetter = null;
    if (timer) { clearInterval(timer); timer = null; }
    stopBeds();
  }
}

export const isPlaying = () => active;
