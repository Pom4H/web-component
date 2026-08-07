export const SIGNAL_REF = Symbol('WebComponent.signal');
export const RAW = Symbol('WebComponent.raw');

export const isObject = value => typeof value === 'object' && value !== null;
export const hasOwnOrInherited = (value, key) => value != null && (typeof value === 'object' || typeof value === 'function') && key in value;
export const toText = value => value == null ? '' : String(value);

export class Scheduler {
  static renderQueue = new Set();
  static effectQueue = new Set();
  static pending = false;
  static batchDepth = 0;
  static flushing = false;
  static stats = { flushes: 0, effectRuns: 0, commits: 0, listCreates: 0, listMoves: 0, listRemoves: 0 };

  static enqueue(effect) {
    if (!effect.active || effect.scope?.paused) return;
    (effect.phase === 'render' ? this.renderQueue : this.effectQueue).add(effect);
    this.#request();
  }

  static #request() {
    if (this.pending || this.batchDepth || this.flushing) return;
    this.pending = true;
    queueMicrotask(() => this.flush());
  }

  static flush() {
    if (this.flushing) return;
    this.pending = false;
    this.flushing = true;
    this.stats.flushes++;
    try {
      while (this.renderQueue.size || this.effectQueue.size) {
        while (this.renderQueue.size) {
          const queue = [...this.renderQueue];
          this.renderQueue.clear();
          for (const effect of queue) effect.run();
        }
        if (this.effectQueue.size) {
          const [effect] = this.effectQueue;
          this.effectQueue.delete(effect);
          effect.run();
        }
      }
    } finally {
      this.flushing = false;
      if (this.renderQueue.size || this.effectQueue.size) this.#request();
    }
  }

  static batch(callback) {
    this.batchDepth++;
    try {
      return callback();
    } finally {
      this.batchDepth--;
      if (!this.batchDepth && (this.renderQueue.size || this.effectQueue.size)) this.#request();
    }
  }

  static commit() { this.stats.commits++; }
}

let activeObserver = null;

const track = source => {
  if (!activeObserver || activeObserver === source) return;
  source.subscribers.add(activeObserver);
  activeObserver.dependencies.add(source);
};

const cleanupDependencies = observer => {
  for (const source of observer.dependencies) source.subscribers.delete(observer);
  observer.dependencies.clear();
};

class Cell {
  subscribers = new Set();
  constructor(value) { this.value = value; }
  get() { track(this); return this.value; }
  set(value) {
    if (Object.is(this.value, value)) return false;
    this.value = value;
    for (const subscriber of [...this.subscribers]) subscriber.invalidate();
    return true;
  }
}

export class SignalRef {
  [SIGNAL_REF] = true;
  constructor(value) { this.cell = new Cell(value); }
  get value() { return this.cell.get(); }
  set value(value) { this.cell.set(value); }
  get() { return this.cell.get(); }
  set(value) { this.cell.set(value); }
  valueOf() { return this.get(); }
  toString() { return toText(this.get()); }
}

export class ComputedRef {
  [SIGNAL_REF] = true;
  subscribers = new Set();
  dependencies = new Set();
  dirty = true;
  disposed = false;

  constructor(callback, scope) {
    this.callback = callback;
    this.scope = scope;
    scope?.own(this);
  }

  get value() { return this.get(); }
  get() {
    track(this);
    if (this.dirty) this.#compute();
    return this.cached;
  }

  #compute() {
    if (this.disposed) return;
    cleanupDependencies(this);
    const previous = activeObserver;
    activeObserver = this;
    try {
      this.cached = this.callback();
      this.dirty = false;
    } finally {
      activeObserver = previous;
    }
  }

  invalidate() {
    if (this.dirty || this.disposed) return;
    this.dirty = true;
    for (const subscriber of [...this.subscribers]) subscriber.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cleanupDependencies(this);
    this.subscribers.clear();
    this.scope?.owned.delete(this);
  }

  valueOf() { return this.get(); }
  toString() { return toText(this.get()); }
}

export class ReactiveEffect {
  dependencies = new Set();
  active = true;
  dirty = false;

  constructor(callback, scope, phase = 'effect') {
    this.callback = callback;
    this.scope = scope;
    this.phase = phase;
    scope?.own(this);
    if (scope?.paused) this.dirty = true;
    else this.run();
  }

  invalidate() {
    if (!this.active) return;
    this.dirty = true;
    if (!this.scope?.paused) Scheduler.enqueue(this);
  }

  run() {
    if (!this.active || this.scope?.paused) return;
    this.dirty = false;
    cleanupDependencies(this);
    const previous = activeObserver;
    activeObserver = this;
    Scheduler.stats.effectRuns++;
    try {
      this.callback();
    } finally {
      activeObserver = previous;
    }
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    cleanupDependencies(this);
    Scheduler.renderQueue.delete(this);
    Scheduler.effectQueue.delete(this);
    this.scope?.owned.delete(this);
  }
}

export class Scope {
  children = new Set();
  owned = new Set();
  cleanups = new Set();
  paused = false;
  disposed = false;

