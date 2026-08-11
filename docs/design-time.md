# Skein design-time model

Skein keeps the browser runtime small and moves optional project intelligence to design time. The model is derived from the same HTML, JavaScript and CSS that the browser runs; there is no separate component manifest to maintain.

## Inspect a project

From an entry page:

```bash
node tools/skein-inspect.mjs examples/control-room/index.html
```

Inspect one component:

```bash
node tools/skein-inspect.mjs examples/control-room/index.html control-unit-card
```

Emit a machine-readable project manifest for coding agents or other tools:

```bash
node tools/skein-inspect.mjs examples/control-room/index.html --manifest
```

## What is inferred

The first design-time model derives these contracts directly from Web Platform primitives:

| Source | Design-time contract |
| --- | --- |
| `input('name', /** @type {...} */ fallback)` | component inputs and optional explicit types |
| `new CustomEvent('name', ...)` | emitted events, detail keys, bubbling/composition flags |
| nested custom-element tags | component dependency graph |
| bubbling + composed descendant events | public/bubbled events visible through composition |
| `<slot>` | named and default slots |
| `part="..."` | shadow parts |
| CSS `@property --name` | typed CSS custom properties |
| tag-to-file mapping | component vocabulary and source locations |

For example, `control-unit-card` currently produces a contract like:

```text
control-unit-card
  inputs:
    unit: Unit
    selectedId: string
  emits:
    select-unit { id } [bubbles+composed]
  slots: actions
  parts: surface, header, load
  css properties:
    --load: <number> = 0
  children: control-sensor-list
  used by: control-unit-grid
```

`control-unit-grid` does not dispatch `select-unit` itself. The model still exposes the event as a bubbled public event because the descendant event is both `bubbles:true` and `composed:true`. That matches Skein's native composition contract and avoids fake relay/output declarations on intermediate components.

## Agent use

The manifest is intended to become the compact semantic index a coding agent reads before changing a component graph. An agent can discover inputs, outputs, styling surfaces, dependencies and reverse dependencies without opening every component file.

`tools/skein-check.mjs` remains the deterministic validation gate. `tools/skein-inspect.mjs` answers structural questions about the project. They are both development-only tools and add zero bytes to `skein.min.js`.

## Current boundary

The model intentionally reports what can be derived reliably without inventing a new Skein runtime API. Event detail currently records object-literal keys rather than a full TypeScript type, CSS `@property` syntax is indexed but not yet checked against bound values, and `exportparts` is not yet modeled. These are natural next consumers of the same project model.
