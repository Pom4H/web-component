#!/usr/bin/env node
import { mkdtemp, readFile, rm, access, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const target = args.find(arg => !arg.startsWith('--')) || 'index.html';
const keep = args.includes('--keep-temp');
const tscArg = args.find(arg => arg.startsWith('--tsc='));
const explicitTsc = tscArg ? tscArg.slice('--tsc='.length) : null;

const root = process.cwd();
const entry = resolve(root, target);

const exists = async path => access(path).then(() => true, () => false);
const sourcePosition = (source, offset) => {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
};
const maskRegions = source => source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, block => block.replace(/[^\n]/g, ' '));
const componentTags = source => [...new Set([...maskRegions(source).matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)\b/gi)].map(hit => hit[1].toLowerCase()))];
const tagPath = tag => tag.replaceAll('-', sep) + '.html';

function splitTopLevel(source) {
  const statements = [];
  let start = 0, paren = 0, brace = 0, bracket = 0;
  let quote = '', escaped = false, lineComment = false, blockComment = false;
  const push = end => {
    const text = source.slice(start, end).trim();
    if (text) statements.push(text);
    start = end;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lineComment) {
      if (c === '\n') { lineComment = false; if (!paren && !brace && !bracket) push(i + 1); }
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '[') bracket++;
    else if (c === ']') bracket--;
    if (!paren && !brace && !bracket && (c === ';' || c === '\n')) push(i + 1);
  }
  push(source.length);
  return statements;
}

