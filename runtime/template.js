import { BindingScope, ReactiveEffect, Ref, compilePath, unwrap } from './reactive.js';

const DYNAMIC = /{([^{}]*)}/g;
const INITIAL = Symbol();
const TEXT = 0, ATTR = 1, BOOL = 2, PROP = 3, EVENT = 4, LIST = 5, BRANCH = 6;
const toText = value => value == null ? '' : String(value);

const parseTokens = value => {
  const result = [];
  let last = 0;
  DYNAMIC.lastIndex = 0;
  for (const hit of value.matchAll(DYNAMIC)) {
    if (hit['index'] > last) result.push(value.slice(last, hit['index']));
    result.push(compilePath(hit[1]));
    last = hit['index'] + hit[0].length;
  }
  if (last < value.length) result.push(value.slice(last));
  return result;
};

const exact = value => {
  if (typeof value !== 'string') return null;
  const parts = parseTokens(value);
  return parts.length === 1 && Array.isArray(parts[0]) ? parts[0] : null;
};

const render = (tokens, scope, contexts) => {
  let value = '';
  for (const token of tokens) value += typeof token === 'string' ? token : toText(scope.lookup(token, contexts));
  return value;
};

const byPath = (root, path) => {
  let node = root;
  for (const index of path) node = node.childNodes[index];
  return node;
};

const watch = (scope, callback) => new ReactiveEffect(callback, scope, true);

const bindText = (node, tokens, contexts, bindingScope, owner) => {
  let previous = node.data;
  watch(owner, () => {
    const value = render(tokens, bindingScope, contexts);
    if (value === previous) return;
    previous = node.data = value;
  });
};

const bindAttribute = (node, name, tokens, contexts, bindingScope, owner) => {
  const exactPath = tokens.length === 1 && Array.isArray(tokens[0]) ? tokens[0] : null;
  let previous = INITIAL;
  watch(owner, () => {
    const raw = exactPath ? bindingScope.lookup(exactPath, contexts) : null;
    const value = exactPath && (raw == null || raw === false) ? null : exactPath ? toText(raw) : render(tokens, bindingScope, contexts);
    if (Object.is(value, previous)) return;
    previous = value;
    if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  });
};

const bindBoolean = (node, name, path, contexts, bindingScope, owner) => {
  let previous = INITIAL;
  watch(owner, () => {
    const value = Boolean(bindingScope.lookup(path, contexts));
    if (value === previous) return;
    previous = value;
    node.toggleAttribute(name, value);
  });
};

const bindProperty = (node, name, path, contexts, bindingScope, owner) => {
  let previous = INITIAL;
  watch(owner, () => {
    const value = bindingScope.lookup(path, contexts);
    if (Object.is(value, previous)) return;
    previous = value;
    node[name] = value;
  });
};

const bindEvent = (node, name, path, contexts, bindingScope, owner) => {
  const listener = event => {
    const handler = bindingScope.lookup(path, contexts);
    if (typeof handler === 'function') return handler.call(node, event);
  };
  node.addEventListener(name, listener);
  owner.cleanup(() => node.removeEventListener(name, listener));
};

const moveNodesBefore = (nodes, parent, anchor) => {
  if (!nodes.length || nodes[nodes.length - 1].nextSibling === anchor) return false;
  for (const node of nodes) {
    if (node.parentNode === parent && parent.moveBefore) parent.moveBefore(node, anchor);
    else parent.insertBefore(node, anchor);
  }
  return true;
};

const keyFromItem = (item, path) => {
  let value = item;
  for (const key of path) {
    if (value == null) return undefined;
    value = unwrap(value[key]);
  }
  return value;
};

class ListPart {
  records = new Map();
  order = [];

  constructor(end, instruction, bindingScope, owner) {
    this.end = end;
    this.expression = instruction[2];
    this.keyPath = instruction[3];
    this.template = instruction[4];
    this.contexts = instruction[5];
    this.bindingScope = bindingScope;
    this.scope = owner.child();
    this.scope.cleanup(() => {
      for (const record of this.order) record.view.dispose(false);
      this.records.clear();
      this.order.length = 0;
    });
    watch(this.scope, () => this.update());
  }

  update() {
    const collection = this.bindingScope.lookup(this.expression, this.contexts);
    const items = collection == null ? [] : Array.isArray(collection) ? collection : [...collection];
    const next = new Map();
    const order = [];
    let occurrences;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let key;
      if (this.keyPath) {
        key = keyFromItem(item, this.keyPath);
      } else if (item !== null && typeof item === 'object') {
        key = item;
      } else {
        occurrences ||= new Map();
        const occurrence = occurrences.get(item) || 0;
        occurrences.set(item, occurrence + 1);
        key = typeof item + ':' + String(item) + ':' + occurrence;
      }

      let record = this.records.get(key);
      if (record) {
        record.bindingScope.setContext(item);
        record.index.set(index);
      } else {
        const scope = this.scope.child();
        const indexRef = new Ref(index);
        const locals = { index: indexRef, $index: indexRef };
        const itemScope = new BindingScope(this.bindingScope.rootState, item, this.bindingScope, locals, true);
        record = { key, bindingScope: itemScope, index: indexRef, view: this.template.instantiate(itemScope, scope) };
      }
      next.set(key, record);
      order.push(record);
    }

    for (const record of this.order) if (!next.has(record.key)) record.view.dispose();

    const parent = this.end.parentNode;
    let anchor = this.end;
    for (let index = order.length - 1; index >= 0; index--) {
      const nodes = order[index].view.nodes;
      moveNodesBefore(nodes, parent, anchor);
      anchor = nodes[0] || anchor;
    }

    this.records = next;
    this.order = order;
  }
}

