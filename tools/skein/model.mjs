import { access, readFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

const exists = async path => access(path).then(() => true, () => false)
const maskRegions = source => source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, block => block.replace(/[^\n]/g, ' '))
const componentTags = source => [...new Set([...maskRegions(source).matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]+)\b/gi)].map(hit => hit[1].toLowerCase()))]
const tagPath = tag => tag.replaceAll('-', sep) + '.html'

function splitTopLevel(source) {
  const statements = []
  let start = 0, paren = 0, brace = 0, bracket = 0
  let quote = '', escaped = false, lineComment = false, blockComment = false
  const push = end => {
    const text = source.slice(start, end).trim()
    if (text) statements.push(text)
    start = end
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1]
    if (lineComment) {
      if (c === '\n') { lineComment = false; if (!paren && !brace && !bracket) push(i + 1) }
      continue
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++ }
      continue
    }
    if (quote) {
      if (escaped) { escaped = false; continue }
      if (c === '\\') { escaped = true; continue }
      if (c === quote) quote = ''
      continue
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue }
    if (c === '/' && n === '*') { blockComment = true; i++; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(') paren++
    else if (c === ')') paren--
    else if (c === '{') brace++
    else if (c === '}') brace--
    else if (c === '[') bracket++
    else if (c === ']') bracket--
    if (!paren && !brace && !bracket && (c === ';' || c === '\n')) push(i + 1)
  }
  push(source.length)
  return statements
}

function balancedType(source, marker) {
  const at = source.indexOf(marker)
  if (at < 0) return null
  const open = source.indexOf('{', at + marker.length)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (!depth) return source.slice(open + 1, i).replace(/\n\s*\*\s?/g, '\n').trim()
    }
  }
  return null
}

const jsdocType = source => balancedType(source, '@type')
const stripLeadingTypedefs = statement => {
  let value = statement
  while (true) {
    const hit = value.match(/^\s*\/\*\*[\s\S]*?\*\/\s*/)
    if (!hit || !hit[0].includes('@typedef')) return value.trim()
    value = value.slice(hit[0].length)
  }
}

