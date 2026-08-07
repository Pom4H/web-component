# Skein

**Native web, tightly woven.**

Skein is a tiny HTML-first Web Components runtime with fine-grained reactivity.

- **14.0 kB raw / 5.1 kB gzip / 4.6 kB Brotli**
- zero runtime dependencies
- no virtual DOM
- no build step required
- ordinary JavaScript state through a deep reactive Proxy
- native HTML, CSS, SVG and Canvas
- keyed DOM reconciliation and scoped cleanup

The production artifact is a single ES module: `skein.min.js`.

## 60-second start

One file is enough:

```html
<click-count></click-count>

<template skein="click-count">
  <script>
    this.count = 0
    this.up = () => this.count++
  </script>

  <button @click={up}>clicked {count}</button>
</template>

<script type="module"
  src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js">
</script>
```

No npm, CLI, config or bundler is required. For reproducible production sites, pin a commit SHA instead of `@main`.

For larger projects a custom-element tag maps to an HTML file by replacing hyphens with slashes:

```text
<counter-app> -> counter/app.html
<user-card>   -> user/card.html
```

A component file can keep script, markup and style together:

```html
<script>
  this.count = 0
  this.increment = () => this.count++
  this.double = computed(() => this.count * 2)
</script>

<button @click={increment}>Count: {count}</button>
<p>Double: {double}</p>

<style>
  button { font: inherit; }
</style>
```

## State

A component `<script>` runs with `this` bound to its reactive state:

```js
this.count++
this.user.name = 'Ada'
this.items.push({ id: 1, title: 'One' })
```

Skein tracks reads at property level. Synchronous writes naturally collapse into one microtask render wave; there is no explicit `batch()` API.

Missing properties are tracked too, so a binding to `{later}` updates when `this.later` is created. Array structure and length are reactive, including direct truncation with `items.length = n`.

## Bindings

Text and attributes:

```html
<h1>Hello {user.name}</h1>
<div title="User {user.name}" data-id={id}></div>
```

Bindings contain property paths, not arbitrary JavaScript expressions. Use `computed()` for derived state.

DOM properties:

```html
<input .value={user.name}>
```

Boolean attributes:

```html
<button ?disabled={saving}>Save</button>
```

Events:

```html
<button @click={save}>Save</button>
```

The listener is installed once and removed with its owning scope. The current handler is resolved when the event fires.

Context:

```html
<address in={user.address}>
  {city}, {street}
</address>
```

Lookup is lexical. A local property with value `undefined` still shadows an outer property with the same name.

## Keyed lists

```html
<article for={projects} key={id}>
  <b>{index}. {title}</b>
  <input placeholder="local DOM state survives reorder">
</article>
```

Objects use object identity by default. Use a stable `key={id}` when records have application identity.

Skein does not rebuild the list:

- append creates only new views
- removal disposes only removed views
- reorder moves existing node ranges
- `index` and `$index` update reactively
- local browser state such as focus and input values can survive reorder

A normal HTML attribute such as `<label for="email">` stays native; only an exact `for={...}` expression is structural.

## Conditions

```html
<section if={inspectorOpen}>
  <canvas></canvas>
</section>
```

A branch owns a child scope. Hiding it disposes its effects, event listeners, nested components and DOM range. Showing it creates a fresh view.

## Computed values and effects

```html
<script>
  this.price = 100
  this.quantity = 2
  this.total = computed(() => this.price * this.quantity)

  effect(() => {
    console.log(this.total)
  })
</script>

<strong>{total}</strong>
```

`computed()` is lazy, cached and dependency-tracked. User `effect()` work runs after render work settles.

## Component script API

Skein 0.5 intentionally keeps the injected surface small:

| Helper | Purpose |
| --- | --- |
| `computed(fn)` | lazy cached derived state |
| `effect(fn)` | user effect after render effects |
| `onCleanup(fn)` | deterministic scope cleanup |
| `host` | current custom element |
| `abortSignal` | scope-owned AbortSignal for native APIs |

Example:

```html
<script>
  window.addEventListener('resize', this.measure, { signal: abortSignal })
  fetch('/data.json', { signal: abortSignal })

  const frame = requestAnimationFrame(this.draw)
  onCleanup(() => cancelAnimationFrame(frame))
</script>
```

`AbortController` is allocated lazily: a component that does not use `abortSignal` does not pay for it.

