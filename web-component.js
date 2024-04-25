const empty = ['\n', '\n\n']
const isEmptyNode = ({ nodeValue }) => empty.includes(nodeValue);
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
  consumers = new Map();

  #events = [];

  #state = {};

  /** @param {HTMLElement} element   */
  constructor(element) {
    if (element.state) this.#state = element.state;
    element.state = createObserver(this.#state, this.#emitEvent);
    this.element = element;
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
        consumer(event, path, oldValue, newValue);
      }
    }
  }

  #emitEvent = (event, path, oldValue, newValue) => {
    this.#events.push({ event, path, oldValue, newValue });
    const frame = requestAnimationFrame(this.#processEvents);
    console.debug({ frame, events: this.#events });
  }

  subscribe(path, vars, consumer) {
    for (const key of vars.map(Template.keyFrom)) {
      const subject = [...path, key].toString();
      if (this.consumers.has(subject)) {
        this.consumers.get(subject).push(consumer);
      } else {
        this.consumers.set(subject, [consumer]);
      }
    }
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
    return path.reduce((obj, key) => obj[key], this.#state);
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
