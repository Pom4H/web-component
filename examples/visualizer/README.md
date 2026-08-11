# Skein Reactive Matter

A zero-dependency WebGL2 application that turns Skein's reactive graph into a living field while using the same composition model it explains.

## Component graph

```text
visualizer-app
└─ visualizer-shell
   ├─ mast                 slot=mast
   ├─ visualizer-scene     slot=scene
   ├─ visualizer-controls  slot=controls
   └─ visualizer-inspector slot=inspector
```

## Visual model

The scene is intentionally not a row of 3D architecture boxes.

- reactive properties are source nodes;
- dependency edges are luminous fibers;
- reactive reads reveal/weave those fibers;
- a state write creates a local shockwave at one property;
- only that property's dependency closure lights up;
- the microtask phase collapses activity into one converging wavefront;
- commit pulses terminate at real DOM targets;
- the `textContent` target is an actual Skein text binding and visibly changes only on the commit phase;
- pointer motion behaves like a temporary force field and bends the dependency fibers instead of orbiting a camera.

## What the example proves

- **WebGL stays imperative.** The frame loop owns shaders, GPU buffers, fibers, particles and pointer deformation instead of forcing animation frames through reactive DOM state.
- **Skein owns application state.** `selected`, `running`, `speed`, `energy` and the explicit write trigger live in `visualizer-app`.
- **Properties flow down.** Scene, controls and inspector receive live values as DOM property inputs.
- **Events flow up.** Property selection, stage selection, controls and write actions use bubbling, composed `CustomEvent`s.
- **Slots compose layout.** `visualizer-shell` uses ordinary named `<slot>` elements.
- **Keyed DOM stays real.** Runtime-stage buttons and reactive-property buttons are keyed Skein lists layered over native WebGL.
- **Exact DOM commit is visible.** WebGL carries the pulse, but the destination is ordinary DOM text updated by Skein.
- **CSS custom-property bindings bridge state into visuals.** Root energy and per-node accent colors remain fine-grained CSS declarations.
- **Lifecycle cleanup is explicit.** `requestAnimationFrame`, `ResizeObserver` and commit timers are torn down with `onCleanup()`.

The boundary is intentional: **Skein coordinates the system; WebGL renders the continuous medium; DOM remains DOM.** The example adds no Three.js scene graph, event bus or second application state system.
