const {
  ReactiveState,
  Scope,
  ReactiveEffect: Effect,
  ComputedRef: Computed,
  Scheduler,
} = await import('../runtime/reactive.js');
const { highlight } = await import('../site/highlight.js');

const assert = (value, message) => { if (!value) throw new Error(message); };
const equal = (actual, expected, message) => { if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, got ${actual}`); };

const reactive = new ReactiveState({ count: 1, items: [1, 2], nested: { name: 'A' } });
const state = reactive.value;
const scope = new Scope();
let countRuns = 0;
let observedCount;
new Effect(() => { countRuns++; observedCount = state.count; }, scope, 'render');
state.count = 2;
state.count = 3;
Scheduler.flush();
equal(observedCount, 3, 'batched signal value');
equal(countRuns, 2, 'effect should rerun once after two synchronous writes');

let listRuns = 0;
let listValue = '';
new Effect(() => { listRuns++; listValue = Array.from(state.items).join(','); }, scope, 'render');
state.items.push(3);
Scheduler.flush();
equal(listValue, '1,2,3', 'array push should invalidate length/list observer');
equal(listRuns, 2, 'array push should produce one list rerun');

let keysRuns = 0;
new Effect(() => { keysRuns++; Object.keys(state.nested); }, scope, 'render');
state.nested.name = 'B';
Scheduler.flush();
equal(keysRuns, 1, 'existing property update must not invalidate iteration');
state.nested.extra = true;
Scheduler.flush();
equal(keysRuns, 2, 'new property must invalidate iteration');

const computed = new Computed(() => state.count * 2, scope);
let computedRuns = 0;
let computedValue;
new Effect(() => { computedRuns++; computedValue = computed.get(); }, scope, 'render');
state.count = 4;
state.count = 5;
Scheduler.flush();
equal(computedValue, 10, 'computed value');
equal(computedRuns, 2, 'computed consumer should rerun once');

const highlighted = highlight(`<click-count></click-count>
<template skein="click-count">
  <script type="module">this.count = 0</script>
  <button onclick={up}>clicked {count}</button>
</template>`);
assert(highlighted.includes('&lt;<span class="tok-tag">click-count</span>&gt;'), 'opening custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('&lt;/<span class="tok-tag">click-count</span>&gt;'), 'closing custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('<span class="tok-attr">skein</span>='), 'attribute names should be highlighted');
assert(highlighted.includes('<span class="tok-bind">{up}</span>'), 'bindings inside tags should be highlighted');
assert(!highlighted.includes('<class='), 'highlighter must not corrupt its own span markup');
assert(!highlighted.includes('</class='), 'highlighter must not emit fake closing tags');

let cleanup = 0;
scope.cleanup(() => cleanup++);
scope.dispose();
equal(cleanup, 1, 'scope cleanup');
assert(scope.signal.aborted, 'scope abort signal should abort on dispose');

console.log('core-node: passed');
