# Skein runtime architecture

Read this only when modifying Skein's renderer, reactivity, lifecycle, compiler, component input contract, build or performance behavior.

## File map

```text
skein.js                 readable public entry/bootstrap
skein.min.js             generated single-file production entry
runtime/reactive.js      dependency graph, scheduler, scopes, Proxy state, lexical lookup
runtime/template.js      compiler, bindings, keyed lists, branches, View
runtime/component.js     loading, registration, Custom Element lifecycle, inputs, script helpers
tools/build.mjs          zero-dependency production bundler/minifier
test/                    Node + real-Chrome tests
```

## Invariants

1. Zero runtime dependencies.
2. No virtual DOM.
3. No component-wide rerender after state writes.
4. Component source compiles once and is cached.
5. Binding paths compile once, not on every update.
6. Dependencies come from actual property reads.
7. Missing properties are trackable.
8. Existing-property writes do not invalidate object iteration unnecessarily.
9. Array structural changes, including direct length truncation, invalidate required dependencies.
10. Synchronous writes share one scheduler microtask.
11. Render effects settle before user effects.
12. Keyed lists preserve DOM identity when keys persist.
13. Dynamic DOM belongs to explicit child scopes.
14. Nested Skein elements are disposed when their owning view disappears.
15. Disconnect pauses; explicit `dispose()` destroys.
16. Component inputs are ordinary host DOM properties backed by child reactive state.
17. Component outputs remain native DOM events; the runtime has no component event bus.
18. Native CSS, SVG, Canvas, Web Audio and browser lifecycle remain first-class.

## Reactive graph

`ReactiveState` returns a deep Proxy directly. Per-object/property `Dep` nodes track observers; iteration has a separate dependency. Internal `Ref` values exist where a mutable binding context/value is required, such as list `index`. They are not public API.

`ComputedRef` is lazy and cached. `ReactiveEffect` removes old dynamic dependencies before each run.

## Scheduler

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

A `Scope` owns child scopes and a lazily allocated resource list containing effects/computed values and cleanup callbacks. `AbortController` is lazy. Declarative `@event` listeners use deterministic `removeEventListener` cleanup so list rows do not allocate an AbortController per listener.

## Template compilation

The compiler operates on real DOM and emits compact numeric instruction tuples for text, attributes, boolean attributes, DOM properties, events, lists and branches.

Expressions are precompiled to path arrays. `<style>` contents are opaque to the binding parser. Structural list/branch nodes use comment anchors. Instructions instantiate in reverse order so synchronous structural insertion cannot invalidate later node paths.

`.property={path}` already writes `node[property] = value`; component inputs deliberately reuse this native behavior rather than adding a new renderer instruction.

## Component inputs

`input(name, fallback)` is injected by `SkeinElement.runScript()` and delegates to the host's input registration.

On first declaration for a name:

1. Check whether the custom element already has an own property of that name. This is how a parent `.property={...}` write can arrive before the child's asynchronous file load finishes.
2. Capture that pending value, otherwise use `fallback`.
3. Delete the pending own property if present.
4. Define a host property accessor whose getter/setter reads/writes the child's reactive `state[name]`.
5. Lazily record the declared input name so reload does not redefine it.
6. Return the captured initial value so normal script assignment (`this.value = input(...)`) seeds reactive state.

This keeps inputs one-way with respect to the owner: assigning the child host property changes child state only. The child uses native `CustomEvent` to request owner changes.

Input bookkeeping is lazy: components that do not call `input()` do not allocate an input Set.

## Binding lookup

`BindingScope` performs direct lexical lookup. Context chains are resolved only when `in={...}` is present. A present property with `undefined` counts as found and shadows outer scopes.

## Keyed reconciliation

`ListPart` keeps `Map<key, record>` plus ordered records. Existing keys reuse views, contexts/index refs update, unseen keys instantiate, removed records dispose, and surviving node ranges move into final order. `moveBefore()` is used when available, otherwise `insertBefore()`.

## Component lifecycle

`SkeinElement` owns state, current root Scope/View, mount generation and lazy input metadata.

- `connectedCallback()` mounts or resumes;
- asynchronous file loading may overlap parent property writes, which `input()` must preserve;
- `disconnectedCallback()` pauses and unregisters connected instances;
- `connectedMoveCallback()` resumes state-preserving moves;
- `dispose()` is permanent teardown;
- `Skein.define()` may reload an existing connected Skein element while keeping declared host input accessors valid.

## Script execution

Component scripts currently use `AsyncFunction` with these injected names:

```text
input
computed
effect
onCleanup
host
abortSignal
```

`AsyncFunction` is the current strict-CSP limitation. If changing evaluation or helper ordering, update build mangling, docs, tests and LLM context together.

## Production build

`tools/build.mjs` concatenates readable modules, removes module-only syntax, lexically minifies and mangles known internal identifiers while preserving strings/regex literals.

Run:

```bash
node tools/build.mjs
node tools/build.mjs --check
node test/run.mjs
```

The generated file is exercised directly in real Chrome, including production component input composition and the real multi-file Studio example.

## Performance discipline

Current intentional choices include lazy Scope resources, lazy AbortController, lazy input bookkeeping, compiled paths, compact instruction tuples, direct keyed-item key resolution, no path-frame allocation on ordinary reads, no renderer-wide DOM traversal at update time and no legacy helper properties attached to rendered nodes.

Do not remove keyed reconciliation, computed values, component input timing guarantees, scoped cleanup or lifecycle correctness merely to cross an arbitrary byte milestone.
