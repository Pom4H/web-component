# Skein 0.6.1 runtime architecture

Read this when modifying renderer, reactivity, lifecycle, component inputs, loading, minification or performance behavior.

## File map

```text
skein.js                 readable entry/bootstrap
skein.min.js             generated production entry
runtime/reactive.js      dependency graph, scheduler, scopes, Proxy state, binding lookup
runtime/template.js      DOM compiler, bindings, keyed lists, branches, View
runtime/component.js     loading, registration, Custom Element lifecycle, inputs, script helpers
tools/build.mjs          zero-dependency lexical bundler/minifier
test/run.mjs             core/readable/generated Chrome regression
test/workspace.mjs       generated-runtime 18-component composition regression
```

## Core invariants

1. Zero runtime dependencies and no virtual DOM.
2. Source and binding paths compile once.
3. Dependencies come from actual property reads.
4. Missing own properties are trackable; prototypes do not leak into bindings.
5. Synchronous writes share one scheduler microtask.
6. Render effects settle before user effects.
7. Keyed list records preserve real DOM identity; explicit keys are preflighted before reconciliation mutates views.
8. Dynamic DOM owns child scopes.
9. Disconnect pauses; permanent disposal destroys.
10. Failed mounts roll back fresh scope/resources/partial DOM.
11. Unknown custom tags are fetched before Skein registers them.
12. Third-party custom elements are never force-disposed.
13. Plain objects/arrays are reactive; platform/class objects stay native.
14. One raw object has one Skein Proxy identity across component boundaries.
15. Component composition uses browser primitives: properties for live data, bubbling+composed events for actions, native Shadow DOM slots for content/layout.
16. Static primitive input attributes are initialization sugar only, never a second reactive channel.

## Reactive graph

Module-global WeakMaps hold raw-object dependencies, raw→proxy and proxy→raw relationships. A plain object passed between components must not become proxy-of-proxy state.

Only arrays and objects whose prototype is `Object.prototype` or `null` are recursively proxied. Date, Map, Set, DOM/platform objects and class instances are returned unchanged.

`ComputedRef` is lazy/cached. `ReactiveEffect` drops dynamic dependencies before each run. Array length truncation invalidates removed indices. Failed Reflect writes/deletes do not notify.

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

There is no public batch primitive.

## Binding scopes and compiler

Root templates read root component state. `each` creates a mutable item scope whose own values shadow outer item/root scopes. List locals are `index`, `$index`, `$value`.

There is no `in={...}` context chain. Lookup requires own properties at every path segment.

The compiler operates on real DOM and emits compact numeric instructions for text, string attributes, boolean attributes, DOM properties, events, lists and branches. Paths and special `.`, `?`, `@`, `if`, `each`, `key` forms validate at compile time. `<style>` is opaque.

`each` uses a comment anchor, preflights explicit keys, reuses matching views and moves surviving node ranges. `if` uses a comment anchor and owned child Scope.

## View and ownership

`Scope` owns effects, computed refs, child scopes, native cleanup callbacks and lazy AbortController. `View` owns root nodes plus Scope.

Renderer teardown calls permanent `dispose()` only on nested actual `SkeinElement` instances. External Custom Elements receive normal disconnected lifecycle only.

## Component loading

`loadElement(tag)` asks CodeLoader for `tag.replaceAll('-', '/') + '.html'`. Only successful source load is followed by `customElements.define`. 404 removes failed cache and leaves the tag undefined.

`Skein.define(tag, source)` is explicit, defines once and relies on native Custom Element upgrade behavior for already-present tags.

## Component inputs

`input(name, fallback)` must keep this order:

1. reject empty/host-colliding names;
2. if an own pre-mount property exists, capture it and delete the temporary property;
3. otherwise, if a same-name attribute exists, convert it from the fallback type;
4. otherwise use fallback;
5. install the host accessor backed by `state[name]`;
6. record the input lazily and seed child state;
7. return initial value for compatibility with old `this.value = input(...)` spelling.

Attribute conversion:
- boolean fallback → attribute presence is `true`;
- number fallback → `Number(value)`, NaN throws;
- object/function fallback → attribute usage throws and requires a property;
- string/undefined/null fallback → text string.

**Do not add attribute observation implicitly.** Literal attributes are static initial configuration. Later attribute mutations do not update state. Reactive owner-to-child flow remains `.property={path}` / direct property assignment.

Pre-mount property precedence is important for async source loading and must remain above attributes.

## Native slots and event propagation

Skein has no slot renderer. `<slot>`, named slots, `slotchange` and `assignedElements()` are Shadow DOM behavior.

Bubbling + `composed:true` CustomEvents are expected to cross nested Skein shadow roots directly. Do not introduce automatic relay handlers or an event bus.

`examples/workspace/` is the scale check for this invariant: 18 component types use properties/events/slots without a new framework composition primitive.

## Component lifecycle

- connect resumes existing view or starts one mount;
- async mount checks connection/disposal after source load;
- failed instantiation disposes fresh Scope and clears partial shadow DOM;
- disconnect pauses;
- connectedMoveCallback resumes supported state-preserving moves;
- `dispose()` is permanent teardown.

## Script execution

Component scripts use `AsyncFunction` with injected `input`, `computed`, `effect`, `onCleanup`, `host`, `abortSignal`. `abortSignal` allocation stays lazy via source-use detection. Dynamic evaluation is the current strict-CSP limitation.

## Production minifier hazards

`tools/build.mjs` is a lexical minifier/mangler, not an AST transform. A mapped identifier is renamed even after `.`. Native/public property tokens must not be added casually to `internalNames`.

`dispose` is public and must stay unmangled. Native collision cases such as match index / AbortSignal use protected string-key access where needed. Always test generated production output in Chromium.

## Validation

Run:

```bash
node tools/build.mjs
node tools/build.mjs --check
node test/run.mjs
node test/workspace.mjs
```

The Workspace test must continue to validate all 18 component definitions, native slot assignment, static input attributes, property precedence, deep composed-event propagation, reactive search, mutation and conditional teardown.

## Performance discipline

Keep lazy allocation, compact instructions, direct key resolution, no update-time renderer-wide DOM traversal and no helper pollution on rendered nodes. Correctness and conceptual simplicity win over arbitrary byte targets.
