# Skein

**Native web, tightly woven.**


A tiny HTML-first Web Components runtime with fine-grained reactivity.

No dependencies. No virtual DOM. No build step. Components are normal HTML files; state is normal JavaScript; only bindings that depend on changed state are updated.

## Why

The browser already has components, DOM, Shadow DOM, events, fetch and lifecycle. This project adds the missing thin layer:

- reactive state with plain assignments such as `this.count++`
- fine-grained text, attribute, property and boolean bindings
- keyed incremental lists
- conditional ranges
- computed values and effects
- batched scheduling
- ownership scopes and deterministic cleanup
- automatic component loading by tag name

The runtime never rerenders a component and never builds a virtual DOM tree.

## Quick start

The smallest Skein project is one HTML file. `template[skein]` is inert browser HTML until Skein registers it as a component:

```html
<!doctype html>

<click-count></click-count>

<template skein="click-count">
  <script>
    this.count = 0
    this.up = () => this.count++
  </script>

  <button onclick={up}>clicked {count}</button>
</template>

<script type="module"
  src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js">
</script>
```

No npm, CLI, config, bundler or dev dependency is required. During the public-GitHub phase `skein.js` is the canonical CDN entry. Pin a commit SHA instead of `@main` for reproducible production sites.

You can also register source from JavaScript with `Skein.define('my-element', source)`. This is what the zero-dependency playground uses.

For larger projects, keep component source in separate files. A tag maps to an HTML file by replacing `-` with `/`:

```text
<counter-app> -> counter/app.html
<user-card>   -> user/card.html
```

`counter/app.html`:

```html
<script>
  this.count = 0
  this.increment = () => this.count++
  this.double = computed(() => this.count * 2)
</script>

<button onclick={increment}>
  Count: {count}
</button>

<p>Double: {double}</p>

<style>
  button { font: inherit; }
</style>
```

## Bindings

### Text

```html
<h1>Hello {name}</h1>
<p>{user.email}</p>
```

Bindings are property paths, not arbitrary JavaScript expressions. Put derived logic in `computed()`.

### Context

`in={...}` changes the local binding context for the element and its descendants.

```html
<address in={user.address}>
  {city}, {street}
</address>
```

Lexical lookup walks outward through parent contexts and finally component state. A local property whose value is `undefined` still correctly shadows a property with the same name in an outer scope.

### Lists

```html
<li for={users} key={id}>
  {name}
</li>
```

`for={items}` is incremental. Existing DOM nodes are preserved across `push`, `splice`, reorder and replacement.

By default objects are keyed by object identity. Use `key={id}` when items have a stable application identity.

Inside a list, `index` and `$index` are reactive locals:

```html
<li for={users} key={id}>
  {index}: {name}
</li>
```

A normal HTML attribute such as `<label for="email">` is left untouched; only a full `for={...}` binding creates a list.

### Conditions

```html
<section if={loggedIn}>
  Welcome {name}
</section>
```

False disposes that branch's reactive scope and DOM. True creates a new scoped view.

### Attributes

```html
<div title="User {name}" data-id={id}></div>
```

A full binding whose value becomes `null`, `undefined` or `false` removes the attribute.

### Properties

Prefix the name with `.` when the DOM property, rather than the HTML attribute, is the source of truth:

```html
<input .value={name}>
```

This matters for form state and avoids resetting a user-edited property during unrelated updates.

### Boolean attributes

```html
<button ?disabled={saving}>Save</button>
```

### Events

```html
<button onclick={save}>Save</button>
<button @click={save}>Save</button>
```

The listener is attached once. The current handler is resolved when the event fires, so changing the handler does not rebind the listener.

Legacy inline browser handlers are also supported. Every rendered element exposes the component state as `$`:

```html
<button onmouseover="$.select(this.id)">...</button>
```

## Component script API

A component `<script>` runs with `this` bound to its reactive state.

```html
<script>
  this.price = 100
  this.quantity = 2

  this.total = computed(() => this.price * this.quantity)

  effect(() => {
    console.log('total', this.total)
  })

  onCleanup(() => {
    console.log('disposed')
  })
</script>
```

The following helpers are injected into component scripts:

| Helper | Purpose |
| --- | --- |
| `computed(fn)` | lazy cached derived value with automatic dependency tracking |
| `effect(fn)` | user effect, run after render effects |
| `onCleanup(fn)` | run cleanup when the owning scope is disposed |
| `batch(fn)` | group synchronous state writes into one scheduled update wave |
| `signal(value)` | explicit signal ref for advanced/local state |
| `untrack(fn)` | read reactive state without subscribing |
| `host` | the current custom element instance |
| `abortSignal` | scope-owned `AbortSignal` for fetch/listeners/resources |

Example using native cleanup through `AbortSignal`:

```html
<script>
  window.addEventListener('resize', this.measure, { signal: abortSignal })
  fetch('/data.json', { signal: abortSignal })
</script>
```

