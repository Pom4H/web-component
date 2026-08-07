# Skein syntax reference

Use this file when generating or reviewing Skein 0.5 application code.

## Component source

A component is HTML containing optional top-level `<script>`, markup and `<style>`:

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

The component script runs with `this` bound to a deep reactive state Proxy.

## Registration

Inline one-file form:

```html
<my-card></my-card>

<template skein="my-card">
  ...component source...
</template>

<script type="module"
  src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js">
</script>
```

Programmatic registration is intended mainly for playgrounds/generated source:

```js
Skein.define('my-card', `
  <script>this.count = 0<\/script>
  <p>{count}</p>
`)
```

External files map directly from custom-element names:

```text
<foo-bar> -> foo/bar.html
<app-home-card> -> app/home/card.html
```

## Bindings

Text:

```html
<h1>{title}</h1>
<p>{user.profile.name}</p>
```

String attributes:

```html
<div data-id={id} title="Project {title}"></div>
```

A full attribute binding removes the attribute for `null`, `undefined` or `false`.

DOM property:

```html
<input .value={name}>
```

Boolean attribute:

```html
<button ?disabled={saving}>Save</button>
```

Event:

```html
<button @click={save}>Save</button>
```

Use `@event={handler}`. `onclick={save}` is not Skein 0.5 syntax.

## Component inputs and outputs

Skein composition follows native Custom Element semantics: **properties down, events up**.

A child declares a reactive host-property input in its script:

```html
<script>
  this.volume = input('volume', .5)
</script>

<strong>{volume}</strong>
```

The owner binds the ordinary DOM property:

```html
<audio-strip .volume={volume}></audio-strip>
```

`input(name, fallback)`:

- returns a property value already written to the custom element before the child mounts, otherwise `fallback`;
- installs a host property accessor backed by the child's reactive state;
- makes later `element.volume = value` writes reactive inside the child;
- does not create two-way state binding.

For child-to-owner communication, dispatch a native event:

```js
host.dispatchEvent(new CustomEvent('volume-change', {
  detail: { volume: this.volume },
  bubbles: true,
  composed: true
}))
```

The owner listens with the normal Skein event binding:

```html
<audio-strip
  .volume={volume}
  @volume-change={volumeChange}>
</audio-strip>
```

Do not invent a framework event bus or mutate owner state through an input object as a substitute for an explicit event contract.

## Context

```html
<section in={user}>
  <h2>{name}</h2>
  <p>{email}</p>
</section>
```

Lookup walks lexical contexts outward to root state. A present local property whose value is `undefined` still shadows an outer property.

## Lists

```html
<li for={items} key={id}>
  {index}: {title}
</li>
```

List locals are `index` and `$index`. Use stable unique keys for durable application identity. Objects use object identity when `key` is omitted. Normal HTML such as `<label for="email">` remains unchanged; only exact `for={...}` is structural.

## Conditions

```html
<section if={visible}>...</section>
```

The branch owns a child scope and is disposed when hidden.

## Computed

```js
this.fullName = computed(() => `${this.first} ${this.last}`)
```

Bind normally:

```html
<strong>{fullName}</strong>
```

## Effects

```js
effect(() => console.log(this.count))
```

Render work settles before user effects. Synchronous writes already share one microtask flush; there is no public `batch()` helper.

## Cleanup

```js
const timer = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(timer))
```

Prefer `abortSignal` where the platform supports it:

```js
window.addEventListener('resize', this.resize, { signal: abortSignal })
fetch(url, { signal: abortSignal })
```

`abortSignal` is lazily allocated.

## Host

`host` is the current Skein custom element. Use it for real host/shadow-root access and native event dispatch. Permanent teardown is `host.dispose()`.

## Public module API

```js
Skein.version
Skein.define(tag, source)
```

Do not generate `Skein.stats`, `Skein.flush`, `Skein.Signal`, `signal()`, `untrack()` or `batch()`; these are not public v0.5 APIs.

## Static page content

Do not wrap static page copy in a component only for consistency:

```html
<h1>Native creative web experiences.</h1>
<p>This text exists before JavaScript runs.</p>
<interactive-art></interactive-art>
```

Skein can own the interactive region while the document remains meaningful without JavaScript.
