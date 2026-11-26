[![Skylark Run — best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/eager-lark-95/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/eager-lark-95/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Skylark Run — Archipelago Airlift

Fly the island hopper through all six rings — each inside its own altitude
band — then bring her home to Runway 09 before the tanks run dry. A landing
on the strip refuels you; a hard one bends the airframe. Mountains bite below
their peaks, and the sea forgives nothing. Fuel and damage turn every sortie
into a decision: push the throttle, spend the boost, or save it for the
glide home.

## How to play

Serve the game and open it in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

| Control | Action |
| --- | --- |
| W / S | Throttle up / down |
| A / D or ← / → | Turn left / right |
| ↑ / ↓ | Climb / descend (pitch) |
| Mouse click (hold) | Boost — fast, but burns fuel hard |
| Space | Brake |
| P | Pause |
| R | Restart the sortie |
| Enter | Take off from the title screen |

Score: +100 per ring, a smooth-landing bonus up to +400, and a fuel bonus
for what is left in the tanks when the mission completes. Land on the runway
before finishing all six rings for a pit stop: full tanks and a patched
airframe, then throttle up and go again.

## What is inside

- `game/index.html` — the page, one canvas, no network requests.
- `game/src/main.js` — game loop and screen state machine.
- `game/src/world.js` — seeded archipelago: islands, peaks, runway, clouds.
- `game/src/physics.js` — throttle, turn, pitch, fuel, damage, rings, landings, crashes.
- `game/src/render.js` — terrain, rings, aircraft, clouds, title and end screens.
- `game/src/hud.js` — compass, altitude and speed tapes, fuel and damage bars, minimap.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesized WebAudio: engine hum, wind, ring chimes, crash thud.
- `game/src/config.js` — every tuning number in one place.
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=start|flight|rings|landing`).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `serve.ts` — tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's vendored dossier library, unchanged.

All art is drawn in code and all sound is synthesized in WebAudio — no
external assets, no libraries, no network. Original game, original names.
