const EVENT = {
  SET: Symbol('SET'),
  DELETE: Symbol('DELETE'),
  APPEND: Symbol('APPEND'),
};

class ProxyState {
  constructor(state) {
    return this.#proxyObject(state);
  }

  #proxyObject(object, path = []) {
    const self = this;
    return new Proxy(object, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (Array.isArray(value)) {
          return self.#proxyArray(value, [...path, property]);
        } else if (typeof value === 'object' && value !== null) {
          return self.#proxyObject(value, [...path, property]);
        }
        return value;
      },
      set(target, property, value, receiver) {
        //StateManager.consumers.set(target, []);

        if (typeof value === 'object' && StateManager.consumers.has(target[property])) {
          const consumers = StateManager.consumers.get(target[property]);
          StateManager.consumers.set(value, consumers);
        }

        const result = Reflect.set(target, property, value, receiver);
        if (typeof value === 'function') return result;

        if (StateManager.consumers.has(value)) {
          StateManager.consumers.get(value).forEach(consume => {
            consume(EVENT.SET, value);
          });
        } else if (StateManager.consumers.has(target)) {
          StateManager.consumers.get(target).forEach(consume => {
            consume(EVENT.SET, target);
          });
        }

        return result;
      },
      deleteProperty(target, property) {
        //const oldValue = Reflect.get(target, property);
        const result = Reflect.deleteProperty(target, property);
        if (StateManager.consumers.has(target)) {
          StateManager.consumers.get(target).forEach(consume => {
            consume(EVENT.DELETE, property);
          });
        }
        return result;
      },
    });
  }

  #proxyArray(array, path) {
    const self = this;
    return new Proxy(array, ({
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value === 'function') {
          return function (...args) {
            const result = value.apply(target, args);
            if (['push', 'pop'].includes(property)) {
              if (StateManager.consumers.has(target)) {
                StateManager.consumers.get(target).forEach(consume => {
                  consume(EVENT.APPEND, target);
                });
              }
            }
            if (typeof result === 'object') {
              return self.#proxyObject(result, path);
            }
            return result;
          };
        } else if (typeof value === 'object') {
          return self.#proxyObject(value, path);
        } else return value;
      },
      set(target, property, value) {
        target[prop] = value;
        return true;
      }
    }));
  }
}

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
  #state = {};

  static consumers = new WeakMap();

  /** @param {HTMLElement} element   */
  constructor(element) {
    if (element.state) this.#state = element.state;
    element.state = new ProxyState(this.#state);
    this.element = element;
  }

  bind = (node, parent) => this.#traverse(node, parent);

  /**
 * @param {string[]} path
 * @returns {any}
 */
  #getState(_path, _state = this.#state, way = []) {
    const [key, ...path] = _path;
    if (!key) return _state;
    if (_state[key]) {
      way.push(key);
      return this.#getState(path, _state[key], way);
    }
    if (typeof key === 'string' && key.startsWith('[')) {
      way.push(key);
      return this.#getByWay(way);
    }
    if (path.length) return this.#getState([key, ...path], this.#state, way);
    if (_state[key]) return _state[key];
    return this.#state[key];
  }

  #getByWay(way = []) {
    const key = way.pop().slice(1, -1);
    let valueObject = this.#state;
    let keyObject;
    for (const part of way) {
      if (keyObject && keyObject[part]) keyObject = keyObject[part];
      else if (valueObject[part]) valueObject = valueObject[part];
      else if (!keyObject) keyObject = this.#state[part];
    }
    return valueObject[keyObject[key]];
  }

  getState(path) {
    return this.#getState(path);
  }

  #fillState(template = '', path = []) {
    return template.replace(Template.curlyBraces, (_, variable) => {
      return this.#getState([...path, variable]);
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
    const target = this.#getState(path);
    if (!target) return clone;
    const consumer = (action) => {
      if (action === EVENT.SET) {
        clone.textContent = this.#fillState(node.textContent, path);
      }
    }
    consumer(EVENT.SET);
    if (!StateManager.consumers.has(target)) StateManager.consumers.set(target, []);
    const consumers = StateManager.consumers.get(target).push(consumer);
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

  #bindAttributes = (node, _path) => {
    for (const name of node.getAttributeNames()) {
      const value = node.getAttribute(name);
      if (!value) continue;
      const vars = Template.match(value);
      if (!vars) continue;
      const [template] = vars;
      if (template) {
        const target = this.getState(_path);
        const path = [..._path, Template.keyFrom(template)];
        const setConsumer = (action) => {
          if (action !== EVENT.SET) return;
          const attribute = this.#getState(path);
          if (typeof attribute === 'object' || typeof attribute === 'function') {
            node.setAttribute(name, [this.element.key, path]);
          } else if (attribute) {
            node.setAttribute(name, attribute);
          } else node.removeAttribute(name);
        }
        const deleteConsumer = (action, attribute) => {
          if (action !== EVENT.DELETE) return;
          node.removeAttribute(attribute)
        };
        if (!StateManager.consumers.has(target)) StateManager.consumers.set(target, []);
        StateManager.consumers.get(target).push(setConsumer, deleteConsumer);
        setConsumer(EVENT.SET);
      }
    }
  }

  /** 
   * @param {HTMLElement} node 
   * @param {HTMLElement} parent 
   */
  #bindListNode = (node, parent, _path = []) => {
    const key = Template.keyFrom(node.getAttribute('for'));
    const path = [..._path, key];
    const target = this.#getState(path);
    const createListNode = this.#createListNode(node);
    const elements = [];

    const consumer = (action, target) => {
      if (action === EVENT.SET || action === EVENT.APPEND) {
        while (elements.length) elements.pop().remove();
        for (const index in target) {
          const element = createListNode([...path, index]);
          elements.push(element);
          parent.appendChild(element);
        }
      }
    };

    consumer(EVENT.SET, target);

    if (!StateManager.consumers.has(target)) StateManager.consumers.set(target, []);
    StateManager.consumers.get(target).push(consumer);
  }

  /** 
  * @param {HTMLElement} node 
  */
  #createListNode = (node) => (path) => {
    const clone = node.cloneNode();
    clone.removeAttribute('for');
    for (const child of node.childNodes) {
      const result = this.#traverse(child, clone, path);
      if (result) clone.appendChild(result);
    }
    this.#bindAttributes(clone, path);
    this.#defineHelpers(clone);
    return clone;
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

  state = {};

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
    this.#loadProps();
    const body = await CodeLoader.loadFromTag(this.localName, this.#signal);
    for (const node of body.childNodes) {
      if (node instanceof HTMLScriptElement) {
        const script = document.createElement('script');
        script.innerHTML = `'use strict';(async function () {${node.textContent}}).call(WebComponent.instances['${this.key}'].state);`;
        this.appendChild(script);
      } else {
        this.stateManager.bind(node, this.shadowRoot);
      }
    }
  }

  #loadProps() {
    for (const attribute of this.getAttributeNames()) {
      const value = this.getAttribute(attribute);
      //if (!value || !value.startsWith('${')) continue;
      const [key, ...path] = value.split(',');
      this.state[attribute] = WebComponent.instances[key].stateManager.getState(path);
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
