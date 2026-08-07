const ITERATE = Symbol();
const MISS = Symbol();

let activeObserver = null;

const clearDependencies = observer => {
  for (const source of observer.dependencies) source.subscribers.delete(observer);
  observer.dependencies.clear();
};

class Dep {
  subscribers = new Set();

  track() {
    if (!activeObserver || activeObserver === this) return;
    this.subscribers.add(activeObserver);
    activeObserver.dependencies.add(this);
  }

  notify() {
    for (const subscriber of this.subscribers) subscriber.invalidate();
  }
}

export class Ref extends Dep {
  constructor(value) {
    super();
    this.current = value;
  }

  get() {
    this.track();
    return this.current;
  }

  set(value) {
    if (Object.is(this.current, value)) return false;
    this.current = value;
    this.notify();
  }
}

export const unwrap = value => value instanceof Dep ? value.get() : value;

export class Scheduler {
  static renderQueue = new Set();
  static effectQueue = new Set();
  static pending = false;
  static flushing = false;

  static enqueue(effect) {
    if (!effect.active || effect.scope?.paused) return;
    (effect.render ? this.renderQueue : this.effectQueue).add(effect);
    this.request();
  }

  static request() {
    if (this.pending || this.flushing) return;
    this.pending = true;
    queueMicrotask(() => this.flush());
  }

  static flush() {
    if (this.flushing) return;
    this.pending = false;
    this.flushing = true;
    try {
      while (this.renderQueue.size || this.effectQueue.size) {
        for (const effect of this.renderQueue) {
          this.renderQueue.delete(effect);
          effect.run();
        }
        for (const effect of this.effectQueue) {
          this.effectQueue.delete(effect);
          effect.run();
          break;
        }
      }
    } finally {
      this.flushing = false;
      if (this.renderQueue.size || this.effectQueue.size) this.request();
    }
  }
}

export class ComputedRef extends Dep {
  dependencies = new Set();
  dirty = true;
  disposed = false;

  constructor(callback, scope) {
    super();
    this.callback = callback;
    this.scope = scope;
    scope?.own(this);
  }

  get() {
    this.track();
    if (this.dirty) this.compute();
    return this.cached;
  }

  compute() {
    if (this.disposed) return;
    clearDependencies(this);
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
    this.notify();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearDependencies(this);
    this.subscribers.clear();
  }
}

export class ReactiveEffect {
  dependencies = new Set();
  active = true;
  dirty = false;

  constructor(callback, scope, render = false) {
    this.callback = callback;
    this.scope = scope;
    this.render = render;
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
    clearDependencies(this);
    const previous = activeObserver;
    activeObserver = this;
    try {
      this.callback();
    } finally {
      activeObserver = previous;
    }
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    clearDependencies(this);
    Scheduler.renderQueue.delete(this);
    Scheduler.effectQueue.delete(this);
  }
}

export class Scope {
  children = null;
  owned = null;
  paused = false;
  disposed = false;

  constructor(parent = null) {
    this.parent = parent;
    this.controller = null;
    if (parent) (parent.children ||= new Set()).add(this);
  }

  get signal() { return (this.controller ||= new AbortController())['signal']; }
  child() { return new Scope(this); }

  own(value) {
    if (this.disposed) value.dispose?.();
    else (this.owned ||= []).push(value);
  }

  cleanup(callback) {
    if (this.disposed) callback();
    else (this.owned ||= []).push(callback);
  }

  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    if (this.children) for (const child of this.children) child.pause();
  }

  resume() {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    if (this.children) for (const child of this.children) child.resume();
    if (this.owned) for (const owned of this.owned) {
      if (owned instanceof ReactiveEffect && owned.dirty) Scheduler.enqueue(owned);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller?.abort();
    if (this.children) for (const child of this.children) child.dispose();
    if (this.owned) {
      for (const owned of this.owned) if (typeof owned !== 'function') owned.dispose?.();
      for (const cleanup of this.owned) if (typeof cleanup === 'function') {
        try { cleanup(); }
        catch (error) { queueMicrotask(() => { throw error; }); }
      }
    }
    this.children?.clear();
    this.children = this.owned = null;
    this.parent?.children?.delete(this);
  }
}

