# Skein 0.6.1 syntax reference

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
Skein.define('my-card', '<p>{name}</p>')
```

A tag is registered once. Redefinition throws. Auto-loading fetches the matching file before `customElements.define`; a 404 leaves the tag available to another Web Components library.

## State

Plain objects and arrays are recursively reactive. Date, Map, Set, DOM nodes, AudioContext and class instances stay native/opaque. Shared plain objects keep one Skein Proxy identity across component state roots and property inputs.

## Binding paths

Bindings accept strict dotted property paths only:

```html
<h1>{user.profile.name}</h1>
<div title="User {user.name}"></div>
```

Expressions are invalid. Use `computed()` for derived values. Lookup checks own properties only and walks from the current list scope outward to root state.

## Native bindings

```html
<div data-id={id}></div>          <!-- attribute -->
<label for={inputId}>Name</label> <!-- native dynamic attribute -->
<input .value={name}>             <!-- DOM property -->
<button ?disabled={saving}>Save</button>
<button @click={save}>Save</button>
```

`.`, `?` and `@` bindings must contain exactly one path.

## Component composition

Use browser primitives:

```text
data      -> DOM properties
/actions/ <- bubbling + composed CustomEvent
content   -> native <slot>
```

There is no component event bus, provide/inject system or framework slot API.

### Inputs

Child:

```html
<script>
  input('name', 'Metric')
  input('value', 0)
</script>
<strong>{name}: {value}</strong>
```

Static primitive configuration may use ordinary attributes:

```html
<ui-metric name="Active" tone="lime"></ui-metric>
```

Conversion follows the fallback type:

- string/undefined/null fallback: attribute text is a string;
- number fallback: `Number(attribute)`; NaN throws;
- boolean fallback: attribute presence means `true`;
- object/function fallback: an attribute is rejected; use a DOM property.

Initialization precedence:

```text
pre-mount own property > static attribute > fallback
```

The attribute is an **initial seed only**. Later `setAttribute()` calls do not update child state. Use a property binding for live values:

```html
<ui-metric name="Active" .value={active}></ui-metric>
<task-card .task={task}></task-card>
```

Later `element.value = x` writes are reactive inside the child. Inputs remain one-way. Input names that collide with HTMLElement/Skein host APIs are rejected.

### Outputs

Use native events:

```js
host.dispatchEvent(new CustomEvent('value-change', {
  detail: { value: this.value + 1 },
  bubbles: true,
  composed: true
}))
```

Owner:

```html
<value-stepper .value={value} @value-change={changed}></value-stepper>
```

Bubbling + composed events can cross nested Shadow DOM boundaries without relay handlers.

### Slots

Skein uses real Shadow DOM, so default and named slots are native:

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

`slotchange` and `assignedElements()` are also ordinary browser APIs.

## Lists

```html
<li each={items} key={id}>
  {index}: {title}
</li>
```

List locals are `index`, `$index` and `$value`. Stable unique keys preserve DOM identity. Explicit null/undefined or duplicate keys throw before reconciliation mutates DOM. Without `key`, object identity is used for objects and occurrence identity for primitives.

## Conditions

```html
<section if={visible}>...</section>
```

Hiding a branch disposes its child reactive scope, nested Skein components and DOM range. Third-party custom elements are disconnected normally; Skein never calls arbitrary external `dispose()` methods.

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

`abortSignal` is lazily allocated. Disconnect pauses; reconnect resumes dirty work. `host.dispose()` is permanent.

## Application-scale reference

`examples/workspace/` contains 18 component types composed only with properties, composed events and native slots. `test/workspace.mjs` runs that graph against generated `skein.min.js` in Chromium.

## Errors and failed mounts

Malformed paths/directives throw Skein-specific errors. Failed template instantiation disposes the fresh scope and clears partial shadow DOM.

## Public API

```js
Skein.version
Skein.define(tag, source)
```

No public `batch`, `signal`, `untrack`, `Skein.stats` or `Skein.flush`.
