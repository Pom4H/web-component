# TypeScript and editor hints

Skein stays a JavaScript runtime. Type declarations are editor-only and add **zero bytes** to `skein.min.js`.

## Public API

`skein.d.ts` describes the module and global API:

```js
// @ts-check
import { Skein } from './skein.js'

Skein.version
Skein.define('demo-counter', '<button>Count</button>')
```

Editors that use the TypeScript language service resolve the adjacent declaration file automatically for local imports. The custom-element tag is typed as `` `${string}-${string}` ``, so an invalid name such as `Skein.define('counter', source)` is reported before runtime.

The declaration also describes `window.Skein` for projects that explicitly include `skein.d.ts` in their TypeScript/JavaScript project.

## Component script helpers

A Skein component script receives helpers from the runtime rather than from JavaScript globals:

```text
input
computed
effect
onCleanup
host
abortSignal
```

`skein.component.d.ts` is therefore intentionally separate and opt-in. Tooling may include it while type-checking component scripts without pretending these names exist globally on every page.

```ts
/// <reference path="./skein.component.d.ts" />

const count = input('count', 0)
const doubled = computed(() => count * 2)

effect(() => console.log(doubled.get()))
onCleanup(() => console.log('disposed'))

host.dispatchEvent(new CustomEvent('ready'))
abortSignal.throwIfAborted()
```

The helper declarations match the current runtime objects. In normal Skein component code, a computed ref is usually assigned into reactive state:

```js
this.double = computed(() => this.count * 2)
```

Reactive state unwraps that ref when `this.double` is read.

## Current boundary

These declarations type the JavaScript API, but they do not yet make the TypeScript language service understand a complete Skein `.html` component. In particular, editor tooling does not yet infer:

- state members created with `this.foo = ...` inside `<script>`;
- `{foo.bar}` binding paths in markup;
- item scope inside `each={items}`;
- whether `.property`, `@event`, `?boolean`, or `--css-var` paths exist.

That requires a Skein-aware HTML language layer. The declarations in this change are the base contract for that next step: the language tool can type-check the extracted component script against `skein.component.d.ts`, then expose the inferred state graph to HTML completions and diagnostics.
