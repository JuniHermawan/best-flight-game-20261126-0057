// Skylark Run — the flight model: throttle, turn, pitch, fuel, damage,
// ring passes, landings and crashes. Pure state in, state out; rendering
// never touches these numbers.
import { PLANE, FUEL, DAMAGE, RUNWAY, LANDING, SCORING } from './config.js';
import { terrainHeightAt, onRunwayAt, distanceTo, freshRings, inClimbCorridor } from './world.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_REFUELLED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_HARD_LANDING = 16;

export const KTS_TO_UNITS = 1.6;

/** A fresh sortie: parked on the runway, engine off, tanks full. */
export function freshPlaneState() {
  return {
    x: RUNWAY.x - 100,
    y: RUNWAY.y,
    heading: 0, // east, down the runway (headingDeg 90); 0 rad = east, +PI/2 = north
    headingDeg: 90,
    speedKts: 0,
    altitudeFt: 12,
    verticalSpeedFpm: 0,
    throttle: 0,
    fuel: FUEL.start,
    damage: 0,
    score: 0,
    ringsPassed: 0,
    rings: freshRings(),
    landed: false,
    crashed: false,
    crashReason: '',
    onGround: true,
    boost: false,
    message: '',
    messageTimer: 0,
    grazeTimer: 0,
    terrainWarning: false,
    time: 0,
  };
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * Advance the plane one step. `input` is { throttleUp, throttleDown,
 * turnLeft, turnRight, pitchUp, pitchDown, brake, boost } booleans.
 * Returns an event bitmask (ring passed, landed, crashed, ...).
 */
export function stepPlane(state, input, dt) {
  if (state.crashed || state.landed) return EVENT_NONE;
  state.time += dt;
  let events = EVENT_NONE;

  const engineOut = state.fuel <= 0;
  if (input.throttleUp && !engineOut) state.throttle = Math.min(1, state.throttle + dt * 0.9);
  if (input.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.9);
  state.boost = Boolean(input.boost) && state.throttle > 0.25 && !engineOut && state.fuel > 0;

  // --- speed: throttle drives toward a target speed; brake and drag bleed it.
  const targetSpeed = engineOut
    ? 0
    : state.boost
      ? PLANE.boostMaxSpeedKts
      : state.throttle * PLANE.maxSpeedKts;
  // On the ground the wheels brake hard once the throttle comes back.
  const decelRate = state.onGround && targetSpeed < state.speedKts ? 140 : PLANE.decelKtsPerSec;
  const accel = targetSpeed > state.speedKts ? PLANE.accelKtsPerSec : decelRate;
  state.speedKts += Math.max(-accel * dt, Math.min(accel * dt, targetSpeed - state.speedKts));
  if (input.brake) state.speedKts = Math.max(0, state.speedKts - 90 * dt);
  if (state.onGround && state.speedKts < 55) state.speedKts = Math.max(0, state.speedKts - 20 * dt);

  // --- turn: banking turn, weaker near stall. On the ground the nosewheel
  // barely steers, and not at all at speed — no turning off the strip.
  const stalled = state.speedKts < PLANE.stallSpeedKts;
  const turnAuthority = stalled ? 0.35 : 1;
  const turnRate = state.onGround
    ? (state.speedKts < 60 ? 0.15 : 0.02)
    : PLANE.turnRateRadPerSec * turnAuthority * (1 - 0.45 * (state.speedKts / PLANE.boostMaxSpeedKts));
  if (input.turnLeft) state.heading = wrapAngle(state.heading + turnRate * dt);
  if (input.turnRight) state.heading = wrapAngle(state.heading - turnRate * dt);
  // Heading convention: 0 = east, positive = north (screen up). headingDeg is
  // the compass reading the HUD shows (0 = north, 90 = east).
  state.headingDeg = (90 - (state.heading * 180) / Math.PI + 360) % 360;

  // --- vertical: pitch sets a target vertical speed; below stall the wing quits.
  // With no pitch input an airborne plane settles gently instead of hovering.
  let targetVsFpm = 0;
  if (input.pitchUp) targetVsFpm = PLANE.climbRateFtPerSec * 60;
  if (input.pitchDown) targetVsFpm = -PLANE.sinkRateFtPerSec * 60;
  if (!input.pitchUp && !input.pitchDown && !state.onGround) targetVsFpm = -150;
  if (stalled && !state.onGround) targetVsFpm = Math.min(targetVsFpm, -PLANE.stallSinkFtPerSec * 60);
  if (state.onGround && state.speedKts < 75) targetVsFpm = Math.min(targetVsFpm, 0);
  const vsRate = 1500;
  state.verticalSpeedFpm += Math.max(-vsRate * dt, Math.min(vsRate * dt, targetVsFpm - state.verticalSpeedFpm));
  state.altitudeFt += (state.verticalSpeedFpm / 60) * dt;

  // --- move over the ground.
  const unitsPerSec = state.speedKts * KTS_TO_UNITS;
  state.x += Math.cos(state.heading) * unitsPerSec * dt;
  state.y -= Math.sin(state.heading) * unitsPerSec * dt;
  state.x = Math.max(40, Math.min(3560, state.x));
  state.y = Math.max(40, Math.min(2560, state.y));

  // Rolling off the strip at speed is an overrun, not a taxi.
  if (state.onGround && !onRunwayAt(state.x, state.y) && state.speedKts > 90) {
    return crashPlane(state, 'Ran off the strip into rough ground');
  }
  if (state.grazeTimer > 0) state.grazeTimer -= dt;

  // --- fuel: throttle burns it, boost burns it fast.
  if (!state.onGround || state.speedKts > 10) {
    let drain = FUEL.baseDrainPerSec + FUEL.throttleDrainPerSec * state.throttle;
    if (state.boost) drain += FUEL.boostDrainPerSec;
    state.fuel = Math.max(0, state.fuel - drain * dt);
  }
  if (engineOut && state.fuel <= 0 && state.messageTimer <= 0) {
    state.message = 'ENGINE OUT — GLIDE TO THE RUNWAY!';
    state.messageTimer = 3;
  }

  // --- terrain warning: ground rising ahead of the nose.
  const groundAhead = terrainHeightAt(
    state.x + Math.cos(state.heading) * 220,
    state.y - Math.sin(state.heading) * 220,
  );
  state.terrainWarning =
    !state.onGround && state.altitudeFt < groundAhead + 320 && state.verticalSpeedFpm < 400;

  // --- rings: inside the circle and inside the altitude band.
  const nextRing = state.rings.find((ring) => !ring.passed);
  if (nextRing) {
    const dist = distanceTo(state.x, state.y, nextRing.x, nextRing.y);
    if (dist < nextRing.radius && state.altitudeFt >= nextRing.altMinFt && state.altitudeFt <= nextRing.altMaxFt) {
      nextRing.passed = true;
      state.ringsPassed += 1;
      state.score += 100;
      state.message = `RING ${state.ringsPassed}/6 — ${nextRing.name.toUpperCase()} +100`;
      state.messageTimer = 2.5;
      events |= EVENT_RING;
    }
  }

  // --- ground contact: runway landing, rough-field landing, or crash.
  // Only a descending aircraft touches down: a plane that has just rotated
  // is inches above the strip but climbing, and must not "land" again.
  const ground = terrainHeightAt(state.x, state.y);
  const onStrip = onRunwayAt(state.x, state.y);
  if (state.altitudeFt <= ground + 2 && !state.onGround && (state.verticalSpeedFpm < -50 || state.altitudeFt <= ground)) {
    if (onStrip) {
      events |= touchdownOnRunway(state, ground);
    } else if (ground > 0) {
      events |= touchdownOffRunway(state, ground);
    } else {
      events |= ditchInWater(state);
    }
  }
  if (state.onGround) {
    // Liftoff: enough speed and the pilot pulling up leaves the ground.
    const takingOff = state.speedKts >= 75 && input.pitchUp && state.verticalSpeedFpm > 0;
    if (takingOff) {
      state.onGround = false;
    } else {
      state.altitudeFt = ground;
      state.verticalSpeedFpm = 0;
    }
  }

  // --- mountain graze: clipping a peak while airborne. One strike, then a
  // short immunity while the pilot climbs away — never a death spiral.
  // The climb-out corridor and the runway strip are flat by design, so they
  // never count as a strike.
  if (!state.onGround && !state.crashed && state.grazeTimer <= 0 && !onRunwayAt(state.x, state.y) && !inClimbCorridor(state.x, state.y) && ground > 0 && state.altitudeFt < ground + 18) {
    state.damage += DAMAGE.mountainGraze;
    state.grazeTimer = 1.5;
    state.message = `TERRAIN STRIKE! DAMAGE +${DAMAGE.mountainGraze}`;
    state.messageTimer = 2;
    if (state.damage >= DAMAGE.max) {
      events |= crashPlane(state, 'Clipped a mountain ridge');
    } else {
      state.altitudeFt = ground + 120;
      state.verticalSpeedFpm = 1200;
    }
  }

  if (state.messageTimer > 0) state.messageTimer -= dt;
  return events;
}

function touchdownOnRunway(state, ground) {
  const descent = -state.verticalSpeedFpm;
  // Runway is bidirectional: compare headings modulo 180 degrees.
  const headingDiff = ((state.headingDeg - RUNWAY.headingDeg + 180) % 360) - 180;
  const aligned = Math.abs(headingDiff) < LANDING.headingToleranceDeg || Math.abs(headingDiff) > 180 - LANDING.headingToleranceDeg;
  const speedOk = state.speedKts >= LANDING.minTouchdownKts && state.speedKts <= LANDING.maxTouchdownKts;
  state.onGround = true;
  state.altitudeFt = ground;
  state.verticalSpeedFpm = 0;
  if (descent > LANDING.hardVsFpm || !speedOk) {
    return crashPlane(state, descent > LANDING.hardVsFpm ? 'Landing too hard — gear collapsed' : 'Touchdown too fast — ran off the strip');
  }
  if (descent > LANDING.smoothVsFpm || !aligned) {
    state.damage += DAMAGE.hardLanding;
    state.speedKts *= 0.4;
    state.altitudeFt = ground + 30;
    state.verticalSpeedFpm = 500;
    state.onGround = false;
    state.message = 'HARD LANDING — BOUNCED! DAMAGE +35';
    state.messageTimer = 2.5;
    if (state.damage >= DAMAGE.max) return crashPlane(state, 'Airframe gave out after the hard landing');
    return EVENT_HARD_LANDING;
  }
  const softness = Math.max(0, 1 - descent / LANDING.smoothVsFpm);
  if (state.ringsPassed >= state.rings.length) {
    const landingBonus = Math.round(100 + softness * SCORING.smoothLandingMaxBonus);
    const fuelBonus = Math.round(state.fuel * SCORING.fuelBonusPerPoint);
    state.score += landingBonus + fuelBonus;
    state.landed = true;
    state.message = `MISSION COMPLETE — LANDING +${landingBonus} · FUEL +${fuelBonus}`;
    state.messageTimer = 6;
    return EVENT_LANDED;
  }
  state.fuel = FUEL.start;
  state.damage = Math.max(0, state.damage - 15);
  state.throttle = 0;
  state.speedKts = 0;
  state.message = 'PIT STOP — REFUELLED · DAMAGE PATCHED · THROTTLE UP TO GO AGAIN';
  state.messageTimer = 4;
  return EVENT_REFUELLED;
}

function touchdownOffRunway(state, ground) {
  const descent = -state.verticalSpeedFpm;
  state.onGround = true;
  state.altitudeFt = ground;
  state.verticalSpeedFpm = 0;
  if (state.speedKts > 90 || descent > LANDING.hardVsFpm) {
    return crashPlane(state, 'Crashed into rough ground');
  }
  state.damage += DAMAGE.roughLanding;
  state.speedKts = 0;
  state.throttle = 0;
  state.message = 'ROUGH-FIELD LANDING — DAMAGE +55 · THROTTLE UP TO TAKE OFF';
  state.messageTimer = 4;
  if (state.damage >= DAMAGE.max) return crashPlane(state, 'Airframe gave out on the rough field');
  return EVENT_HARD_LANDING;
}

function ditchInWater(state) {
  return crashPlane(state, 'Ditched in the sea');
}

export function crashPlane(state, reason) {
  state.crashed = true;
  state.crashReason = reason;
  state.speedKts = 0;
  state.verticalSpeedFpm = 0;
  state.message = reason.toUpperCase();
  state.messageTimer = 6;
  return EVENT_CRASHED;
}

/** Next objective for the HUD compass and guidance line. */
export function nextObjective(state) {
  const ring = state.rings.find((item) => !item.passed);
  if (ring) return { x: ring.x, y: ring.y, label: `RING ${state.ringsPassed + 1}/6`, alt: `${ring.altMinFt}–${ring.altMaxFt} FT` };
  return { x: RUNWAY.x, y: RUNWAY.y, label: 'LAND · RWY 09', alt: 'FINAL' };
}
