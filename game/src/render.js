// Skylark Run — everything the pilot sees: the pre-rendered island map,
// the runway, the glowing rings, the aircraft with its shadow, clouds and
// the title / end screens. The HUD lives in hud.js; this file draws the world.
import { VIEW, WORLD, RUNWAY } from './config.js';
import { terrainColourAt, terrainHeightAt, makeClouds } from './world.js';
import {
  drawCompass,
  drawFlightTapes,
  drawStatusPanel,
  drawMessageBanner,
  drawMinimap,
  drawObjectiveArrow,
  drawControlsHint,
} from './hud.js';
import { nextObjective } from './physics.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LANDED = 'landed';
export const SCREEN_CRASHED = 'crashed';

const TERRAIN_SCALE = 0.5;

/** Paint the whole archipelago once into an offscreen canvas. */
export function buildTerrainCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD.width * TERRAIN_SCALE);
  canvas.height = Math.round(WORLD.height * TERRAIN_SCALE);
  const ctx = canvas.getContext('2d');
  const step = 4;
  for (let y = 0; y < WORLD.height; y += step) {
    for (let x = 0; x < WORLD.width; x += step) {
      ctx.fillStyle = terrainColourAt(x, y);
      ctx.fillRect(x * TERRAIN_SCALE, y * TERRAIN_SCALE, step * TERRAIN_SCALE + 1, step * TERRAIN_SCALE + 1);
    }
  }
  drawRunwayOnTerrain(ctx);
  return canvas;
}

