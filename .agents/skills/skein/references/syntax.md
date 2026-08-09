# Skein 0.6 syntax reference

## Component source

A component is HTML containing optional top-level `<script>`, markup and `<style>`:

```html
<script>
  this.count = 0
  this.inc = () => this.count++
</script>
<button @click={inc}>{count}</button>
<style>button { font: inherit; }</style>
```

`this` is component reactive state.

## Registration

Inline:

```html
<my-card></my-card>
<template skein="my-card">...</template>
<script type="module" src="https://cdn.jsdelivr.net/gh/Pom4H/web-component@main/skein.min.js"></script>
```

External files:

```text
<foo-bar> -> foo/bar.html
<app-home-card> -> app/home/card.html
```

Programmatic registration is mainly for tooling:

```js
Skein.define('my-card', '<p>{title}</p>')
```

A tag is registered once. Redefinition throws. For auto-loaded tags, Skein fetches the matching file before calling `customElements.define`; a 404 leaves the tag available to another Web Components library.

## State

Plain objects and arrays are reactive recursively:

```js
this.user = { name: 'Ada' }
this.items = [{ id: 1 }]
this.user.name = 'Grace'
this.items.push({ id: 2 })
```

Date, Map, Set, DOM nodes, AudioContext and class instances stay native/opaque. Mutations inside those objects are not reactive automatically.

Shared plain objects keep one Skein Proxy identity across component state roots and property inputs.

## Binding paths

Bindings accept strict dotted property paths only:

```html
<h1>{user.profile.name}</h1>
<div title="User {user.name}"></div>
```

Whitespace/expression syntax is invalid. Use `computed()` for derived values.

Lookup checks own properties only and walks from the current list item scope through outer list scopes to root component state. A present own property whose value is `undefined` still shadows outer scopes.

`in={...}` does not exist in 0.6. Write the full path.

## Native bindings

String attribute:

```html
<div data-id={id} title="Project {title}"></div>
<label for={inputId}>Name</label>
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

`.`, `?` and `@` bindings must contain exactly one path. `onclick={save}` is not Skein syntax.

## Component inputs and outputs

Properties down, events up.

Child:

```html
<script>
  input('volume', .5)
  this.change = event => host.dispatchEvent(new CustomEvent('volume-change', {
    detail: { volume: Number(event.currentTarget.value) },
    bubbles: true,
    composed: true
  }))
</script>
<strong>{volume}</strong>
```

Owner:

```html
<audio-strip .volume={volume} @volume-change={volumeChange}></audio-strip>
```

`input(name, fallback)`:

- installs a host property accessor backed by child reactive state;
- seeds child state with a property value written before upgrade/mount, otherwise `fallback`;
- makes later `element.volume = value` writes reactive inside the child;
- returns the initial value for compatibility with `this.volume = input(...)`;
- rejects names that collide with HTMLElement or Skein host APIs;
- does not create two-way binding.

Use native `CustomEvent` for child-to-owner requests/notifications.

## Lists

```html
<li each={items} key={id}>
  {index}: {title}
</li>
```

List locals are `index` and `$index`. Stable unique keys preserve DOM identity. Explicit keys that resolve to `null`/`undefined` or duplicate another key throw before reconciliation mutates DOM.

When `key` is omitted, object items use object identity; repeated primitive values use occurrence identity. Prefer explicit stable keys for application records.

The old `for={items}` list directive was removed so native dynamic `for={inputId}` remains ordinary HTML.

## Conditions

```html
<section if={visible}>...</section>
```

`if` accepts one path. Hiding a branch disposes its child reactive scope, nested Skein components and DOM range. Third-party custom elements are only disconnected; Skein never calls arbitrary external `dispose()` methods.

## Computed and effects

```js
this.fullName = computed(() => `${this.first} ${this.last}`)
effect(() => console.log(this.fullName))
```

Computed values are lazy/cached. Render effects settle before user effects. Synchronous writes already batch into one microtask.

## Cleanup

```js
const timer = setInterval(this.tick, 1000)
onCleanup(() => clearInterval(timer))

window.addEventListener('resize', this.resize, { signal: abortSignal })
fetch(url, { signal: abortSignal })
```

`abortSignal` is lazily allocated. Disconnect pauses the component scope; reconnect resumes dirty work. `host.dispose()` is permanent.

## Errors and failed mounts

Compiler mistakes such as malformed paths/directives throw with Skein-specific messages. If mount/instantiation throws, Skein disposes the new scope and clears partial shadow DOM before reporting the error event.

## Public API

```js
Skein.version
Skein.define(tag, source)
```

No public `batch`, `signal`, `untrack`, `Skein.stats` or `Skein.flush`.
