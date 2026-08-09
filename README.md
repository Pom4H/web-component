# Skein

**Native web, tightly woven.**

Skein is a tiny HTML-first Web Components runtime with fine-grained reactivity.

- **15.4 kB raw / 5.7 kB gzip / 5.1 kB Brotli**
- zero runtime dependencies
- no virtual DOM
- no build step required
- reactive plain objects and arrays through native Proxy
- real Custom Elements + Shadow DOM
- native HTML, CSS, SVG, Canvas, Web Audio and platform objects
- keyed DOM identity and scoped cleanup

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

A custom-element tag maps directly to an HTML file:

```text
<counter-app>     -> counter/app.html
<workspace-shell> -> workspace/shell.html
<task-card>       -> task/card.html
```

The file is ordinary script, markup and style:

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

Skein fetches an unknown tag's source **before** registering it. A missing `foo/bar.html` leaves `<foo-bar>` undefined instead of stealing a tag owned by another Web Components library.

## State

A component `<script>` runs with `this` bound to reactive state:

```js
this.count++
this.user.name = 'Ada'
this.items.push({ id: 1, title: 'One' })
```

Plain objects and arrays are reactive recursively. The same raw object keeps one Skein Proxy identity when passed between components.

Platform objects and class instances stay native and opaque:

```js
this.createdAt = new Date()
this.cache = new Map()
this.audio = new AudioContext()
```

Skein tracks actual property reads. Synchronous writes settle in one microtask render wave, so there is no public `batch()` API.

## Bindings

```html
<h1>Hello {user.name}</h1>
<div title="User {user.name}" data-id={id}></div>
<label for={inputId}>Dynamic native for</label>
<input .value={user.name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Bindings contain **strict dotted property paths**, not JavaScript expressions. Put derived logic in `computed()`.

The prefixes are deliberately DOM-shaped:

```text
attribute   title={title}
property    .value={value}
boolean     ?disabled={saving}
event       @click={save}
```

## Composition

Skein applications compose with three browser primitives:

```text
data      -> DOM properties
/actions/ <- bubbling + composed CustomEvent
content   -> native <slot>
```

There is no Skein component bus, provide/inject layer or framework slot API.

### Inputs

A child declares the values it accepts:

```html
<script>
  input('name', 'Metric')
  input('value', 0)
</script>

<strong>{name}: {value}</strong>
```

For **static primitive configuration**, ordinary HTML attributes are enough:

```html
<ui-metric name="Active" tone="lime"></ui-metric>
```

The fallback determines primitive conversion: string stays a string, a numeric fallback parses with `Number()`, and the presence of an attribute for a boolean fallback means `true`.

For **live values, objects and functions**, use a DOM property:

```html
<ui-metric name="Active" .value={active}></ui-metric>
<task-card .task={task}></task-card>
```

Input initialization precedence is:

```text
pre-mount DOM property
        ↓
static primitive attribute
        ↓
fallback
```

A static attribute is an initial value, not a second reactive channel. Changing that attribute after mount does not update child state; use `.property={path}` when the value must stay live. Non-primitive attributes fail loudly instead of being JSON-parsed implicitly.

Later property assignments such as `element.value = 8` update child state reactively. Inputs stay one-way: children request changes with native events.

Input names may not shadow `HTMLElement` or Skein host APIs such as `title`, `state` or `dispose`.

### Outputs

Children dispatch ordinary DOM events:

```js
host.dispatchEvent(new CustomEvent('value-change', {
  detail: { value: this.value + 1 },
  bubbles: true,
  composed: true
}))
```

Owners listen declaratively:

```html
<value-stepper
  .value={value}
  @value-change={changed}>
</value-stepper>
```

Because the event is bubbling and composed, it can cross nested Shadow DOM boundaries. Intermediate Skein components do not need relay handlers.

### Content and layout

Use native slots directly:

```html
<!-- ui/panel.html -->
<section>
  <header><slot name="heading"></slot></header>
  <slot></slot>
</section>
```

```html
<ui-panel>
  <span slot="heading">Tasks</span>
  <task-board .tasks={tasks}></task-board>
