// Skylark Run — the archipelago itself: seeded terrain, islands, mountains
// and the home runway. Everything here is deterministic: the same seed always
// builds the same islands, so a screenshot can be reproduced exactly.
import { WORLD, RUNWAY, RINGS } from './config.js';

/** Small deterministic PRNG (mulberry32) so terrain never changes between runs. */
export function makeSeededRandom(seed) {
  let state = seed >>> 0;
  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashGridCell(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 974634211) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0, 1] at world coordinates. */
function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hashGridCell(ix, iy, seed);
  const b = hashGridCell(ix + 1, iy, seed);
  const c = hashGridCell(ix, iy + 1, seed);
  const d = hashGridCell(ix + 1, iy + 1, seed);
  const ux = smoothStep(fx);
  const uy = smoothStep(fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal noise, 4 octaves, in roughly [0, 1]. */
function fractalNoise(x, y, seed) {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 101);
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum;
}

// Island centres: a hand-placed archipelago so the mission route reads as a
// chain of landfalls instead of random blobs.
const ISLANDS = [
  { x: 600, y: 1300, radius: 640, peakFt: 520 }, // home island, Skylark Field
  { x: 1250, y: 880, radius: 330, peakFt: 420 },
  { x: 1920, y: 560, radius: 380, peakFt: 450 }, // Twin Peaks
  { x: 2520, y: 1120, radius: 360, peakFt: 650 },
  { x: 2920, y: 1880, radius: 430, peakFt: 950 }, // Summit island
  { x: 2080, y: 2140, radius: 380, peakFt: 800 },
  { x: 1180, y: 2020, radius: 300, peakFt: 350 },
  { x: 3300, y: 700, radius: 260, peakFt: 900 },
  { x: 300, y: 420, radius: 240, peakFt: 800 },
  { x: 1750, y: 1500, radius: 170, peakFt: 300 }, // small sandbar
];

function islandFalloff(x, y) {
  let land = 0;
  for (const island of ISLANDS) {
    const dx = (x - island.x) / island.radius;
    const dy = (y - island.y) / island.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= 1) continue;
    const bump = Math.cos(d2 * Math.PI * 0.5);
    land = Math.max(land, bump * bump);
  }
  return land;
}

/**
 * Terrain height in feet at a world point: 0 is sea level, negative is open
 * water. The runway strip is flattened so a landing there is always fair.
 */
export function terrainHeightAt(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return -40;
  const land = islandFalloff(x, y);
  if (land <= 0.02) return -40;
  const rough = fractalNoise(x / 420, y / 420, WORLD.seed);
  const detail = fractalNoise(x / 130, y / 130, WORLD.seed + 7) * 0.35;
  let nearestPeak = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dy = y - island.y;
    if (dx * dx + dy * dy < island.radius * island.radius) nearestPeak = Math.max(nearestPeak, island.peakFt);
  }
  const height = land * nearestPeak * (0.45 + 0.55 * rough) + detail * 60 * land;
  return runwayFlatten(x, y, corridorFlatten(x, y, height));
}

/** A low, gentle climb-out corridor east of the runway so rotation is safe.
 * It runs all the way to the open sea at x=2600 — a straight-east climb-out
 * (and the westbound final down the same valley) never meets rising ground. */
export function inClimbCorridor(x, y) {
  return x >= 500 && x <= 2600 && y >= 1080 && y <= 1520;
}

function corridorFlatten(x, y, height) {
  const x0 = 500;
  const x1 = 2600;
  const y0 = 1080;
  const y1 = 1520;
  const margin = 140;
  if (x < x0 - margin || x > x1 + margin || y < y0 - margin || y > y1 + margin) return height;
  const edgeX = Math.max(0, Math.max(x0 - x, x - x1)) / margin;
  const edgeY = Math.max(0, Math.max(y0 - y, y - y1)) / margin;
  const blend = smoothStep(Math.min(1, Math.max(edgeX, edgeY)));
  // 12 ft, the same as the runway: the slope home meets the ground at the
  // threshold itself, never 50 units short of it on the apron.
  return 12 * (1 - blend) + height * blend;
}

/** Keep the runway strip (and a small apron) flat at 12 ft: the whole strip
 * is flat, and the blend happens outside it, never on it. */
function runwayFlatten(x, y, height) {
  const along = Math.abs(x - RUNWAY.x);
  const across = Math.abs(y - RUNWAY.y);
  const beyond = Math.max(along - RUNWAY.length / 2, across - RUNWAY.width / 2);
  if (beyond <= 0) return 12;
  if (beyond >= 80) return height;
  const blend = smoothStep(beyond / 80);
  return 12 * (1 - blend) + height * blend;
}

export function isWaterAt(x, y) {
  return terrainHeightAt(x, y) <= 0;
}

/** True when the point is on the runway strip itself. */
export function onRunwayAt(x, y) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.length / 2 &&
    Math.abs(y - RUNWAY.y) < RUNWAY.width / 2
  );
}

export function headingTo(fromX, fromY, toX, toY) {
  return Math.atan2(-(toY - fromY), toX - fromX);
}

export function distanceTo(fromX, fromY, toX, toY) {
  return Math.hypot(toX - fromX, toY - fromY);
}

/** Mission ring list with a passed flag each; reset between sorties. */
export function freshRings() {
  return RINGS.map((ring) => ({ ...ring, passed: false }));
}

/**
 * Colour a terrain sample for the pre-rendered map: shallow water, sand,
 * grass, forest, rock and snow by height, with a little noise speckle.
 */
export function terrainColourAt(x, y) {
  const h = terrainHeightAt(x, y);
  const speckle = (hashGridCell(Math.floor(x / 7), Math.floor(y / 7), 5) - 0.5) * 14;
  if (h <= 0) {
    const depth = Math.min(1, -h / 60);
    return shade([26 + depth * 10, 94 - depth * 34, 138 - depth * 48], speckle);
  }
  if (h < 26) return shade([232, 213, 163], speckle);
  if (h < 180) return shade([93, 162, 74], speckle);
  if (h < 520) return shade([76, 138, 63], speckle);
  if (h < 950) return shade([47, 107, 51], speckle);
  if (h < 1350) return shade([138, 122, 106], speckle);
  return shade([240, 240, 234], speckle);
}

function shade(rgb, amount) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0] + amount)));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1] + amount)));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2] + amount)));
  return `rgb(${r},${g},${b})`;
}

/** Soft drifting clouds, seeded so screenshots are reproducible. */
export function makeClouds(count) {
  const random = makeSeededRandom(WORLD.seed + 99);
  const clouds = [];
  for (let i = 0; i < count; i += 1) {
    clouds.push({
      x: random() * WORLD.width,
      y: random() * WORLD.height,
      radius: 90 + random() * 170,
      speed: 6 + random() * 10,
      puffs: 3 + Math.floor(random() * 3),
      seed: random() * 100,
    });
  }
  return clouds;
}
