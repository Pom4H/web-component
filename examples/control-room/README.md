# Typed Control Room

A larger Skein example built to exercise the agent-facing type checker rather than only demonstrate rendering.

It has eight components and a nested domain model:

```text
control-app
├─ control-summary-strip → control-kpi ×4
├─ control-unit-grid → control-unit-card ×N → control-sensor-list
├─ control-unit-inspector
└─ control-alarm-feed
```

The component contracts use ordinary zero-runtime JSDoc casts on `input()` fallbacks:

```js
input('value', /** @type {number} */ (0))
input('unit', /** @type {Unit} */ ({ ...fallback }))
```

Skein ignores the comment at runtime. `tools/skein-check.mjs` uses it as an explicit cross-component contract. Richer owner values remain assignable by normal structural typing.

Run:

```bash
node tools/skein-check.mjs examples/control-room/index.html
```

The checker validates nested binding paths, `each` item scopes, event handlers, native properties, child input names, and explicitly typed child property values.

## Agent exercise

A coding agent can now make a non-trivial domain change with a deterministic guardrail. For example: add a `maintenance` object to every unit, create a `<control-maintenance-panel>` receiving the selected unit, and surface the next service date. Update the `Unit` contracts as you propagate the shape. The task is complete only when `skein-check` returns zero errors.

## Design-time inspection

The same example also exercises Skein's semantic project model:

```bash
node tools/skein-inspect.mjs examples/control-room/index.html control-unit-card
node tools/skein-inspect.mjs examples/control-room/index.html --manifest
```

The model is derived from the application itself: typed `input()` declarations, native `CustomEvent`s, slots, shadow parts, CSS `@property`, child components and reverse dependencies. No separate manifest is authored. Because `select-unit` is `bubbles:true` + `composed:true`, the model also exposes it as a public bubbled event on `control-unit-grid` and `control-app` without requiring relay handlers.
