# Skein 0.6 runtime architecture

Read this when modifying renderer, reactivity, lifecycle, component inputs, loading, minification or performance behavior.

## File map

```text
skein.js                 readable entry/bootstrap
skein.min.js             generated production entry
runtime/reactive.js      dependency graph, scheduler, scopes, Proxy state, binding lookup
runtime/template.js      DOM compiler, bindings, keyed lists, branches, View
runtime/component.js     loading, registration, Custom Element lifecycle, inputs, script helpers
tools/build.mjs          zero-dependency lexical bundler/minifier
test/                    Node + real-Chrome regressions
```

## Core invariants

1. Zero runtime dependencies and no virtual DOM.
2. Source compiles once; binding paths compile once.
3. Dependencies come from actual property reads.
4. Missing own properties are trackable; prototype properties do not leak into lexical bindings.
5. Synchronous writes share one scheduler microtask.
6. Render effects settle before user effects.
7. Keyed list records preserve real DOM identity.
8. Explicit list keys are validated before reconciliation mutates views.
9. Dynamic DOM owns explicit child scopes.
10. Disconnect pauses; permanent disposal destroys.
11. Failed mounts roll back scope/resources/partial DOM.
12. Component inputs are native host properties; outputs are native events.
13. Unknown custom tags are fetched before Skein registers them.
14. External custom elements are never force-disposed by Skein.
15. Plain objects/arrays are reactive; platform/class objects remain native.
16. One raw object has one Skein Proxy identity across component boundaries.

## Reactive graph

Module-global WeakMaps hold raw-object dependencies, raw→proxy and proxy→raw relationships. This is deliberate: a plain object passed from parent to child must not become proxy-of-proxy state. Effects in either component subscribe to the same raw property `Dep` nodes.

Only arrays and objects whose prototype is `Object.prototype` or `null` are recursively proxied. Date, Map, Set, DOM/platform objects and class instances are returned unchanged.

`ComputedRef` is lazy/cached. `ReactiveEffect` drops dynamic dependencies before each run. Array length truncation invalidates removed indices. Failed `Reflect.set` / `Reflect.deleteProperty` operations do not notify subscribers.

## Scheduler

```text
state writes
→ dependency invalidation
→ one queued microtask
→ exhaust render queue
→ run one user effect
→ return to render queue if dirtied
→ continue user effects
```

There is no public batch primitive because one JavaScript call stack already finishes before the queued microtask.

## Binding scopes

There is one lookup model. Root templates read root component state. `each` creates a mutable item scope whose own properties shadow outer item/root scopes. List locals (`index`, `$index`) live beside the item context.

There is no `in={...}` context chain. Removing it avoids a second lexical model and makes `if`/nested `each` compilation deterministic.

Lookup requires own properties at every path segment. Missing keys on reactive proxies still track directly without reading inherited values, so prototype methods/getters never become accidental bindings or execute during lookup.

## Template compiler

The compiler operates on real DOM and emits compact numeric instruction tuples for text, string attributes, boolean attributes, DOM properties, events, lists and branches.

Paths are strict dotted property paths. Special `.`, `?`, `@`, `if`, `each` and `key` forms validate during compilation and fail early on malformed syntax. `<style>` content remains opaque.

`each={collection}` uses a comment anchor. Existing keys reuse views, item context/index refs update, removed records dispose, and surviving node ranges move into final order. Explicit key uniqueness/nullability is checked in a preflight pass before record mutation.

`if={path}` uses a comment anchor and a child Scope. Structural templates compile independently without inherited context metadata because all non-list references are explicit paths.

## View and ownership

`Scope` owns effects, computed refs, child scopes, native cleanup callbacks and a lazy AbortController. `View` owns only root nodes plus its Scope.

During template instantiation, actual custom-element nodes are captured for teardown. The component module supplies a disposer callback that calls `dispose()` **only** when the nested node is a `SkeinElement`; arbitrary third-party elements rely on normal disconnected lifecycle.

## Component loading and coexistence

`loadElement(tag)` first asks `CodeLoader` for `tag.replaceAll('-', '/') + '.html'`. Only after successful source load does Skein call `customElements.define`. A 404 deletes the failed cache entry and leaves the tag undefined.

This replaces the old eager “claim every undefined custom tag” behavior. External libraries can define their own tags before, during or after a failed Skein lookup.

`Skein.define(tag, source)` is explicit and defines once. Production instance registries, reload and generation counters were removed; Playground already recreates its iframe/runtime for edited source, and late explicit define relies on the browser's native Custom Element upgrade behavior.

## Component inputs

`input(name, fallback)`:

1. rejects empty names and any name present on `SkeinElement.prototype`/HTMLElement prototypes plus the own `state` API;
2. captures an own pre-upgrade property if the parent wrote `.property={...}` before child source/mount;
3. deletes that temporary property;
4. installs a host accessor backed by `state[name]`;
5. records the declared input lazily;
6. seeds child state immediately;
7. returns the initial value so the old assignment spelling remains harmless/compatible.

No event bus or implicit two-way link exists.

## Component lifecycle

- `connectedCallback`: resume existing view or start one mount.
- asynchronous mount checks connection/disposal after source load.
- mount instantiation is wrapped transactionally; errors dispose the fresh Scope and clear partial shadow DOM.
- `disconnectedCallback`: pause.
- `connectedMoveCallback`: resume state-preserving moves when the platform uses it.
- `dispose()`: permanent teardown.

## Script execution

Component scripts use `AsyncFunction` with injected `input`, `computed`, `effect`, `onCleanup`, `host`, `abortSignal`. `abortSignal` allocation remains lazy via source-use detection. Dynamic evaluation is the current strict-CSP limitation.

## Production minifier hazards

`tools/build.mjs` is a lexical zero-dependency minifier and identifier mangler, not an AST transform. A mapped identifier is renamed even when it appears after `.`. Therefore public/native property tokens must never be added casually to `internalNames`.

Examples deliberately written with string-key property access to protect native names that collide with internal mangle names:

```js
hit['index']
controller['signal']
```

`dispose` is public on `host` and must never be mangled. Real-Chrome tests exercise the generated bundle, not just readable modules.

## Performance discipline

Keep lazy resource allocation, compact instructions, direct item-key resolution, no update-time renderer-wide DOM traversal and no helper pollution on rendered nodes. Correctness wins over arbitrary byte targets, but remove whole concepts before micro-optimizing tokens.
