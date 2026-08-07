---
name: skein-web
description: Build, modify, review, or debug websites and Web Components using the Skein HTML-first reactive runtime. Use for Skein bindings, component composition, component files, creative CSS/SVG/Canvas/Web Audio, keyed lists, lifecycle/cleanup, SEO, playground examples, or changes to the runtime itself.
license: MIT
compatibility: Browser projects using Skein 0.5+ or the Skein repository. Core work should remain zero-dependency and runnable without a build step.
metadata:
  author: Pom4H
  version: "0.3.0"
---

# Skein Web

Use Skein as a thin reactive layer over native HTML, CSS, SVG, Canvas, Web Audio and Custom Elements.

## Choose the smallest shape

For a tiny demo, prefer one file:

```html
<hello-card></hello-card>

<template skein="hello-card">
  <script>this.name = 'world'</script>
  <h2>Hello {name}</h2>
</template>

<script type="module"
  src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js">
</script>
```

For larger projects, external files map from tag names:

```text
<user-card> -> user/card.html
<studio-mixer> -> studio/mixer.html
```

Read `references/syntax.md` for the full application API.

## Keep content as HTML

Skein has no SSR today. Static, semantic, linkable or SEO-critical content should stay in the original document. Use Skein for interactive regions; if a server must compute HTML, do that outside Skein and enhance the result.

## Write ordinary state

```html
<script>
  this.count = 0
  this.user = { name: 'Ada' }
  this.increment = () => this.count++
  this.total = computed(() => this.price * this.quantity)
</script>
```

Braces contain property paths, not arbitrary JavaScript expressions.

## Bind native DOM semantics

```html
<h1>{title}</h1>
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Use `@event={handler}`. Do not generate the removed `onclick={handler}` alias.

## Compose with properties down and events up

Child:

```html
<script>
  this.value = input('value', 0)
  this.raise = () => host.dispatchEvent(new CustomEvent('value-change', {
    detail: { value: this.value + 1 },
    bubbles: true,
    composed: true
  }))
</script>

<button @click={raise}>{value}</button>
```

Owner:

```html
<value-stepper
  .value={value}
  @value-change={changed}>
</value-stepper>
```

`input(name, fallback)` declares a reactive host property. It preserves a property written before the child file finishes loading. Inputs are one-way; use native `CustomEvent` for child-to-owner requests/notifications. Do not add framework stores, provide/inject or an event bus merely to connect Skein components.

Use `examples/studio/` as the reference for non-trivial composition.

## Preserve list identity

```html
<article for={projects} key={id}>
  <b>{index}. {title}</b>
  <input>
</article>
```

Do not replace keyed reconciliation with `innerHTML`, full-list cloning or index identity.

## Let native media do their jobs

Bind values into CSS custom properties and let CSS animate/layout. Keep SVG as SVG. Keep Canvas/Web Audio imperative and use Skein for state, controls, component boundaries and lifecycle.

## Own resources

```js
window.addEventListener('resize', this.measure, { signal: abortSignal })
fetch(url, { signal: abortSignal })

const id = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(id))
```

The injected component helpers are:

```text
input
computed
effect
onCleanup
host
abortSignal
```

Synchronous state writes already share a microtask wave. Do not invent `batch()`.

## When modifying Skein itself

Read `references/architecture.md` first. Preserve zero dependencies, no virtual DOM, exact dependency tracking, keyed identity, scoped cleanup, composition timing guarantees, render-before-user-effect scheduling, reconnect semantics and production runtime correctness.

Run:

```bash
node tools/build.mjs
node test/run.mjs
```

The repository tests the generated `skein.min.js` and the multi-file composition path in real Chrome. Do not add a test framework or bundler just for runtime work.

## Avoid

Do not invent JSX/template expressions, rebuild full lists, use JS for CSS layout/animation, wrap SVG in a framework object model, make Canvas declarative pixel-by-pixel, silently add dependencies, expose scheduler internals, add a second component communication system, or claim SSR/hydration/suspense/error boundaries exist.

## Repository context

When working inside the Skein repository also read `AGENTS.md`, `llms-full.txt`, `references/syntax.md`, `references/architecture.md` and `README.md`.
