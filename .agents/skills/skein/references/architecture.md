# Skein runtime architecture

Load this file only when modifying the framework runtime, renderer, reactivity, lifecycle, compiler, tests or performance characteristics.

## File map

```text
skein.js                 public entry and bootstrap
web-component.js         compatibility alias
runtime/reactive.js      signals, computed, effects, scheduler, scopes, reactive Proxy, BindingScope
runtime/template.js      compiler, DOM Parts, keyed lists, branches, View
runtime/component.js     component loading, registration, Custom Element lifecycle, script helpers
```

## Runtime invariants

Preserve all of these unless the task explicitly changes the architecture:

1. Zero core dependencies.
2. No virtual DOM.
3. No component-wide rerender after state changes.
4. Component source is parsed/compiled once and cached.
5. Reactive dependencies are discovered from actual reads.
6. A state write invalidates only dependent observers.
7. DOM Parts cache committed values and skip equal writes.
8. Synchronous writes batch through the scheduler.
9. Render effects settle before user effects.
10. Dynamic DOM belongs to explicit reactive scopes.
11. Keyed list operations preserve DOM identity when keys persist.
12. Disconnect pauses; reconnect resumes. Disconnect alone is not permanent disposal.
13. Permanent resource cleanup belongs to scope disposal.
14. Native browser APIs are preferred over framework substitutes.

## Reactive graph

`ReactiveState` exposes deep Proxy objects for application ergonomics. Internally, state is tracked per target/property through cells.

Iteration is a separate dependency from property value reads. Adding/deleting properties should invalidate iteration; changing an existing property should not invalidate object-key consumers unnecessarily.

Arrays must notify both relevant index/property cells and structural consumers such as `length`/iteration when structure changes.

`ComputedRef` is lazy and cached. It becomes dirty when a dependency invalidates it and propagates invalidation to its subscribers.

`ReactiveEffect` tracks dynamic dependencies each run. Old dependencies are removed before rerun.

## Scheduler

There are separate render and user-effect queues.

Expected order:

```text
state writes
-> invalidation
-> one queued microtask
-> exhaust render queue
-> run user effects
-> if a user effect dirties render work, return to render queue before continuing effects
```

Do not create one microtask per DOM binding.

## Scope ownership

`Scope` owns:

- effects;
- computed values where appropriate;
- child scopes;
- cleanup callbacks;
- an AbortController/AbortSignal.

Lists and conditional branches create child scopes. Removing one dynamic view must dispose exactly its subtree without touching siblings.

## Template compilation

`CompiledTemplate` analyzes real DOM once and stores instructions that point to dynamic nodes by stable DOM path in the cloned template.

Current specialized Parts:

- TextPart
- AttributePart
- PropertyPart
- BooleanPart
- EventPart
- ListPart
- BranchPart

Do not collapse these into one generic string renderer. Their DOM semantics are intentionally different.

## Keyed reconciliation

`ListPart` stores records by identity/key and an ordered list of records.

On update:

- reuse records whose keys still exist;
- update their item context and reactive index;
- instantiate only unseen keys;
- dispose only removed keys;
- move existing node ranges into new order;
- use `moveBefore()` where available, otherwise `insertBefore()`.

Never clear the whole list range as the normal reconciliation strategy.

The benchmark-relevant correctness property is not only speed: DOM identity and local browser state must survive reorder.

## Component lifecycle

A `WebComponent` mounts once per instance unless explicitly disposed/replaced.

`connectedCallback()` mounts or resumes.

`disconnectedCallback()` pauses the root scope; it must not permanently abort everything because DOM nodes can be temporarily disconnected or moved.

`connectedMoveCallback()` resumes state-preserving moves when supported.

`dispose()` is permanent teardown.

## Component scripts

Component scripts currently use `AsyncFunction` with injected helpers. This is why strict CSP still requires `unsafe-eval`.

Helpers currently include:

- computed
- effect
- onCleanup
- batch
- signal
- untrack
- host
- abortSignal

If changing script evaluation, preserve these semantics or update tests/docs/llms context together.

## Public compatibility

`skein.js` is canonical.

`web-component.js` is a compatibility alias.

Browser globals currently include `window.Skein`, `window.WebComponent` and `window.WebComponentRuntime` for compatibility/diagnostics.

## Tests

Run:

```bash
node test/run.mjs
```

The suite intentionally uses no test packages. It drives real Chrome via Chrome DevTools Protocol and also tests the reactive core in Node.

When changing rendering or reconciliation, add/adjust tests for:

- DOM identity;
- local form state preservation;
- exact create/remove/move counts where meaningful;
- nested scope disposal;
- scheduler batching;
- reconnect behavior;
- legacy examples;
- performance smoke correctness.

Do not turn machine-dependent timing values into brittle pass/fail thresholds.
