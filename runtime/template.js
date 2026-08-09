import { BindingScope, ReactiveEffect, Ref, compilePath, unwrap } from './reactive.js';

const DYNAMIC = /{([^{}]*)}/g;
const INITIAL = Symbol();
const TEXT = 0, ATTR = 1, BOOL = 2, PROP = 3, EVENT = 4, LIST = 5, BRANCH = 6, CSS_VAR = 7;
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

const render = (tokens, scope) => {
  let value = '';
  for (const token of tokens) value += typeof token === 'string' ? token : toText(scope.lookup(token));
  return value;
};

const byPath = (root, path) => {
  let node = root;
  for (const index of path) node = node.childNodes[index];
  return node;
};

const watch = (scope, callback) => new ReactiveEffect(callback, scope, true);

const bindText = (node, tokens, bindingScope, owner) => {
  let previous = node.data;
  watch(owner, () => {
    const value = render(tokens, bindingScope);
    if (value === previous) return;
    previous = node.data = value;
  });
};

const bindAttribute = (node, name, tokens, bindingScope, owner) => {
  const path = tokens.length === 1 && Array.isArray(tokens[0]) ? tokens[0] : null;
  let previous = INITIAL;
  watch(owner, () => {
    const raw = path ? bindingScope.lookup(path) : null;
    const value = path && (raw == null || raw === false) ? null : path ? toText(raw) : render(tokens, bindingScope);
    if (Object.is(value, previous)) return;
    previous = value;
    if (value == null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  });
};

const bindBoolean = (node, name, path, bindingScope, owner) => {
  let previous = INITIAL;
  watch(owner, () => {
    const value = Boolean(bindingScope.lookup(path));
    if (value === previous) return;
    previous = value;
    node.toggleAttribute(name, value);
  });
};

const bindProperty = (node, name, path, bindingScope, owner) => {
  let previous = INITIAL;
  watch(owner, () => {
    const value = bindingScope.lookup(path);
    if (Object.is(value, previous)) return;
    previous = value;
    node[name] = value;
  });
};

const bindCustomProperty = (node, name, path, bindingScope, owner) => {
  let previous = INITIAL;
  watch(owner, () => {
    const raw = bindingScope.lookup(path);
    const value = raw == null || raw === false ? null : raw;
    if (Object.is(value, previous)) return;
    previous = value;
    if (value == null) node.style.removeProperty(name);
    else node.style.setProperty(name, value);
  });
};

const bindEvent = (node, name, path, bindingScope, owner) => {
  const listener = event => {
    const handler = bindingScope.lookup(path);
    if (typeof handler === 'function') return handler.call(node, event);
  };
  node.addEventListener(name, listener);
  owner.cleanup(() => node.removeEventListener(name, listener));
};

const moveNodesBefore = (nodes, parent, anchor) => {
  if (!nodes.length || nodes[nodes.length - 1].nextSibling === anchor) return;
  for (const node of nodes) {
    if (node.parentNode === parent && parent.moveBefore) parent.moveBefore(node, anchor);
    else parent.insertBefore(node, anchor);
  }
};

const keyFromItem = (item, path) => {
  let value = item;
  for (const key of path) {
    if (value == null || !Object.hasOwn(value, key)) return undefined;
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
    this.bindingScope = bindingScope;
    this.scope = owner.child();
    watch(this.scope, () => this.update());
  }

  update() {
    const collection = this.bindingScope.lookup(this.expression);
    const items = collection == null ? [] : Array.isArray(collection) ? collection : [...collection];
    const next = new Map();
    const order = [];
    const keys = [];
    let occurrences;

    for (const item of items) {
      let key;
      if (this.keyPath) {
        key = keyFromItem(item, this.keyPath);
        if (key == null) throw new Error('Skein list key resolved to ' + key);
      } else if (item !== null && typeof item === 'object') {
        key = item;
      } else {
        occurrences ||= new Map();
        const occurrence = occurrences.get(item) || 0;
        occurrences.set(item, occurrence + 1);
        key = typeof item + ':' + String(item) + ':' + occurrence;
      }
      if (next.has(key)) throw new Error('Duplicate Skein list key: ' + String(key));
      next.set(key, null);
      keys.push(key);
    }
    next.clear();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const key = keys[index];
      let record = this.records.get(key);
      if (record) {
        record.bindingScope.setContext(item);
        record.index.set(index);
      } else {
        const scope = this.scope.child();
        const indexRef = new Ref(index);
        const locals = { index: indexRef, $index: indexRef };
        const itemScope = new BindingScope(item, this.bindingScope, locals, true);
        locals.$value = itemScope.contextValue;
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
    this.bindingScope = bindingScope;
    this.scope = owner.child();
    watch(this.scope, () => this.update());
  }

  update() {
    const visible = Boolean(this.bindingScope.lookup(this.expression));
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
  constructor(fragment, nodes, scope) {
    this.fragment = fragment;
    this.nodes = nodes;
    this.scope = scope;
  }

  dispose(remove = true) {
    this.scope.dispose();
    if (remove) for (const node of this.nodes) node.remove();
  }
}

export class CompiledTemplate {
  constructor(fragment, loadElement, disposeElement) {
    this.fragment = fragment;
    this.loadElement = loadElement;
    this.disposeElement = disposeElement;
    this.instructions = [];
    this.customPaths = [];
    this.compileChildren(fragment, []);
  }

  static fromNode(node, loadElement, disposeElement) {
    const fragment = document.createDocumentFragment();
    fragment.append(node);
    return new CompiledTemplate(fragment, loadElement, disposeElement);
  }

  compileChildren(parent, parentPath) {
    let index = 0;
    while (index < parent.childNodes.length) {
      const node = parent.childNodes[index];
      const path = [...parentPath, index];

      if (node.nodeType === Node.TEXT_NODE) {
        const tokenList = parseTokens(node.data);
        if (tokenList.some(Array.isArray)) this.instructions.push([TEXT, path, tokenList]);
        index++;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        index++;
        continue;
      }

      const eachValue = node.getAttribute('each');
      const eachPath = exact(eachValue);
      if (eachValue !== null && !eachPath) throw new Error('Skein each must be a single path binding: each={items}');
      if (eachPath) {
        const keyValue = node.getAttribute('key');
        const keyPath = keyValue === null ? null : exact(keyValue);
        if (keyValue !== null && !keyPath) throw new Error('Skein key must be a single path binding: key={id}');
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('each');
        templateNode.removeAttribute('key');
        const template = CompiledTemplate.fromNode(templateNode, this.loadElement, this.disposeElement);
        const end = document.createComment('each');
        parent.replaceChild(end, node);
        this.instructions.push([LIST, path, eachPath, keyPath, template]);
        index++;
        continue;
      }

      const ifValue = node.getAttribute('if');
      const ifPath = exact(ifValue);
      if (ifValue !== null && !ifPath) throw new Error('Skein if must be a single path binding: if={visible}');
      if (ifPath) {
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('if');
        const template = CompiledTemplate.fromNode(templateNode, this.loadElement, this.disposeElement);
        const end = document.createComment('if');
        parent.replaceChild(end, node);
        this.instructions.push([BRANCH, path, ifPath, template]);
        index++;
        continue;
      }

      if (exact(node.getAttribute('in'))) throw new Error('Skein in={...} was removed; use full property paths');

      if (node.localName === 'style') {
        index++;
        continue;
      }

      if (node.localName.includes('-')) {
        this.customPaths.push(path);
      }

      for (const name of node.getAttributeNames()) {
        const tokenList = parseTokens(node.getAttribute(name));
        const dynamic = tokenList.some(Array.isArray);
        const pathExpression = tokenList.length === 1 && Array.isArray(tokenList[0]) ? tokenList[0] : null;
        if (name.startsWith('--')) {
          if (!pathExpression) throw new Error('Skein --name must be a single path binding');
          node.removeAttribute(name);
          this.instructions.push([CSS_VAR, path, name, pathExpression]);
        } else if (name[0] === '.' || name[0] === '?' || name[0] === '@') {
          if (!pathExpression) throw new Error('Skein ' + name + ' must be a single path binding');
          node.removeAttribute(name);
          const type = name[0] === '.' ? PROP : name[0] === '?' ? BOOL : EVENT;
          this.instructions.push([type, path, name.slice(1), pathExpression]);
        } else if (dynamic) {
          this.instructions.push([ATTR, path, name, tokenList]);
        }
      }

      this.compileChildren(node, path);
      index++;
    }
  }

  instantiate(bindingScope, owner) {
    const fragment = this.fragment.cloneNode(true);
    const nodes = [...fragment.childNodes];

    if (this.customPaths.length) {
      const elements = this.customPaths.map(path => byPath(fragment, path));
      for (const element of elements) this.loadElement(element.localName);
      owner.cleanup(() => {
        for (const element of elements) this.disposeElement(element);
      });
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
      if (type === TEXT) bindText(node, instruction[2], bindingScope, owner);
      else if (type === ATTR) bindAttribute(node, instruction[2], instruction[3], bindingScope, owner);
      else if (type === BOOL) bindBoolean(node, instruction[2], instruction[3], bindingScope, owner);
      else if (type === PROP) bindProperty(node, instruction[2], instruction[3], bindingScope, owner);
      else if (type === CSS_VAR) bindCustomProperty(node, instruction[2], instruction[3], bindingScope, owner);
      else bindEvent(node, instruction[2], instruction[3], bindingScope, owner);
    }

    return new View(fragment, nodes, owner);
  }
}