function extractInputs(source) {
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] || ''
  const inputs = []
  for (const statementRaw of splitTopLevel(script)) {
    const statement = stripLeadingTypedefs(statementRaw).replace(/;\s*$/, '')
    if (!statement) continue
    const hit = statement.match(/^input\(\s*(['"])([^'"]+)\1\s*(?:,\s*([\s\S]*))?\)$/)
    if (!hit) continue
    const fallback = hit[3] == null ? 'undefined' : hit[3].trim()
    const type = jsdocType(fallback)
    inputs.push({ name: hit[2], type, typed: Boolean(type) })
  }
  return inputs
}

function findBalancedCall(source, openParen) {
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false
  for (let i = openParen; i < source.length; i++) {
    const c = source[i], n = source[i + 1]
    if (lineComment) { if (c === '\n') lineComment = false; continue }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++ }; continue }
    if (quote) {
      if (escaped) { escaped = false; continue }
      if (c === '\\') { escaped = true; continue }
      if (c === quote) quote = ''
      continue
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue }
    if (c === '/' && n === '*') { blockComment = true; i++; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (!depth) return i + 1
    }
  }
  return source.length
}

function extractEvents(source) {
  const script = source.match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)?.[1] || ''
  const events = []
  const rx = /new\s+CustomEvent\s*\(\s*(['"])([^'"]+)\1/g
  for (const hit of script.matchAll(rx)) {
    const openParen = script.indexOf('(', hit.index)
    const end = findBalancedCall(script, openParen)
    const call = script.slice(hit.index, end)
    const detailObject = call.match(/detail\s*:\s*\{([\s\S]*?)\}\s*(?:,|\})/)
    const detailKeys = detailObject ? [...detailObject[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map(item => item[1]) : []
    events.push({
      name: hit[2],
      bubbles: /\bbubbles\s*:\s*true\b/.test(call),
      composed: /\bcomposed\s*:\s*true\b/.test(call),
      detailKeys
    })
  }
  return uniqueBy(events, event => event.name)
}

function parseAttrs(token) {
  const attrs = new Map()
  const open = token.match(/^<\s*([A-Za-z][^\s/>]*)/)
  if (!open) return attrs
  const attrText = token.slice(open[0].length, token.length - (token.endsWith('/>') ? 2 : 1))
  const rx = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  for (const hit of attrText.matchAll(rx)) attrs.set(hit[1], hit[2] ?? hit[3] ?? hit[4] ?? null)
  return attrs
}

function extractSlots(source) {
  const slots = []
  for (const hit of maskRegions(source).matchAll(/<slot\b[^>]*>/gi)) slots.push(parseAttrs(hit[0]).get('name') || 'default')
  return [...new Set(slots)]
}

function extractParts(source) {
  const parts = []
  for (const hit of maskRegions(source).matchAll(/<[A-Za-z][^>]*>/g)) {
    const value = parseAttrs(hit[0]).get('part')
    if (value) parts.push(...value.split(/\s+/).filter(Boolean))
  }
  return [...new Set(parts)]
}

function extractCssProperties(source) {
  const properties = []
  for (const style of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    for (const hit of style[1].matchAll(/@property\s+(--[A-Za-z0-9_-]+)\s*\{([\s\S]*?)\}/g)) {
      const body = hit[2]
      const field = name => body.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1].trim().replace(/^['"]|['"]$/g, '') || null
      properties.push({ name: hit[1], syntax: field('syntax'), inherits: field('inherits'), initialValue: field('initial-value') })
    }
  }
  return uniqueBy(properties, property => property.name)
}

function uniqueBy(values, key) {
  const seen = new Set()
  return values.filter(value => {
    const id = key(value)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function analyzeComponent(tag, path, source, root) {
  return {
    tag,
    path: relative(root, path),
    inputs: extractInputs(source),
    emits: extractEvents(source),
    slots: extractSlots(source),
    parts: extractParts(source),
    cssProperties: extractCssProperties(source),
    children: componentTags(source),
    usedBy: [],
    publicEvents: []
  }
}

function computeGraph(components) {
  const byTag = new Map(components.map(component => [component.tag, component]))
  for (const component of components) {
    component.children = component.children.filter(tag => byTag.has(tag))
    for (const child of component.children) byTag.get(child).usedBy.push(component.tag)
    component.usedBy.sort()
  }
  for (const component of components) component.publicEvents = component.emits.map(event => ({ ...event, source: component.tag, forwarded: false }))
  let changed = true
  while (changed) {
    changed = false
    for (const component of components) {
      const known = new Set(component.publicEvents.map(event => event.name))
      for (const childTag of component.children) {
        const child = byTag.get(childTag)
        for (const event of child.publicEvents) {
          if (!event.bubbles || !event.composed || known.has(event.name)) continue
          component.publicEvents.push({ ...event, forwarded: true })
          known.add(event.name)
          changed = true
        }
      }
    }
  }
  for (const component of components) component.publicEvents.sort((a, b) => a.name.localeCompare(b.name))
  return byTag
}

export async function buildProjectModel(entryPath, options = {}) {
  const root = resolve(options.root || process.cwd())
  const entry = resolve(root, entryPath)
  if (!(await exists(entry))) throw new Error(`Entry not found: ${relative(root, entry)}`)
  const entrySource = await readFile(entry, 'utf8')
  const baseHit = entrySource.match(/<base\b[^>]*href\s*=\s*["']([^"']+)["']/i)
  const componentRoot = resolve(dirname(entry), baseHit?.[1] || '.')
  const components = []
  const unresolved = new Set()
  const queue = componentTags(entrySource)
  const seen = new Set()

  while (queue.length) {
    const tag = queue.shift()
    if (seen.has(tag)) continue
    seen.add(tag)
    const path = resolve(componentRoot, tagPath(tag))
    if (!(await exists(path))) { unresolved.add(tag); continue }
    const source = await readFile(path, 'utf8')
    const component = analyzeComponent(tag, path, source, root)
    components.push(component)
    for (const child of componentTags(source)) if (!seen.has(child)) queue.push(child)
  }

  components.sort((a, b) => a.tag.localeCompare(b.tag))
  const byTag = computeGraph(components)
  return {
    entry: relative(root, entry),
    componentRoot: relative(root, componentRoot) || '.',
    components,
    byTag,
    unresolved: [...unresolved].sort()
  }
}

export function manifest(model) {
  return {
    entry: model.entry,
    componentRoot: model.componentRoot,
    unresolved: model.unresolved,
    components: Object.fromEntries(model.components.map(component => [component.tag, {
      path: component.path,
      inputs: Object.fromEntries(component.inputs.map(input => [input.name, input.type || 'unknown'])),
      emits: Object.fromEntries(component.emits.map(event => [event.name, { detailKeys: event.detailKeys, bubbles: event.bubbles, composed: event.composed }])),
      publicEvents: Object.fromEntries(component.publicEvents.map(event => [event.name, { source: event.source, forwarded: event.forwarded, detailKeys: event.detailKeys, bubbles: event.bubbles, composed: event.composed }])),
      slots: component.slots,
      parts: component.parts,
      cssProperties: Object.fromEntries(component.cssProperties.map(property => [property.name, { syntax: property.syntax, inherits: property.inherits, initialValue: property.initialValue }])),
      children: component.children,
      usedBy: component.usedBy
    }]))
  }
}

export function formatComponent(component) {
  if (!component) return ''
  const lines = [component.tag, `  file: ${component.path}`]
  if (component.inputs.length) {
    lines.push('  inputs:')
    for (const input of component.inputs) lines.push(`    ${input.name}: ${input.type || 'unknown'}`)
  }
  if (component.emits.length) {
    lines.push('  emits:')
    for (const event of component.emits) lines.push(`    ${event.name}${event.detailKeys.length ? ` { ${event.detailKeys.join(', ')} }` : ''}${event.bubbles && event.composed ? ' [bubbles+composed]' : ''}`)
  }
  const forwarded = component.publicEvents.filter(event => event.forwarded)
  if (forwarded.length) {
    lines.push('  bubbled events:')
    for (const event of forwarded) lines.push(`    ${event.name} ← ${event.source}`)
  }
  if (component.slots.length) lines.push(`  slots: ${component.slots.join(', ')}`)
  if (component.parts.length) lines.push(`  parts: ${component.parts.join(', ')}`)
  if (component.cssProperties.length) {
    lines.push('  css properties:')
    for (const property of component.cssProperties) lines.push(`    ${property.name}: ${property.syntax || 'unknown'}${property.initialValue ? ` = ${property.initialValue}` : ''}`)
  }
  if (component.children.length) lines.push(`  children: ${component.children.join(', ')}`)
  if (component.usedBy.length) lines.push(`  used by: ${component.usedBy.join(', ')}`)
  return lines.join('\n')
}
