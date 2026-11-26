// Skylark Run — synthesized sound only: engine hum, wind, ring chimes,
// landing fanfare and the crash thud. No audio files, no network.
import { FUEL } from './config.js';

let audioContext = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let engineFilter = null;
let windSource = null;
let windGain = null;
let lastBeepAt = 0;

function ensureContext() {
  if (audioContext) return audioContext;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  audioContext = new AudioCtx();
  return audioContext;
}

/** Call from any user gesture (key, click): browsers require it. */
export function unlockAudio() {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  startEngineHum(ctx);
}

function startEngineHum(ctx) {
  if (engineOsc) return;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineOsc2 = ctx.createOscillator();
  engineOsc2.type = 'square';
  engineOsc2.frequency.value = 28;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 420;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(ctx.destination);
  engineOsc.start();
  engineOsc2.start();

  const noiseLength = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
  windSource = ctx.createBufferSource();
  windSource.buffer = buffer;
  windSource.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  windGain = ctx.createGain();
  windGain.gain.value = 0;
  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(ctx.destination);
  windSource.start();
}

/** Every frame: engine pitch follows throttle, wind follows airspeed. */
export function updateEngineSound(state) {
  if (!audioContext || !engineOsc || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  const throttle = state.onGround && state.speedKts < 5 ? 0.12 : state.throttle;
  const targetFreq = 52 + throttle * 95 + (state.boost ? 45 : 0);
  const targetGain = state.crashed ? 0 : 0.035 + throttle * 0.05;
  engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
  engineOsc2.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.08);
  engineGain.gain.setTargetAtTime(targetGain, now, 0.1);
  const windTarget = state.crashed ? 0 : Math.min(0.09, (state.speedKts / 330) * 0.09);
  windGain.gain.setTargetAtTime(windTarget, now, 0.15);
}

function playTone(freq, startAt, duration, type, volume) {
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

/** Two-note chime when a ring is flown. */
export function playRingChime() {
  playTone(880, 0, 0.35, 'sine', 0.16);
  playTone(1318.5, 0.12, 0.5, 'sine', 0.14);
}

/** Short rising fanfare for a completed mission landing. */
export function playLandingFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, index) => playTone(freq, index * 0.14, 0.5, 'triangle', 0.15));
}

/** Noise burst plus a low thud for a crash. */
export function playCrashThud() {
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;
  const length = ctx.sampleRate * 0.7;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  playTone(55, 0, 0.6, 'sine', 0.4);
}

/** Single warning beep, throttled so it never machine-guns. */
export function playWarningBeep() {
  const now = Date.now();
  if (now - lastBeepAt < 700) return;
  lastBeepAt = now;
  playTone(1046, 0, 0.12, 'square', 0.06);
}

/** Soft click for starting and menu actions. */
export function playClick() {
  playTone(660, 0, 0.09, 'sine', 0.08);
}

/** Silence everything (used on crash / game over screens). */
export function muteEngineSound() {
  if (!audioContext || !engineGain) return;
  engineGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.05);
  windGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.05);
}

export function lowFuel(state) {
  return state.fuel <= FUEL.lowWarning;
}
