// Skylark Run — shared tuning numbers for the whole game.
// One place for every speed, altitude, fuel and scoring constant so the
// flight model, the HUD and the screenshot autopilot all agree.
export const GAME_TITLE = 'Skylark Run';
export const GAME_SUBTITLE = 'Archipelago Airlift';

export const VIEW = { width: 1280, height: 720 };

export const WORLD = { width: 3600, height: 2600, seed: 20261126 };

export const PLANE = {
  maxSpeedKts: 240,
  boostMaxSpeedKts: 330,
  stallSpeedKts: 70,
  accelKtsPerSec: 55,
  decelKtsPerSec: 40,
  turnRateRadPerSec: 1.15,
  climbRateFtPerSec: 90,
  sinkRateFtPerSec: 45,
  stallSinkFtPerSec: 14,
  cruiseAltitudeFt: 900,
};

export const FUEL = {
  start: 100,
  baseDrainPerSec: 0.22,
  throttleDrainPerSec: 0.5,
  boostDrainPerSec: 2.1,
  lowWarning: 25,
};

export const DAMAGE = {
  hardLanding: 35,
  roughLanding: 35,
  mountainGraze: 10,
  max: 100,
};

export const RUNWAY = {
  x: 600,
  y: 1300,
  headingDeg: 90,
  length: 460,
  width: 52,
  name: 'RWY 09 · SKYLARK FIELD',
};

// Six rings across the archipelago, in mission order. Each ring must be flown
// through inside its altitude band; the bands climb to the summit, then ease
// down for the run home — and every ring sits over low ground or open water,
// so its band is always flyable.
export const RINGS = [
  { x: 1900, y: 1100, altMinFt: 150, altMaxFt: 450, radius: 150, name: 'Coral Gate' },
  { x: 2300, y: 950, altMinFt: 300, altMaxFt: 700, radius: 150, name: 'Twin Peak Gate' },
  { x: 3300, y: 1300, altMinFt: 450, altMaxFt: 900, radius: 150, name: 'Lagoon Gate' },
  { x: 3250, y: 2250, altMinFt: 600, altMaxFt: 1000, radius: 150, name: 'Summit Gate' },
  { x: 1850, y: 2250, altMinFt: 550, altMaxFt: 950, radius: 150, name: 'Palm Gate' },
  { x: 950, y: 2100, altMinFt: 300, altMaxFt: 600, radius: 150, name: 'Home Gate' },
];

export const SCORING = {
  ringPoints: 100,
  smoothLandingMaxBonus: 400,
  fuelBonusPerPoint: 3,
};

// Landing judgement windows, in feet per minute of descent.
export const LANDING = {
  smoothVsFpm: 600,
  hardVsFpm: 1100,
  maxTouchdownKts: 175,
  minTouchdownKts: 65,
  headingToleranceDeg: 28,
};

export const KEYS = {
  throttleUp: ['KeyW', 'Equal'],
  throttleDown: ['KeyS', 'Minus'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  pitchUp: ['ArrowUp', 'KeyI'],
  pitchDown: ['ArrowDown', 'KeyK'],
  brake: ['Space'],
  restart: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  start: ['Enter'],
};
