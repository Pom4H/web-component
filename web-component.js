const empty = ['\n', '\n\n']
const isEmptyNode = ({ nodeValue }) => empty.includes(nodeValue);
const EVENT_TYPES = {
  ASSIGN: 'assign',
  CHANGE: 'change',
  REMOVE: 'remove',
  ADD: 'add',
  MOVE: 'move',
};

const Signal = (() => {
  if (typeof globalThis.Signal === 'object' || typeof globalThis.Signal === 'function') {
    return globalThis.Signal;
  }

  let currentObserver = null;

  class StateSignal {
    #value;
    observers = new Set();
    constructor(value) {
      this.#value = value;
    }

    get value() {
      if (currentObserver) {
        currentObserver.subscribe(this);
      }
      return this.#value;
    }

    set value(next) {
      if (Object.is(this.#value, next)) return;
      this.#value = next;
      this.#notify();
    }

    peek() {
      return this.#value;
    }

    #notify() {
      for (const observer of [...this.observers]) {
        observer.schedule();
      }
    }
  }

  const createObserver = (callback, options = {}) => {
    const controller = new AbortController();
    if (options.signal instanceof AbortSignal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    const observer = {
      signals: new Set(),
      pending: false,
      subscribe(signal) {
        if (controller.signal.aborted) return;
        signal.observers.add(observer);
        observer.signals.add(signal);
      },
      cleanup() {
        for (const signal of observer.signals) {
          signal.observers.delete(observer);
        }
        observer.signals.clear();
      },
      run() {
        if (controller.signal.aborted) return;
        observer.cleanup();
        currentObserver = observer;
        try {
          callback();
        } finally {
          currentObserver = null;
        }
      },
      schedule() {
        if (controller.signal.aborted || observer.pending) return;
        observer.pending = true;
        queueMicrotask(() => {
          observer.pending = false;
          observer.run();
        });
      }
    };

    controller.signal.addEventListener('abort', () => observer.cleanup(), { once: true });
    observer.run();
    return controller;
  };

  const effect = (callback, options = {}) => createObserver(callback, options);

  const polyfill = {
    state(initialValue) {
      return new StateSignal(initialValue);
    },
    effect,
  };

  globalThis.Signal = polyfill;
  return polyfill;
})();

const createObserver = (target, emitEvent, path = []) => {
  const handlers = {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'object' && value !== null) {
        return createObserver(value, emitEvent, [...path, property]);
      }
      return value;
    },
    set(target, property, value, receiver) {
      const oldValue = Reflect.get(target, property, receiver);
      const result = Reflect.set(target, property, value, receiver);
      const eventPath = [...path, property];
      if (oldValue !== undefined) {
        emitEvent(EVENT_TYPES.CHANGE, eventPath, oldValue, value);
      } else {
        emitEvent(EVENT_TYPES.ASSIGN, eventPath, undefined, value);
      }
      return result;
    },
    deleteProperty(target, property) {
      const oldValue = Reflect.get(target, property);
      const result = Reflect.deleteProperty(target, property);
      emitEvent(EVENT_TYPES.REMOVE, [...path, property], oldValue);
      return result;
    },
  };

  if (Array.isArray(target)) {
    Object.assign(handlers, {
      push: (...items) => {
        const result = Array.prototype.push.apply(target, items);
        emitEvent(EVENT_TYPES.ADD, [...path, target.length - items.length], undefined, items);
        return result;
      },
      pop: () => {
        const oldValue = target.pop();
        emitEvent(EVENT_TYPES.REMOVE, [...path, target.length], oldValue);
        return oldValue;
      },
      shift: () => {
        const oldValue = target.shift();
        emitEvent(EVENT_TYPES.REMOVE, [...path, 0], oldValue);
        return oldValue;
      },
      unshift: (...items) => {
        const result = target.unshift(...items);
        emitEvent(EVENT_TYPES.ADD, [...path, 0], undefined, items);
        return result;
      },
      splice: (start, deleteCount, ...items) => {
        const deletedItems = target.splice(start, deleteCount, ...items);
        if (deletedItems.length > 0) {
          emitEvent(EVENT_TYPES.REMOVE, [...path, start], deletedItems);
        }
        if (items.length > 0) {
          emitEvent(EVENT_TYPES.ADD, [...path, start], undefined, items);
        }
        return deletedItems;
      },
      sort: (compareFn) => {
        const oldArr = [...target];
        const result = Array.prototype.sort.apply(target, [compareFn]);
        emitEvent(EVENT_TYPES.MOVE, path, oldArr, target);
        return result;
      },
    });
  }

  return new Proxy(target, handlers);
};

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
  static fill = (text, data) => text.replace(
    Template.curlyBraces,
    (_match, key) => {
      const value = data?.[key];
      return value == null ? '' : value;
    }
  );
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
  #state = {};
  #signals = new Map();
  #effects = new Set();

  /** @param {HTMLElement} element   */
  constructor(element) {
    if (element.state) this.#state = element.state;
    this.element = element;
    element.state = createObserver(this.#state, this.#emitEvent);
  }

  dispose() {
    for (const controller of this.#effects) {
      controller.abort();
    }
    this.#effects.clear();
  }

  bind = (node) => this.#traverseBottomUp(node)

  #emitEvent = (_event, path) => {
    for (let i = path.length; i >= 0; i--) {
      const subject = this.#subjectFrom(path.slice(0, i));
      const signal = this.#signalFor(subject);
      signal.value = signal.peek() + 1;
    }
  }

  #signalFor(subject) {
    if (!this.#signals.has(subject)) {
      this.#signals.set(subject, Signal.state(0));
    }
    return this.#signals.get(subject);
  }

  #subjectFrom(path) {
    if (!path.length) return '[root]';
    return path.map(String).join();
  }

  #watchPath(path, consumer) {
    const subject = this.#subjectFrom(path);
    const signal = this.#signalFor(subject);
    const controller = Signal.effect(() => {
      signal.value;
      consumer();
    });
    this.#effects.add(controller);
    controller.signal.addEventListener('abort', () => this.#effects.delete(controller), { once: true });
  }

  subscribe(path, vars, consumer) {
    const keys = vars.map(Template.keyFrom);
    if (!keys.length) return;
    const controller = Signal.effect(() => {
      for (const key of keys) {
        const subject = this.#subjectFrom([...path, key]);
        const signal = this.#signalFor(subject);
        signal.value;
      }
      consumer();
    });
    this.#effects.add(controller);
    controller.signal.addEventListener('abort', () => this.#effects.delete(controller), { once: true });
  }

  #safeGet(path) {
    return path.reduce((obj, key) => (obj == null ? undefined : obj[key]), this.#state);
  }

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

  /** 
   * @param {Element} node 
   * @returns {Node}
   */
  #bindList = (node, path = []) => {
    const key = Template.keyFrom(node.getAttribute('for'));
    const fragment = document.createDocumentFragment();
    let data = this.#safeGet([...path, key]);
    if (!data) {
      data = this.#safeGet([key]);
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
    const content = node.textContent;
    if (!content) return;
    if (content.trim() === '{}') {
      const initial = this.#safeGet(path);
      node.textContent = initial == null ? '' : initial;
      this.#watchPath(path, () => {
        const value = this.#safeGet(path);
        node.textContent = value == null ? '' : value;
      });
      return;
    }
    const vars = Template.match(content);
    if (vars) {
      const template = content;
      const consumer = () => {
        const state = this.#safeGet(path);
        const data = state && typeof state === 'object' ? state : {};
        node.textContent = Template.fill(template, data);
      };
      this.subscribe(path, vars, consumer);
      consumer();
    }
  }

  /** @param {HTMLElement} node */
  #bindAttributes = (node, path) => {
    for (const name of node.getAttributeNames()) {
      const value = node.getAttribute(name);
      if (!value) continue;
      const vars = Template.match(value);
      if (!vars) continue;
      const [template] = vars;
      if (!template) continue;
      const consumer = () => {
        const state = this.#safeGet(path);
        const data = state && typeof state === 'object' ? state : {};
        const attribute = Template.fill(template, data);
        if (attribute) node.setAttribute(name, attribute);
        else node.removeAttribute(name);
      };
      this.subscribe(path, [template], consumer);
      consumer();
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
    this.stateManager.dispose();
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