const owns = Object.hasOwn;

export class ReactiveState {
  #deps = new WeakMap();
  #proxies = new WeakMap();
  #raw = new WeakMap();

  constructor(value = {}) {
    return this.reactive(value);
  }

  raw(value) {
    return this.#raw.get(value) || value;
  }

  dep(target, property) {
    let map = this.#deps.get(target);
    if (!map) this.#deps.set(target, map = new Map());
    let dep = map.get(property);
    if (!dep) map.set(property, dep = new Dep());
    return dep;
  }

  reactive(target) {
    if (target === null || typeof target !== 'object') return target;
    if (this.#raw.has(target)) return target;
    const cached = this.#proxies.get(target);
    if (cached) return cached;

    const proxy = new Proxy(target, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== 'symbol') this.dep(target, property).track();
        return this.reactive(unwrap(value));
      },
      set: (target, property, value, receiver) => {
        const had = owns(target, property);
        const previous = Reflect.get(target, property, receiver);
        const previousLength = Array.isArray(target) ? target.length : -1;
        const raw = this.raw(value);
        const result = Reflect.set(target, property, raw, receiver);
        if (Object.is(previous, raw)) return result;

        this.dep(target, property).notify();
        let structural = !had;
        if (Array.isArray(target) && target.length !== previousLength) {
          if (property !== 'length') this.dep(target, 'length').notify();
          else if (raw < previousLength) {
            const deps = this.#deps.get(target);
            if (deps) for (const [key, dep] of deps) if (typeof key !== 'symbol' && +key >= raw) dep.notify();
          }
          structural = true;
        }
        if (structural) this.dep(target, ITERATE).notify();
        return result;
      },
      deleteProperty: (target, property) => {
        if (!owns(target, property)) return true;
        const result = Reflect.deleteProperty(target, property);
        this.dep(target, property).notify();
        this.dep(target, ITERATE).notify();
        return result;
      },
      ownKeys: target => {
        this.dep(target, ITERATE).track();
        return Reflect.ownKeys(target);
      },
    });

    this.#proxies.set(target, proxy);
    this.#raw.set(proxy, target);
    return proxy;
  }
}

export const compilePath = expression => expression.match(/[^.\s]+/g) || [];

const read = (value, key) => {
  if (value == null) return MISS;
  const type = typeof value;
  if (type !== 'object' && type !== 'function') return MISS;
  const result = value[key];
  return key in value ? result : MISS;
};

const follow = (value, path, start = 1) => {
  value = unwrap(value);
  for (let index = start; index < path.length; index++) {
    if (value == null) return undefined;
    value = unwrap(value[path[index]]);
  }
  return value;
};

export class BindingScope {
  constructor(rootState, context = rootState, parent = null, locals = null, mutable = false) {
    this.rootState = rootState;
    this.contextValue = mutable ? new Ref(context) : context;
    this.parent = parent;
    this.locals = locals;
  }

  setContext(value) { this.contextValue.set(value); }
  context() { return unwrap(this.contextValue); }

  lookup(path, contextChain = null) {
    let contexts = null;
    if (contextChain?.length) {
      contexts = [];
      for (const contextPath of contextChain) contexts.unshift(this.find(contextPath, contexts));
    }
    return this.find(path, contexts);
  }

  find(path, contexts = null) {
    if (!path.length) return unwrap(contexts?.[0] ?? this.context());
    const head = path[0];

    if (contexts) {
      for (const context of contexts) {
        const value = read(context, head);
        if (value !== MISS) return follow(value, path);
      }
    }

    for (let scope = this; scope; scope = scope.parent) {
      if (scope.locals) {
        const value = read(scope.locals, head);
        if (value !== MISS) return follow(value, path);
      }
      const value = read(scope.context(), head);
      if (value !== MISS) return follow(value, path);
    }
    return undefined;
  }
}
