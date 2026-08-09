# Skein Pipeline Visualizer

A zero-dependency WebGL2 application that visualizes Skein's own reactive pipeline while using the same composition model it explains.

## Component graph

```text
visualizer-app
└─ visualizer-shell
   ├─ mast                 slot=mast
   ├─ visualizer-scene     slot=scene
   ├─ visualizer-controls  slot=controls
   └─ visualizer-inspector slot=inspector
```

## What the example proves

- **WebGL stays imperative.** The render loop owns GPU buffers, camera movement and per-frame drawing instead of forcing 60 FPS through reactive DOM state.
- **Skein owns application state.** `selected`, `running`, `speed` and `energy` live in `visualizer-app`.
- **Properties flow down.** Scene, controls and inspector receive live values as DOM property inputs.
- **Events flow up.** The scene and controls emit bubbling, composed `CustomEvent`s.
- **Slots compose layout.** `visualizer-shell` uses ordinary named `<slot>` elements.
- **Keyed DOM overlays remain stable.** The 3D stage labels are a keyed Skein list while their projected screen positions are updated imperatively.
- **CSS custom-property bindings bridge state into visuals.** The application binds `--energy` into the scene and each projected stage owns a reactive `--accent` declaration.
- **Lifecycle cleanup is explicit.** `requestAnimationFrame` and `ResizeObserver` are torn down with `onCleanup()`.

The important boundary is intentional: Skein coordinates state and components; WebGL renders pixels. The example does not add Three.js, a scene graph, an event bus or a second state system.
