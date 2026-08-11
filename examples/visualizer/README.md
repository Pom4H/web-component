# The Night Shift

`examples/visualizer/` is a playable first-person indie-horror vertical slice built with Skein and native browser APIs. It is deliberately game-shaped rather than a renderer toy: the root component declares a small world, while the scene component owns first-person control, collision, enemy AI, WebGL2 rendering and synthesized audio.

```text
visualizer-app
  game world data
    player / NPC / enemy
    walls / props / lockers
    fuse / power panel / exit
        ↓ DOM property
visualizer-scene
  first-person controller
  collision + interaction
  patrol → suspicion → search → chase AI
  native WebGL2 + Web Audio
        ↓ game-state CustomEvent
visualizer-app
   ├─ visualizer-hud
   └─ visualizer-dialogue
```

There is no game-engine dependency, virtual DOM, store or component bus.

## Story

You answer a night call from a research ward that should have been closed for years. Dr. Mira Vale appears behind reception glass and tells you the magnetic exit has lost power. A spare fuse is in Archive B.

The corridor is occupied by Elias, Patient 06. He reacts to sight and sound. Once the player restores power, the story changes: the voice on the intercom identifies the player as Patient 07. Reaching the exit reveals the final detail about Mira.

The full loop is intentionally short enough to function as an example rather than a standalone game.

## Mechanics

- first-person mouse look and WASD movement;
- sprint with stamina;
- crouch for slower, quieter movement;
- enemy field-of-view plus line-of-sight tests;
- running and nearby footsteps produce detectable noise;
- AI states: dormant, patrol, suspicion, search and chase;
- last-known-position pursuit after line of sight breaks;
- lockers that break sight and create a hiding state;
- NPC dialogue with branching choices;
- story objectives and interaction prompts;
- scripted scare on the fuse pickup;
- capture jumpscare with synthesized noise/audio;
- short escape ending and restart flow.

## Controls

```text
W A S D       move
mouse         look
Shift         sprint
C             crouch
E             interact / talk / hide / use
Esc           release pointer lock
```

Click inside the game to capture the mouse and initialize Web Audio.

## Why the API is engine-shaped

The public example code lives in `visualizer-app` and reads like a tiny Unity/UE scene declaration instead of WebGL setup code:

```js
this.game = {
  player: { spawn, yaw },
  npc: { id, name, position },
  enemy: { position, patrol, speed, chaseSpeed },
  walls: [...],
  props: [...],
  lockers: [...],
  fuse,
  panel,
  exit
}
```

The renderer, shaders, collision helpers, hearing/vision model and update loop stay inside `visualizer-scene`. UI state leaves that component through one bubbling + composed `game-state` event. Dialogue choices and restart commands return as ordinary native events.

## Validation

```bash
node tools/skein-check.mjs examples/visualizer/index.html
node tools/skein-inspect.mjs examples/visualizer/index.html --manifest
node test/game-model.mjs
node test/visualizer.mjs
node test/mobile-visualizer.mjs
```

The browser regression covers WebGL mount, world contracts, NPC dialogue branching, transition into the stealth phase and story reset. The mobile regression covers responsive viewport and dialogue layout; the first-person control scheme itself is currently desktop-oriented.
