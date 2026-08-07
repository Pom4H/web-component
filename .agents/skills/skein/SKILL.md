---
name: skein-web
description: Build, modify, review, or debug websites and Web Components using the Skein HTML-first reactive runtime. Use for Skein bindings, component files, creative CSS/SVG/Canvas work, keyed lists, lifecycle/cleanup, SEO/progressive enhancement, playground examples, or changes to the Skein runtime itself.
license: MIT
compatibility: Browser projects using Skein 0.4+ or the Skein repository. Core work should remain zero-dependency and runnable without a build step.
metadata:
  author: Pom4H
  version: "0.2.0"
---

# Skein Web

Use Skein as a thin reactive layer over the native web platform. Preserve normal HTML, CSS, SVG, Canvas, Custom Elements and browser lifecycle instead of replacing them with framework abstractions.

## Decide the shape first

For a tiny demo, prototype, embed, or single-page experiment, prefer one HTML file:

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

The production runtime is `skein.min.js`: 21.4 kB raw, 6.1 kB gzip, 5.6 kB Brotli, zero dependencies. For reproducible production output, pin a commit SHA rather than `@main`.

For a larger project, use external component files. A tag maps to a path by replacing hyphens with slashes:

```text
<user-card> -> user/card.html
```

Read `references/syntax.md` when you need the binding/API reference.

## Keep content as HTML

Skein has no SSR today. Do not respond by moving the entire page into client-rendered components.

If content is static, semantic, linkable, accessibility-critical, or important for SEO, prefer writing it directly in the document:

```html
<main>
  <h1>Creative sites with native HTML, CSS, SVG and Canvas.</h1>
  <p>Skein adds fine-grained reactive bindings without a virtual DOM.</p>
  <a href="/work/">See the work</a>

  <interactive-demo></interactive-demo>
</main>
```

Use Skein for the interactive region. If a server must compute HTML per request, use an external server/static-generation layer and let Skein enhance the delivered HTML. Never claim Skein itself currently provides SSR or hydration.

## Write ordinary state

A component `<script>` runs with `this` bound to reactive state:

```html
<script>
  this.count = 0
  this.user = { name: 'Ada' }
  this.increment = () => this.count++
</script>
```

Prefer ordinary property assignment. Do not introduce `.get()` / `.set()` ceremony into application code.

Use `computed()` for derived values:

```js
this.total = computed(() => this.price * this.quantity)
```

Template braces contain paths, not arbitrary JavaScript expressions.

## Bind to the correct DOM primitive

```html
<h1>{title}</h1>
<div title="Project {title}"></div>
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

Do not stringify a DOM property when a property binding is appropriate. Do not create reactive event-listener rebindings when one event binding is sufficient.

## Preserve list identity

For application records, use a stable key:

```html
<article for={projects} key={id}>
  <b>{index}. {title}</b>
  <input>
</article>
```

Do not replace keyed reconciliation with `innerHTML`, full-list cloning, or index-only identity. Skein intentionally preserves DOM nodes and local form state across reorder.

## Let CSS, SVG, and Canvas do their own jobs

Bind state into the native medium rather than recreating the medium in JavaScript.

```html
<article style="--x:{x}px"></article>
<circle cx={x} cy={y} r="6" />
```

Let CSS animate/layout. Keep the SVG tree native. Canvas should normally keep an imperative render loop; use Skein for state, controls and lifecycle.

## Own resources correctly

Prefer browser APIs that accept the scope-owned `abortSignal`:

```js
window.addEventListener('resize', this.measure, { signal: abortSignal })
fetch(url, { signal: abortSignal })
```

For anything else:

```js
const id = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(id))
```

## When modifying Skein itself

Read `references/architecture.md` before changing runtime behavior.

Preserve these invariants:

- zero core dependencies;
- no virtual DOM;
- no component-level rerender loop;
- templates compile once per source;
- exact signal dependencies drive exact DOM parts;
- parts skip equal DOM commits;
- keyed list identity survives reorder;
- scopes own effects and cleanup;
- render work settles before user effects;
- reconnect pauses/resumes rather than destroying state;
- `skein.min.js` remains behaviorally equivalent to the readable runtime.

Run:

```bash
node test/run.mjs
```

Do not add Playwright, Puppeteer, jsdom, Jest, Vitest, a bundler, or a test framework just to implement a runtime change. The repository deliberately tests with Node built-ins and real Chrome through CDP.

## Avoid these patterns

Do not:

- move static SEO copy into a client-only component without a reason;
- invent JSX or a second template language;
- put arithmetic or arbitrary expressions inside `{...}`;
- rerender whole components after state writes;
- rebuild an entire list after `push`, `splice`, `sort`, or reverse;
- use JavaScript for CSS transitions/layout that CSS already handles;
- wrap SVG in a framework-specific object model;
- make Canvas declarative pixel-by-pixel;
- silently add third-party dependencies;
- resurrect removed pre-Skein globals or entry files;
- claim SSR, hydration, suspense, or error boundaries already exist.

## Useful project context

If working inside the Skein repository, also read:

- `AGENTS.md` for repository-wide agent rules.
- `llms-full.txt` for the compact complete public model.
- `references/syntax.md` for application syntax.
- `references/architecture.md` for runtime internals.
- `README.md` for human-facing project documentation.
