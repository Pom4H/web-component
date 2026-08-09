# AGENTS.md

This repository contains **Skein**, a zero-dependency HTML-first Web Components runtime for fine-grained reactive native-DOM applications.

## Before changing code

For application syntax, read `llms-full.txt` and `.agents/skills/skein/references/syntax.md`. For renderer/reactivity/lifecycle/performance work, also read `.agents/skills/skein/references/architecture.md`, the relevant `runtime/` source and `test/`.

## Runtime invariants

- zero runtime dependencies;
- no virtual DOM or component-wide rerender loop;
- no build step required by users;
- plain objects and arrays are reactive; platform objects and class instances remain native/opaque;
- one raw object has one Skein Proxy identity across component boundaries;
- `{...}` bindings are strict property paths compiled once;
- binding lookup uses own properties only, then walks list scopes outward;
- native dynamic attributes such as `for={inputId}` stay native;
- list repetition uses `each={items}`; explicit keys must be unique and non-null;
- exact reactive reads invalidate exact DOM work;
- synchronous writes naturally share one microtask;
- render effects settle before user effects;
- list/branch scopes own disposal;
- disconnect pauses, explicit `dispose()` destroys;
- failed mounts roll back their scope and partial DOM;
- component inputs are ordinary host DOM properties backed by child reactive state;
- input names cannot shadow HTMLElement/Skein host properties;
- component outputs remain native DOM events / `CustomEvent`;
- unknown custom-element source is fetched before Skein claims the tag;
- third-party custom elements are never force-disposed by Skein;
- CSS, SVG, Canvas, Web Audio and other browser APIs stay native.

Do not reintroduce removed public APIs (`batch`, `signal`, `untrack`, `Skein.stats`, `Skein.flush`), `in={...}`, the old list `for={...}` directive, or the old `onclick={handler}` alias without an explicit product decision.

## Public API

Production entry: `skein.min.js`. Readable entry: `skein.js`.

```js
Skein.version
Skein.define(tag, source)
```

Injected component-script helpers:

```text
input
computed
effect
onCleanup
host
abortSignal
```

Preferred input declaration is `input('value', fallback)`. The legacy assignment spelling remains compatible. Composition uses `.property={state}` down and bubbling/composed `CustomEvent` up. Do not add a second component bus, store or provide/inject protocol.

## SEO and document content

Skein has no SSR or hydration. Keep static, semantic and SEO-critical content in ordinary document HTML when possible. Never claim SSR, hydration, suspense or error boundaries currently exist.

## Native-site rules

- bind values into CSS custom properties and let CSS animate/layout;
- keep SVG as actual SVG and update only dynamic attributes/properties;
- keep Canvas/Web Audio imperative and use Skein for state, controls and lifecycle;
- clean up timers, frames, observers and requests with `onCleanup()` or `abortSignal`;
- do not wrap Date, Map, Set, DOM nodes, AudioContext or class instances in framework state abstractions;
- do not add editor, animation, state-management or rendering libraries unless explicitly requested.

## Performance rules

Important v0.6 choices:

- global WeakMap registries give shared raw objects one Proxy identity;
- only arrays/plain objects are recursively proxied;
- `AbortController` and input bookkeeping are lazy;
- declarative event listeners use deterministic cleanup;
- component sources and binding paths compile once;
- renderer instructions are compact tuples;
- list keys resolve directly against items and validate before DOM mutation;
- unknown tags are only defined after a successful component-source load;
- production hot-reload instance/generation machinery is intentionally absent.

Do not trade keyed identity, cleanup correctness, input timing or lifecycle correctness merely to reduce bundle size.

## Production build

```bash
node tools/build.mjs
node tools/build.mjs --check
```

The custom minifier renames internal identifiers lexically. Never mangle DOM/public property names by accident. Protect native property accesses when an identifier is also an internal mangle target (for example `hit['index']` and `controller['signal']`). Exercise minifier changes against `skein.min.js` in real Chrome.

## Testing

```bash
node test/run.mjs
```

Requirements: Node.js 22+ and Chrome/Chromium (`CHROME_BIN` may be set). The harness intentionally uses Node built-ins and raw Chrome DevTools Protocol. Do not add Playwright, Puppeteer, jsdom, Jest or Vitest for convenience.

Runtime changes need regression tests for the invariant they affect, including readable **and minified** behavior where identifier mangling can matter. Performance timings are smoke data, not pass/fail thresholds.

## Documentation sync

When public syntax or behavior changes, update README, docs, start/landing examples, `llms.txt`, `llms-full.txt`, `.agents/skills/skein/`, tests and Playground/examples together.
