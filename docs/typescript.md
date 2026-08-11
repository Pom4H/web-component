# TypeScript and editor hints

Skein stays a JavaScript runtime. Type declarations and the optional checker are development tooling and add **zero bytes** to `skein.min.js`.

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

`skein.component.d.ts` is intentionally separate and opt-in. Tooling may include it while type-checking component scripts without pretending these names exist globally on every page.

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

## Checking complete `.html` components

Install TypeScript 7 as a development-only checker dependency:

```bash
npm install --no-save --ignore-scripts typescript@7.0.2
```

Then run Skein's CLI checker from an entry page:

```bash
node tools/skein-check.mjs examples/workspace/index.html
```

The checker follows the same custom-element mapping as the runtime. For an entry page with `<base href="../">`, `<workspace-app>` resolves to `workspace/app.html`; child tags are discovered recursively.

For each component the checker builds temporary TypeScript that models:

- top-level state created with `this.foo = ...`;
- values returned by `computed()` as the values seen by bindings;
- direct `{foo.bar}` binding paths;
- `each={items}` item scopes, including `index`, `$index`, and `$value`;
- event handler bindings;
- native DOM `.property={path}` value types;
- whether `.property` names exist in discovered Skein child `input()` contracts.

Diagnostics are mapped back to the original HTML location. For example:

```html
<script>
  this.users = [{ id: 1, name: 'Ada' }]
</script>

<li each={users}>{nmae}</li>
```

fails with a diagnostic at the `{nmae}` binding and exits with status 1. Correcting it to `{name}` exits with status 0.

## Explicit component input contracts

A fallback value is runtime initialization, not automatically a permanent JavaScript type. When a component boundary should be strict, annotate the fallback with ordinary JSDoc:

```js
input('value', /** @type {number} */ (0))
input('sensor', /** @type {{ id:string, value:number } | null} */ (null))
```

The comment has no runtime effect. `skein-check` treats it as the explicit type accepted by `.value={...}` or `.sensor={...}` from owner components. Assignment is structural, so a richer owner object is valid when it contains the required fields.

JSDoc typedefs can keep larger contracts readable:

```js
/** @typedef {{ id:string, load:number, metrics:{ pressure:number } }} Unit */
input('unit', /** @type {Unit} */ ({ id:'', load:0, metrics:{ pressure:0 } }))
```

The same JSDoc cast can annotate owner state initialized with an object or array literal:

```js
this.units = /** @type {Unit[]} */ ([ ... ])
```

`examples/control-room/` is the scale example for this mode. It uses eight components, nested unit/sensor/alarm shapes, typed list scopes and strict values across component boundaries.

```bash
node tools/skein-check.mjs examples/control-room/index.html
```

## CI contract

The repository CI checks with TypeScript 7.0.2:

- the declaration API contract;
- the real 18-component workspace;
- a known-good typed list scope;
- an intentionally invalid list binding that must fail;
- the typed 8-component control-room example;
- an intentionally invalid cross-component object assignment that must fail.

## Current boundary

Only inputs with an explicit JSDoc `@type` are strict across Skein component boundaries. Untyped `input()` fallbacks still provide runtime initialization and binding inference, but the checker does not pretend their fallback JavaScript type is a runtime-enforced contract.

The generated state model currently focuses on template and composition safety rather than fully type-checking arbitrary JavaScript inside `<script>`. There is also no editor autocomplete for `{binding.paths}` yet. The CLI checker is the shared validation core for agents and CI; a future HTML/LSP layer can reuse the same model for completions and live diagnostics.
