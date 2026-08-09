const { ReactiveState, Scope, ReactiveEffect, ComputedRef, Scheduler } = await import('../runtime/reactive.js');
const { highlight } = await import('../site/highlight.js');
const { cursorLabel, indentSelection, insertIndentedNewline } = await import('../playground/editor.js');

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

// Shared objects use one proxy across component state roots.
const shared = { value: 1 };
const a = new ReactiveState({ shared });
const b = new ReactiveState({ shared: a.shared });
equal(a.shared, b.shared, 'shared object uses one proxy');
let sharedSeen;
const sharedScope = new Scope();
new ReactiveEffect(() => { sharedSeen = b.shared.value; }, sharedScope, true);
a.shared.value = 2;
Scheduler.flush();
equal(sharedSeen, 2, 'shared proxy propagates across roots');
sharedScope.dispose();

// Platform and class instances stay opaque so internal-slot methods remain valid.
const date = new Date(0);
const map = new Map([['x', 1]]);
class Box { constructor() { this.value = 3; } }
const box = new Box();
const opaque = new ReactiveState({ date, map, box });
equal(opaque.date, date, 'Date stays native');
equal(opaque.date.getTime(), 0, 'Date methods keep receiver');
equal(opaque.map, map, 'Map stays native');
equal(opaque.map.get('x'), 1, 'Map methods keep receiver');
equal(opaque.box, box, 'class instance stays opaque');

// Failed writes do not invalidate subscribers.
const frozen = Object.freeze({ value: 1 });
const frozenState = new ReactiveState({ item: frozen });
let frozenRuns = 0;
const frozenScope = new Scope();
new ReactiveEffect(() => { frozenRuns++; frozenState.item.value; }, frozenScope, true);
equal(Reflect.set(frozenState.item, 'value', 2), false, 'failed frozen write returns false');
Scheduler.flush();
equal(frozenRuns, 1, 'failed frozen write does not invalidate');
frozenScope.dispose();

const inherited = Object.create({ secret: 'prototype' });
inherited.own = 'own';
const lexical = new ReactiveState({ inherited });
equal(lexical.inherited.secret, 'prototype', 'opaque object behavior is native');

const highlighted = highlight(`<click-count></click-count>\n<template skein="click-count">\n  <script type="module">this.count = 0</script>\n  <button @click={up}>clicked {count}</button>\n</template>`);
assert(highlighted.includes('&lt;<span class="tok-tag">click-count</span>&gt;'), 'opening custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('&lt;/<span class="tok-tag">click-count</span>&gt;'), 'closing custom-element tag should remain valid highlighted HTML');
assert(highlighted.includes('<span class="tok-attr">skein</span>='), 'attribute names should be highlighted');
assert(highlighted.includes('<span class="tok-bind">{up}</span>'), 'bindings inside tags should be highlighted');
assert(!highlighted.includes('<class='), 'highlighter must not corrupt its own span markup');
assert(!highlighted.includes('</class='), 'highlighter must not emit fake closing tags');

let edit = indentSelection('alpha', 2, 2);
equal(edit.value, 'al  pha', 'Tab inserts two spaces at the caret');
equal(edit.start, 4, 'Tab advances the caret');
equal(edit.end, 4, 'Tab keeps a collapsed selection');

edit = indentSelection('one\n  two\nthree\n', 0, 16);
equal(edit.value, '  one\n    two\n  three\n', 'Tab indents every selected line once');
equal(edit.start, 2, 'multiline indent preserves the selection start');
equal(edit.end, 22, 'multiline indent preserves the selected lines');

edit = indentSelection('\tone\n  two\nthree', 0, 16, true);
equal(edit.value, 'one\ntwo\nthree', 'Shift+Tab removes one tab or indent width per line');
equal(edit.start, 0, 'multiline outdent keeps the first line selected');
equal(edit.end, 13, 'multiline outdent maps the selection end');

edit = insertIndentedNewline('  <div>value</div>', 7, 12);
equal(edit.value, '  <div>\n  </div>', 'Enter replaces the selection with an indented newline');
equal(edit.start, 10, 'Enter places the caret after inherited indentation');
equal(edit.end, 10, 'Enter leaves a collapsed selection');

equal(cursorLabel('first\nsecond', 8, 8), 'Ln 2, Col 3', 'cursor label reports line and column');
equal(cursorLabel('first\nsecond', 6, 10), 'Ln 2, Col 5 · 4 selected', 'cursor label reports selection length');

let cleanup = 0;
const abortSignal = scope.signal;
scope.cleanup(() => cleanup++);
scope.dispose();
equal(cleanup, 1, 'cleanup');
assert(abortSignal.aborted, 'abort signal');

console.log('core-node: passed');
