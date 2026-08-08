# Skein

**Native web, tightly woven.**

Skein is a tiny HTML-first Web Components runtime with fine-grained reactivity.

- **15.0 kB raw / 5.5 kB gzip / 4.9 kB Brotli**
- zero runtime dependencies
- no virtual DOM
- no build step required
- reactive plain objects and arrays through native Proxy
- native component composition through DOM properties and CustomEvents
- native HTML, CSS, SVG, Canvas, Web Audio and platform objects
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

Skein fetches an unknown custom-element source **before** registering that tag. A missing `foo/bar.html` therefore leaves `<foo-bar>` undefined instead of stealing a tag that may belong to another Web Components library.

## State

A component `<script>` runs with `this` bound to reactive state:

```js
this.count++
this.user.name = 'Ada'
this.items.push({ id: 1, title: 'One' })
```

Plain objects and arrays are reactive recursively and share one proxy identity even when passed between Skein components. Platform objects and class instances stay native and opaque:

```js
this.createdAt = new Date()
this.cache = new Map()
this.audio = new AudioContext()
```

Skein does not Proxy those objects, so their native internal-slot methods keep the correct receiver. Mutations *inside* a `Map`, `Set`, `Date` or class instance are not reactive; expose a normal reactive value when the DOM needs to observe them.

Skein tracks reads at property level. Synchronous writes settle in one microtask render wave; there is no public `batch()` API. Missing properties, object iteration, array structure and direct array-length truncation are reactive.

## Bindings

```html
<h1>Hello {user.name}</h1>
<div title="User {user.name}" data-id={id}></div>
<label for={inputId}>Dynamic native for</label>
<input .value={user.name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Bindings are **strict property paths**, not JavaScript expressions. Whitespace, empty segments and expressions such as `{a + b}` fail during component compilation instead of producing ambiguous output. Put derived logic in `computed()`.

Special bindings must contain one path:

```html
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

A malformed form such as `.value="prefix {name}"` throws a useful compile-time error.

## Component composition

Skein components use the browser contract directly: **properties down, DOM events up**.

A child declares the host properties it accepts:

```html
<!-- volume/control.html -->
<script>
  input('value', .5)

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

`input(name, fallback)` installs a reactive host-property accessor and seeds child state itself. The older `this.value = input('value', .5)` spelling remains compatible, but the shorter declaration is preferred.

If the parent writes a property before the child's HTML source has loaded, Skein adopts that pre-upgrade property value when the child mounts. Later writes such as `element.value = .8` update the child reactively. Inputs are one-way: the child asks its owner to change state with a native `CustomEvent`.

Input names may not shadow `HTMLElement` or Skein host APIs such as `title`, `state` or `dispose`; collisions fail loudly instead of corrupting the element.

See `examples/studio/` for a composed application using file-loaded transport, sequencer, synth, mixer and Canvas scope components.

## Keyed lists

Skein 0.6 uses `each={...}` so native HTML `for={...}` remains available for labels and outputs:

```html
<article each={projects} key={id}>
  <b>{index}. {title}</b>
  <input placeholder="local DOM state survives reorder">
</article>
```

Stable keys preserve real DOM identity. Append creates only new views, removal disposes only removed Skein views, and reorder moves existing node ranges. `index` and `$index` update reactively.

Explicit keys must resolve to non-null unique values. Duplicate or missing keys throw before reconciliation mutates the list, which prevents silent DOM identity corruption. When `key` is omitted, object items use object identity and repeated primitive values use occurrence identity.

## Conditions

```html
<section if={inspectorOpen}>
  <canvas></canvas>
</section>
```

A conditional branch owns a child scope. Hiding it disposes its effects, listeners and nested **Skein** components, then removes its DOM range. Third-party custom elements are left to their own disconnected lifecycle; Skein never calls an arbitrary external element's `dispose()` method.

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

`computed()` is lazy, cached and dependency-tracked. User effects run only after pending render effects settle.

## Component script API

| Helper | Purpose |
| --- | --- |
| `input(name, fallback)` | declare and seed a reactive host-property input |
| `computed(fn)` | lazy cached derived state |
| `effect(fn)` | user effect after render effects |
| `onCleanup(fn)` | deterministic scope cleanup |
| `host` | current Skein custom element |
| `abortSignal` | scope-owned AbortSignal for native APIs |

```html
<script>
  window.addEventListener('resize', this.measure, { signal: abortSignal })
  fetch('/data.json', { signal: abortSignal })

  const frame = requestAnimationFrame(this.draw)
  onCleanup(() => cancelAnimationFrame(frame))
</script>
```

`AbortController` is allocated lazily: a component that never references `abortSignal` does not allocate one.

## Public module API

```js
Skein.version
Skein.define(tag, source)
```

`Skein.define()` is intended for inline tooling, playgrounds and generated source. In 0.6 it defines a component once; redefining an already registered Skein tag throws instead of maintaining production hot-reload machinery. Normal multi-file applications should let the tag-to-path loader fetch component files.

## Rendering model

Component source parses and compiles once per tag. Mount clones real DOM and installs fine-grained effects on exact nodes.

```text
component.html
      ↓
parse + compile once
      ↓
real DOM clone + binding effects
      ↓
reactive property reads
      ↓
dependency graph
      ↓
state write
      ↓
one microtask
      ↓
exact DOM writes
      ↓
user effects
```

There is no virtual tree to diff and no component-wide rerender after a state write.

## Lifecycle

Disconnecting a Skein element pauses its reactive scopes. Reconnection resumes dirty work without rebuilding DOM identity. Renderer-owned branch/list removals permanently dispose nested Skein elements. `host.dispose()` is permanent teardown.

Failed mounts are transactional: if template instantiation throws, the new scope is disposed and partial shadow DOM is cleared before the error is reported.

## 0.6 migration

```diff
- <li for={items} key={id}>...</li>
+ <li each={items} key={id}>...</li>

- <section in={user}><b>{name}</b></section>
+ <section><b>{user.name}</b></section>

- this.value = input('value', 0)
+ input('value', 0)
```

`in={...}` was removed. Full paths make structural `if` / `each` scopes deterministic and remove a second lexical-context model from the runtime. The old input assignment spelling still works; the list/context changes are intentional 0.6 API changes.

## Testing and production build

```bash
node tools/build.mjs
node tools/build.mjs --check
node test/run.mjs
```

The zero-dependency harness uses Node built-ins plus raw Chrome DevTools Protocol. It exercises readable and generated minified runtimes, keyed identity, scheduler ordering, lifecycle teardown, input timing, third-party Custom Element coexistence, native platform objects and the real multi-file Studio composition.

## Constraints

Skein currently does not implement SSR, hydration, suspense or error boundaries. Keep static, semantic and SEO-critical content as ordinary document HTML when possible, and enhance the interactive regions with Skein.

Component scripts currently execute through `AsyncFunction`, so a strict Content Security Policy still requires allowing dynamic evaluation.

## License

MIT
