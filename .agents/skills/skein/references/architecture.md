# Skein runtime architecture

Read this only when modifying Skein's renderer, reactivity, lifecycle, compiler, build or performance behavior.

## File map

```text
skein.js                 readable public entry/bootstrap
skein.min.js             generated single-file production entry
runtime/reactive.js      dependency graph, scheduler, scopes, Proxy state, lexical lookup
runtime/template.js      compiler, bindings, keyed lists, branches, View
runtime/component.js     loading, registration, Custom Element lifecycle, script helpers
tools/build.mjs          zero-dependency production bundler/minifier
test/                    Node + real-Chrome tests
```

## Invariants

1. Zero runtime dependencies.
2. No virtual DOM.
3. No component-wide rerender after state writes.
4. Component source compiles once and is cached.
5. Binding paths compile once, not on every reactive update.
6. Dependencies come from actual property reads.
7. Missing properties are trackable.
8. Existing-property writes do not invalidate object iteration unnecessarily.
9. Array structural changes, including direct length truncation, invalidate the required dependencies.
10. Synchronous writes share one scheduler microtask.
11. Render effects settle before user effects.
12. Keyed lists preserve DOM identity when keys persist.
13. Dynamic DOM belongs to explicit child scopes.
14. Nested Skein elements are disposed when their owning view disappears.
15. Disconnect pauses; explicit `dispose()` destroys.
16. Native CSS, SVG, Canvas and browser lifecycle remain first-class.

## Reactive graph

`ReactiveState` returns a deep Proxy directly. Per-object/property `Dep` nodes track observers; iteration has a separate dependency.

Internal `Ref` values exist only where a mutable binding context/value is required, such as list `index` and replaced keyed records. They are not part of the public API.

`ComputedRef` is lazy and cached. `ReactiveEffect` removes old dynamic dependencies before each run.

## Scheduler

Two Sets preserve phase ordering:

```text
state writes
→ invalidation
→ one queued microtask
→ exhaust render queue
→ run one user effect
→ return to render queue if dirtied
→ continue user effects
```

There is no public `batch()` because a JavaScript call stack already completes before the scheduled microtask can flush.

## Scope ownership

A `Scope` owns child scopes and a single resource list containing effects/computed values and cleanup callbacks. Resource arrays and child Sets are allocated lazily.

The `AbortController` is also lazy. Declarative `@event` listeners use deterministic scope cleanup with `removeEventListener` so list rows do not allocate one AbortController per event-bearing item. Component scripts receive a real `abortSignal` only if their source references that helper.

## Template compilation

The compiler operates on real DOM and emits compact numeric instruction tuples for:

- text
- attribute
- boolean attribute
- property
- event
- list
- branch

Expressions are precompiled to path arrays. `<style>` contents are deliberately opaque to the binding parser so CSS braces remain CSS.

Structural list/branch nodes use one comment anchor each. Instructions instantiate in reverse order so synchronous structural insertion cannot invalidate paths needed by later instructions.

## Binding lookup

`BindingScope` performs direct lexical lookup rather than allocating a `frames()` array per read. Context chains are resolved only when `in={...}` is present.

A present property with value `undefined` counts as found and shadows outer scopes.

## Keyed reconciliation

`ListPart` maintains both `Map<key, record>` and ordered records.

On structural update:

- existing keys reuse views;
- record context and reactive index update;
- unseen keys instantiate new scoped views;
- removed records dispose exactly their view;
- surviving node ranges move into final order;
- `moveBefore()` is used when available, otherwise `insertBefore()`.

Key expressions resolve directly against the item rather than allocating a temporary binding scope.

## Component lifecycle

`SkeinElement` owns state, current root Scope/View and mount generation.

- `connectedCallback()` mounts or resumes;
- `disconnectedCallback()` pauses and removes the element from the connected-instance registry;
- `connectedMoveCallback()` resumes state-preserving moves;
- `dispose()` is permanent teardown.

The connected-instance registry lets `Skein.define()` recover already-created elements, including nested elements in Shadow DOM, without permanently retaining disconnected elements.

## Script execution

Component scripts currently use `AsyncFunction` with these fixed injected names:

```text
computed
effect
onCleanup
host
abortSignal
```

`AsyncFunction` is the current strict-CSP limitation. If changing evaluation, update docs/tests/LLM context together.

## Production build

`tools/build.mjs` concatenates the four readable modules, removes module-only syntax, lexically minifies, and mangles known internal identifiers. It must never replace text inside string or regex literals.

The generated file exports `Skein` and is also exposed as `window.Skein` by the entry source.

Run:

```bash
node tools/build.mjs
node tools/build.mjs --check
```

The test suite imports `skein.min.js` directly and exercises bootstrap strings, SVG/Canvas/style behavior, late nested registration and the Playground sandbox. Do not accept a build optimization that only passes readable-module tests.

## Performance discipline

Measure correctness and allocations before chasing a bundle-size milestone. Current intentional optimizations include:

- lazy Scope resources;
- lazy AbortController;
- no production diagnostics counters;
- no public low-level signal wrapper API;
- compiled property paths;
- compact instruction tuples;
- direct keyed-item key resolution;
- no path-frame allocation on ordinary reads;
- no renderer-wide DOM traversal at update time;
- no legacy helper properties attached to every rendered node.

Do not remove keyed reconciliation, computed values, scoped cleanup or lifecycle correctness just to cross an arbitrary byte threshold.
