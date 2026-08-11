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

The repository CI checks three cases with TypeScript 7.0.2: the declaration contract, the real 18-component workspace, and an intentionally invalid list binding that must fail.

## Current boundary

The checker is deliberately conservative about component input value types. The runtime uses an `input()` fallback for initial attribute conversion, but later DOM property assignment is not runtime-type-restricted to the fallback's JavaScript type. The checker therefore validates that a child `.property` names a declared input, but it does not yet infer a strict cross-component value type from the fallback alone.

There is also no editor autocomplete for `{binding.paths}` yet. The CLI checker is the shared validation core for agents and CI; a future HTML/LSP layer can reuse the same model for completions and live diagnostics.