## Public module API

The browser/module API is deliberately just:

```js
Skein.version
Skein.define(tag, source)
```

`Skein.define()` is useful for playgrounds, generated source and inline tooling:

```js
Skein.define('my-poster', `
  <script>this.x = 50<\/script>
  <h1 style="--x:{x}">Skein</h1>
`)
```

Low-level scheduler/signal classes are runtime internals rather than public framework ceremony.

## Rendering model

Component source is parsed and compiled once per tag. At mount Skein clones real DOM and attaches fine-grained bindings to exact nodes.

```text
state write
   ↓
dependency invalidation
   ↓
one microtask scheduler
   ↓
exact DOM parts
   ↓
user effects
```

There is no component-wide rerender and no virtual DOM diff.

The compiler uses compact instructions for:

- text
- attributes
- DOM properties
- boolean attributes
- events
- keyed lists
- conditional branches

Binding paths are parsed once at compile time rather than split on every update. DOM writes cache their previous committed value and skip equal updates.

## Lifecycle and ownership

Every component owns a root scope. Lists and branches create child scopes. Scopes own reactive effects, computed dependencies, event cleanup and user cleanup callbacks.

`disconnectedCallback()` pauses reactive work; reconnection resumes dirty bindings without rebuilding the view. `connectedMoveCallback()` is supported for state-preserving custom-element moves.

Permanent teardown is explicit:

```js
component.dispose()
```

Renderer-owned list and branch removals dispose automatically, including nested Skein elements.

## Creative sites

Skein is meant to stay out of the medium.

CSS:

```html
<article style="--x:{x}px" @pointermove={move}>...</article>
```

Let CSS handle layout, transitions and interpolation.

SVG:

```html
<svg viewBox="0 0 100 100">
  <circle cx={x} cy={y} r="5" />
</svg>
```

The SVG tree stays native; Skein updates only the dynamic attributes.

Canvas should remain imperative. Use Skein for state, controls and lifecycle, then use the ordinary Canvas API inside your render loop.

## Static HTML and SEO

Skein does not provide SSR or hydration today. That does not require static content to become client-rendered.

If a heading, value proposition, navigation link, article or structured data matters before JavaScript, write it directly in the document:

```html
<main>
  <h1>Native creative web experiences.</h1>
  <p>This content exists in the original HTML response.</p>
  <interactive-art></interactive-art>
</main>
```

If a server genuinely needs to compute HTML per request, use a server or static generator and let Skein enhance the result.

## Source and production build

Readable source stays split into native ES modules:

```text
skein.js
runtime/reactive.js
runtime/template.js
runtime/component.js
```

The CDN artifact is generated with a zero-dependency Node script:

```bash
node tools/build.mjs
```

Verify the committed artifact is current without rewriting it:

```bash
node tools/build.mjs --check
```

Current `skein.min.js` size:

```text
raw      13,988 B  ≈ 14.0 kB
gzip      5,086 B  ≈  5.1 kB
brotli    4,606 B  ≈  4.6 kB
```

The build script performs bundling, lexical minification and internal identifier mangling without npm dependencies. Production browser tests execute the generated file directly so a minifier regression cannot hide behind tests of the readable modules.

## Tests

Run everything with:

```bash
node test/run.mjs
```

Requirements:

- Node.js 22+
- Chrome or Chromium (`CHROME_BIN` may be supplied)

The test harness uses Node built-ins and the Chrome DevTools Protocol directly. No Playwright, Puppeteer, jsdom, Jest or Vitest.

It checks the reactive core, bindings, scheduler ordering, missing-property tracking, array truncation, keyed DOM identity, nested disposal, reconnect, CSS parsing, SVG/Canvas production behavior, `template[skein]`, late registration inside Shadow DOM, the minified bundle and the sandboxed Playground path. It also runs a 1000-row correctness/performance smoke test without machine-dependent pass/fail timing thresholds.

## CDN

Production:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js
```

Readable modules:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js
```

Pin a commit SHA for production deployments.

## Current limitations

- no SSR or hydration
- no built-in async resource / suspense primitive
- no built-in error boundary primitive
- `{...}` accepts paths rather than arbitrary expressions
- component scripts use `AsyncFunction`, so strict CSP currently requires `unsafe-eval`

Skein stays intentionally small by relying on the browser for the things the browser already does well.
