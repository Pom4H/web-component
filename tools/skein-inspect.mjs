#!/usr/bin/env node
import { buildProjectModel, formatComponent, manifest } from './skein/model.mjs'

const args = process.argv.slice(2)
const flags = new Set(args.filter(arg => arg.startsWith('--')))
const positional = args.filter(arg => !arg.startsWith('--'))
const entry = positional[0] || 'index.html'
const tag = positional[1] || null

const model = await buildProjectModel(entry)
if (flags.has('--manifest')) {
  console.log(JSON.stringify(manifest(model), null, 2))
} else if (tag) {
  const component = model.byTag.get(tag)
  if (!component) {
    console.error(`Unknown Skein component: ${tag}`)
    const candidates = model.components.map(component => component.tag).filter(name => name.includes(tag.split('-').at(-1) || tag)).slice(0, 5)
    if (candidates.length) console.error(`Known matches: ${candidates.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log(formatComponent(component))
  }
} else {
  console.log(`Skein model: ${model.components.length} components from ${model.entry}`)
  for (const component of model.components) console.log(`  ${component.tag} -> ${component.path}`)
  if (model.unresolved.length) console.log(`Unresolved custom elements: ${model.unresolved.join(', ')}`)
}