/** Runway asphalt, centre dashes and threshold bars, painted on the map. */
function drawRunwayOnTerrain(ctx) {
  ctx.save();
  ctx.translate(RUNWAY.x * TERRAIN_SCALE, RUNWAY.y * TERRAIN_SCALE);
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect((-RUNWAY.length / 2) * TERRAIN_SCALE, (-RUNWAY.width / 2) * TERRAIN_SCALE, RUNWAY.length * TERRAIN_SCALE, RUNWAY.width * TERRAIN_SCALE);
  ctx.fillStyle = '#f5f5f0';
  for (let d = -RUNWAY.length / 2 + 30; d < RUNWAY.length / 2 - 20; d += 46) {
    ctx.fillRect(d * TERRAIN_SCALE, -2, 26 * TERRAIN_SCALE, 4);
  }
  ctx.fillRect((-RUNWAY.length / 2 + 6) * TERRAIN_SCALE, (-RUNWAY.width / 2 + 4) * TERRAIN_SCALE, 10, (RUNWAY.width - 8) * TERRAIN_SCALE);
  ctx.fillRect((RUNWAY.length / 2 - 16) * TERRAIN_SCALE, (-RUNWAY.width / 2 + 4) * TERRAIN_SCALE, 10, (RUNWAY.width - 8) * TERRAIN_SCALE);
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold ${Math.round(26 * TERRAIN_SCALE)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('09', (-RUNWAY.length / 2 + 44) * TERRAIN_SCALE, 0);
  ctx.fillText('27', (RUNWAY.length / 2 - 44) * TERRAIN_SCALE, 0);
  ctx.restore();
}

/** Camera centre in world coordinates, clamped inside the map. */
export function cameraFor(state) {
  const zoom = state.speedKts > 200 ? 0.82 : 1;
  const x = Math.max(VIEW.width / 2 / zoom, Math.min(WORLD.width - VIEW.width / 2 / zoom, state.x));
  const y = Math.max(VIEW.height / 2 / zoom, Math.min(WORLD.height - VIEW.height / 2 / zoom, state.y));
  return { x, y, zoom };
}

function worldToScreen(camera, wx, wy) {
  return {
    x: (wx - camera.x) * camera.zoom + VIEW.width / 2,
    y: (wy - camera.y) * camera.zoom + VIEW.height / 2,
  };
}

/** The next ring: a glowing gate with its altitude band written on it. */
export function drawRings(ctx, state, camera) {
  const next = state.rings.find((ring) => !ring.passed);
  for (const ring of state.rings) {
    const screen = worldToScreen(camera, ring.x, ring.y);
    const radius = ring.radius * camera.zoom;
    if (screen.x < -radius - 80 || screen.x > VIEW.width + radius + 80) continue;
    if (screen.y < -radius - 80 || screen.y > VIEW.height + radius + 80) continue;
    const isNext = ring === next;
    const pulse = isNext ? 0.55 + 0.45 * Math.sin(state.time * 4) : 0;
    ctx.save();
    ctx.globalAlpha = ring.passed ? 0.5 : 1;
    ctx.strokeStyle = ring.passed ? '#7dff9b' : isNext ? '#ffd94d' : 'rgba(234,246,255,0.75)';
    ctx.lineWidth = isNext ? 5 + pulse * 3 : 3;
    ctx.shadowColor = ring.passed ? '#7dff9b' : '#ffd94d';
    ctx.shadowBlur = isNext ? 22 : 6;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = ring.passed ? 'rgba(125,255,155,0.10)' : 'rgba(255,217,77,0.08)';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
    // Inner chevron ring so the gate reads at a glance when shrunk.
    ctx.strokeStyle = ring.passed ? '#7dff9b' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ring.passed ? '#7dff9b' : '#ffffff';
    ctx.font = `bold ${Math.round(15 * camera.zoom) + 2}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = ring.passed
      ? '✓ DONE'
      : `${ring.name.toUpperCase()} · ${ring.altMinFt}–${ring.altMaxFt} FT`;
    ctx.fillText(label, screen.x, screen.y - radius - 16);
    ctx.restore();
  }
  // Dashed guidance line from the aircraft to the next gate.
  if (next) {
    const from = worldToScreen(camera, state.x, state.y);
    const to = worldToScreen(camera, next.x, next.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,217,77,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }
}

/** Soft cloud shadows and puffs drifting over the islands. */
export function drawClouds(ctx, camera, clouds, time) {
  ctx.save();
  for (const cloud of clouds) {
    const driftX = (cloud.x + cloud.speed * time) % (WORLD.width + 400) - 200;
    const screen = worldToScreen(camera, driftX, cloud.y);
    const radius = cloud.radius * camera.zoom;
    if (screen.x < -radius * 2 || screen.x > VIEW.width + radius * 2) continue;
    if (screen.y < -radius * 2 || screen.y > VIEW.height + radius * 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    for (let p = 0; p < cloud.puffs; p += 1) {
      const px = screen.x + Math.sin(cloud.seed + p * 2.1) * radius * 0.7;
      const py = screen.y + Math.cos(cloud.seed + p * 1.7) * radius * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, radius * (0.45 + 0.12 * ((p % 2) + 1) * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The Skylark: a single-prop island hopper, drawn nose-first, banking. */
export function drawPlane(ctx, state, camera) {
  const screen = worldToScreen(camera, state.x, state.y);
  // Ground shadow: smaller and fainter the higher the aircraft flies.
  const shadowScale = Math.max(0.25, 1 - state.altitudeFt / 2600);
  const ground = terrainHeightAt(state.x, state.y);
  const heightAboveGround = Math.max(0, state.altitudeFt - ground);
  const shadowOffset = Math.min(46, heightAboveGround / 28);
  ctx.save();
  ctx.globalAlpha = 0.30 * shadowScale;
  ctx.fillStyle = '#06121f';
  ctx.beginPath();
  ctx.ellipse(screen.x + shadowOffset, screen.y + shadowOffset, 26 * shadowScale, 12 * shadowScale, -state.heading, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Boost flame behind the tail (local −y is the tail).
  if (state.boost && !state.crashed) {
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-state.heading - Math.PI / 2);
    ctx.fillStyle = 'rgba(255,157,77,0.9)';
    const flicker = 14 + Math.sin(state.time * 40) * 5;
    ctx.beginPath();
    ctx.moveTo(-5, -20);
    ctx.lineTo(0, -20 - flicker);
    ctx.lineTo(5, -20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(screen.x, screen.y);
  // Local sprite points nose-first along +y; rotate so +y lands on the heading.
  ctx.rotate(-state.heading - Math.PI / 2);
  const bankSquash = 1 - Math.min(0.35, Math.abs(state.speedKts) / 900);
  ctx.scale(1, bankSquash);
  // Wings and tail: bright rescue-yellow so the aircraft never gets lost.
  ctx.fillStyle = '#ffc93c';
  ctx.strokeStyle = '#8a6d00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.lineTo(-6, -34);
  ctx.lineTo(-13, -34);
  ctx.lineTo(-11, 0);
  ctx.lineTo(-13, 34);
  ctx.lineTo(-6, 34);
  ctx.lineTo(6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fuselage.
  ctx.fillStyle = '#fff3d6';
  ctx.strokeStyle = '#7a5c00';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Cockpit glass.
  ctx.fillStyle = '#1d6fb8';
  ctx.beginPath();
  ctx.ellipse(0, 10, 6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail.
  ctx.fillStyle = '#ff5d5d';
  ctx.beginPath();
  ctx.moveTo(-6, -24);
  ctx.lineTo(-16, -34);
  ctx.lineTo(-16, -26);
  ctx.lineTo(-6, -18);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, -24);
  ctx.lineTo(16, -34);
  ctx.lineTo(16, -26);
  ctx.lineTo(6, -18);
  ctx.closePath();
  ctx.fill();
  // Spinning propeller disc at the nose.
  if (state.throttle > 0.05 && !state.crashed) {
    ctx.fillStyle = `rgba(200,220,240,${0.18 + state.throttle * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(0, 27, 13, 4 + Math.sin(state.time * 55) * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Damage smoke.
  if (state.damage > 45 && !state.crashed) {
    ctx.fillStyle = 'rgba(60,60,60,0.55)';
    ctx.beginPath();
    ctx.arc(-4 - Math.sin(state.time * 9) * 3, -26, 5 + Math.sin(state.time * 13) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Crashed wreck: darkened airframe, smoke column, scattered ring. */
export function drawWreck(ctx, state, camera) {
  const screen = worldToScreen(camera, state.x, state.y);
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(-state.heading - Math.PI / 2 + 0.6);
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.moveTo(-4, -20);
  ctx.lineTo(-18, -30);
  ctx.lineTo(-10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(80,80,80,0.5)';
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(screen.x + Math.sin(state.time * 2 + i) * 8, screen.y - 20 - i * 16 - (state.time % 3) * 8, 8 + i * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function centrePanel(ctx, width, height) {
  const x = (VIEW.width - width) / 2;
  const y = (VIEW.height - height) / 2;
  ctx.fillStyle = 'rgba(6, 16, 28, 0.88)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  return { x, y };
}

/** Title screen over the parked aircraft on the runway. */
export function drawTitleScreen(ctx, state) {
  const { x, y } = centrePanel(ctx, 640, 400);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 52px monospace';
  ctx.fillText('SKYLARK RUN', VIEW.width / 2, y + 78);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('ARCHIPELAGO AIRLIFT', VIEW.width / 2, y + 112);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '15px monospace';
  const lines = [
    'Fly the island hopper through all 6 rings — inside each altitude band —',
    'then bring her home to Runway 09 before the tanks run dry.',
    'A landing on the strip refuels you. A hard one bends the airframe.',
    'Mountains bite below their peaks. The sea forgives nothing.',
    '',
    'W/S  THROTTLE      A/D  TURN      ↑/↓  CLIMB / DESCEND',
    'CLICK  BOOST (burns fuel fast)      SPACE  BRAKE',
    '',
    'Press ENTER or CLICK to take off',
  ];
  lines.forEach((line, index) => {
    ctx.fillText(line, VIEW.width / 2, y + 152 + index * 24);
  });
  ctx.fillStyle = '#7dff9b';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('6 RINGS · 1 RUNWAY · 100 FUEL — MAKE EVERY GALLON COUNT', VIEW.width / 2, y + 378);
  void x;
}

/** Mission-complete screen with the final score breakdown. */
export function drawLandedScreen(ctx, state) {
  const { y } = centrePanel(ctx, 620, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dff9b';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('MISSION COMPLETE', VIEW.width / 2, y + 70);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '18px monospace';
  ctx.fillText('All 6 rings flown — and a smooth touchdown on Runway 09.', VIEW.width / 2, y + 112);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 30px monospace';
  ctx.fillText(`FINAL SCORE  ${state.score}`, VIEW.width / 2, y + 168);
  ctx.fillStyle = '#bcd8ea';
  ctx.font = '15px monospace';
  ctx.fillText(`Fuel left ${Math.round(state.fuel)}%  ·  Damage ${Math.round(state.damage)}%`, VIEW.width / 2, y + 204);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('Press R to fly the route again', VIEW.width / 2, y + 252);
}

/** Crash screen with the reason the sortie ended. */
export function drawCrashedScreen(ctx, state) {
  const { y } = centrePanel(ctx, 620, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6b6b';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('SORTIE LOST', VIEW.width / 2, y + 70);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '18px monospace';
  ctx.fillText(state.crashReason || 'The Skylark is down.', VIEW.width / 2, y + 112);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`RINGS ${state.ringsPassed}/6  ·  SCORE ${state.score}`, VIEW.width / 2, y + 168);
  ctx.fillStyle = '#bcd8ea';
  ctx.font = '15px monospace';
  ctx.fillText('Watch the altitude band on each ring — and mind the peaks.', VIEW.width / 2, y + 204);
  ctx.fillStyle = '#7fd4ff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('Press R to try the route again', VIEW.width / 2, y + 252);
}

/** One full frame: world, aircraft, instruments, then any overlay screen. */
export function drawFrame(ctx, state, terrainCanvas, clouds, screen) {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  const camera = cameraFor(state);
  ctx.save();
  ctx.drawImage(
    terrainCanvas,
    (camera.x - VIEW.width / 2 / camera.zoom) * TERRAIN_SCALE,
    (camera.y - VIEW.height / 2 / camera.zoom) * TERRAIN_SCALE,
    (VIEW.width / camera.zoom) * TERRAIN_SCALE,
    (VIEW.height / camera.zoom) * TERRAIN_SCALE,
    0,
    0,
    VIEW.width,
    VIEW.height,
  );
  ctx.restore();
  drawClouds(ctx, camera, clouds, state.time);
  drawRings(ctx, state, camera);
  if (state.crashed) drawWreck(ctx, state, camera);
  else drawPlane(ctx, state, camera);
  drawObjectiveArrow(ctx, state, camera);
  drawCompass(ctx, state);
  drawFlightTapes(ctx, state);
  drawStatusPanel(ctx, state);
  drawMessageBanner(ctx, state);
  drawMinimap(ctx, state, terrainCanvas);
  drawControlsHint(ctx);
  if (screen === SCREEN_TITLE) drawTitleScreen(ctx, state);
  if (screen === SCREEN_LANDED) drawLandedScreen(ctx, state);
  if (screen === SCREEN_CRASHED) drawCrashedScreen(ctx, state);
}
