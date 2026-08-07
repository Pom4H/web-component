# AGENTS.md

This repository contains **Skein**, a zero-dependency HTML-first Web Components runtime for fine-grained reactive native-DOM applications.

## Before changing code

For application syntax, read:

- `llms-full.txt`
- `.agents/skills/skein/references/syntax.md`

For renderer/reactivity/lifecycle/performance work, also read:

- `.agents/skills/skein/references/architecture.md`
- the relevant `runtime/` source
- `test/`

## Runtime invariants

Preserve these unless the task explicitly changes them:

- zero runtime dependencies;
- no virtual DOM or component-wide rerender loop;
- no build step required by users;
- ordinary JavaScript state through a deep reactive Proxy;
- `{...}` bindings are property paths and compile once;
- exact reactive reads invalidate exact DOM work;
- synchronous writes naturally share one microtask;
- render effects settle before user effects;
- keyed lists preserve DOM identity;
- list/branch scopes own disposal;
- disconnect pauses, explicit `dispose()` destroys;
- declared component inputs are ordinary host DOM properties backed by reactive state;
- component outputs remain native DOM events / `CustomEvent`;
- CSS, SVG, Canvas, Web Audio and other browser APIs stay native.

Do not reintroduce removed low-level public APIs (`batch`, `signal`, `untrack`, `Skein.stats`, `Skein.flush`) or the old `onclick={handler}` alias without an explicit product decision. Use `@event={handler}`.

## Public API

Production entry: `skein.min.js`. Readable entry: `skein.js`.

Public module/global surface:

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

Composition rule: use `.property={state}` from owner to child, declare the corresponding child property with `input(name, fallback)`, and use bubbling/composed `CustomEvent` for requests or notifications back up. Do not invent a second framework-specific component bus.

## SEO and document content

Skein currently has no SSR or hydration. Keep static, semantic and SEO-critical content in ordinary document HTML whenever possible. If request-time HTML generation is required, use a server or static generator outside Skein and enhance the result.

Never claim Skein currently implements SSR, hydration, suspense or error boundaries.

## Native-site rules

- bind values into CSS custom properties and let CSS animate/layout;
- keep SVG as actual SVG and update only dynamic attributes/properties;
- keep Canvas/Web Audio imperative and use Skein for state, controls and lifecycle;
- clean up timers, frames, observers and requests with `onCleanup()` or `abortSignal`;
- do not add editor, animation, state-management or rendering libraries unless explicitly requested.

## Performance rules

Before adding an abstraction, consider allocation cost in repeated item scopes.

Important v0.5 choices:

- `AbortController` is lazy;
- component input bookkeeping is lazy;
- declarative event listeners use deterministic scope cleanup;
- registered component sources are cached directly;
- list keys resolve directly against items;
- binding paths compile once;
- renderer instructions are compact tuples;
- nested Skein elements are disposed with their owning view.

Do not trade keyed identity, cleanup correctness, input semantics or lifecycle correctness merely to reduce bundle size.

## Production build

```bash
node tools/build.mjs
node tools/build.mjs --check
```

The minifier must remain string-safe and must never rewrite selector/source strings, DOM property names or user-facing public names. Exercise minifier changes against `skein.min.js` in real Chrome.

## Testing

```bash
node test/run.mjs
```

Requirements: Node.js 22+ and Chrome/Chromium (`CHROME_BIN` may be set).

The harness intentionally uses Node built-ins and raw Chrome DevTools Protocol. Do not add Playwright, Puppeteer, jsdom, Jest or Vitest for convenience.

Runtime changes need regression tests for the invariant they affect: DOM identity, disposal, scheduling, missing-property tracking, arrays, lifecycle, component input timing, composition, production minified output or sandbox behavior. Do not make machine-dependent performance timings pass/fail thresholds.

## Documentation sync

When public syntax or behavior changes, update together:

- `README.md`
- `docs/`
- `start/` and landing examples
- `llms.txt`
- `llms-full.txt`
- `.agents/skills/skein/`
- Playground/examples when relevant.

Keep `llms.txt` concise and link-oriented. Put the fuller machine model in `llms-full.txt`.
