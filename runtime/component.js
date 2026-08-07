import { BindingScope, ComputedRef, ReactiveEffect, ReactiveState, Scope } from './reactive.js';
import { CompiledTemplate } from './template.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const scriptCache = new Map();

export const defineElement = tag => {
  if (!customElements.get(tag)) customElements.define(tag, class extends SkeinElement {});
};

class CompiledComponent {
  constructor(body) {
    const fragment = document.createDocumentFragment();
    this.scripts = null;
    for (const child of [...body.childNodes]) {
      if (child instanceof HTMLScriptElement) (this.scripts ||= []).push(child.textContent);
      else fragment.append(child);
    }
    this.template = new CompiledTemplate(fragment, defineElement);
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
  }

  static load(tag) {
    let promise = this.cache.get(tag);
    if (promise) return promise;
    promise = this.fetch(tag).catch(error => {
      this.cache.delete(tag);
      throw error;
    });
    this.cache.set(tag, promise);
    return promise;
  }

  static async fetch(tag) {
    const path = tag.replaceAll('-', '/') + '.html';
    const response = await fetch(new URL(path, SkeinElement.baseURL));
    if (!response.ok) throw new Error('Cannot load <' + tag + '>: ' + response.status + ' ' + response.statusText);
    return this.compile(await response.text());
  }
}

export class SkeinElement extends HTMLElement {
  static baseURL = new URL('.', document.baseURI);
  static instances = new Set();

  #scope = null;
  #view = null;
  #mounting = null;
  #disposed = false;
  #generation = 0;
  #inputs = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = new ReactiveState({});
  }


  connectedCallback() {
    if (this.#disposed) return;
    SkeinElement.instances.add(this);
    if (this.#view) return this.#scope?.resume();
    if (this.#mounting) return;

    const generation = ++this.#generation;
    const mounting = this.mount(generation);
    this.#mounting = mounting;
    mounting.catch(error => {
      if (generation === this.#generation) this.report(error);
    }).finally(() => {
      if (this.#mounting === mounting) this.#mounting = null;
    });
  }

  acceptInput(name, fallback) {
    if (typeof name !== 'string' || !name) throw new TypeError('Skein input name must be a non-empty string');
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
    return initial;
  }

  disconnectedCallback() { SkeinElement.instances.delete(this); this.#scope?.pause(); }
  connectedMoveCallback() { this.#scope?.resume(); }

  async mount(generation) {
    const component = await CodeLoader.load(this.localName);
    if (!this.isConnected || this.#disposed || generation !== this.#generation) return;

    const scope = this.#scope = new Scope();
    this.shadowRoot.replaceChildren();

    if (component.scripts) for (const source of component.scripts) this.runScript(source, scope);

    const bindingScope = new BindingScope(this.state);
    this.#view = component.template.instantiate(bindingScope, scope);
    this.shadowRoot.append(this.#view.fragment);
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
    this.dispatchEvent(new ErrorEvent('error', { 'error': error, message: error?.message || String(error), bubbles: true, composed: true }));
    console.error(error);
  }

  reload() {
    if (this.#disposed) return;
    this.#generation++;
    if (this.#view) this.#view.dispose(false);
    else this.#scope?.dispose();
    this.#scope = this.#view = null;
    this.#mounting = null;
    this.shadowRoot.replaceChildren();
    if (this.isConnected) this.connectedCallback();
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    if (this.#view) this.#view.dispose(false);
    else this.#scope?.dispose();
    this.#scope = this.#view = null;
    this.#mounting = null;
    this.shadowRoot.replaceChildren();
    SkeinElement.instances.delete(this);
  }
}

export const registerComponent = (tag, source) => {
  CodeLoader.register(tag, source);
  const existing = customElements.get(tag);
  if (existing) {
    if (!(existing.prototype instanceof SkeinElement)) throw new Error('<' + tag + '> is already defined outside Skein');
    for (const element of SkeinElement.instances) if (element.localName === tag) element.reload();
    return existing;
  }
  defineElement(tag);
  return customElements.get(tag);
};
