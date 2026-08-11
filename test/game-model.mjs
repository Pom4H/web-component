import assert from 'node:assert/strict'
import { buildProjectModel, manifest } from '../tools/skein/model.mjs'

const model = await buildProjectModel('examples/visualizer/index.html')
assert.equal(model.components.length, 5)
assert.deepEqual(model.unresolved, [])

const scene = model.byTag.get('visualizer-scene')
assert.ok(scene)
assert.deepEqual(scene.inputs.map(input => [input.name, input.type]), [
  ['world', 'World'],
  ['running', 'boolean'],
  ['timeScale', 'number'],
  ['fieldScale', 'number'],
  ['resetToken', 'number']
])

const emitted = new Map(scene.emits.map(event => [event.name, event]))
for (const name of ['world-impact', 'core-collect', 'world-telemetry']) assert.ok(emitted.has(name))
assert.equal(emitted.get('world-telemetry').bubbles, true)
assert.equal(emitted.get('world-telemetry').composed, true)
assert.deepEqual(scene.parts, ['world', 'canvas', 'math', 'hud'])
assert.deepEqual(scene.cssProperties.map(property => [property.name, property.syntax]), [
  ['--thrust', '<number>'],
  ['--danger', '<number>']
])

const controls = model.byTag.get('visualizer-controls')
assert.ok(controls)
assert.deepEqual(controls.inputs.map(input => [input.name, input.type]), [
  ['running', 'boolean'],
  ['timeScale', 'number'],
  ['fieldScale', 'number']
])
for (const name of ['run-change','time-scale-change','field-scale-change','world-reset']) {
  assert.ok(controls.emits.some(event => event.name === name))
}

const inspector = model.byTag.get('visualizer-inspector')
assert.ok(inspector)
assert.deepEqual(inspector.inputs.map(input => [input.name, input.type]), [
  ['telemetry', 'Telemetry'],
  ['world', 'World']
])

const shell = model.byTag.get('visualizer-shell')
assert.ok(shell)
assert.deepEqual(shell.slots, ['scene', 'mast', 'controls', 'inspector'])

const app = model.byTag.get('visualizer-app')
assert.ok(app)
assert.ok(app.publicEvents.some(event => event.name === 'world-telemetry' && event.source === 'visualizer-scene'))

const data = manifest(model)
assert.equal(data.components['visualizer-scene'].inputs.world, 'World')
assert.equal(data.components['visualizer-inspector'].inputs.world, 'World')
assert.equal(data.components['visualizer-scene'].cssProperties['--danger'].syntax, '<number>')

console.log('curvature-arena model: typed Entity+Components+Systems world, system events, parts, CSS physics channels and component graph verified.')
