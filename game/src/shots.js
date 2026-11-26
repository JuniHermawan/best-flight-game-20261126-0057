// Skylark Run — screenshot scenes behind ?shot=start|flight|rings|landing.
// Each scene plays the real flight model forward from a fresh sortie, steered
// by a simple autopilot (turn toward the objective, hold the ring's altitude
// band, glide the slope home), so every frame is what real play looks like
// and the same seed always gives the same frame.
import { RUNWAY, RINGS } from './config.js';
import { freshPlaneState, stepPlane, nextObjective, EVENT_LANDED, EVENT_CRASHED } from './physics.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_LANDED, SCREEN_CRASHED } from './render.js';

const SAMPLE = 1 / 30;
const FLIGHT_SECONDS = 14;
const RINGS_SECONDS = 30;
const LANDING_LIMIT_SECONDS = 40;

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * One autopilot decision: which controls to hold this frame to chase the
 * next objective at a sensible speed and altitude.
 */
export function autopilotControls(state) {
  const objective = nextObjective(state);
  const ring = state.rings.find((item) => !item.passed);
  // On the ground, or still low after rotation, hold the runway heading:
  // the climb-out corridor is flat, the hills north of it are not. The
  // first gate sits east, down the corridor, so the climb is the route.
  const climbingOut = state.onGround || state.altitudeFt < 250;
  let desiredHeading;
  let targetAltitude;
  let targetSpeed = 175;
  let distance;
  if (!ring) {
    // Landing is a pattern, not a dive: shedding 700 ft at 45 ft/s takes
    // over 2,000 units of flying, so the approach is two legs — a descent
    // to the open-sea point east of the corridor, then final west down the
    // flat corridor to the strip. The sea lane keeps the descent clear of
    // every island; the direction follows the aircraft's heading, never
    // its position, so crossing the centre mid-final cannot flip the turn.
    const westbound = Math.cos(state.heading) < 0;
    const thresholdX = westbound ? RUNWAY.x + RUNWAY.length / 2 : RUNWAY.x - RUNWAY.length / 2;
    const distThreshold = Math.hypot(thresholdX - state.x, RUNWAY.y - state.y);
    const descentPoint = { x: 1800, y: 1300 };
    const distDescent = Math.hypot(descentPoint.x - state.x, descentPoint.y - state.y);
    if (distThreshold > 650 && distDescent > 300) {
      // Descent leg: hold 250 ft until close to the descent point — the
      // ground north of the corridor rises to ~100 ft, and following the
      // slope down early flies the aircraft straight into that hillside.
      // Inside 500 units, join the slope itself for the final.
      desiredHeading = Math.atan2(-(descentPoint.y - state.y), descentPoint.x - state.x);
      targetSpeed = 80;
      targetAltitude = distDescent > 500 ? 250 : Math.max(80, 12 + distThreshold * 0.1);
      distance = distDescent;
    } else {
      // Final: steer at the runway centre so a lateral offset is corrected;
      // once close in, hold the strip heading instead, so passing the
      // centre cannot swing the nose around.
      targetSpeed = 100;
      // A 0.10 slope at 100 kts needs ~16 ft/s of sink — inside the 45 ft/s
      // the wing can give — so the aircraft can actually track it home.
      targetAltitude = Math.max(12, 12 + distThreshold * 0.1);
      if (distThreshold < 250) {
        targetAltitude = 12;
        desiredHeading = state.heading; // hold the strip heading, flare and settle
      } else {
        desiredHeading = Math.atan2(-(RUNWAY.y - state.y), RUNWAY.x - state.x);
      }
      distance = distThreshold;
    }
  } else {
    const dx = objective.x - state.x;
    const dy = objective.y - state.y;
    distance = Math.hypot(dx, dy);
    desiredHeading = climbingOut ? 0 : Math.atan2(-dy, dx);
    targetAltitude = (ring.altMinFt + ring.altMaxFt) / 2;
    // Slow right down near a gate: at 122 kts the turn radius (~200) is
    // wider than the ring, and the aircraft orbits it forever instead of
    // flying through it. At 80 kts the turn fits inside the ring.
    if (distance < 500) targetSpeed = 80;
    else if (distance < 1200) targetSpeed = 140;
  }
  const headingError = wrapAngle(desiredHeading - state.heading);
  const controls = {
    throttleUp: false,
    throttleDown: false,
    turnLeft: false,
    turnRight: false,
    pitchUp: false,
    pitchDown: false,
    brake: false,
    boost: false,
  };
  if (headingError > 0.06) controls.turnLeft = true;
  if (headingError < -0.06) controls.turnRight = true;

  // Tight deadband on final: a ±20 ft window floats the aircraft above the
  // slope and off the far end of the strip.
  const deadband = ring ? 20 : 8;
  if (state.altitudeFt < targetAltitude - deadband) controls.pitchUp = true;
  if (state.altitudeFt > targetAltitude + deadband) controls.pitchDown = true;
  // Flare: under 30 ft on final, hold the descent near -360 fpm — fast
  // enough to reach the strip, gentle enough to land on it. It starts low
  // on purpose: flaring from 45 ft floats the aircraft past the far end.
  if (!ring && state.altitudeFt < 30) {
    if (state.verticalSpeedFpm < -420) {
      controls.pitchUp = true;
      controls.pitchDown = false;
    } else if (state.verticalSpeedFpm > -300) {
      controls.pitchDown = true;
      controls.pitchUp = false;
    }
  }
  if (state.speedKts < targetSpeed - 6) controls.throttleUp = true;
  if (state.speedKts > targetSpeed + 6) controls.throttleDown = true;
  if (distance < 260 && !ring) controls.brake = state.speedKts > 130;
  return controls;
}

/** Step the plane forward for `seconds` with the autopilot at the controls. */
function flyForward(state, seconds) {
  let events = 0;
  for (let t = 0; t < seconds; t += SAMPLE) {
    events |= stepPlane(state, autopilotControls(state), SAMPLE);
    if (state.crashed || state.landed) break;
  }
  return events;
}

/**
 * Set `state` to the named scene and return the screen to draw over it.
 * start: parked on the runway under the title. flight: climbing out toward
 * ring 1. rings: mid-route between gates. landing: on final, all rings flown,
 * autopilot brings her home.
 */
export function stageShot(name, state) {
  if (name === 'flight') {
    flyForward(state, FLIGHT_SECONDS);
    return { screen: state.crashed ? SCREEN_CRASHED : SCREEN_PLAY };
  }
  if (name === 'rings') {
    flyForward(state, RINGS_SECONDS);
    return { screen: state.crashed ? SCREEN_CRASHED : SCREEN_PLAY };
  }
  if (name === 'landing') {
    for (const ring of state.rings) ring.passed = true;
    state.ringsPassed = state.rings.length;
    state.x = RUNWAY.x + 1150;
    state.y = RUNWAY.y;
    state.heading = Math.PI; // westbound, down the slope to Runway 27
    state.headingDeg = 270;
    state.speedKts = 105;
    state.altitudeFt = 150;
    state.verticalSpeedFpm = -500;
    state.throttle = 0.3;
    state.fuel = 42;
    state.onGround = false;
    state.time = 0;
    const events = flyForward(state, LANDING_LIMIT_SECONDS);
    if (events & EVENT_LANDED) return { screen: SCREEN_LANDED };
    if (state.crashed) return { screen: SCREEN_CRASHED };
    return { screen: SCREEN_PLAY };
  }
  // start (and any unknown name): title over the parked aircraft.
  return { screen: SCREEN_TITLE };
}

export function freshShotState() {
  return freshPlaneState();
}
