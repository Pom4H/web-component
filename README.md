# Skein

**Native web, tightly woven.**

Skein is a tiny HTML-first Web Components runtime with fine-grained reactivity.

- **14.5 kB raw / 5.3 kB gzip / 4.8 kB Brotli**
- zero runtime dependencies
- no virtual DOM
- no build step required
- ordinary JavaScript state through a deep reactive Proxy
- native component composition through DOM properties and CustomEvents
- native HTML, CSS, SVG, Canvas and Web Audio
- keyed DOM reconciliation and scoped cleanup

The production artifact is one ES module: `skein.min.js`.

## 60-second start

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

No npm, CLI, config or bundler is required. Pin a commit SHA instead of `@main` for reproducible production sites.

## Component files

For larger projects a custom-element tag maps to an HTML file by replacing hyphens with slashes:

```text
<counter-app>  -> counter/app.html
<user-card>    -> user/card.html
<studio-mixer> -> studio/mixer.html
```

A component file keeps its script, markup and styles together:

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

A component `<script>` runs with `this` bound to a deep reactive Proxy:

```js
this.count++
this.user.name = 'Ada'
this.items.push({ id: 1, title: 'One' })
```

Skein tracks reads at property level. Synchronous writes settle in one microtask render wave; there is no public `batch()` API. Missing properties, array structure and direct array-length truncation are reactive too.

## Bindings

```html
<h1>Hello {user.name}</h1>
<div title="User {user.name}" data-id={id}></div>
<input .value={user.name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Bindings contain property paths, not arbitrary JavaScript expressions. Put derived logic in `computed()`.

Lexical context uses `in={...}`:

```html
<address in={user.address}>
  {city}, {street}
</address>
```

## Component composition

Skein components use the browser contract directly: **properties down, DOM events up**.

A child explicitly declares the host properties it accepts:

```html
<!-- volume/control.html -->
<script>
  this.value = input('value', .5)

  this.change = event => host.dispatchEvent(new CustomEvent('value-change', {
    detail: { value: Number(event.currentTarget.value) },
    bubbles: true,
    composed: true
  }))
</script>

<input type="range" .value={value} @input={change}>
```

The parent binds an ordinary DOM property and listens to an ordinary event:

```html
<volume-control
  .value={volume}
  @value-change={volumeChange}>
</volume-control>
```

`input(name, fallback)` makes that host property reactive inside the child. If the parent writes the property before the child file has finished loading, Skein preserves that value and adopts it when the child mounts. Later JavaScript writes such as `element.value = .8` update the child reactively as well.

Inputs are one-way. A child asks the owner to change state by dispatching a `CustomEvent`; Skein does not add an event bus, store or component-context protocol.

See `examples/studio/` for a composed application using file-loaded transport, sequencer, synth, mixer and Canvas scope components.

## Keyed lists

```html
<article for={projects} key={id}>
  <b>{index}. {title}</b>
  <input placeholder="local DOM state survives reorder">
</article>
```

Stable keys preserve real DOM identity. Append creates only new views, removal disposes only removed views, reorder moves existing node ranges, and `index` / `$index` update reactively.

A normal HTML attribute such as `<label for="email">` stays native; only exact `for={...}` is structural.

## Conditions

```html
<section if={inspectorOpen}>
  <canvas></canvas>
</section>
```

A conditional branch owns a child scope. Hiding it disposes its effects, listeners, nested components and DOM range. Showing it creates a fresh view.

## Computed values and effects

```html
<script>
  this.price = 100
  this.quantity = 2
  this.total = computed(() => this.price * this.quantity)

  effect(() => console.log(this.total))
</script>

<strong>{total}</strong>
```

`computed()` is lazy, cached and dependency-tracked. User effects run after render work settles.

## Component script API

| Helper | Purpose |
| --- | --- |
| `input(name, fallback)` | declare a reactive host-property input |
| `computed(fn)` | lazy cached derived state |
| `effect(fn)` | user effect after render effects |
| `onCleanup(fn)` | deterministic scope cleanup |
| `host` | current custom element |
| `abortSignal` | scope-owned AbortSignal for native APIs |

```html
<script>
  window.addEventListener('resize', this.measure, { signal: abortSignal })
  fetch('/data.json', { signal: abortSignal })

  const frame = requestAnimationFrame(this.draw)
  onCleanup(() => cancelAnimationFrame(frame))
</script>
```

`AbortController` is allocated lazily: a component that never reads `abortSignal` does not pay for it.

## Public module API

The browser/module surface remains deliberately tiny:

```js
Skein.version
Skein.define(tag, source)
```

`Skein.define()` is intended for playgrounds, generated source and inline tooling. Normal multi-file applications should usually let the custom-element tag load its matching `.html` file.

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

There is no component-wide rerender and no virtual DOM diff. Binding paths are parsed once at compile time, and DOM writes cache their previously committed value.

## Lifecycle and ownership

Every component owns a root scope. Lists and branches create child scopes. Scopes own reactive effects, computed dependencies, event cleanup and user cleanup callbacks.

`disconnectedCallback()` pauses reactive work; reconnection resumes dirty bindings without rebuilding the current view. `connectedMoveCallback()` is supported for state-preserving custom-element moves.

Permanent teardown is explicit:

```js
component.dispose()
```

Renderer-owned list and branch removals dispose nested Skein elements automatically.

## Native media

Use CSS for layout, transitions and interpolation:

```html
<article style="--x:{x}px" @pointermove={move}>...</article>
```

Keep SVG as SVG:

```html
<svg viewBox="0 0 100 100">
  <circle cx={x} cy={y} r="5" />
</svg>
```

Keep Canvas and Web Audio imperative. Use Skein for state, controls, composition and lifecycle around those native APIs.

## Static HTML and SEO

Skein does not provide SSR or hydration today. Static content does not need client rendering in the first place.

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

Build and verify the production artifact with the zero-dependency Node script:

```bash
node tools/build.mjs
node tools/build.mjs --check
```

Current `skein.min.js` size:

```text
raw      14,455 B  ≈ 14.5 kB
gzip      5,267 B  ≈  5.3 kB
brotli    4,753 B  ≈  4.8 kB
```

## Tests

```bash
node test/run.mjs
```

Requirements: Node.js 22+ and Chrome/Chromium (`CHROME_BIN` may be supplied).

The zero-dependency test harness uses Node built-ins and Chrome DevTools Protocol directly. It covers reactive behavior, bindings, keyed identity, disposal, reconnect, component property inputs, CustomEvent composition, the real multi-file Studio example, SVG/Canvas behavior, the generated minified runtime, inline bootstrap, late registration and the sandboxed Playground path.

## CDN

Production:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js
```

Readable modules:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js
```

## Current limitations

- no SSR or hydration
- no built-in async resource / suspense primitive
- no built-in error boundary primitive
- `{...}` accepts paths rather than arbitrary expressions
- component scripts use `AsyncFunction`, so strict CSP currently requires `unsafe-eval`

Skein stays intentionally small by relying on the browser for the things the browser already does well.
