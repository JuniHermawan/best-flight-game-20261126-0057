// Skylark Run — the entry point: game loop, screen state machine, input
// wiring and sound triggers. The flight model lives in physics.js, the
// drawing in render.js, the instruments in hud.js.
import { VIEW } from './config.js';
import { freshPlaneState, stepPlane, EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_REFUELLED, EVENT_HARD_LANDING } from './physics.js';
import { freshInput, attachInput, readControls } from './input.js';
import { buildTerrainCanvas, drawFrame, SCREEN_TITLE, SCREEN_PLAY, SCREEN_LANDED, SCREEN_CRASHED } from './render.js';
import { makeClouds } from './world.js';
import { stageShot, freshShotState } from './shots.js';
import {
  unlockAudio,
  updateEngineSound,
  playRingChime,
  playLandingFanfare,
  playCrashThud,
  playWarningBeep,
  playClick,
  muteEngineSound,
} from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const terrainCanvas = buildTerrainCanvas();
const clouds = makeClouds(14);
const input = freshInput();
attachInput(canvas, input);

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

// Read-only probe for automated play-tests (never used by the game itself).
window.__skylark = function skylarkProbe() {
  return {
    screen,
    paused,
    x: state.x,
    y: state.y,
    headingDeg: state.headingDeg,
    speedKts: state.speedKts,
    altitudeFt: state.altitudeFt,
    verticalSpeedFpm: state.verticalSpeedFpm,
    throttle: state.throttle,
    fuel: state.fuel,
    damage: state.damage,
    score: state.score,
    ringsPassed: state.ringsPassed,
    onGround: state.onGround,
    crashed: state.crashed,
    crashReason: state.crashReason,
    landed: state.landed,
  };
};

let state = shotName ? freshShotState() : freshPlaneState();
let screen = SCREEN_TITLE;
let paused = false;
let lastFrameAt = performance.now();
let previousRings = 0;
let previousFuel = state.fuel;

if (shotName) {
  const staged = stageShot(shotName, state);
  screen = staged.screen;
  // Screenshot scenes render one deterministic frame and stop.
  drawFrame(ctx, state, terrainCanvas, clouds, screen);
  document.title = `Skylark Run — ${shotName}`;
} else {
  requestAnimationFrame(frame);
}

function startSortie() {
  state = freshPlaneState();
  screen = SCREEN_PLAY;
  paused = false;
  previousRings = 0;
  previousFuel = state.fuel;
  playClick();
  unlockAudio();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  const controls = readControls(input);

  if (controls.start || (controls.boost && screen === SCREEN_TITLE)) {
    if (screen === SCREEN_TITLE) startSortie();
  }
  if (controls.restart && screen !== SCREEN_TITLE) startSortie();
  if (controls.pause && screen === SCREEN_PLAY) {
    paused = !paused;
    input.keys.clear();
  }

  if (screen === SCREEN_PLAY && !paused) {
    const events = stepPlane(state, controls, dt);
    if (state.ringsPassed > previousRings) {
      playRingChime();
      previousRings = state.ringsPassed;
    }
    if (events & EVENT_LANDED) {
      screen = SCREEN_LANDED;
      playLandingFanfare();
      muteEngineSound();
    }
    if (events & EVENT_CRASHED) {
      screen = SCREEN_CRASHED;
      playCrashThud();
      muteEngineSound();
    }
    if (events & (EVENT_REFUELLED | EVENT_HARD_LANDING)) playClick();
    if (state.terrainWarning) playWarningBeep();
    if (state.fuel < previousFuel && state.fuel <= 25 && state.fuel > 24.5) playWarningBeep();
    previousFuel = state.fuel;
    updateEngineSound(state);
  }
  if (screen === SCREEN_TITLE && controls.boost) unlockAudio();

  drawFrame(ctx, state, terrainCanvas, clouds, paused ? SCREEN_PLAY : screen);
  if (paused) drawPausedOverlay();
}

function drawPausedOverlay() {
  ctx.fillStyle = 'rgba(6, 16, 28, 0.7)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 10);
  ctx.font = '16px monospace';
  ctx.fillText('Press P to keep flying', VIEW.width / 2, VIEW.height / 2 + 28);
}
