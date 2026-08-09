---
name: skein-web
description: Build, modify, review, or debug websites and Web Components using the Skein HTML-first reactive runtime. Use for Skein bindings, composition, component files, CSS/SVG/Canvas/Web Audio, keyed lists, lifecycle/cleanup, SEO, examples, or runtime changes.
license: MIT
compatibility: Browser projects using Skein 0.6+ or the Skein repository. Core work remains zero-dependency and runnable without a user build step.
metadata:
  author: Pom4H
  version: "0.4.0"
---

# Skein Web

Use Skein as a thin reactive layer over native HTML, CSS, SVG, Canvas, Web Audio and Custom Elements.

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

## State

```html
<script>
  this.count = 0
  this.user = { name: 'Ada' }
  this.increment = () => this.count++
  this.total = computed(() => this.price * this.quantity)
</script>
```

Plain objects/arrays are reactive. Date, Map, Set, DOM/platform objects and class instances stay native. Do not wrap native objects just to put them in Skein state.

## Bindings

```html
<h1>{user.name}</h1>
<label for={inputId}>Name</label>
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Braces contain strict property paths. Use `computed()` for expressions. `in={...}` was removed in 0.6; write full paths.

## Composition

Child:

```html
<script>
  input('value', 0)
  this.raise = () => host.dispatchEvent(new CustomEvent('value-change', {
    detail: { value: this.value + 1 }, bubbles: true, composed: true
  }))
</script>
<button @click={raise}>{value}</button>
```

Owner:

```html
<value-stepper .value={value} @value-change={changed}></value-stepper>
```

Input values written before child mount are adopted. Input host-name collisions throw. Inputs are one-way; outputs are native events. Do not invent stores/provide-inject/event buses merely for component communication.

## Lists

```html
<article each={projects} key={id}>
  <b>{index}. {title}</b>
  <input>
</article>
```

Use `each`, not the removed list `for`. Native dynamic `for={inputId}` stays HTML. Explicit keys must be stable, non-null and unique; Skein validates before reconciling.

## Native APIs and cleanup

Keep SVG as SVG and Canvas/Web Audio imperative. Bind state into CSS custom properties instead of scripting layout/animation.

```js
window.addEventListener('resize', this.measure, { signal: abortSignal })
fetch(url, { signal: abortSignal })
const id = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(id))
```

Injected names: `input`, `computed`, `effect`, `onCleanup`, `host`, `abortSignal`.

## Custom Element coexistence

Skein fetches a tag's matching HTML file before defining the custom element. A missing source leaves the tag unclaimed. Never restore eager claiming of every undefined custom element. Nested third-party custom elements must not be force-disposed; only nested `SkeinElement`s receive permanent `dispose()` on renderer-owned removal.

## Runtime work

Read `references/architecture.md` first. Preserve zero dependencies, no virtual DOM, exact dependency tracking, shared Proxy identity, native opaque objects, keyed identity, transactional mount rollback, scoped cleanup, render-before-user-effect scheduling, reconnect semantics and minified production correctness.

Run:

```bash
node tools/build.mjs
node test/run.mjs
```

The suite drives readable and generated production runtimes in real Chrome and includes the multi-file Studio path.

## Avoid

Do not invent JSX/template expressions, full-list rerenders, `in` contexts, framework-specific component buses, public scheduler internals, SSR/hydration claims, arbitrary external-element disposal or dependencies that duplicate browser APIs.
