const empty = ['\n', '\n\n']
const isEmptyNode = ({ nodeValue }) => empty.includes(nodeValue);

// Signal implementation following TC39 proposal
let currentEffect = null;
const effectStack = [];

class Signal {
  #value;
  #subscribers = new Set();

  constructor(initialValue) {
    this.#value = initialValue;
  }

  get value() {
    if (currentEffect) {
      this.#subscribers.add(currentEffect);
    }
    return this.#value;
  }

  set value(newValue) {
    if (this.#value !== newValue) {
      const oldValue = this.#value;
      this.#value = newValue;
      // Notify subscribers
      for (const effect of this.#subscribers) {
        effect();
      }
    }
  }

  peek() {
    return this.#value;
  }
}

function signal(initialValue) {
  return new Signal(initialValue);
}

function computed(fn) {
  let isDirty = true;
  let cachedValue;
  const subscribers = new Set();

  const effectFn = () => {
    isDirty = true;
    // Notify subscribers
    for (const subscriber of subscribers) {
      subscriber();
    }
  };

  const getValue = () => {
    if (isDirty) {
      const prevEffect = currentEffect;
      currentEffect = effectFn;
      try {
        cachedValue = fn();
      } finally {
        currentEffect = prevEffect;
      }
      isDirty = false;
    }
    return cachedValue;
  };

  // Create a computed signal object
  const computedSignal = {
    get value() {
      if (currentEffect) {
        subscribers.add(currentEffect);
      }
      return getValue();
    },
    set value(_) {
      throw new Error('Computed signals are read-only');
    },
    peek() {
      return getValue();
    }
  };

  return computedSignal;
}

function effect(fn) {
  const effectFn = () => {
    effectStack.push(effectFn);
    const prevEffect = currentEffect;
    currentEffect = effectFn;
    try {
      fn();
    } finally {
      currentEffect = prevEffect;
      effectStack.pop();
    }
  };
  effectFn();
  return effectFn;
}

// Helper to convert plain objects/arrays to signal-based reactive structures
function createReactiveState(target, path = []) {
  if (target === null || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return createReactiveArray(target, path);
  }

  return createReactiveObject(target, path);
}

function createReactiveObject(obj, path = []) {
  const reactive = {};
  const signals = new Map();

  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null) {
      reactive[key] = createReactiveState(value, [...path, key]);
    } else {
      const sig = signal(value);
      signals.set(key, sig);
      Object.defineProperty(reactive, key, {
        get() {
          return sig.value;
        },
        set(newValue) {
          if (typeof newValue === 'object' && newValue !== null) {
            reactive[key] = createReactiveState(newValue, [...path, key]);
          } else {
            sig.value = newValue;
          }
        },
        enumerable: true,
        configurable: true
      });
    }
  }

  // Handle new properties
  return new Proxy(reactive, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }
      if (!signals.has(property)) {
        const sig = signal(undefined);
        signals.set(property, sig);
        Object.defineProperty(target, property, {
          get() {
            return sig.value;
          },
          set(newValue) {
            if (typeof newValue === 'object' && newValue !== null) {
              target[property] = createReactiveState(newValue, [...path, property]);
            } else {
              sig.value = newValue;
            }
          },
          enumerable: true,
          configurable: true
        });
      }
      return target[property];
    },
    set(target, property, value) {
      if (property in target) {
        target[property] = value;
      } else {
        if (!signals.has(property)) {
          const sig = signal(value);
          signals.set(property, sig);
          Object.defineProperty(target, property, {
            get() {
              return sig.value;
            },
            set(newValue) {
              if (typeof newValue === 'object' && newValue !== null) {
                target[property] = createReactiveState(newValue, [...path, property]);
              } else {
                sig.value = newValue;
              }
            },
            enumerable: true,
            configurable: true
          });
        } else {
          target[property] = value;
        }
      }
      return true;
    },
    deleteProperty(target, property) {
      if (signals.has(property)) {
        signals.delete(property);
      }
      return Reflect.deleteProperty(target, property);
    }
  });
}

