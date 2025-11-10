/**
 * TC39 Signals Polyfill
 * This provides a basic implementation of the TC39 Signals proposal
 * https://github.com/tc39/proposal-signals
 */
if (typeof Signal === 'undefined') {
  window.Signal = class Signal {
    static State = class State {
      #value;
      #watchers = new Set();

      constructor(value) {
        this.#value = value;
      }

      get() {
        return this.#value;
      }

      set(newValue) {
        if (this.#value !== newValue) {
          this.#value = newValue;
          this.#notify();
        }
      }

      #notify() {
        for (const watcher of this.#watchers) {
          watcher.notify();
        }
      }

      _addWatcher(watcher) {
        this.#watchers.add(watcher);
      }

      _removeWatcher(watcher) {
        this.#watchers.delete(watcher);
      }
    };

    static Computed = class Computed {
      #fn;
      #value;
      #dirty = true;

      constructor(fn) {
        this.#fn = fn;
      }

      get() {
        if (this.#dirty) {
          this.#value = this.#fn();
          this.#dirty = false;
        }
        return this.#value;
      }
    };

    static subtle = class {
      static Watcher = class Watcher {
        #callback;
        #signals = new Set();
        #pending = false;

        constructor(callback) {
          this.#callback = callback;
        }

        watch(signal) {
          this.#signals.add(signal);
          signal._addWatcher(this);
        }

        unwatch(signal) {
          this.#signals.delete(signal);
          signal._removeWatcher(this);
        }

        notify() {
          if (!this.#pending) {
            this.#pending = true;
            queueMicrotask(() => {
              this.#pending = false;
              this.#callback();
            });
          }
        }

        getPending() {
          return Array.from(this.#signals);
        }
      };
    };
  };
}

const empty = ['\n', '\n\n']
const isEmptyNode = ({ nodeValue }) => empty.includes(nodeValue);

/**
 * SignalStateWrapper wraps objects and arrays with Signal.State for reactivity
 * Each property is converted to a Signal.State for fine-grained reactivity
 */
class SignalStateWrapper {
  #signals = new Map();
  #path = [];
  #watchers = new Set();

  constructor(initialValue = {}, path = []) {
    this.#path = path;
    this.#initializeSignals(initialValue);
  }

  #initializeSignals(obj) {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          this.#signals.set(key, new Signal.State(value));
        } else {
          this.#signals.set(key, new Signal.State(value));
        }
      } else {
        this.#signals.set(key, new Signal.State(value));
      }
    }
  }

  getSignal(key) {
    if (!this.#signals.has(key)) {
      this.#signals.set(key, new Signal.State(undefined));
    }
    return this.#signals.get(key);
  }

  get(key) {
    return this.getSignal(key).get();
  }

  set(key, value) {
    this.getSignal(key).set(value);
  }

  has(key) {
    return this.#signals.has(key);
  }

  delete(key) {
    const signal = this.getSignal(key);
    signal.set(undefined);
    return this.#signals.delete(key);
  }

  keys() {
    return Array.from(this.#signals.keys());
  }

  addWatcher(watcher) {
    this.#watchers.add(watcher);
  }

  createProxy() {
    return new Proxy(this, {
      get(target, property) {
        if (typeof property === 'string' && !property.startsWith('_') && property !== 'constructor') {
          const value = target.get(property);
          // If value is object/array, wrap it in a proxy too
          if (typeof value === 'object' && value !== null) {
            return target.#createNestedProxy(property, value);
          }
          return value;
        }
        return Reflect.get(target, property);
      },
      set(target, property, value) {
        if (typeof property === 'string' && !property.startsWith('_')) {
          target.set(property, value);
          return true;
        }
        return Reflect.set(target, property, value);
      },
      deleteProperty(target, property) {
        return target.delete(property);
      },
      has(target, property) {
        return target.has(property);
      },
      ownKeys(target) {
        return target.keys();
      },
      getOwnPropertyDescriptor(target, property) {
        if (target.has(property)) {
          return {
            enumerable: true,
            configurable: true,
          };
        }
      }
    });
  }

  #createNestedProxy(key, obj) {
    const handler = {
      get: (target, property) => {
        if (typeof property === 'symbol' || property === 'length') {
          return Reflect.get(target, property);
        }
        const value = Array.isArray(target) ? target[property] : target[property];
        if (typeof value === 'object' && value !== null) {
          return new Proxy(value, handler);
        }
        return value;
      },
      set: (target, property, value) => {
        const result = Reflect.set(target, property, value);
        // Trigger signal update for the parent
        const signal = this.getSignal(key);
        signal.set(target);
        return result;
      }
    };
    return new Proxy(obj, handler);
  }
}

const defineElement = (tag) => {
  if (tag in WebComponent.tags) return true;
  if (!tag.includes('-')) return false;
  customElements.define(tag, WebComponent.tags[tag] = class extends WebComponent {
    constructor() {
      super();
    }
  });
  return true;
};

class CodeLoader {
  static #cache = {};
  static #parser = new DOMParser();

  /** @returns {Promise<HTMLElement>} */
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
  static curlyBraces = /{([^}]+)}/g;
  static match = (text = '') => text.match(Template.curlyBraces);
  static keyFrom = (curlyBraces = '') => curlyBraces.startsWith('{') ? curlyBraces.slice(1, -1) : curlyBraces;
  static fill = (text, data) => text.replace(Template.curlyBraces, (match, key) => data[key] || '');
  static applyTemplate = (node, data) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = Template.fill(node.textContent, data);
    } else {
      for (const child of node.childNodes) {
        Template.applyTemplate(child, data);
      }
    }
  }
}

