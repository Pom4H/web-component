import { BindingScope, ComputedRef, RAW, ReactiveEffect, ReactiveState, Scheduler, Scope, SignalRef, untrack } from './reactive.js';
import { CompiledTemplate } from './template.js';

const isCustomTag = name => name?.includes('-');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const scriptCache = new Map();

export const defineElement = tag => {
  if (!isCustomTag(tag)) return false;
  if (customElements.get(tag)) return true;
  customElements.define(tag, class extends WebComponent {});
  return true;
};

class CompiledComponent {
  constructor(body) {
    const fragment = document.createDocumentFragment();
    this.scripts = [];
    this.styles = [];
    for (const child of [...body.childNodes]) {
      if (child instanceof HTMLScriptElement) this.scripts.push(child.textContent);
      else if (child instanceof HTMLStyleElement) this.styles.push(child.textContent);
      else fragment.append(child.cloneNode(true));
    }
    this.template = new CompiledTemplate(fragment, defineElement);
  }
}

class CodeLoader {
  static #cache = new Map();
  static #parser = new DOMParser();

  static loadFromTag(tag) {
    if (!this.#cache.has(tag)) {
      const promise = this.#load(tag).catch(error => {
        this.#cache.delete(tag);
        throw error;
      });
      this.#cache.set(tag, promise);
    }
    return this.#cache.get(tag);
  }

  static async #load(tag) {
    const path = `${tag.toLowerCase().split('-').join('/')}.html`;
    const response = await fetch(new URL(path, WebComponent.baseURL));
    if (!response.ok) throw new Error(`Cannot load <${tag}>: ${response.status} ${response.statusText}`);
    const body = await response.text();
    const doc = this.#parser.parseFromString(`<html><body>${body}</body></html>`, 'text/html');
    return new CompiledComponent(doc.body);
  }
}

export class WebComponent extends HTMLElement {
  static baseURL = new URL('.', document.baseURI);

  #scope = null;
  #view = null;
  #mounted = false;
  #mounting = null;
  #disposed = false;
  #generation = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = new ReactiveState({}).value;
    this.$ = this.state;
  }

  get signal() { return this.#scope?.signal; }

  connectedCallback() {
    if (this.#disposed) return;
    if (this.#mounted) {
      this.#scope?.resume();
      return;
    }
    if (!this.#mounting) this.#mounting = this.#mount(++this.#generation).finally(() => { this.#mounting = null; });
  }

  disconnectedCallback() { this.#scope?.pause(); }
  connectedMoveCallback() { this.#scope?.resume(); }

  async #mount(generation) {
    const component = await CodeLoader.loadFromTag(this.localName);
    if (!this.isConnected || this.#disposed || generation !== this.#generation) return;

    const scope = new Scope();
    this.#scope = scope;
    this.shadowRoot.replaceChildren();

    for (const styleText of component.styles) {
      const style = document.createElement('style');
      style.textContent = styleText;
      this.shadowRoot.append(style);
    }

    const helpers = this.#helpers(scope);
    for (const source of component.scripts) this.#runScript(source, helpers);

    const bindingScope = new BindingScope(this.state);
    this.#view = component.template.instantiate(bindingScope, scope, this);
    this.shadowRoot.append(this.#view.fragment);
    this.#mounted = true;
  }

  #helpers(scope) {
    return {
      computed: callback => new ComputedRef(callback, scope),
      effect: callback => new ReactiveEffect(callback, scope, 'effect'),
      onCleanup: callback => scope.cleanup(callback),
      batch: callback => Scheduler.batch(callback),
      signal: value => new SignalRef(value),
      untrack,
      host: this,
      abortSignal: scope.signal,
    };
  }

  #runScript(source, helpers) {
    try {
      let script = scriptCache.get(source);
      if (!script) {
        script = new AsyncFunction(...Object.keys(helpers), source);
        scriptCache.set(source, script);
      }
      script.call(this.state, ...Object.values(helpers))?.catch(error => this.#reportError(error));
    } catch (error) {
      this.#reportError(error);
    }
  }

  #reportError(error) {
    this.dispatchEvent(new ErrorEvent('error', { error, message: error?.message || String(error), bubbles: true, composed: true }));
    console.error(error);
  }

  dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    this.#scope?.dispose();
    this.#scope = null;
    this.#view = null;
    this.#mounted = false;
    this.shadowRoot.replaceChildren();
  };

  open = tag => {
    if (!defineElement(tag)) return false;
    this.#scope?.dispose();
    this.#scope = new Scope();
    this.shadowRoot.replaceChildren(document.createElement(tag));
    return true;
  };

  replace = tag => {
    if (!defineElement(tag)) return false;
    const node = document.createElement(tag);
    this.replaceWith(node);
    this.dispose();
    return true;
  };
}

export const Runtime = {
  Scope,
  Scheduler,
  Signal: SignalRef,
  Computed: ComputedRef,
  Effect: ReactiveEffect,
  ReactiveState,
  BindingScope,
  batch: callback => Scheduler.batch(callback),
  flush: () => Scheduler.flush(),
  stats: Scheduler.stats,
  raw: value => value?.[RAW] || value,
};
