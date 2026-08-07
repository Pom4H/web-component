---
name: skein-web
description: Build, modify, review, or debug websites and Web Components using the Skein HTML-first reactive runtime. Use for Skein bindings, component files, creative CSS/SVG/Canvas work, keyed lists, lifecycle/cleanup, SEO/progressive enhancement, playground examples, or changes to the Skein runtime itself.
license: MIT
compatibility: Browser projects using Skein 0.5+ or the Skein repository. Core work should remain zero-dependency and runnable without a build step.
metadata:
  author: Pom4H
  version: "0.2.0"
---

# Skein Web

Use Skein as a thin reactive layer over native HTML, CSS, SVG, Canvas and Web Components.

## Choose the smallest shape

For a tiny demo or prototype, prefer one file:

```html
<hello-card></hello-card>

<template skein="hello-card">
  <script>
    this.name = 'world'
  </script>

  <h2>Hello {name}</h2>
</template>

<script type="module"
  src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js">
</script>
```

For larger projects, external component files map from tag names:

```text
<user-card> -> user/card.html
```

Read `references/syntax.md` for the application API.

## Keep content as HTML

Skein has no SSR today. Do not move the whole page into client-only components as a workaround.

If content is static, semantic, linkable or important for SEO/accessibility, write it directly in the document:

```html
<main>
  <h1>Creative sites with native HTML, CSS, SVG and Canvas.</h1>
  <p>Fine-grained reactivity without a virtual DOM.</p>
  <a href="/work/">See the work</a>
  <interactive-demo></interactive-demo>
</main>
```

Use Skein for the interactive region. If a server must compute HTML, do that outside Skein and enhance the result.

## Write ordinary state

```html
<script>
  this.count = 0
  this.user = { name: 'Ada' }
  this.increment = () => this.count++
</script>
```

Use `computed()` for derived values:

```js
this.total = computed(() => this.price * this.quantity)
```

Braces contain paths, not arbitrary JavaScript expressions.

## Bind to native DOM semantics

```html
<h1>{title}</h1>
<div title="Project {title}"></div>
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Use `@event={handler}` for reactive event binding. Do not generate the removed `onclick={handler}` alias.

## Preserve list identity

```html
<article for={projects} key={id}>
  <b>{index}. {title}</b>
  <input>
</article>
```

Do not replace keyed reconciliation with `innerHTML`, full-list cloning or index identity. Persistent rows should keep their DOM nodes and browser-local form state across reorder.

## Let CSS, SVG and Canvas do their jobs

CSS:

```html
<article style="--x:{x}px"></article>
```

SVG:

```html
<circle cx={x} cy={y} r="6" />
```

Canvas should normally keep an imperative render loop. Use Skein for state, controls and lifecycle.

## Own resources

Prefer native `abortSignal` support:

```js
window.addEventListener('resize', this.measure, { signal: abortSignal })
fetch(url, { signal: abortSignal })
```

For other resources:

```js
const id = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(id))
```

The component-script helpers are only:

```text
computed
effect
onCleanup
host
abortSignal
```

Synchronous state writes are already scheduled into one microtask wave. Do not invent or use `batch()`.

## When modifying Skein itself

Read `references/architecture.md` first.

Preserve:

- zero core dependencies;
- no virtual DOM;
- no component-level rerender;
- compiled binding paths;
- exact dependency tracking;
- keyed DOM identity;
- scoped cleanup;
- render-before-user-effect scheduling;
- reconnect pause/resume semantics;
- production runtime correctness.

Run:

```bash
node tools/build.mjs
node test/run.mjs
```

The repository deliberately tests the generated `skein.min.js` in real Chrome. Do not add a test framework or bundler just to implement runtime work.

## Avoid

Do not:

- hide static SEO copy inside client-only components without a reason;
- invent JSX or another template language;
- put arbitrary expressions inside `{...}`;
- rerender whole components after a state write;
- rebuild whole keyed lists after native array mutations;
- use JS for CSS animation/layout that CSS already handles;
- wrap SVG in a framework-specific object model;
- make Canvas declarative pixel-by-pixel;
- add dependencies silently;
- expose low-level signal/scheduler APIs just because they exist internally;
- claim SSR, hydration, suspense or error boundaries already exist.

## Repository context

When working inside the Skein repository also read:

- `AGENTS.md`
- `llms-full.txt`
- `references/syntax.md`
- `references/architecture.md`
- `README.md`