function extractState(source) {
  const scriptMatch = source.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i);
  const script = scriptMatch?.[1] || '';
  const members = new Map();
  const inputs = new Set();
  for (const statementRaw of splitTopLevel(script)) {
    const statement = statementRaw.trim().replace(/;\s*$/, '');
    let hit = statement.match(/^input\(\s*(['"])([^'"]+)\1\s*(?:,\s*([\s\S]*))?\)$/);
    if (hit) {
      const name = hit[2];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        const fallback = hit[3] == null ? 'undefined' : hit[3].trim();
        members.set(name, `input(${JSON.stringify(name)}, ${fallback})`);
        inputs.add(name);
      }
      continue;
    }
    hit = statement.match(/^this\.([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
    if (hit) members.set(hit[1], hit[2].trim());
  }
  return { members, inputs };
}

function parseAttrs(token, tokenOffset) {
  const attrs = [];
  const open = token.match(/^<\s*([A-Za-z][^\s/>]*)/);
  if (!open) return { tag: '', attrs, selfClosing: false };
  const tag = open[1].toLowerCase();
  const attrTextStart = open[0].length;
  const attrText = token.slice(attrTextStart, token.length - (token.endsWith('/>') ? 2 : 1));
  const rx = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const hit of attrText.matchAll(rx)) {
    const name = hit[1];
    const value = hit[2] ?? hit[3] ?? hit[4] ?? null;
    const localOffset = attrTextStart + hit.index + (value == null ? 0 : hit[0].indexOf(value));
    attrs.push({ name, value, offset: tokenOffset + localOffset });
  }
  return { tag, attrs, selfClosing: /\/\s*>$/.test(token) };
}

const exactPath = value => {
  const hit = typeof value === 'string' && value.match(/^\{([^{}]+)\}$/);
  return hit ? hit[1].trim() : null;
};
const segments = path => path.split('.').map(part => part.trim()).filter(Boolean);
const scopeExpr = (scope, path) => segments(path).reduce((expr, part) => `${expr}[${JSON.stringify(part)}]`, scope);

function analyzeTemplate(source) {
  const masked = maskRegions(source);
  const scopes = [{ id: 0, parent: null, item: false }];
  const stack = [];
  const checks = [];
  const tokens = masked.matchAll(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g);
  const currentScope = () => stack.length ? stack.at(-1).scopeId : 0;
  const addCheck = (scopeId, path, kind, name, tag, offset) => {
    if (!path) return;
    const pos = sourcePosition(source, offset);
    checks.push({ scopeId, path, kind, name, tag, offset, ...pos });
  };
  for (const hit of tokens) {
    const token = hit[0];
    const offset = hit.index;
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { if (stack.length) stack.pop(); continue; }
    if (token.startsWith('<')) {
      const parsed = parseAttrs(token, offset);
      if (!parsed.tag) continue;
      const attr = name => parsed.attrs.find(item => item.name === name);
      const parentScope = currentScope();
      let elementScope = parentScope;
      const each = attr('each');
      if (each?.value != null) {
        const path = exactPath(each.value);
        addCheck(parentScope, path, 'each', 'each', parsed.tag, each.offset);
        if (path) {
          elementScope = scopes.length;
          scopes.push({ id: elementScope, parent: parentScope, item: true, collection: path, tag: parsed.tag });
        }
      }
      for (const item of parsed.attrs) {
        if (item.value == null || item.name === 'each') continue;
        for (const pathHit of item.value.matchAll(/\{([^{}]+)\}/g)) {
          const path = pathHit[1].trim();
          const kind = item.name === 'key' ? 'key' : item.name.startsWith('.') ? 'property' : item.name.startsWith('@') ? 'event' : item.name.startsWith('?') ? 'boolean' : item.name.startsWith('--') ? 'css-var' : item.name === 'if' ? 'if' : 'attribute';
          addCheck(elementScope, path, kind, item.name.replace(/^[.@?]/, ''), parsed.tag, item.offset + pathHit.index + 1);
        }
      }
      const voidTag = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']).has(parsed.tag);
      if (!parsed.selfClosing && !voidTag) stack.push({ tag: parsed.tag, scopeId: elementScope });
      continue;
    }
    const scopeId = currentScope();
    for (const pathHit of token.matchAll(/\{([^{}]+)\}/g)) addCheck(scopeId, pathHit[1].trim(), 'text', 'text', stack.at(-1)?.tag || '', offset + pathHit.index + 1);
  }
  return { scopes, checks };
}

function stateSource(component) {
  const { members, inputs } = component.state;
  const lines = [
    '// @ts-nocheck',
    'declare function input(name: string, fallback: []): any[];',
    'declare function input(name: string, fallback: null): any;',
    'declare function input<T>(name: string, fallback: T): T;',
    'declare function input(name: string): any;',
    'declare function computed<T>(callback: () => T): T;',
    'declare function effect(callback: () => void): void;',
    'declare function onCleanup(callback: () => void): void;',
    'declare const host: HTMLElement;',
    'declare const abortSignal: AbortSignal;',
    'export class SkeinState {'
  ];
  for (const [name, rhs] of members) lines.push(`  ${name} = ${rhs}`);
  lines.push('}', 'export const state = new SkeinState();');
  if (inputs.size) lines.push(`export type Inputs = Pick<SkeinState, ${[...inputs].map(JSON.stringify).join(' | ')}>;`);
  else lines.push('export type Inputs = {};');
  return lines.join('\n') + '\n';
}

function checkSource(component, componentByTag) {
  const lines = [
    `import { state } from './${component.id}.state.js';`,
    'type SkeinItem<T> = T extends readonly (infer U)[] ? U : T extends Iterable<infer U> ? U : never;',
    'type SkeinScope<Local, Parent> = (Local extends object ? Local : {}) & Parent & { $value: Local; index: number; $index: number };',
    'const $scope0 = state;'
  ];
  const lineMap = new Map();
  const scopeNames = new Map([[0, '$scope0']]);
  for (const scope of component.template.scopes.slice(1)) {
    const parent = scopeNames.get(scope.parent);
    const collection = scopeExpr(parent, scope.collection);
    const item = `$item${scope.id}`;
    const name = `$scope${scope.id}`;
    lines.push(`type $Item${scope.id} = SkeinItem<typeof ${collection}>;`);
    lines.push(`declare const ${item}: $Item${scope.id};`);
    lines.push(`declare const ${name}: SkeinScope<$Item${scope.id}, typeof ${parent}>;`);
    scopeNames.set(scope.id, name);
  }
  let serial = 0;
  for (const check of component.template.checks) {
    const scope = scopeNames.get(check.scopeId) || '$scope0';
    const expr = scopeExpr(scope, check.path);
    const generatedLine = lines.length + 1;
    let code = `void (${expr});`;
    if (check.kind === 'event') code = `const $event${serial++}: (...args: any[]) => any = ${expr};`;
    else if (check.kind === 'property') {
      const child = componentByTag.get(check.tag);
      if (child) {
        const current = serial++;
        code = `const $input${current}: keyof import('./${child.id}.state.js').Inputs = ${JSON.stringify(check.name)}; void (${expr});`;
      } else if (!check.tag.includes('-')) {
        const current = serial++;
        code = `declare const $native${current}: HTMLElementTagNameMap[${JSON.stringify(check.tag)}]; const $prop${current}: typeof $native${current}[${JSON.stringify(check.name)}] = ${expr};`;
      }
    }
    lines.push(code);
    lineMap.set(generatedLine, check);
  }
  return { source: lines.join('\n') + '\n', lineMap };
}

async function crawlEntry(entryPath) {
  const entrySource = await readFile(entryPath, 'utf8');
  const baseHit = entrySource.match(/<base\b[^>]*href\s*=\s*["']([^"']+)["']/i);
  const componentRoot = resolve(dirname(entryPath), baseHit?.[1] || '.');
  const components = [];
  const byTag = new Map();
  const queue = componentTags(entrySource);
  const seen = new Set();
  while (queue.length) {
    const tag = queue.shift();
    if (seen.has(tag)) continue;
    seen.add(tag);
    const path = resolve(componentRoot, tagPath(tag));
    if (!(await exists(path))) continue;
    const source = await readFile(path, 'utf8');
    const component = { id: `c${components.length}`, tag, path, source, state: extractState(source), template: analyzeTemplate(source) };
    components.push(component);
    byTag.set(tag, component);
    for (const child of componentTags(source)) if (!seen.has(child)) queue.push(child);
  }
  return { components, byTag };
}

function findTsc() {
  if (explicitTsc) return explicitTsc;
  return resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
}

async function main() {
  if (!(await exists(entry))) throw new Error(`Entry not found: ${relative(root, entry)}`);
  const { components, byTag } = await crawlEntry(entry);
  if (!components.length) throw new Error(`No Skein components found from ${relative(root, entry)}`);
  const temp = await mkdtemp(join(tmpdir(), 'skein-check-'));
  const maps = new Map();
  try {
    for (const component of components) await writeFile(join(temp, `${component.id}.state.ts`), stateSource(component));
    for (const component of components) {
      const check = checkSource(component, byTag);
      maps.set(`${component.id}.check.ts`, { component, lineMap: check.lineMap });
      await writeFile(join(temp, `${component.id}.check.ts`), check.source);
    }
    const checkFiles = [...maps.keys()].map(name => join(temp, name));
    const tsc = findTsc();
    const result = spawnSync(tsc, ['--pretty','false','--noEmit','--strict','--target','es2022','--module','esnext','--moduleResolution','bundler','--lib','es2022,dom', ...checkFiles], { encoding: 'utf8' });
    if (result.error) throw new Error(`Cannot run TypeScript compiler at ${tsc}: ${result.error.message}`);
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const diagnostics = [];
    for (const line of output.split('\n')) {
      const hit = line.match(/([^/\\]+\.check\.ts)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
      if (!hit) continue;
      const mapped = maps.get(hit[1]);
      const check = mapped?.lineMap.get(Number(hit[2]));
      if (!mapped || !check) continue;
      diagnostics.push({ component: mapped.component, check, code: hit[4], message: hit[5] });
    }
    if (diagnostics.length) {
      for (const diagnostic of diagnostics) {
        const file = relative(root, diagnostic.component.path);
        console.error(`${file}:${diagnostic.check.line}:${diagnostic.check.column} error SKEIN${diagnostic.code}: ${diagnostic.message}`);
        console.error(`  ${diagnostic.check.kind}={${diagnostic.check.path}}`);
      }
      console.error(`\n${diagnostics.length} Skein type error${diagnostics.length === 1 ? '' : 's'} in ${components.length} components.`);
      process.exitCode = 1;
    } else if (result.status !== 0) {
      console.error(output || `TypeScript exited with status ${result.status}`);
      process.exitCode = result.status || 1;
    } else {
      console.log(`Skein check: ${components.length} components, ${components.reduce((n, c) => n + c.template.checks.length, 0)} bindings, 0 errors.`);
    }
    if (keep) console.log(`Generated TypeScript: ${temp}`);
  } finally {
    if (!keep) await rm(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