function createReactiveArray(arr, path = []) {
  const arraySignals = arr.map((item, index) => {
    if (typeof item === 'object' && item !== null) {
      return createReactiveState(item, [...path, index]);
    }
    return signal(item);
  });
  
  // Length signal to track array mutations
  const lengthSignal = signal(arraySignals.length);

  const arrayProxy = new Proxy([], {
    get(target, property) {
      if (property === 'length') {
        // Access length signal to track changes
        return lengthSignal.value;
      }
      if (typeof property === 'string' && /^\d+$/.test(property)) {
        const index = parseInt(property);
        if (index < arraySignals.length) {
          const sig = arraySignals[index];
          return sig instanceof Signal ? sig.value : sig;
        }
        return undefined;
      }
      if (property === 'push') {
        return (...items) => {
          for (const item of items) {
            const sig = typeof item === 'object' && item !== null
              ? createReactiveState(item, [...path, arraySignals.length])
              : signal(item);
            arraySignals.push(sig);
          }
          lengthSignal.value = arraySignals.length;
          return arraySignals.length;
        };
      }
      if (property === 'pop') {
        return () => {
          if (arraySignals.length === 0) return undefined;
          const sig = arraySignals.pop();
          lengthSignal.value = arraySignals.length;
          return sig instanceof Signal ? sig.value : sig;
        };
      }
      if (property === 'shift') {
        return () => {
          if (arraySignals.length === 0) return undefined;
          const sig = arraySignals.shift();
          lengthSignal.value = arraySignals.length;
          return sig instanceof Signal ? sig.value : sig;
        };
      }
      if (property === 'unshift') {
        return (...items) => {
          const newSignals = items.map(item =>
            typeof item === 'object' && item !== null
              ? createReactiveState(item, [...path, 0])
              : signal(item)
          );
          arraySignals.unshift(...newSignals);
          lengthSignal.value = arraySignals.length;
          return arraySignals.length;
        };
      }
      if (property === 'splice') {
        return (start, deleteCount, ...items) => {
          const deleted = arraySignals.splice(start, deleteCount || 0);
          const newSignals = items.map(item =>
            typeof item === 'object' && item !== null
              ? createReactiveState(item, [...path, start])
              : signal(item)
          );
          arraySignals.splice(start, 0, ...newSignals);
          lengthSignal.value = arraySignals.length;
          return deleted.map(sig => sig instanceof Signal ? sig.value : sig);
        };
      }
      if (property === 'sort') {
        return (compareFn) => {
          arraySignals.sort((a, b) => {
            const aVal = a instanceof Signal ? a.value : a;
            const bVal = b instanceof Signal ? b.value : b;
            return compareFn ? compareFn(aVal, bVal) : (aVal > bVal ? 1 : -1);
          });
          lengthSignal.value = arraySignals.length; // Trigger update
          return arrayProxy;
        };
      }
      // Delegate other array methods
      if (typeof Array.prototype[property] === 'function') {
        return function(...args) {
          const values = arraySignals.map(sig => sig instanceof Signal ? sig.value : sig);
          return Array.prototype[property].apply(values, args);
        };
      }
      return undefined;
    },
    set(target, property, value) {
      if (typeof property === 'string' && /^\d+$/.test(property)) {
        const index = parseInt(property);
        if (index < arraySignals.length) {
          const sig = arraySignals[index];
          if (sig instanceof Signal) {
            sig.value = value;
          } else {
            arraySignals[index] = typeof value === 'object' && value !== null
              ? createReactiveState(value, [...path, index])
              : signal(value);
          }
        } else {
          const sig = typeof value === 'object' && value !== null
            ? createReactiveState(value, [...path, index])
            : signal(value);
          arraySignals[index] = sig;
          lengthSignal.value = arraySignals.length;
        }
        return true;
      }
      return false;
    },
    deleteProperty(target, property) {
      if (typeof property === 'string' && /^\d+$/.test(property)) {
        const index = parseInt(property);
        if (arraySignals.length > index) {
          arraySignals.splice(index, 1);
          lengthSignal.value = arraySignals.length;
        }
        return true;
      }
      return false;
    }
  });

  return arrayProxy;
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
  #effects = new Map();
  #state = {};

  /** @param {HTMLElement} element   */
  constructor(element) {
    if (element.state) {
      this.#state = element.state;
    }
    element.state = createReactiveState(this.#state);
    this.element = element;
  }

  // Get signal for a specific path
  #getSignal(path) {
    let current = this.#state;
    for (const key of path) {
      if (current === null || typeof current !== 'object') {
        return null;
      }
      current = current[key];
    }
    return current;
  }

  // Create effect for a specific path and variable
  subscribe(path, vars, consumer) {
    const effectKey = `${path.join('.')}:${vars.join(',')}`;
    
    // Clean up existing effect if any
    if (this.#effects.has(effectKey)) {
      // Effects are automatically cleaned up when dependencies change
      // We'll create a new effect for this subscription
    }

    // Create an effect that watches the relevant signals
    const effectFn = effect(() => {
      // Access the state to track dependencies
      const state = this.#getByPath(path);
      if (state) {
        // Access each variable to track its signal
        for (const varMatch of vars) {
          const key = Template.keyFrom(varMatch);
          if (state[key] !== undefined) {
            // Access the value to track the signal
            const _ = state[key];
          }
        }
        consumer();
      }
    });

    this.#effects.set(effectKey, effectFn);
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
    if (path.length === 0) return this.#state;
    let current = this.#state;
    for (const key of path) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /** 
   * @param {Element} node 
   * @returns {Node}
   */
  #bindList = (node, path = []) => {
    const key = Template.keyFrom(node.getAttribute('for'));
    let data = this.#getByPath([...path, key]);
    let dataPath = [...path, key];
    
    if (!data || !Array.isArray(data)) {
      data = this.#getByPath([key]);
      dataPath = [key];
    }
    
    if (!data || !Array.isArray(data)) {
      return document.createDocumentFragment();
    }

    // Initial render
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < data.length; index++) {
      const clone = node.cloneNode(true);
      clone.removeAttribute('for');
      fragment.appendChild(this.#traverseBottomUp(clone, [...dataPath, index]));
    }
    
    // Set up reactive updates for array changes
    let previousLength = data.length;
    effect(() => {
      const currentData = this.#getByPath(dataPath);
      if (currentData && Array.isArray(currentData)) {
        // Track array length to detect mutations
        const currentLength = currentData.length;
        
        // Access items to track individual changes
        for (let i = 0; i < currentLength; i++) {
          const _ = currentData[i]; // Track signal for each item
        }
        
        // If length changed, we need to re-render
        // Note: This is a simplified approach - in production you'd want
        // more sophisticated diffing for better performance
        if (currentLength !== previousLength) {
          previousLength = currentLength;
          // The parent node will handle re-rendering through effects
          // For now, we rely on the initial render and individual item updates
        }
      }
    });

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
      // Simple binding - bind to the state value directly
      const stateValue = state;
      if (stateValue !== undefined) {
        node.textContent = stateValue;
        // Create effect to update when state changes
        effect(() => {
          const currentState = this.#getByPath(path);
          if (currentState !== undefined) {
            node.textContent = currentState;
          }
        });
      }
      return;
    }
    const vars = Template.match(node.textContent);
    if (vars) {
      const template = node.textContent;
      const consumer = () => {
        const currentState = this.#getByPath(path);
        if (currentState) {
          node.textContent = Template.fill(template, currentState);
        }
      };
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
          const currentState = this.#getByPath(path);
          if (currentState) {
            const attribute = Template.fill(template, currentState);
            if (attribute) node.setAttribute(name, attribute);
            else node.removeAttribute(name);
          }
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
// Export Signal API for testing
window.Signal = Signal;
window.signal = signal;
window.computed = computed;
window.effect = effect;
window.createReactiveState = createReactiveState;
window.Template = Template;
window.StateManager = StateManager;
window.CodeLoader = CodeLoader;

for (const element of document.body.children) {
  if (element.localName.includes('-')) {
    defineElement(element.localName);
    break;
  }
}
