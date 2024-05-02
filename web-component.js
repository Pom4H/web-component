const EVENT_TYPES = {
  ASSIGN: 'assign',
  CHANGE: 'change',
  REMOVE: 'remove',
  ADD: 'add',
  MOVE: 'move',
};

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
      if (typeof value === 'function') return result;
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
  if (!tag || !tag.includes('-')) return false;
  if (tag in WebComponent.tags) return true;
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
  static curlyBraces = /\${([^}]+)}/g;
  static match = (text = '') => text.match(Template.curlyBraces);
  static keyFrom = (curlyBraces = '') => curlyBraces.startsWith('${') ? curlyBraces.slice(2, -1) : curlyBraces;
  static fill = (text, data) => text.replace(Template.curlyBraces, (match, key) => data[key] || '');
}

class StateManager {
  consumers = new Map();
  #events = [];
  #state = {};

  /** @param {HTMLElement} element   */
  constructor(element) {
    if (element.state) this.#state = element.state;
    element.state = createObserver(this.#state, this.#emitEvent);
    this.element = element;
  }

  bind = (node, parent) => this.#traverse(node, parent);

  /**
 * @param {string[]} path
 * @returns {any}
 */
  #getState(path = []) {
    if (path.length === 0) return this.#state;
    let currentObject = this.#state;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      if (currentObject === undefined || currentObject[key] === undefined && path.length > 1) {
        const previous = [...path];
        const last = previous.pop();
        previous.pop();
        previous.push(last);
        return this.#getState(previous);
      }
      currentObject = currentObject[key];
    }
    return currentObject;
  }

  #fillState(template = '', path = [], vars = []) {
    // Handle empty path or invalid variables
    if (!vars.length) return template;

    // Create a copy of the path to avoid modifying the original
    const currentPath = [...path];

    // Get the current object from the state using the path
    let currentObject = this.#state;
    for (const key of currentPath) {
      if (!currentObject[key]) {
        // If a key is not found, go up one level in the path and try again
        currentPath.pop();
        if (!currentPath.length) return template; // Reached the top level without finding the key
        currentObject = this.#state; // Reset to the top level state
        for (const k of currentPath) {
          currentObject = currentObject[k];
        }
      } else {
        currentObject = currentObject[key];
      }
    }

    return template.replace(Template.curlyBraces, (match, varName) => {
      // Check if the variable exists in the current object or any parent object
      let value;
      for (let i = currentPath.length; i >= 0 && !value; i--) {
        const obj = i === 0 ? this.#state : currentPath.slice(0, i).reduce((acc, k) => acc[k], this.#state);
        value = obj[varName];
      }

      return value || match; // Return the value if found, otherwise the original variable
    });
  }

  /** 
 * @param {Node} node 
 * @returns {Node}
 */
  #traverse(node, parent = document.createDocumentFragment(), path = []) {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('for') && node.localName !== 'label') {
        return this.#bindListNode(node, parent, path);
      }
      return parent.appendChild(this.#bindElementNode(node, path));
    } else if (node.nodeType === Node.TEXT_NODE) {
      return parent.appendChild(this.#bindTextNode(node, path));
    }
  }

  /** @param {HTMLElement} node */
  #bindTextNode(node, path) {
    const clone = node.cloneNode();
    const vars = Template.match(node.textContent);
    if (vars) {
      const consumer = () => clone.textContent = this.#fillState(node.textContent, path, vars);
      this.#subscribe(path, vars, consumer);
      consumer();
    }
    return clone;
  }

  /** @param {HTMLElement} node */
  #bindElementNode(node, path) {
    defineElement(node.localName);
    if (node.hasAttribute('in')) path = [...path, Template.keyFrom(node.getAttribute('in'))];
    const clone = node.cloneNode();
    this.#bindAttributes(clone, path);
    for (const child of node.childNodes) this.#traverse(child, clone, path);
    this.#defineHelpers(clone);
    return clone;
  }

  #bindAttributes = (node, path) => {
    const state = this.#getState(path);
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
        consumer();
      }
    }
  }

  /** 
   * @param {HTMLElement} node 
   * @param {HTMLElement} parent 
   */
  #bindListNode = (node, parent, path = []) => {
    const key = Template.keyFrom(node.getAttribute('for'));
    const target = [...path, key];
    const consumer = this.#createListConsumer(node);
    const elements = [];
    this.#subscribeList(target, () => {
      while (elements.length) elements.pop().remove();
      for (const index in this.#getState(target)) {
        const element = consumer([...target, index]);
        elements.push(element);
        parent.appendChild(element);
      }
    });
  }

  /** 
 * @param {HTMLElement} node 
 */
  #createListConsumer = (node) => (path) => {
    const clone = node.cloneNode();
    clone.removeAttribute('for');
    for (const child of node.childNodes) {
      clone.appendChild(this.#traverse(child, clone, path));
    }
    return clone;
  }

  #processEvents = () => {
    console.debug('events', this.#events.length);
    while (this.#events.length) {
      const { event, path, oldValue, newValue } = this.#events.shift();
      const consumers = [];
      for (const [subject, subs] of this.consumers) {
        if (subject === path.join()) {
          consumers.push(...subs);
        }
      }
      for (const consumer of consumers) {
        consumer(path);
      }
    }
  }

  #emitEvent = (event, path, oldValue, newValue) => {
    console.log({ event, path, oldValue, newValue });
    this.#events.push({ event, path, oldValue, newValue });
    const frame = requestAnimationFrame(this.#processEvents);
    console.debug({ frame, events: this.#events });
  }

  #subscribeList(path, consumer) {
    const subject = path.toString();
    if (this.consumers.has(subject)) {
      this.consumers.get(subject).push(consumer);
    } else {
      this.consumers.set(subject, [consumer]);
    }
  }

  #subscribe(path, vars, consumer) {
    for (const key of vars.map(Template.keyFrom)) {
      const subject = [...path, key].toString();
      if (this.consumers.has(subject)) {
        this.consumers.get(subject).push(consumer);
      } else {
        this.consumers.set(subject, [consumer]);
      }
    }
  }

  #defineHelpers(node) {
    node.$ = this.element.state;
    node.open = this.element.open;
    node.replace = this.element.replace;
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
    for (const node of body.childNodes) {
      if (node instanceof HTMLScriptElement) {
        const script = document.createElement('script');
        script.innerHTML = `'use strict';(async function () {${node.textContent}}).call(WebComponent.instances['${this.key}'].state);`;
        this.appendChild(script);
        continue;
      }
      const binded = this.stateManager.bind(node);
      if (binded) this.shadowRoot.appendChild(binded);
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
