# Skein

**Reactive Web Components in plain HTML files — no npm or compiler.**

Skein is a small browser runtime for interactive widgets on static sites and server-rendered pages. Write each component as ordinary HTML containing its script and style; Skein supplies fine-grained reactivity while Custom Elements, Shadow DOM and the rest of the browser stay native.

- **15,839 B raw / 5,686 B gzip / 5,123 B Brotli**
- zero runtime dependencies
- no virtual DOM
- no npm, compiler or application build step required
- reactive plain objects and arrays through native Proxy
- real Custom Elements + Shadow DOM
- native HTML, CSS, SVG, Canvas, Web Audio and platform objects
- keyed DOM identity and scoped cleanup

The production artifact is one ES module: `skein.min.js`. It is designed for browser-side interactive regions: data visualizations, instruments, media controls and small application surfaces built with native CSS, SVG, Canvas or Web Audio.

## Where Skein fits

Use Skein when the deployable artifact should remain a folder of static files, but plain Custom Elements would leave you writing reactive updates, keyed DOM identity and cleanup by hand. It is especially suited to:

- interactive SVG and Canvas visualizations;
- Web Audio tools and media controls;
- widgets embedded in static sites, CMS pages or existing server applications;
- kiosks and browser-based device interfaces where SSR is not required.

Skein is not trying to replace an SSR application framework or a mature design-system toolchain. If your application already depends on a compiler and full framework ecosystem, that framework will usually be the more practical default.

## 60-second start: one page, one component

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

Save that as `index.html`, serve the directory over HTTP and open it in a modern browser. No package manifest, CLI, config or bundler is required. The inline template is useful for a first widget; when it grows, move its contents into `click/count.html` and keep `<click-count>` in the page. Pin a commit SHA instead of `@main` for reproducible production sites.

## Browser Playground

[Open the zero-dependency Playground](https://pom4h.github.io/web-component/playground/) to edit a complete component and run it beside its preview. The editor provides line numbers, cursor and selection position, syntax highlighting, smart indent/outdent and a draggable desktop editor/preview split without embedding a third-party editor.

Each built-in example keeps its own auto-saved browser-local draft. **Reset** restores the repository source, while **Share** copies a URL containing the current source. Run, save and share actions report their state in the workspace, and runtime errors can be read and dismissed without covering the editor permanently.

```text
Ctrl/Cmd + Enter   run
Ctrl/Cmd + S       save the current example draft
Tab / Shift+Tab    indent / outdent the current line or selection
```

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
<reactor-core --load={reactor.load}></reactor-core>
```

Bindings contain **strict dotted property paths**, not JavaScript expressions. Put derived logic in `computed()`.

The prefixes are deliberately DOM-shaped:

```text
attribute   title={title}
property    .value={value}
boolean     ?disabled={saving}
event       @click={save}
CSS custom  --load={reactor.load}
```

`--name={path}` is a fine-grained CSS custom-property binding. Skein updates that one declaration with `element.style.setProperty('--name', value)`. When the value is `null`, `undefined` or `false`, it removes only that declaration with `removeProperty()`; `0` remains a valid value.

```html
<reactor-core
  data-state={reactor.state}
  style="display:block; contain:layout"
  --temperature={reactor.temperature}
  --load={reactor.load}>
</reactor-core>
```

This does not build or replace a serialized `style` attribute. Ordinary static inline declarations and other custom properties remain intact. If static `style` declares the same custom property, the binding owns that declaration; a removal value removes it and lets the normal cascade or fallback apply. Do not also bind the whole `style={path}` attribute on that element: whole-attribute and per-property writes have competing ownership. CSS custom properties also inherit through Shadow DOM, so a binding on the custom-element host can drive its internal styles directly:

```css
:host { --load: 0; }
.core { transform: scale(calc(1 + var(--load) * .04)); }
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

The public examples show the browser-native workloads Skein is intended for:

- **Hello Counter** — the smallest editable state, event and CSS custom-property example.
- **Workspace** — 18-component application composition with native slots, properties and events.
- **Queue Board** — keyed DOM identity and native form behavior.
- **Field Atlas** — an interactive native SVG with exact reactive attribute writes.
- **Type Machine** — four independent `--name={path}` bindings feeding native CSS while a normal inline style remains intact.
- **Skein Studio** — a browser-only Web Audio instrument with Canvas visualization, composed from multiple HTML component files.

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

Skein currently does not implement SSR, hydration, suspense or error boundaries. Keep static, semantic and SEO-critical content as ordinary document HTML and use Skein for browser-side interactive regions.

Component scripts execute through `AsyncFunction`, so a strict Content Security Policy still requires allowing dynamic evaluation.

## License

MIT
