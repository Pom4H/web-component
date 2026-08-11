import assert from 'node:assert/strict'
import { buildProjectModel, manifest } from '../tools/skein/model.mjs'

const model = await buildProjectModel('examples/visualizer/index.html')
assert.equal(model.components.length, 6)
assert.deepEqual(model.unresolved, [])

const scene = model.byTag.get('visualizer-scene')
assert.ok(scene)
assert.deepEqual(scene.inputs.map(input => [input.name, input.type]), [
  ['world', 'World'],
  ['controls', 'GameControls'],
  ['running', 'boolean'],
  ['resetToken', 'number']
])
assert.ok(scene.emits.some(event => event.name === 'world-telemetry' && event.bubbles && event.composed))
assert.deepEqual(scene.parts, ['world', 'canvas', 'hud', 'inventory', 'math'])

const gamepad = model.byTag.get('visualizer-gamepad')
assert.ok(gamepad)
for (const name of ['game-input-change','game-action']) assert.ok(gamepad.emits.some(event => event.name === name))
assert.deepEqual(gamepad.parts, ['gamepad'])

const controls = model.byTag.get('visualizer-controls')
assert.ok(controls)
assert.deepEqual(controls.inputs.map(input => [input.name, input.type]), [['running','boolean']])
for (const name of ['run-change','world-reset']) assert.ok(controls.emits.some(event => event.name === name))

const inspector = model.byTag.get('visualizer-inspector')
assert.ok(inspector)
assert.deepEqual(inspector.inputs.map(input => [input.name, input.type]), [['telemetry','Telemetry'],['world','World']])

const shell = model.byTag.get('visualizer-shell')
assert.ok(shell)
assert.deepEqual(shell.slots, ['scene','mast','controls','inspector','gamepad'])

const app = model.byTag.get('visualizer-app')
assert.ok(app)
assert.ok(app.publicEvents.some(event => event.name === 'world-telemetry' && event.source === 'visualizer-scene'))
assert.ok(app.children.includes('visualizer-gamepad'))

const data = manifest(model)
assert.equal(data.components['visualizer-scene'].inputs.world, 'World')
assert.equal(data.components['visualizer-scene'].inputs.controls, 'GameControls')
assert.equal(data.components['visualizer-gamepad'].emits['game-action'].bubbles, true)

console.log('voxel-meadow model: typed voxel world, continuous property input, native command events, fixed systems, inventory and mobile gamepad graph verified.')
