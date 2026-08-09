# AGENTS.md

This repository contains **Skein**, a zero-dependency HTML-first Web Components runtime for fine-grained reactive native-DOM applications.

## Before changing code

For application syntax, read `llms-full.txt` and `.agents/skills/skein/references/syntax.md`. For renderer/reactivity/lifecycle/performance work, also read `.agents/skills/skein/references/architecture.md`, relevant `runtime/` source and `test/`.

Use `examples/workspace/` as the application-scale composition reference, not only isolated demos.

## Runtime invariants

- zero runtime dependencies;
- no virtual DOM or component-wide rerender loop;
- no user build step required;
- plain objects/arrays are reactive; platform/class objects remain native/opaque;
- one raw object has one Skein Proxy identity across component boundaries;
- `{...}` bindings are strict property paths compiled once;
- binding lookup uses own properties only and walks list scopes outward;
- native dynamic attributes such as `for={inputId}` stay native;
- CSS custom properties use fine-grained `--name={path}` bindings: direct `style.setProperty`, with null/undefined/false removing only that property;
- list repetition uses `each={items}`; explicit keys are unique/non-null and validated before reconciliation mutation;
- synchronous writes share one microtask; render effects settle before user effects;
- list/branch scopes own disposal;
- disconnect pauses, explicit `dispose()` destroys;
- failed mounts roll back fresh scope and partial DOM;
- unknown custom-element source is fetched before Skein claims the tag;
- third-party custom elements are never force-disposed;
- CSS, Shadow DOM, SVG, Canvas, Web Audio and browser APIs stay native.

## Composition contract

Prefer exactly these browser mechanisms:

```text
data      → DOM properties
/actions/ ← bubbling + composed CustomEvent
content   → native <slot>
```

Do not add a component bus, provide/inject protocol, framework slot abstraction or store merely to pass values/actions/content through component trees.

`input(name, fallback)` declares a child input. Initialization precedence is:

```text
pre-mount property > static primitive attribute > fallback
```

Primitive literal attributes are initial configuration only. Their conversion follows fallback type. Objects/functions and all live owner values use `.property={path}`. Later attribute mutation is intentionally not a reactive input channel. Input names cannot shadow HTMLElement/Skein host properties.

Bubbling + `composed:true` events are expected to cross nested Shadow DOM boundaries directly; avoid relay handlers unless an intermediate component intentionally transforms domain semantics.

Do not reintroduce removed public APIs (`batch`, `signal`, `untrack`, `Skein.stats`, `Skein.flush`), `in={...}`, old list `for={...}`, or `onclick={handler}` without an explicit product decision.

## Public API

Production entry: `skein.min.js`. Readable entry: `skein.js`.

```js
Skein.version
Skein.define(tag, source)
```

Injected component helpers: `input`, `computed`, `effect`, `onCleanup`, `host`, `abortSignal`.

## SEO / native media

Skein has no SSR or hydration. Keep static, semantic and SEO-critical content in ordinary document HTML when possible. Never claim SSR/hydration/suspense/error boundaries exist.

Bind state into CSS custom properties with `--name={path}` and let CSS render/animate. Do not replace this with a computed string `style` binding. Keep SVG actual SVG. Keep Canvas/Web Audio imperative. Clean native resources with `onCleanup()` / `abortSignal`.

## Performance rules

Important 0.6.x choices:

- global WeakMaps give shared raw objects one Proxy identity;
- only arrays/plain objects are recursively proxied;
- AbortController and input bookkeeping are lazy;
- sources/paths compile once;
- instructions are compact tuples;
- keys resolve directly and preflight before DOM mutation;
- unknown tags define only after successful source fetch;
- production hot-reload instance/generation machinery is absent.

Do not trade keyed identity, cleanup, input timing or lifecycle correctness merely for bytes.

## Production build

```bash
node tools/build.mjs
node tools/build.mjs --check
```

The minifier is lexical. Never accidentally mangle DOM/public property names. Generated output must be exercised in real Chrome.

## Testing

```bash
node test/run.mjs
node test/workspace.mjs
```

Requirements: Node 22+ and Chrome/Chromium (`CHROME_BIN` optional). Tests intentionally use Node built-ins + raw Chrome DevTools Protocol. Do not add Playwright/Puppeteer/jsdom/Jest/Vitest for convenience.

`test/workspace.mjs` is the scale gate: it must continue to cover all 18 component definitions, native slot assignment, primitive static inputs, pre-mount property precedence, deep composed events, search reactivity, mutation and conditional teardown using generated `skein.min.js`.

## Documentation sync

When public syntax/behavior changes, update README, docs, start/landing examples, `llms.txt`, `llms-full.txt`, `.agents/skills/skein/`, tests and Playground/examples together.
