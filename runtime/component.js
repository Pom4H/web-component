import { BindingScope, ComputedRef, ReactiveEffect, ReactiveState, Scope } from './reactive.js';
import { CompiledTemplate } from './template.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const scriptCache = new Map();

const defineSkeinElement = tag => {
  if (!customElements.get(tag)) customElements.define(tag, class extends SkeinElement {});
  return customElements.get(tag);
};

const disposeElement = element => {
  if (element instanceof SkeinElement) element.dispose();
};

class CompiledComponent {
  constructor(body) {
    const fragment = document.createDocumentFragment();
    this.scripts = null;
    for (const child of [...body.childNodes]) {
      if (child instanceof HTMLScriptElement) (this.scripts ||= []).push(child.textContent);
      else fragment.append(child);
    }
    this.template = new CompiledTemplate(fragment, loadElement, disposeElement);
  }
}

class CodeLoader {
  static cache = new Map();
  static parser = new DOMParser();

  static compile(source) {
    return new CompiledComponent(this.parser.parseFromString('<body>' + source, 'text/html').body);
  }

  static register(tag, source) {
    if (!tag.includes('-')) throw new TypeError('Skein component names must contain a hyphen: ' + tag);
    const component = this.compile(source);
    this.cache.set(tag, component);
    return component;
  }

  static load(tag) {
    let value = this.cache.get(tag);
    if (value) return value;
    value = this.fetch(tag).catch(error => {
      this.cache.delete(tag);
      throw error;
    });
    this.cache.set(tag, value);
    return value;
  }

  static async fetch(tag) {
    const path = tag.replaceAll('-', '/') + '.html';
    const response = await fetch(new URL(path, SkeinElement.baseURL));
    if (!response.ok) {
      const error = new Error('Cannot load <' + tag + '>: ' + response.status + ' ' + response.statusText);
      error.status = response.status;
      throw error;
    }
    return this.compile(await response.text());
  }
}

export const loadElement = async tag => {
  const existing = customElements.get(tag);
  if (existing) return existing;
  try {
    await CodeLoader.load(tag);
  } catch (error) {
    if (error.status !== 404) console.error(error);
    return null;
  }
  return customElements.get(tag) || defineSkeinElement(tag);
};

export class SkeinElement extends HTMLElement {
  static baseURL = new URL('.', document.baseURI);

  #scope = null;
  #view = null;
  #mounting = null;
  #disposed = false;
  #inputs = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = new ReactiveState({});
  }

  connectedCallback() {
    if (this.#disposed) return;
    if (this.#view) return this.#scope?.resume();
    if (this.#mounting) return;

    const mounting = this.mount();
    this.#mounting = mounting;
    mounting.catch(error => this.report(error)).finally(() => {
      if (this.#mounting === mounting) this.#mounting = null;
    });
  }

  disconnectedCallback() { this.#scope?.pause(); }
  connectedMoveCallback() { this.#scope?.resume(); }

  acceptInput(name, fallback) {
    if (typeof name !== 'string' || !name) throw new TypeError('Skein input name must be a non-empty string');
    if (name === 'state' || name in SkeinElement.prototype) throw new TypeError('Skein input conflicts with host property: ' + name);
    if (this.#inputs?.has(name)) return this.state[name];

    const pending = Object.hasOwn(this, name);
    const initial = pending ? this[name] : fallback;
    if (pending) delete this[name];

    Object.defineProperty(this, name, {
      configurable: true,
      enumerable: true,
      get: () => this.state[name],
      set: value => { this.state[name] = value; },
    });
    (this.#inputs ||= new Set()).add(name);
    this.state[name] = initial;
    return initial;
  }

  async mount() {
    const component = await CodeLoader.load(this.localName);
    if (!this.isConnected || this.#disposed) return;

    const scope = this.#scope = new Scope();
    this.shadowRoot.replaceChildren();
    try {
      if (component.scripts) for (const source of component.scripts) this.runScript(source, scope);
      const bindingScope = new BindingScope(this.state);
      this.#view = component.template.instantiate(bindingScope, scope);
      this.shadowRoot.append(this.#view.fragment);
    } catch (error) {
      scope.dispose();
      if (this.#scope === scope) this.#scope = null;
      this.shadowRoot.replaceChildren();
      throw error;
    }
  }

  runScript(source, scope) {
    try {
      const input = (name, fallback) => this.acceptInput(name, fallback);
      const computed = callback => new ComputedRef(callback, scope);
      const effect = callback => new ReactiveEffect(callback, scope);
      const onCleanup = callback => scope.cleanup(callback);
      const abortSignal = source.includes('abortSignal') ? scope.signal : undefined;
      let script = scriptCache.get(source);
      if (!script) {
        script = new AsyncFunction('input', 'computed', 'effect', 'onCleanup', 'host', 'abortSignal', source);
        scriptCache.set(source, script);
      }
      script.call(this.state, input, computed, effect, onCleanup, this, abortSignal)?.catch(error => this.report(error));
    } catch (error) {
      this.report(error);
    }
  }

  report(error) {
    this.dispatchEvent(new ErrorEvent('error', { error, message: error?.message || String(error), bubbles: true, composed: true }));
    console.error(error);
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#view) this.#view.dispose(false);
    else this.#scope?.dispose();
    this.#scope = this.#view = null;
    this.#mounting = null;
    this.shadowRoot.replaceChildren();
  }
}

export const registerComponent = (tag, source) => {
  if (!tag.includes('-')) throw new TypeError('Skein component names must contain a hyphen: ' + tag);
  const existing = customElements.get(tag);
  if (existing) {
    if (!(existing.prototype instanceof SkeinElement)) throw new Error('<' + tag + '> is already defined outside Skein');
    throw new Error('<' + tag + '> is already defined by Skein');
  }
  CodeLoader.register(tag, source);
  return defineSkeinElement(tag);
};
