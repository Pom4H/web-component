# Skein syntax reference

Load this file when generating or reviewing Skein application code.

## Component source

A Skein component source is HTML containing optional `<script>`, markup and `<style>`.

The component script runs with `this` bound to the component's reactive state.

```html
<script>
  this.count = 0
  this.inc = () => this.count++
</script>

<button @click={inc}>{count}</button>

<style>
  button { font: inherit; }
</style>
```

## Inline registration

```html
<my-card></my-card>

<template skein="my-card">
  ...component source...
</template>

<script type="module" src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js"></script>
```

Production entry: `skein.min.js` — 21.4 kB raw, 6.1 kB gzip, 5.6 kB Brotli. `skein.js` is the readable modular source entry.

## Programmatic registration

```js
Skein.define('my-card', `
  <script>this.count = 0<\/script>
  <p>{count}</p>
`)
```

## External files

Tag names map to paths:

```text
<foo-bar> -> foo/bar.html
<app-home-card> -> app/home/card.html
```

## Text/path binding

```html
<h1>{title}</h1>
<p>{user.profile.name}</p>
```

Braces contain property paths only. Use `computed()` for logic.

## String attributes

```html
<div data-id={id} title="Project {title}"></div>
```

For an exact binding, `null`, `undefined`, or `false` removes the attribute.

## DOM properties

```html
<input .value={name}>
```

Use `.property` when the live DOM property matters.

## Boolean attributes

```html
<button ?disabled={saving}>Save</button>
```

## Events

Preferred:

```html
<button @click={save}>Save</button>
```

Also supported:

```html
<button onclick={save}>Save</button>
```

Legacy inline browser handler:

```html
<button onclick="$.save(event)">Save</button>
```

`$` is the component state exposed on rendered elements for this compatibility style.

## Context

```html
<section in={user}>
  <h2>{name}</h2>
  <p>{email}</p>
</section>
```

Contexts are lexical. Lookup walks outward through parent contexts and finally root component state.

## Lists

```html
<li for={items} key={id}>
  {index}: {title}
</li>
```

Available list locals: `index` and `$index`. Use stable keys for durable identity.

A normal HTML attribute such as `<label for="email">` is not a list binding. Only a full `for={...}` expression is structural.

## Conditions

```html
<section if={visible}>
  ...
</section>
```

The branch owns a child scope and is disposed when hidden.

## Computed

```js
this.fullName = computed(() => `${this.first} ${this.last}`)
```

Then bind normally:

```html
<strong>{fullName}</strong>
```

## Effects and batch

```js
effect(() => console.log(this.count))

batch(() => {
  this.x = 1
  this.y = 2
})
```

User effects run after render work.

## Signal and untrack

```js
const selected = signal(null)
selected.value = 42
const snapshot = untrack(() => this.largeObject)
```

Application state usually should remain normal `this.property` assignments.

## Cleanup

```js
const timer = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(timer))
```

Prefer `abortSignal` when a platform API supports it:

```js
window.addEventListener('resize', this.resize, { signal: abortSignal })
fetch(url, { signal: abortSignal })
```

## Host

`host` is the current custom element instance. Use it when access to the custom element or its shadow root is genuinely needed.

## Static page content

Do not wrap static page copy in a Skein component just for consistency.

```html
<h1>Native creative web experiences.</h1>
<p>This text exists before JavaScript runs.</p>
<interactive-art></interactive-art>
```

The document can remain crawlable and meaningful while Skein owns only the interactive part.
