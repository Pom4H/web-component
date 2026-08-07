const empty = ['\n', '\n\n'];
const isEmptyNode = ({ nodeValue }) => empty.includes(nodeValue);

class FallbackState {
  #value;
  #effects = new Set();

  constructor(value) {
    this.#value = value;
  }

  get() {
    if (FallbackSignal.active) {
      this.#effects.add(FallbackSignal.active);
      FallbackSignal.active.dependencies.add(this);
    }
    return this.#value;
  }

  set(value) {
    if (Object.is(this.#value, value)) return;
    this.#value = value;
    for (const effect of [...this.#effects]) effect.schedule();
  }

  remove(effect) {
    this.#effects.delete(effect);
  }
}

class FallbackEffect {
  dependencies = new Set();
  scheduled = false;
  active = true;

  constructor(callback) {
    this.callback = callback;
    this.run();
  }

  run = () => {
    if (!this.active) return;
    this.scheduled = false;
    for (const dependency of this.dependencies) dependency.remove(this);
    this.dependencies.clear();
    const previous = FallbackSignal.active;
    FallbackSignal.active = this;
    try {
      this.callback();
    } finally {
      FallbackSignal.active = previous;
    }
  }

  schedule = () => {
    if (this.scheduled || !this.active) return;
    this.scheduled = true;
    queueMicrotask(this.run);
  }

  dispose = () => {
    this.active = false;
    for (const dependency of this.dependencies) dependency.remove(this);
    this.dependencies.clear();
  }
}

const FallbackSignal = {
  active: null,
  State: FallbackState,
  effect(callback) {
    return new FallbackEffect(callback).dispose;
  },
};

const NativeSignal = globalThis.Signal;

const Signals = NativeSignal?.State && NativeSignal?.Computed && NativeSignal?.subtle?.Watcher ? {
  State: NativeSignal.State,
  effect(callback) {
    const watcher = new NativeSignal.subtle.Watcher(() => queueMicrotask(() => {
      for (const pending of watcher.getPending()) pending.get();
      watcher.watch();
    }));
    const computed = new NativeSignal.Computed(callback);
    watcher.watch(computed);
    computed.get();
    return () => watcher.unwatch(computed);
  },
} : FallbackSignal;

class ReactiveState {
  #signals = new WeakMap();
  #proxies = new WeakMap();
  #iterate = Symbol('iterate');

  constructor(value = {}) {
    this.value = this.#reactive(value);
  }

  #signal(target, property) {
    let signals = this.#signals.get(target);
    if (!signals) this.#signals.set(target, signals = new Map());
    if (!signals.has(property)) signals.set(property, new Signals.State(target[property]));
    return signals.get(property);
  }

  #reactive(target) {
    if (typeof target !== 'object' || target === null) return target;
    if (this.#proxies.has(target)) return this.#proxies.get(target);

    const proxy = new Proxy(target, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof property === 'symbol') return value;
        this.#signal(target, property).get();
        return this.#reactive(value);
      },
      set: (target, property, value, receiver) => {
        const previous = Reflect.get(target, property, receiver);
        const result = Reflect.set(target, property, value, receiver);
        if (!Object.is(previous, value)) {
          this.#signal(target, property).set(value);
          this.#signal(target, this.#iterate).set({});
        }
        return result;
      },
      deleteProperty: (target, property) => {
        if (!Reflect.has(target, property)) return true;
        const result = Reflect.deleteProperty(target, property);
        this.#signal(target, property).set(undefined);
        this.#signal(target, this.#iterate).set({});
        return result;
      },
      ownKeys: (target) => {
        this.#signal(target, this.#iterate).get();
        return Reflect.ownKeys(target);
      },
    });

    this.#proxies.set(target, proxy);
    return proxy;
  }
}

const defineElement = (tag) => {
  if (tag in WebComponent.tags) return true;
  if (!tag.includes('-')) return false;
  customElements.define(tag, WebComponent.tags[tag] = class extends WebComponent {});
  return true;
};

class CodeLoader {
  static #cache = {};
  static #parser = new DOMParser();

  static async loadFromTag(tag, signal) {
    if (tag in CodeLoader.#cache) return CodeLoader.#cache[tag];
    CodeLoader.#cache[tag] = this.#parse(await this.#fetch(tag, signal));
    return CodeLoader.#cache[tag];
  }

  static #resolve = (tag) => `${tag.toLowerCase().split('-').join('/')}.html`;

  static async #fetch(tag, signal) {
    const data = await fetch(CodeLoader.#resolve(tag), { signal });
    return await data.text();
  }

  static #parse(body) {
    const doc = CodeLoader.#parser.parseFromString(`<html><head></head><body>${body}</body></html>`, 'text/html');
    return doc.body;
  }
}

class Template {
  static curlyBraces = /{([^}]*)}/g;
  static match = (text = '') => [...text.matchAll(Template.curlyBraces)];

  static fill(text, resolve) {
    return text.replace(Template.curlyBraces, (_, key) => {
      const value = resolve(key);
      return value ?? '';
    });
  }
}

class StateManager {
  #state;
  #effects = new Set();

  constructor(element) {
    const reactive = new ReactiveState(element.state || {});
    this.#state = reactive.value;
    element.state = this.#state;
    this.element = element;
  }

