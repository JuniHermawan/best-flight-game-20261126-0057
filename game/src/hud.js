// Skylark Run — the instrument panel: compass, altitude and speed tapes,
// fuel and damage bars, throttle, messages and the minimap. Every number
// here is read straight from the live plane state.
import { VIEW, RUNWAY, FUEL } from './config.js';
import { nextObjective } from './physics.js';
import { lowFuel } from './audio.js';

const PANEL = 'rgba(8, 18, 30, 0.72)';
const PANEL_EDGE = 'rgba(120, 200, 255, 0.35)';
const CYAN = '#7fd4ff';
const AMBER = '#ffb347';
const GREEN = '#7dff9b';
const RED = '#ff6b6b';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

function bar(ctx, x, y, w, h, fraction, colour, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
  ctx.strokeStyle = PANEL_EDGE;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + h / 2 + 0.5);
}

function compassLabel(deg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return `${points[index]} ${String(Math.round(deg)).padStart(3, '0')}°`;
}

/** Top-centre compass strip with the heading bug on the next objective. */
export function drawCompass(ctx, state) {
  const width = 420;
  const height = 44;
  const x = (VIEW.width - width) / 2;
  const y = 10;
  panel(ctx, x, y, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let deg = -60; deg <= 60; deg += 15) {
    const shown = (Math.round(state.headingDeg) + deg + 360) % 360;
    const px = x + width / 2 + deg * 3.2;
    const major = shown % 45 === 0;
    ctx.strokeStyle = major ? CYAN : 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(px, y + height - 8);
    ctx.lineTo(px, y + height - (major ? 20 : 13));
    ctx.stroke();
    if (major) ctx.fillText(compassLabel(shown), px, y + 13);
  }
  ctx.restore();
  // Heading caret.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + height - 2);
  ctx.lineTo(x + width / 2 - 6, y + height - 10);
  ctx.lineTo(x + width / 2 + 6, y + height - 10);
  ctx.closePath();
  ctx.fill();
  // Objective bug: a diamond showing the bearing to the next ring / runway.
  const objective = nextObjective(state);
  const bearing = (90 - (Math.atan2(-(objective.y - state.y), objective.x - state.x) * 180) / Math.PI + 360) % 360;
  let diff = ((bearing - state.headingDeg + 540) % 360) - 180;
  const bugX = x + width / 2 + Math.max(-200, Math.min(200, diff * 3.2));
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(bugX, y + 4);
  ctx.lineTo(bugX + 5, y + 10);
  ctx.lineTo(bugX, y + 16);
  ctx.lineTo(bugX - 5, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(objective.label, x + width / 2, y + height + 12);
}

/** Left tapes: altitude with vertical speed, and airspeed. */
export function drawFlightTapes(ctx, state) {
  panel(ctx, 12, 10, 150, 108);
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ALTITUDE', 22, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`${Math.max(0, Math.round(state.altitudeFt))}`, 22, 60);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#bcd8ea';
  ctx.fillText('FT', 132, 60);
  const vs = Math.round(state.verticalSpeedFpm);
  ctx.fillStyle = vs > 200 ? GREEN : vs < -200 ? AMBER : '#bcd8ea';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${vs >= 0 ? '+' : ''}${vs} FPM`, 22, 84);
  ctx.fillStyle = state.terrainWarning ? RED : '#bcd8ea';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(state.terrainWarning ? '▲ TERRAIN!' : '— CLEAR —', 22, 106);

  panel(ctx, 12, 126, 150, 84);
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 11px monospace';
  ctx.fillText('AIRSPEED', 22, 146);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`${Math.round(state.speedKts)}`, 22, 176);
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#bcd8ea';
  ctx.fillText('KTS', 132, 176);
  ctx.fillStyle = state.speedKts < 70 && !state.onGround ? RED : '#bcd8ea';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(state.speedKts < 70 && !state.onGround ? '⚠ STALL' : 'THR ' + Math.round(state.throttle * 100) + '%', 22, 200);
}

/** Right column: fuel, damage, score, rings, throttle. */
export function drawStatusPanel(ctx, state) {
  const x = VIEW.width - 182;
  panel(ctx, x, 10, 170, 168);
  ctx.fillStyle = CYAN;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SKYLARK RUN', x + 10, 28);
  bar(ctx, x + 10, 38, 150, 18, state.fuel / 100, lowFuel(state) ? RED : GREEN, `FUEL ${Math.round(state.fuel)}%`);
  bar(ctx, x + 10, 62, 150, 18, state.damage / 100, state.damage > 60 ? RED : AMBER, `DAMAGE ${Math.round(state.damage)}%`);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`SCORE ${state.score}`, x + 10, 108);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 14px monospace';
  const ringsText = '◉ '.repeat(state.ringsPassed) + '○ '.repeat(6 - state.ringsPassed);
  ctx.fillText(ringsText, x + 10, 132);
  ctx.fillStyle = '#bcd8ea';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`RINGS ${state.ringsPassed}/6`, x + 10, 150);
  bar(ctx, x + 10, 158, 150, 12, state.throttle, state.boost ? '#ff9d4d' : CYAN, state.boost ? 'BOOST!' : 'THROTTLE');
}

/** Centre message banner (ring passed, warnings, pit stop). */
export function drawMessageBanner(ctx, state) {
  if (!state.message || state.messageTimer <= 0) return;
  const alpha = Math.min(1, state.messageTimer);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 20px monospace';
  const width = ctx.measureText(state.message).width + 36;
  const x = (VIEW.width - width) / 2;
  panel(ctx, x, 84, width, 40);
  ctx.fillStyle = '#ffd94d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, VIEW.width / 2, 105);
  ctx.restore();
}

/** Bottom-right minimap: the whole archipelago, rings, runway and the plane. */
export function drawMinimap(ctx, state, terrainCanvas) {
  const w = 190;
  const h = 138;
  const x = VIEW.width - w - 12;
  const y = VIEW.height - h - 12;
  panel(ctx, x, y, w, h);
  const scale = Math.min(w / 3600, h / 2600);
  const ox = x + (w - 3600 * scale) / 2;
  const oy = y + (h - 2600 * scale) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(terrainCanvas, ox, oy, 3600 * scale, 2600 * scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(RUNWAY.x * scale + ox - 5, RUNWAY.y * scale + oy - 1.5, 10, 3);
  for (const ring of state.rings) {
    ctx.fillStyle = ring.passed ? GREEN : '#ffd94d';
    ctx.beginPath();
    ctx.arc(ring.x * scale + ox, ring.y * scale + oy, ring.passed ? 3 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const px = state.x * scale + ox;
  const py = state.y * scale + oy;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0b2233';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py - 6);
  ctx.lineTo(px + 4.5, py + 5);
  ctx.lineTo(px - 4.5, py + 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#bcd8ea';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ARCHIPELAGO', x + 6, y + 12);
}

/** Off-screen direction arrow to the next objective when it is not visible. */
export function drawObjectiveArrow(ctx, state, camera) {
  const objective = nextObjective(state);
  const sx = objective.x - camera.x + VIEW.width / 2;
  const sy = objective.y - camera.y + VIEW.height / 2;
  if (sx > 40 && sx < VIEW.width - 40 && sy > 40 && sy < VIEW.height - 40) return;
  const angle = Math.atan2(sy - VIEW.height / 2, sx - VIEW.width / 2);
  const cx = VIEW.width / 2 + Math.cos(angle) * 260;
  const cy = VIEW.height / 2 + Math.sin(angle) * 200;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-8, -11);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const dist = Math.round(Math.hypot(objective.x - state.x, objective.y - state.y) / 100) * 100;
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${objective.label} · ${dist} FT · ${objective.alt}`, cx, cy + 26);
}

/** Bottom-left control reminder, small so it never fights the instruments. */
export function drawControlsHint(ctx) {
  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('W/S THROTTLE · A/D TURN · ↑/↓ PITCH · CLICK BOOST · SPACE BRAKE · P PAUSE · R RESTART', 12, VIEW.height - 14);
}
