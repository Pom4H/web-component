const { ReactiveState, Scope, ReactiveEffect, ComputedRef, Scheduler } = await import('../runtime/reactive.js');
const { highlight } = await import('../site/highlight.js');

const assert = (value, message) => { if (!value) throw new Error(message); };
const equal = (actual, expected, message) => {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, got ${actual}`);
};

const state = new ReactiveState({ count: 1, items: [1, 2, 3], nested: { name: 'A' } });
const scope = new Scope();
let countRuns = 0;
let observed;
new ReactiveEffect(() => { countRuns++; observed = state.count; }, scope, true);
state.count = 2;
state.count = 3;
Scheduler.flush();
equal(observed, 3, 'batched value');
equal(countRuns, 2, 'sync writes rerun once');

let listRuns = 0;
let list = '';
new ReactiveEffect(() => { listRuns++; list = [...state.items].join(','); }, scope, true);
state.items.push(4);
Scheduler.flush();
equal(list, '1,2,3,4', 'array push');
equal(listRuns, 2, 'array push one rerun');

let truncated;
new ReactiveEffect(() => { truncated = state.items[3]; }, scope, true);
state.items.length = 1;
Scheduler.flush();
equal(truncated, undefined, 'length truncation invalidates removed index');

let keysRuns = 0;
new ReactiveEffect(() => { keysRuns++; Object.keys(state.nested); }, scope, true);
state.nested.name = 'B';
Scheduler.flush();
equal(keysRuns, 1, 'value update does not invalidate keys');
state.nested.extra = true;
Scheduler.flush();
equal(keysRuns, 2, 'add invalidates keys');

const computed = new ComputedRef(() => state.count * 2, scope);
let computedRuns = 0;
let computedValue;
new ReactiveEffect(() => { computedRuns++; computedValue = computed.get(); }, scope, true);
state.count = 4;
state.count = 5;
Scheduler.flush();
equal(computedValue, 10, 'computed');
equal(computedRuns, 2, 'computed consumer rerun once');

let missing;
new ReactiveEffect(() => { missing = state.later; }, scope, true);
state.later = 7;
Scheduler.flush();
equal(missing, 7, 'missing property tracks');

const highlighted = highlight(`<click-count></click-count>
<template skein="click-count">
  <script type="module">this.count = 0</script>
  <button @click={up}>clicked {count}</button>
</template>`);
assert(highlighted.includes('&lt;<span class="tok-tag">click-count</span>&gt;'), 'opening custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('&lt;/<span class="tok-tag">click-count</span>&gt;'), 'closing custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('<span class="tok-attr">skein</span>='), 'attribute names should be highlighted');
assert(highlighted.includes('<span class="tok-bind">{up}</span>'), 'bindings inside tags should be highlighted');
assert(!highlighted.includes('<class='), 'highlighter must not corrupt its own span markup');
assert(!highlighted.includes('</class='), 'highlighter must not emit fake closing tags');

let cleanup = 0;
const abortSignal = scope.signal;
scope.cleanup(() => cleanup++);
scope.dispose();
equal(cleanup, 1, 'cleanup');
assert(abortSignal.aborted, 'abort signal');

console.log('core-node: passed');