  dispose() {
    for (const dispose of this.#effects) dispose();
    this.#effects.clear();
  }

  effect(callback) {
    const dispose = Signals.effect(callback);
    this.#effects.add(dispose);
    return dispose;
  }

  bind = (node) => this.#traverse(node);

  #traverse(node, path = []) {
    if (isEmptyNode(node)) return node;
    if (node.localName) defineElement(node.localName);
    this.#defineHelpers(node);

    if (node.nodeType === Node.ELEMENT_NODE) {
      const inBinding = this.#bindingKey(node, 'in');
      if (inBinding !== null) path = [...path, inBinding];

      const forBinding = this.#bindingKey(node, 'for');
      if (forBinding !== null) return this.#bindList(node, path, forBinding);
    }

    for (const child of [...node.childNodes]) {
      node.replaceChild(this.#traverse(child, path), child);
    }

    return this.#bindNode(node, path);
  }

  #bindingKey(node, name) {
    if (!node.hasAttribute?.(name)) return null;
    const value = node.getAttribute(name);
    const matches = Template.match(value);
    if (matches.length !== 1 || matches[0][0] !== value) return null;
    return matches[0][1];
  }

  #defineHelpers(node) {
    node.$ = this.#state;
    node.open = this.element.open;
    node.replace = this.element.replace;
  }

  #getByPath(path) {
    let value = this.#state;
    for (const key of path) {
      if (value == null) return undefined;
      value = value[key];
    }
    return value;
  }

  #resolve(path, key) {
    if (key === '') return this.#getByPath(path);
    const local = this.#getByPath([...path, key]);
    if (local !== undefined) return local;
    return this.#getByPath([key]);
  }

  #bindList(node, path, key) {
    const start = document.createComment(`for:${key}`);
    const end = document.createComment(`/for:${key}`);
    const fragment = document.createDocumentFragment();
    fragment.append(start, end);
    const template = node.cloneNode(true);
    template.removeAttribute('for');
    let childDisposers = [];

    this.effect(() => {
      for (const dispose of childDisposers) {
        dispose();
        this.#effects.delete(dispose);
      }
      childDisposers = [];

      let current = start.nextSibling;
      while (current && current !== end) {
        const next = current.nextSibling;
        current.remove();
        current = next;
      }

      const data = this.#resolve(path, key);
      let listPath = [...path, key];
      if (this.#getByPath(listPath) === undefined) listPath = [key];
      if (data == null) return;

      for (const index of Object.keys(data)) {
        const clone = template.cloneNode(true);
        const before = this.#effects.size;
        const bound = this.#traverse(clone, [...listPath, index]);
        end.before(bound);
        childDisposers.push(...[...this.#effects].slice(before));
      }
    });

    return fragment;
  }

  #bindNode(node, path) {
    if (node.nodeType === Node.TEXT_NODE) this.#bindText(node, path);
    if (node instanceof Element && node.hasAttributes()) this.#bindAttributes(node, path);
    return node;
  }

  #bindText(node, path) {
    const template = node.textContent;
    if (!Template.match(template).length) return;
    this.effect(() => {
      node.textContent = Template.fill(template, (key) => this.#resolve(path, key));
    });
  }

  #bindAttributes(node, path) {
    for (const name of node.getAttributeNames()) {
      if (name === 'in' || name === 'for') continue;
      const template = node.getAttribute(name);
      if (!Template.match(template).length) continue;
      this.effect(() => {
        const value = Template.fill(template, (key) => this.#resolve(path, key));
        if (value === '') node.removeAttribute(name);
        else node.setAttribute(name, value);
      });
    }
  }
}

class WebComponent extends HTMLElement {
  static root = null;
  static ids = {};
  static tags = {};
  static instances = {};

  #abort = new AbortController();
  #signal = this.#abort.signal;
  state = null;

  constructor() {
    super();
    if (!WebComponent.root) WebComponent.root = this;
    if (!WebComponent.ids[this.localName]) WebComponent.ids[this.localName] = 1;
    else WebComponent.ids[this.localName]++;
    this.key = this.localName + '-' + WebComponent.ids[this.localName];
    WebComponent.instances[this.key] = this;
    this.attachShadow({ mode: 'open' });
    this.stateManager = new StateManager(this);
  }

  async connectedCallback() {
    const body = await CodeLoader.loadFromTag(this.localName, this.#signal);
    for (const child of body.childNodes) {
      const node = child.cloneNode(true);
      if (node instanceof HTMLScriptElement) {
        const script = document.createElement('script');
        script.innerHTML = `(async function () {${node.textContent}}).call(WebComponent.instances['${this.key}'].state);`;
        this.appendChild(script);
        continue;
      }
      if (node instanceof HTMLStyleElement) {
        this.shadowRoot.appendChild(node);
        continue;
      }
      this.shadowRoot.appendChild(this.stateManager.bind(node));
    }
  }

  disconnectedCallback() {
    this.#abort.abort();
    this.stateManager.dispose();
    delete WebComponent.instances[this.key];
  }

  open = (tag) => {
    if (!defineElement(tag)) return false;
    let style = '';
    const [stylesheet] = this.shadowRoot.styleSheets;
    if (stylesheet) {
      const [rule] = stylesheet.cssRules;
      if (rule) style = `<style>${rule.cssText}</style>`;
    }
    this.shadowRoot.innerHTML = style + `<${tag}></${tag}>`;
    return true;
  }

  replace = (tag) => {
    if (!defineElement(tag)) return false;
    if (WebComponent.root === this) WebComponent.root = null;
    if (this.parentNode) this.outerHTML = `<${tag}></${tag}>`;
    return true;
  }
}

window.WebComponent = WebComponent;
window.WebComponentSignals = Signals;

for (const element of document.body.children) {
  if (element.localName.includes('-')) {
    defineElement(element.localName);
    break;
  }
}