class StateManager {
  #stateWrapper = null;
  #watchers = new Map();
  #effects = new Map();

  /** @param {HTMLElement} element   */
  constructor(element) {
    const initialState = element.state || {};
    this.#stateWrapper = new SignalStateWrapper(initialState);
    element.state = this.#stateWrapper.createProxy();
    this.element = element;
  }

  /**
   * Subscribe to state changes using Signal.subtle.Watcher
   * @param {string[]} path - Path to the state property
   * @param {string[]} vars - Template variables to watch
   * @param {Function} consumer - Callback function
   */
  subscribe(path, vars, consumer) {
    for (const key of vars.map(Template.keyFrom)) {
      const signal = this.#getSignalByPath([...path, key]);
      if (!signal) continue;

      // Create a watcher for this signal
      const watcherKey = [...path, key].toString();
      
      if (!this.#effects.has(watcherKey)) {
        this.#effects.set(watcherKey, new Set());
      }
      this.#effects.get(watcherKey).add(consumer);

      if (!this.#watchers.has(watcherKey)) {
        // Create computed effect that runs consumer when signal changes
        const watcher = new Signal.subtle.Watcher(() => {
          const effects = this.#effects.get(watcherKey);
          if (effects) {
            for (const effect of effects) {
              effect();
            }
          }
        });
        
        watcher.watch(signal);
        this.#watchers.set(watcherKey, watcher);
      }
    }
  }

  /**
   * Get Signal by path
   * @param {string[]} path 
   * @returns {Signal.State | null}
   */
  #getSignalByPath(path) {
    if (path.length === 0) return null;
    
    let current = this.#stateWrapper;
    for (let i = 0; i < path.length - 1; i++) {
      const value = current.get(path[i]);
      if (typeof value === 'object' && value !== null) {
        // For nested objects, we need to access through the wrapper
        current = value;
      } else {
        return null;
      }
    }
    
    const lastKey = path[path.length - 1];
    return current.getSignal ? current.getSignal(lastKey) : null;
  }

  bind = (node) => this.#traverseBottomUp(node)

  /** 
   * @param {Node} node 
   * @returns {Node}
   */
  #traverseBottomUp(node, path = []) {
    if (isEmptyNode(node)) return node;

    if (node.localName) defineElement(node.localName);

    this.#defineHelpers(node);

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('in')) {
        path = [...path, Template.keyFrom(node.getAttribute('in'))];
      }
      if (node.hasAttribute('for')) {
        return this.#bindList(node, path);
      }
    }

    for (const child of node.childNodes) {
      node.replaceChild(this.#traverseBottomUp(child, path), child);
    }

    return this.#bindNode(node, path);
  }

  #defineHelpers(node) {
    node.$ = this.element.state;
    node.open = this.element.open;
    node.replace = this.element.replace;
  }

  /** @param {string[]} path  */
  #getByPath(path) {
    if (path.length === 0) return this.element.state;
    let current = this.element.state;
    for (const key of path) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /** 
   * @param {Element} node 
   * @returns {Node}
   */
  #bindList = (node, path = []) => {
    const key = Template.keyFrom(node.getAttribute('for'));
    const fragment = document.createDocumentFragment();
    let data = this.#getByPath([...path, key]);
    if (!data) {
      data = this.#getByPath([key]);
      path = [key];
    } else {
      path = [...path, key];
    }
    for (const index in data) {
      const clone = node.cloneNode(true);
      clone.removeAttribute('for');
      fragment.appendChild(this.#traverseBottomUp(clone, [...path, index]));
    }
    return fragment;
  }

  /** @param {HTMLElement} node */
  #bindNode = (node, path) => {
    if (node.textContent) this.#bindTextContent(node, path);
    if (node instanceof Element && node.hasAttributes()) this.#bindAttributes(node, path);
    return node;
  }

  /** @param {HTMLElement} node */
  #bindTextContent = (node, path) => {
    const state = this.#getByPath(path);
    if (node.textContent === '{}') {
      node.textContent = state;
      return;
    }
    const vars = Template.match(node.textContent);
    if (vars) {
      const template = node.textContent;
      const consumer = () => node.textContent = Template.fill(template, state);
      this.subscribe(path, vars, consumer);
      consumer();
    }
  }

  /** @param {HTMLElement} node */
  #bindAttributes = (node, path) => {
    const state = this.#getByPath(path);
    for (const name of node.getAttributeNames()) {
      const value = node.getAttribute(name);
      if (!value) continue;
      const vars = Template.match(value);
      if (!vars) continue;
      const [template] = vars;
      if (template) {
        const consumer = () => {
          const attribute = Template.fill(template, state);
          if (attribute) node.setAttribute(name, attribute);
          else node.removeAttribute(name);
        }
        this.subscribe(path, [template], consumer);
        consumer();
      }
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
      } else if (node instanceof HTMLStyleElement) {
        this.shadowRoot.appendChild(node);
        continue;
      }
      this.shadowRoot.appendChild(this.stateManager.bind(node));
    }
  }

  disconnectedCallback() {
    this.#abort.abort();
  }

  open = (tag) => {
    if (!defineElement(tag)) return false;
    let style = '';
    const [stylesheet] = this.shadowRoot.styleSheets;
    if (stylesheet) {
      const [rule] = stylesheet.cssRules;
      if (rule) {
        style = `<style>${rule.cssText}</style>`;
      }
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

for (const element of document.body.children) {
  if (element.localName.includes('-')) {
    defineElement(element.localName);
    break;
  }
}
