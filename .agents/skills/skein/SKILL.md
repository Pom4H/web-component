---
name: skein-web
description: Build, modify, review, or debug websites and Web Components using the Skein HTML-first reactive runtime. Use for Skein bindings, composition, component files, native slots, CSS/SVG/Canvas/Web Audio, keyed lists, lifecycle/cleanup, SEO, examples, or runtime changes.
license: MIT
compatibility: Browser projects using Skein 0.6.1+ or the Skein repository. Core work remains zero-dependency and runnable without a user build step.
metadata:
  author: Pom4H
  version: "0.5.0"
---

# Skein Web

Use Skein as a thin reactive layer over native HTML, CSS, Shadow DOM, SVG, Canvas, Web Audio and Custom Elements.

## Smallest shape

```html
<hello-card></hello-card>
<template skein="hello-card">
  <script>this.name = 'world'</script>
  <h2>Hello {name}</h2>
</template>
<script type="module" src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js"></script>
```

External files map from tag names: `<user-card>` → `user/card.html`.

## State and bindings

```html
<script>
  this.count = 0
  this.user = { name: 'Ada' }
  this.increment = () => this.count++
  this.total = computed(() => this.price * this.quantity)
</script>

<h1>{user.name}</h1>
<label for={inputId}>Name</label>
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Plain objects/arrays are reactive. Platform/class objects stay native. Braces contain strict property paths; use `computed()` for expressions.

## Composition

Prefer exactly three browser mechanisms:

```text
data      → DOM properties
/actions/ ← bubbling + composed CustomEvent
content   → native <slot>
```

Do not add a store, provide/inject system, component event bus or framework slot abstraction merely to connect components.

### Inputs

```html
<script>
  input('name', 'Metric')
  input('value', 0)
</script>
```

Static primitive configuration can use literal attributes:

```html
<ui-metric name="Active" tone="lime"></ui-metric>
```

Live values and non-primitives use DOM properties:

```html
<ui-metric name="Active" .value={active}></ui-metric>
<task-card .task={task}></task-card>
```

Input initialization order is pre-mount property → static attribute → fallback. Attribute conversion follows the fallback type. A static attribute is only an initial seed; later attribute changes do not update child state. Objects/functions must use properties. Host-name collisions such as `title`, `state` and `dispose` throw.

### Outputs

```js
host.dispatchEvent(new CustomEvent('value-change', {
  detail: { value: this.value + 1 },
  bubbles: true,
  composed: true
}))
```

A composed event can cross nested Shadow DOM boundaries directly. Do not relay it through intermediate Skein components unless that component intentionally changes the domain event.

### Content

Use browser slots:

```html
<!-- ui/panel.html -->
<header><slot name="heading"></slot></header>
<slot></slot>
```

```html
<ui-panel>
  <span slot="heading">Tasks</span>
  <task-board .tasks={tasks}></task-board>
</ui-panel>
```

Use native `slotchange` / `assignedElements()` when needed.

## Lists

```html
<article each={projects} key={id}>
  <b>{index}. {title}</b>
  <input>
</article>
```

Use `each`, not the removed list `for`. Native dynamic `for={inputId}` stays HTML. Explicit keys must be stable, non-null and unique.

## Native APIs and cleanup

Keep SVG as SVG and Canvas/Web Audio imperative. Bind reactive values into CSS custom properties instead of scripting layout/animation.

```js
window.addEventListener('resize', this.measure, { signal: abortSignal })
const id = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(id))
```

Injected names: `input`, `computed`, `effect`, `onCleanup`, `host`, `abortSignal`.

## Application-scale reference

Use `examples/workspace/` when judging composition ergonomics. It contains 18 component types and intentionally uses no framework communication primitive beyond inputs plus browser events/slots. `test/workspace.mjs` validates it against generated `skein.min.js` in Chromium.

## Custom Element coexistence

Skein fetches a matching HTML file before defining an unknown custom tag. A missing source leaves the tag unclaimed. Never eagerly claim all undefined custom elements or force-dispose third-party elements.

## Runtime work

Read `references/architecture.md` first. Preserve zero dependencies, no virtual DOM, exact dependency tracking, shared Proxy identity, native opaque objects, keyed identity, transactional mount rollback, scoped cleanup, render-before-user-effect scheduling and generated-production correctness.

Run:

```bash
node tools/build.mjs
node tools/build.mjs --check
node test/run.mjs
node test/workspace.mjs
```

## Avoid

Do not invent JSX/template expressions, full-list rerenders, `in` contexts, framework-specific buses/slots, public scheduler internals, SSR/hydration claims, arbitrary external-element disposal or dependencies that duplicate browser APIs.