</ui-panel>
```

Default slots, named slots, `slotchange` and `assignedElements()` are browser behavior; Skein does not wrap them.

## Application-scale proof

`examples/workspace/` is intentionally not a feature demo. It is a product-style workspace built from **18 component types**:

```text
workspace-app
└─ workspace-shell
   ├─ workspace-sidebar          slot=sidebar
   ├─ workspace-topbar           slot=topbar
   ├─ workspace-overview         default slot
   │  ├─ workspace-metrics → ui-metric
   │  ├─ ui-panel → project-list → project-row
   │  ├─ ui-panel → task-board → task-column → task-card
   │  ├─ ui-panel → team-strip → ui-avatar
   │  └─ ui-panel → activity-feed → activity-item
   └─ detail-drawer              slot=aside
```

It uses no store, router, event bus, provide/inject system or framework slot abstraction. Root state flows down through properties, leaf actions travel upward as composed DOM events, and layout composition is native slotting.

The regression `test/workspace.mjs` runs this graph against the generated production runtime in Chromium and verifies all 18 component definitions, slot assignment, static input attributes, property precedence, deep event propagation, search reactivity, task mutation and conditional drawer teardown.

## Lists

Skein uses `each={...}` so native HTML `for={...}` remains available:

```html
<article each={projects} key={id}>
  <b>{index}. {title}</b>
  <input placeholder="local DOM state survives reorder">
</article>
```

Stable keys preserve real DOM identity. Reorder moves existing node ranges instead of recreating them. `index`, `$index` and `$value` are available inside list scopes.

Explicit keys must resolve to non-null unique values. Duplicate or missing keys throw before reconciliation mutates the list.

## Conditions

```html
<section if={inspectorOpen}>
  <detail-panel></detail-panel>
</section>
```

A conditional branch owns a child scope. Hiding it disposes its effects, listeners and nested Skein components before removing its DOM range.

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

`computed()` is lazy, cached and dependency-tracked. User effects run after pending render effects settle.

## Cleanup

```html
<script>
  window.addEventListener('resize', this.measure, { signal: abortSignal })

  const timer = setInterval(this.tick, 1000)
  onCleanup(() => clearInterval(timer))
</script>
```

`abortSignal` is lazily allocated. Disconnect pauses a component scope; reconnect resumes dirty work. `host.dispose()` is permanent teardown.

## Component script API

| Helper | Purpose |
| --- | --- |
| `input(name, fallback)` | declare and initialize a reactive host-property input |
| `computed(fn)` | lazy cached derived state |
| `effect(fn)` | user effect after render effects |
| `onCleanup(fn)` | deterministic scope cleanup |
| `host` | current Skein custom element |
| `abortSignal` | scope-owned AbortSignal for native APIs |

## Public module API

```js
Skein.version
Skein.define(tag, source)
```

`Skein.define()` is intended for inline tooling, playgrounds and generated source. Normal multi-file applications should let tag-to-path loading fetch component files.

## Rendering model

```text
component.html
      ↓
parse + compile once
      ↓
real DOM clone + exact binding effects
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

## Examples

The public examples each have one architectural purpose:

- **Workspace** — 18-component application composition with native slots, properties and events.
- **Queue Board** — keyed DOM identity and native form behavior.
- **Field Atlas** — native SVG with exact reactive attribute writes.
- **Type Machine** — reactive values feeding native CSS custom properties.
- **Skein Studio** — multi-file Web Audio/Canvas composition.

## 0.6 migration

```diff
- <li for={items} key={id}>...</li>
+ <li each={items} key={id}>...</li>

- <section in={user}><b>{name}</b></section>
+ <section><b>{user.name}</b></section>

- this.value = input('value', 0)
+ input('value', 0)
```

Skein 0.6.1 additionally lets literal primitive attributes seed matching `input()` declarations.

## Testing and production build

```bash
node tools/build.mjs
node tools/build.mjs --check
node test/run.mjs
node test/workspace.mjs
```

Both browser suites use Node built-ins plus raw Chrome DevTools Protocol; no test framework is required.

## Constraints

Skein currently does not implement SSR, hydration, suspense or error boundaries. Keep static, semantic and SEO-critical content as ordinary document HTML when possible and enhance interactive regions with Skein.

Component scripts execute through `AsyncFunction`, so a strict Content Security Policy still requires allowing dynamic evaluation.

## License

MIT