  constructor(parent = null) {
    this.parent = parent;
    this.controller = new AbortController();
    parent?.children.add(this);
  }

  get signal() { return this.controller.signal; }
  child() { return new Scope(this); }

  own(value) {
    if (this.disposed) value.dispose?.();
    else this.owned.add(value);
    return value;
  }

  cleanup(callback) {
    if (this.disposed) callback();
    else this.cleanups.add(callback);
    return callback;
  }

  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    for (const child of this.children) child.pause();
  }

  resume() {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    for (const child of this.children) child.resume();
    for (const owned of this.owned) {
      if (owned instanceof ReactiveEffect && owned.dirty) Scheduler.enqueue(owned);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    for (const child of [...this.children]) child.dispose();
    for (const owned of [...this.owned]) owned.dispose?.();
    for (const cleanup of [...this.cleanups]) {
      try { cleanup(); } catch (error) { queueMicrotask(() => { throw error; }); }
    }
    this.children.clear();
    this.owned.clear();
    this.cleanups.clear();
    this.parent?.children.delete(this);
  }
}

export const unwrap = value => value?.[SIGNAL_REF] ? value.get() : value;

export class ReactiveState {
  #cells = new WeakMap();
  #proxies = new WeakMap();
  #rawByProxy = new WeakMap();
  #iterate = Symbol('iterate');

  constructor(value = {}) { this.value = this.#reactive(value); }
  raw(value) { return this.#rawByProxy.get(value) || value; }

  #cell(target, property) {
    let map = this.#cells.get(target);
    if (!map) this.#cells.set(target, map = new Map());
    if (!map.has(property)) map.set(property, new Cell(target[property]));
    return map.get(property);
  }

  #reactive(target) {
    if (!isObject(target)) return target;
    if (this.#rawByProxy.has(target)) return target;
    if (this.#proxies.has(target)) return this.#proxies.get(target);

    const proxy = new Proxy(target, {
      get: (target, property, receiver) => {
        if (property === RAW) return target;
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== 'symbol') this.#cell(target, property).get();
        return this.#reactive(unwrap(value));
      },
      set: (target, property, value, receiver) => {
        const had = Reflect.has(target, property);
        const previous = Reflect.get(target, property, receiver);
        const previousLength = Array.isArray(target) ? target.length : null;
        const raw = this.raw(value);
        const result = Reflect.set(target, property, raw, receiver);
        if (!Object.is(previous, raw)) {
          this.#cell(target, property).set(raw);
          if (!had) this.#cell(target, this.#iterate).set({});
        }
        if (Array.isArray(target) && target.length !== previousLength) this.#cell(target, 'length').set(target.length);
        return result;
      },
      deleteProperty: (target, property) => {
        if (!Reflect.has(target, property)) return true;
        const result = Reflect.deleteProperty(target, property);
        this.#cell(target, property).set(undefined);
        this.#cell(target, this.#iterate).set({});
        return result;
      },
      ownKeys: target => {
        this.#cell(target, this.#iterate).get();
        return Reflect.ownKeys(target);
      },
      has: (target, property) => {
        if (typeof property !== 'symbol') this.#cell(target, property).get();
        return Reflect.has(target, property);
      },
    });

    this.#proxies.set(target, proxy);
    this.#rawByProxy.set(proxy, target);
    return proxy;
  }
}

export class BindingScope {
  constructor(rootState, context = rootState, parent = null, locals = null) {
    this.rootState = rootState;
    this.contextCell = new Cell(context);
    this.parent = parent;
    this.locals = locals || Object.create(null);
  }

  setContext(value) { this.contextCell.set(value); }
  context() { return this.contextCell.get(); }

  frames() {
    const frames = [];
    for (let scope = this; scope; scope = scope.parent) frames.push({ context: scope.context(), locals: scope.locals });
    return frames;
  }

  resolve(expression, contextChain = []) {
    let frames = this.frames();
    for (const item of contextChain) {
      const context = this.#resolveFromFrames(item, frames);
      frames = [{ context, locals: null }, ...frames];
    }
    return this.#resolveFromFrames(expression, frames);
  }

  #resolveFromFrames(expression, frames) {
    if (expression === '') return unwrap(frames[0]?.context);
    const parts = expression.split('.').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return unwrap(frames[0]?.context);
    const [head, ...tail] = parts;
    let value;
    let found = false;
    for (const frame of frames) {
      if (frame.locals && hasOwnOrInherited(frame.locals, head)) {
        value = frame.locals[head];
        found = true;
        break;
      }
      if (hasOwnOrInherited(frame.context, head)) {
        value = frame.context[head];
        found = true;
        break;
      }
    }
    if (!found) return undefined;
    value = unwrap(value);
    for (const key of tail) {
      if (value == null) return undefined;
      value = unwrap(value[key]);
    }
    return value;
  }
}

export const untrack = callback => {
  const previous = activeObserver;
  activeObserver = null;
  try { return callback(); } finally { activeObserver = previous; }
};
