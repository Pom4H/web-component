import { BindingScope, ReactiveEffect, Scheduler, SignalRef, isObject, toText } from './reactive.js';

const DYNAMIC = /{([^{}]*)}/g;
const isCustomTag = name => name?.includes('-');

const parseTokens = value => {
  const tokens = [];
  let lastIndex = 0;
  DYNAMIC.lastIndex = 0;
  for (const match of value.matchAll(DYNAMIC)) {
    if (match.index > lastIndex) tokens.push({ type: 'text', value: value.slice(lastIndex, match.index) });
    tokens.push({ type: 'expression', value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) tokens.push({ type: 'text', value: value.slice(lastIndex) });
  return tokens;
};

const exactExpression = value => {
  if (typeof value !== 'string') return null;
  const tokens = parseTokens(value);
  return tokens.length === 1 && tokens[0].type === 'expression' ? tokens[0].value : null;
};

const renderTokens = (tokens, scope, contextChain) => tokens.map(token =>
  token.type === 'text' ? token.value : toText(scope.resolve(token.value, contextChain))
).join('');

const getNodeByPath = (root, path) => {
  let node = root;
  for (const index of path) node = node.childNodes[index];
  return node;
};

class TextPart {
  constructor(node, instruction, bindingScope, ownerScope) {
    Object.assign(this, { node, bindingScope, ...instruction });
    this.value = node.data;
    new ReactiveEffect(() => this.update(), ownerScope, 'render');
  }
  update() {
    const value = renderTokens(this.tokens, this.bindingScope, this.contextChain);
    if (value === this.value) return;
    this.value = value;
    this.node.data = value;
    Scheduler.commit();
  }
}

class AttributePart {
  constructor(node, instruction, bindingScope, ownerScope) {
    Object.assign(this, { node, bindingScope, ...instruction });
    this.value = Symbol('initial');
    new ReactiveEffect(() => this.update(), ownerScope, 'render');
  }
  update() {
    const raw = this.exact != null ? this.bindingScope.resolve(this.exact, this.contextChain) : null;
    const remove = this.exact != null && (raw == null || raw === false);
    const value = remove ? null : (this.exact != null ? toText(raw) : renderTokens(this.tokens, this.bindingScope, this.contextChain));
    if (Object.is(value, this.value)) return;
    this.value = value;
    if (value == null) this.node.removeAttribute(this.name);
    else this.node.setAttribute(this.name, value);
    Scheduler.commit();
  }
}

class BooleanPart {
  constructor(node, instruction, bindingScope, ownerScope) {
    Object.assign(this, { node, bindingScope, ...instruction });
    this.value = Symbol('initial');
    new ReactiveEffect(() => this.update(), ownerScope, 'render');
  }
  update() {
    const value = Boolean(this.bindingScope.resolve(this.expression, this.contextChain));
    if (value === this.value) return;
    this.value = value;
    this.node.toggleAttribute(this.name, value);
    Scheduler.commit();
  }
}

class PropertyPart {
  constructor(node, instruction, bindingScope, ownerScope) {
    Object.assign(this, { node, bindingScope, ...instruction });
    this.value = Symbol('initial');
    new ReactiveEffect(() => this.update(), ownerScope, 'render');
  }
  update() {
    const value = this.bindingScope.resolve(this.expression, this.contextChain);
    if (Object.is(value, this.value)) return;
    this.value = value;
    this.node[this.name] = value;
    Scheduler.commit();
  }
}

class EventPart {
  constructor(node, instruction, bindingScope, ownerScope) {
    node.addEventListener(instruction.name, event => {
      const handler = bindingScope.resolve(instruction.expression, instruction.contextChain);
      if (typeof handler === 'function') return handler.call(node, event);
    }, { signal: ownerScope.signal });
  }
}

const moveNodesBefore = (nodes, parent, before) => {
  if (!nodes.length) return false;
  if (nodes[nodes.length - 1].nextSibling === before && nodes.every(node => node.parentNode === parent)) return false;
  for (const node of nodes) {
    if (node.parentNode === parent && typeof parent.moveBefore === 'function') parent.moveBefore(node, before);
    else parent.insertBefore(node, before);
  }
  return true;
};

const primitiveKey = (value, occurrence) => `${typeof value}:${String(value)}:${occurrence}`;

class ListPart {
  records = new Map();
  order = [];

  constructor(start, end, instruction, bindingScope, ownerScope, host) {
    Object.assign(this, { start, end, instruction, bindingScope, host });
    this.scope = ownerScope.child();
    new ReactiveEffect(() => this.update(), this.scope, 'render');
  }

  update() {
    const collection = this.bindingScope.resolve(this.instruction.expression, this.instruction.contextChain);
    const items = collection == null ? [] : Array.isArray(collection) ? Array.from(collection) : [...collection];
    const nextRecords = new Map();
    const nextOrder = [];
    const primitiveOccurrences = new Map();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let key;
      if (this.instruction.keyExpression != null) {
        key = new BindingScope(this.bindingScope.rootState, item, this.bindingScope).resolve(this.instruction.keyExpression);
      } else if (isObject(item)) {
        key = item;
      } else {
        const base = `${typeof item}:${String(item)}`;
        const occurrence = primitiveOccurrences.get(base) || 0;
        primitiveOccurrences.set(base, occurrence + 1);
        key = primitiveKey(item, occurrence);
      }

      let record = this.records.get(key);
      if (record) {
        record.bindingScope.setContext(item);
        record.index.value = index;
      } else {
        const scope = this.scope.child();
        const indexRef = new SignalRef(index);
        const locals = Object.assign(Object.create(null), { index: indexRef, $index: indexRef });
        const itemScope = new BindingScope(this.bindingScope.rootState, item, this.bindingScope, locals);
        const view = this.instruction.template.instantiate(itemScope, scope, this.host);
        record = { key, bindingScope: itemScope, index: indexRef, view };
        Scheduler.stats.listCreates++;
      }
      nextRecords.set(key, record);
      nextOrder.push(record);
    }

    for (const record of this.order) {
      if (nextRecords.has(record.key)) continue;
      record.view.dispose();
      Scheduler.stats.listRemoves++;
    }

    const parent = this.end.parentNode;
    let before = this.end;
    for (let index = nextOrder.length - 1; index >= 0; index--) {
      const record = nextOrder[index];
      if (moveNodesBefore(record.view.nodes, parent, before)) Scheduler.stats.listMoves++;
      before = record.view.nodes[0] || before;
    }

    this.records = nextRecords;
    this.order = nextOrder;
  }
}

class BranchPart {
  view = null;
  visible = false;

  constructor(start, end, instruction, bindingScope, ownerScope, host) {
    Object.assign(this, { start, end, instruction, bindingScope, host });
    this.scope = ownerScope.child();
    new ReactiveEffect(() => this.update(), this.scope, 'render');
  }

  update() {
    const visible = Boolean(this.bindingScope.resolve(this.instruction.expression, this.instruction.contextChain));
    if (visible === this.visible) return;
    this.visible = visible;
    if (visible) {
      const childScope = this.scope.child();
      this.view = this.instruction.template.instantiate(this.bindingScope, childScope, this.host);
      for (const node of this.view.nodes) this.end.before(node);
    } else if (this.view) {
      this.view.dispose();
      this.view = null;
    }
    Scheduler.commit();
  }
}

export class View {
  constructor(fragment, nodes, scope, customElements = []) {
    Object.assign(this, { fragment, nodes, scope, customElements });
  }
  dispose(remove = true) {
    this.scope.dispose();
    for (const element of this.customElements) element.dispose?.();
    if (remove) for (const node of this.nodes) node.remove();
  }
}

export class CompiledTemplate {
  constructor(fragment, defineElement) {
    this.fragment = fragment;
    this.defineElement = defineElement;
    this.instructions = [];
    this.#compileChildren(fragment, [], []);
  }

  static fromNode(node, defineElement) {
    const fragment = document.createDocumentFragment();
    fragment.append(node);
    return new CompiledTemplate(fragment, defineElement);
  }

  #compileChildren(parent, parentPath, contextChain) {
    let index = 0;
    while (index < parent.childNodes.length) {
      const node = parent.childNodes[index];
      const path = [...parentPath, index];

      if (node.nodeType === Node.TEXT_NODE) {
        const tokens = parseTokens(node.data);
        if (tokens.some(token => token.type === 'expression')) this.instructions.push({ type: 'text', path, tokens, contextChain });
        index++;
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        index++;
        continue;
      }

      if (isCustomTag(node.localName)) this.defineElement(node.localName);

      const forExpression = exactExpression(node.getAttribute('for'));
      if (forExpression != null) {
        const keyExpression = exactExpression(node.getAttribute('key'));
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('for');
        templateNode.removeAttribute('key');
        const template = CompiledTemplate.fromNode(templateNode, this.defineElement);
        const start = document.createComment(`for:${forExpression}`);
        const end = document.createComment(`/for:${forExpression}`);
        parent.replaceChild(start, node);
        parent.insertBefore(end, start.nextSibling);
        this.instructions.push({ type: 'list', startPath: path, endPath: [...parentPath, index + 1], expression: forExpression, keyExpression, template, contextChain });
        index += 2;
        continue;
      }

      const ifExpression = exactExpression(node.getAttribute('if'));
      if (ifExpression != null) {
        const templateNode = node.cloneNode(true);
        templateNode.removeAttribute('if');
        const template = CompiledTemplate.fromNode(templateNode, this.defineElement);
        const start = document.createComment(`if:${ifExpression}`);
        const end = document.createComment(`/if:${ifExpression}`);
        parent.replaceChild(start, node);
        parent.insertBefore(end, start.nextSibling);
        this.instructions.push({ type: 'branch', startPath: path, endPath: [...parentPath, index + 1], expression: ifExpression, template, contextChain });
        index += 2;
        continue;
      }

      let childContext = contextChain;
      const inExpression = exactExpression(node.getAttribute('in'));
      if (inExpression != null) {
        node.removeAttribute('in');
        childContext = [...contextChain, inExpression];
      }

      for (const name of node.getAttributeNames()) {
        const value = node.getAttribute(name);
        const tokens = parseTokens(value);
        if (!tokens.some(token => token.type === 'expression')) continue;
        const exact = tokens.length === 1 && tokens[0].type === 'expression' ? tokens[0].value : null;
        const base = { path, contextChain: childContext };
        if (name.startsWith('.') && exact != null) {
          node.removeAttribute(name);
          this.instructions.push({ ...base, type: 'property', name: name.slice(1), expression: exact });
        } else if (name.startsWith('?') && exact != null) {
          node.removeAttribute(name);
          this.instructions.push({ ...base, type: 'boolean', name: name.slice(1), expression: exact });
        } else if (name.startsWith('@') && exact != null) {
          node.removeAttribute(name);
          this.instructions.push({ ...base, type: 'event', name: name.slice(1), expression: exact });
        } else if (name.startsWith('on') && exact != null) {
          node.removeAttribute(name);
          this.instructions.push({ ...base, type: 'event', name: name.slice(2), expression: exact });
        } else {
          this.instructions.push({ ...base, type: 'attribute', name, tokens, exact });
        }
      }

      this.#compileChildren(node, path, childContext);
      index++;
    }
  }

  instantiate(bindingScope, ownerScope, host) {
    const fragment = this.fragment.cloneNode(true);
    const nodes = [...fragment.childNodes];
    const customElements = [];
    for (const element of fragment.querySelectorAll('*')) {
      element.$ = bindingScope.rootState;
      element.open = host.open;
      element.replace = host.replace;
      if (isCustomTag(element.localName) && typeof element.dispose === 'function') customElements.push(element);
    }

    const resolved = this.instructions.map(instruction => instruction.type === 'list' || instruction.type === 'branch'
      ? { instruction, start: getNodeByPath(fragment, instruction.startPath), end: getNodeByPath(fragment, instruction.endPath) }
      : { instruction, node: getNodeByPath(fragment, instruction.path) });

    for (const entry of resolved) {
      const instruction = entry.instruction;
      switch (instruction.type) {
        case 'text': new TextPart(entry.node, instruction, bindingScope, ownerScope); break;
        case 'attribute': new AttributePart(entry.node, instruction, bindingScope, ownerScope); break;
        case 'boolean': new BooleanPart(entry.node, instruction, bindingScope, ownerScope); break;
        case 'property': new PropertyPart(entry.node, instruction, bindingScope, ownerScope); break;
        case 'event': new EventPart(entry.node, instruction, bindingScope, ownerScope); break;
        case 'list': new ListPart(entry.start, entry.end, instruction, bindingScope, ownerScope, host); break;
        case 'branch': new BranchPart(entry.start, entry.end, instruction, bindingScope, ownerScope, host); break;
      }
    }

    return new View(fragment, nodes, ownerScope, customElements);
  }
}
