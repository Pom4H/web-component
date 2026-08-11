# Curvature Arena

`examples/visualizer/` is now a game-world vertical slice rather than a diagram of Skein internals.

The domain is deliberately small but engine-shaped:

```text
declarative world
  fields[] + rules
        ↓ typed DOM properties
fixed-step simulation
  input → forces → integrate → collisions → pickups
        ↓
native WebGL2 renderer
        ↓
bubbling + composed world events
        ↓
Skein state / HUD / inspector
```

There is no game-engine dependency and no second UI state system.

## Mathematics

The player body is integrated at a fixed simulation rate (`120 Hz` by default) with semi-implicit Euler:

```text
v[n+1] = clamp(v[n] + a Δt)
x[n+1] = x[n] + v[n+1] Δt
```

Acceleration combines four terms:

```text
a =
  Σ μ r / (|r|² + ε²)^(3/2)       gravity / repulsor
  + κ (ŷ × r) / (|r|² + ε²)       vortex / curl field
  - γ v                             linear damping
  + u                               player thrust
```

The arena is a sphere. Crossing the boundary projects the body back to the surface and reflects the outward velocity component with restitution `e`.

The renderer also samples the same force function on a sparse 3D lattice, so the vectors visible in the scene are the actual field used by physics rather than decorative lines.

## Why this is a useful game-engine domain

The example has the pieces a small engine needs without inventing a Skein-specific runtime abstraction:

- a declarative world schema (`Field[]`, `Rules`);
- deterministic fixed-step simulation with render interpolation;
- input as a system;
- force/physics and collision systems;
- collectibles and score as game rules;
- continuous WebGL rendering;
- game events (`world-telemetry`, `world-impact`, `core-collect`);
- typed component boundaries;
- a design-time semantic graph for coding agents.

The world declaration lives in `visualizer-app` and is passed to the simulation through ordinary DOM properties. Changing that declaration changes both runtime behavior and the design-time type contract.

## Design-time inspection

```bash
node tools/skein-check.mjs examples/visualizer/index.html
node tools/skein-inspect.mjs examples/visualizer/index.html visualizer-scene
node tools/skein-inspect.mjs examples/visualizer/index.html --manifest
```

The semantic model derives the scene inputs, emitted world events, shadow parts and typed CSS custom properties from the same source the browser runs.

## Controls

- drag inside the scene: screen-space thrust;
- `W A S D`: planar thrust;
- `Q / E`: depth thrust;
- **pause world**: stop fixed-step integration while rendering continues;
- **time**: simulation time scale;
- **field**: scale all field forces;
- **reset orbit**: deterministic world reset.

Run the browser regression with:

```bash
node test/visualizer.mjs
```