class BranchPart {
  view = null;
  visible = false;

  constructor(end, instruction, bindingScope, owner) {
    this.end = end;
    this.expression = instruction[2];
    this.template = instruction[3];
    this.contexts = instruction[4];
    this.bindingScope = bindingScope;
    this.scope = owner.child();
    this.scope.cleanup(() => this.view?.dispose(false));
    watch(this.scope, () => this.update());
  }

  update() {
    const visible = Boolean(this.bindingScope.lookup(this.expression, this.contexts));
    if (visible === this.visible) return;
    this.visible = visible;
    if (visible) {
      const scope = this.scope.child();
      this.view = this.template.instantiate(this.bindingScope, scope);
      for (const node of this.view.nodes) this.end.before(node);
    } else if (this.view) {
      this.view.dispose();
      this.view = null;
    }
  }
}

export class View {
  constructor(fragment, nodes, scope, elements) {
    this.fragment = fragment;
    this.nodes = nodes;
    this.scope = scope;
    this.elements = elements;
  }

  dispose(remove = true) {
    this.scope.dispose();
    if (this.elements) for (const element of this.elements) element.dispose?.();
    if (remove) for (const node of this.nodes) node.remove();
  }
}

export class CompiledTemplate {
  constructor(fragment, defineElement) {
    this.fragment = fragment;
    this.defineElement = defineElement;
    this.instructions = [];
    this.customPaths = [];
    this.compileChildren(fragment, [], []);
  }

  static fromNode(node, defineElement) {
    const fragment = document.createDocumentFragment();
    fragment.append(node);
    return new CompiledTemplate(fragment, defineElement);
  }

  compileChildren(parent, parentPath, contexts) {
    let index = 0;
    while (index < parent.childNodes.length) {
      const node = parent.childNodes[index];
      const path = [...parentPath, index];

      if (node.nodeType === Node.TEXT_NODE) {
        const tokenList = parseTokens(node.data);
        if (tokenList.some(Array.isArray)) this.instructions.push([TEXT, path, tokenList, contexts]);
        index++;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        index++;
        continue;
      }

      const forPath = exact(node.getAttribute('for'));
      if (forPath) {
        const keyPath = exact(node.getAttribute('key'));
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('for');
        templateNode.removeAttribute('key');
        const template = CompiledTemplate.fromNode(templateNode, this.defineElement);
        const end = document.createComment('for');
        parent.replaceChild(end, node);
        this.instructions.push([LIST, path, forPath, keyPath, template, contexts]);
        index++;
        continue;
      }

      const ifPath = exact(node.getAttribute('if'));
      if (ifPath) {
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('if');
        const template = CompiledTemplate.fromNode(templateNode, this.defineElement);
        const end = document.createComment('if');
        parent.replaceChild(end, node);
        this.instructions.push([BRANCH, path, ifPath, template, contexts]);
        index++;
        continue;
      }

      if (node.localName === 'style') {
        index++;
        continue;
      }

      if (node.localName.includes('-')) {
        this.defineElement(node.localName);
        this.customPaths.push(path);
      }

      let childContexts = contexts;
      const inPath = exact(node.getAttribute('in'));
      if (inPath) {
        node.removeAttribute('in');
        childContexts = [...contexts, inPath];
      }

      for (const name of node.getAttributeNames()) {
        const tokenList = parseTokens(node.getAttribute(name));
        if (!tokenList.some(Array.isArray)) continue;
        const pathExpression = tokenList.length === 1 && Array.isArray(tokenList[0]) ? tokenList[0] : null;
        if (name[0] === '.' && pathExpression) {
          node.removeAttribute(name);
          this.instructions.push([PROP, path, name.slice(1), pathExpression, childContexts]);
        } else if (name[0] === '?' && pathExpression) {
          node.removeAttribute(name);
          this.instructions.push([BOOL, path, name.slice(1), pathExpression, childContexts]);
        } else if (name[0] === '@' && pathExpression) {
          node.removeAttribute(name);
          this.instructions.push([EVENT, path, name.slice(1), pathExpression, childContexts]);
        } else {
          this.instructions.push([ATTR, path, name, tokenList, childContexts]);
        }
      }

      this.compileChildren(node, path, childContexts);
      index++;
    }
  }

  instantiate(bindingScope, owner) {
    const fragment = this.fragment.cloneNode(true);
    const nodes = [...fragment.childNodes];
    let elements = null;
    if (this.customPaths.length) {
      elements = [];
      for (const path of this.customPaths) {
        const element = byPath(fragment, path);
        if (typeof element.dispose === 'function') elements.push(element);
      }
    }

    for (let index = this.instructions.length - 1; index >= 0; index--) {
      const instruction = this.instructions[index];
      const type = instruction[0];
      if (type === LIST || type === BRANCH) {
        const end = byPath(fragment, instruction[1]);
        if (type === LIST) new ListPart(end, instruction, bindingScope, owner);
        else new BranchPart(end, instruction, bindingScope, owner);
        continue;
      }

      const node = byPath(fragment, instruction[1]);
      if (type === TEXT) bindText(node, instruction[2], instruction[3], bindingScope, owner);
      else if (type === ATTR) bindAttribute(node, instruction[2], instruction[3], instruction[4], bindingScope, owner);
      else if (type === BOOL) bindBoolean(node, instruction[2], instruction[3], instruction[4], bindingScope, owner);
      else if (type === PROP) bindProperty(node, instruction[2], instruction[3], instruction[4], bindingScope, owner);
      else bindEvent(node, instruction[2], instruction[3], instruction[4], bindingScope, owner);
    }

    return new View(fragment, nodes, owner, elements);
  }
}