## Rendering model

Component source is fetched, parsed and compiled once per tag. The cache stores the compiled template, not just raw HTML.

At instantiation the template is cloned and connected to specialized DOM parts:

```text
reactive state
     │
     ├── TextPart
     ├── AttributePart
     ├── PropertyPart
     ├── BooleanPart
     ├── EventPart
     ├── ListPart
     └── BranchPart
```

Each reactive read records the exact signal dependency. A write marks only subscribers dirty.

```text
state write
   -> dirty signal
   -> dirty parts
   -> one microtask flush
   -> exact DOM commits
   -> user effects
```

Parts cache their last committed value and skip identical DOM writes.

The runtime itself is split into native ES modules with no bundler: `runtime/reactive.js`, `runtime/template.js`, `runtime/component.js`, and the canonical `skein.js` entry point. `web-component.js` remains a compatibility alias.

## Keyed reconciliation

Lists keep a `Map<key, item view>`.

- append creates only appended views
- removal disposes only removed views
- reorder moves existing nodes instead of recreating them
- replacing an item with the same key updates its existing item scope
- nested custom elements and form state survive reorder

When the browser exposes `Element.moveBefore()`, the runtime uses it for state-preserving moves. Otherwise it falls back to `insertBefore()`.

There is no list-level DOM clear/rebuild path.

## Scheduler

Synchronous writes are deduplicated in a `Set` and flushed in a microtask.

Render effects are exhausted before user effects. If a user effect dirties rendering again, rendering becomes the next phase before more user effects run.

```js
this.count = 1
this.count = 2
this.count = 3
```

produces one scheduled render wave and the DOM observes the final value.

## Ownership and disposal

Every component owns a root `Scope`. Dynamic structures create child scopes:

```text
Component Scope
├── render parts
├── user effects
├── Branch Scope
└── List Scope
    ├── Item Scope
    ├── Item Scope
    └── Item Scope
```

Disposing a scope recursively disposes effects, child scopes, event listeners attached with its `AbortSignal`, computed dependencies and registered cleanup callbacks.

Renderer-owned list/branch removals dispose automatically.

`disconnectedCallback()` pauses the component. Reconnecting resumes dirty bindings without rebuilding the view. `connectedMoveCallback()` is supported for state-preserving Custom Element moves.

For an explicit permanent teardown:

```js
component.dispose()
```

## Reactive objects

State uses a deep Proxy facade so application code stays ordinary JavaScript:

```js
this.user.name = 'Ada'
this.items.push(item)
this.items.splice(2, 1)
```

Dependency tracking is property-level. Object iteration has a separate structural dependency, so changing an existing property does not invalidate `Object.keys()` subscribers; adding or deleting a property does.

Arrays additionally track structural length changes so `push()` and other native mutations invalidate list consumers correctly.

## Tests

The project intentionally has no test framework and no package dependencies.

Run everything with:

```bash
node test/run.mjs
```

Requirements for the test runner:

- Node.js 22+
- Chrome or Chromium

If Chrome is not auto-detected:

```bash
CHROME_BIN=/path/to/chrome node test/run.mjs
```

The runner uses only Node built-ins and the Chrome DevTools Protocol. It does not use Playwright, Puppeteer, jsdom or an HTTP server.

It runs:

- signal/reactivity core tests in Node
- browser binding tests in real Chrome
- keyed identity/reorder/disposal tests
- scheduler/batching tests
- reconnect lifecycle tests
- a 1000-row performance smoke test
- compatibility smoke tests for the original examples

The performance smoke prints timings for create 1000, update 100 rows, reverse 1000 and clear 1000. The values are informational rather than pass/fail thresholds because they depend on hardware and Chrome version.

## Runtime diagnostics

For development and benchmarks:

```js
Skein.stats
```

contains counters for scheduler flushes, reactive effect runs, DOM commits and list operations.

A synchronous flush is also available for low-level tests:

```js
Skein.flush()
```

Application code normally should not need either.

## CDN and browser requirements

Canonical GitHub-backed CDN entry:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js
```

`web-component.js` is kept as a compatibility alias while the project moves to the Skein brand.

## Browser requirements

The runtime is built on standard browser primitives:

- Custom Elements
- Shadow DOM
- Proxy
- AbortController / AbortSignal
- queueMicrotask
- fetch

It does not require a native browser `Signal` API. The internal signal graph can be adapted to TC39 Signals later without changing component syntax.

## Current limitations

- no SSR or hydration yet
- no async resource/suspense primitive yet
- no error-boundary component primitive yet
- expressions inside `{...}` are property paths; use `computed()` for derived logic
- component scripts are compiled with `AsyncFunction`; a strict CSP therefore currently needs an `unsafe-eval` allowance

The core is intentionally small: browser components + compiled HTML parts + fine-grained signals + scoped lifecycle.
