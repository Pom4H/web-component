# AGENTS.md

This repository contains **Skein**, a zero-dependency, HTML-first Web Components runtime for fine-grained reactive CSS, SVG, Canvas and native-DOM sites.

## Before changing code

If the task touches Skein application syntax, read:

- `llms-full.txt`
- `.agents/skills/skein/references/syntax.md`

If the task touches runtime internals, rendering, reactivity, reconciliation, lifecycle or performance, also read:

- `.agents/skills/skein/references/architecture.md`
- the relevant file under `runtime/`
- the relevant browser/core tests under `test/`

## Project invariants

Preserve these unless the user explicitly asks to change them:

- zero runtime dependencies;
- no virtual DOM;
- no build step required for users;
- no component-wide rerender loop;
- ordinary JavaScript state through a reactive Proxy;
- templates remain normal HTML;
- `{...}` contains property paths, not arbitrary JavaScript;
- computed logic belongs in `computed()`;
- specialized DOM bindings preserve native semantics;
- keyed lists preserve DOM identity across reorder;
- scopes own effects and cleanup;
- disconnect pauses, explicit `dispose()` destroys;
- render work settles before user effects;
- CSS, SVG and Canvas should stay native rather than be wrapped in framework-specific representations.

## SEO and document content

Skein currently does not provide SSR or hydration.

Do not solve this by moving meaningful content into client-only components. Prefer static semantic HTML for content that should exist before JavaScript runs: titles, headings, value propositions, navigation links, product copy, article text, structured data and other crawlable content.

Use Skein as an enhancement layer for interactive regions. If request-time HTML generation is required, use a server/static-generation layer outside Skein and enhance the result with Skein.

Never claim Skein currently implements SSR, hydration, suspense or error boundaries.

## Public entry points

Canonical runtime:

```text
skein.js
```

Public GitHub-backed CDN during this phase:

```text
https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js
```

For reproducible production examples, prefer pinning a commit SHA rather than `@main`.

`web-component.js` remains a compatibility alias.

## Application patterns

Tiny apps and examples should prefer the one-file form when that makes the example clearer:

```html
<demo-card></demo-card>

<template skein="demo-card">
  <script>
    this.count = 0
    this.inc = () => this.count++
  </script>

  <button @click={inc}>{count}</button>
</template>

<script type="module" src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.js"></script>
```

Larger projects can use external component files where `<foo-bar>` resolves to `foo/bar.html`.

Use stable keys for application lists:

```html
<li for={items} key={id}>{title}</li>
```

Use native DOM semantics:

```html
<input .value={name}>
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

## Creative-site rule

When building visual experiences:

- bind values into CSS custom properties and let CSS animate/layout;
- keep SVG as actual SVG and update only dynamic attributes/properties;
- keep Canvas imperative and use Skein for state, controls and lifecycle;
- register timers, animation frames, observers, listeners and requests with `abortSignal` or `onCleanup()`.

Do not add editor, animation, state-management, templating or rendering libraries unless the user explicitly requests them.

## Testing

Run the complete suite after runtime changes:

```bash
node test/run.mjs
```

Requirements are Node.js 22+ and Chrome/Chromium (`CHROME_BIN` may be set explicitly).

The test harness deliberately uses Node built-ins and raw Chrome DevTools Protocol. Do not add Playwright, Puppeteer, jsdom, Jest, Vitest or another test framework merely for convenience.

When changing runtime semantics, add a regression test for the actual invariant being changed rather than only a superficial rendered-text assertion.

## Documentation sync

When public syntax or behavior changes, update the relevant surfaces together:

- `README.md`
- `docs/`
- `llms.txt`
- `llms-full.txt`
- `.agents/skills/skein/`
- examples/playground when the change is user-visible.

Keep `llms.txt` concise and link-oriented. Put the fuller machine-readable explanation in `llms-full.txt`.
