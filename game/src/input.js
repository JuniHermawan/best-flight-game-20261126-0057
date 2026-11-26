// Skylark Run — keyboard and mouse input: one object, booleans only.
// The game reads this every frame; nothing here knows about the flight model.
import { KEYS } from './config.js';

function keysInclude(list, code) {
  return list.indexOf(code) !== -1;
}

/** Fresh input state: every control released, mouse up. */
export function freshInput() {
  return {
    keys: new Set(),
    mouseDown: false,
    mouseX: 0,
    mouseY: 0,
    anyKeyPressed: false,
  };
}

/** Control snapshot the physics step consumes this frame. */
export function readControls(input) {
  const k = input.keys;
  const any = (list) => list.some((code) => k.has(code));
  return {
    throttleUp: any(KEYS.throttleUp),
    throttleDown: any(KEYS.throttleDown),
    turnLeft: any(KEYS.turnLeft),
    turnRight: any(KEYS.turnRight),
    pitchUp: any(KEYS.pitchUp),
    pitchDown: any(KEYS.pitchDown),
    brake: any(KEYS.brake),
    boost: input.mouseDown,
    restart: any(KEYS.restart),
    pause: any(KEYS.pause),
    start: any(KEYS.start),
  };
}

/** Wire keyboard and mouse listeners onto the canvas; returns a detach function. */
export function attachInput(canvas, input) {
  function onKeyDown(event) {
    if (keysInclude(KEYS.brake, event.code)) event.preventDefault();
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') event.preventDefault();
    input.keys.add(event.code);
    input.anyKeyPressed = true;
  }
  function onKeyUp(event) {
    input.keys.delete(event.code);
  }
  function onMouseDown(event) {
    input.mouseDown = true;
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
    input.anyKeyPressed = true;
  }
  function onMouseUp(event) {
    input.mouseDown = false;
    input.mouseX = event.clientX;
    input.mouseY = event.clientY;
  }
  function onBlur() {
    input.keys.clear();
    input.mouseDown = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  return function detachInput() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('blur', onBlur);
  };
}
