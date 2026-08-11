import assert from 'node:assert/strict'
import { buildProjectModel, manifest } from '../tools/skein/model.mjs'

const model = await buildProjectModel('examples/visualizer/index.html')
assert.equal(model.components.length, 5)
assert.deepEqual(model.unresolved, [])

const scene = model.byTag.get('visualizer-scene')
assert.ok(scene)
assert.deepEqual(scene.inputs.map(input => input.name), ['game'])
assert.ok(scene.emits.some(event => event.name === 'game-state' && event.bubbles && event.composed))

const hud = model.byTag.get('visualizer-hud')
assert.ok(hud)
assert.deepEqual(hud.inputs.map(input => input.name), ['state'])
assert.ok(hud.emits.some(event => event.name === 'game-command' && event.bubbles && event.composed))

const dialogue = model.byTag.get('visualizer-dialogue')
assert.ok(dialogue)
assert.deepEqual(dialogue.inputs.map(input => input.name), ['dialogue'])
assert.ok(dialogue.emits.some(event => event.name === 'dialogue-choice' && event.bubbles && event.composed))

const shell = model.byTag.get('visualizer-shell')
assert.ok(shell)
assert.deepEqual(shell.slots, ['scene','mast','hud','dialogue'])

const app = model.byTag.get('visualizer-app')
assert.ok(app)
assert.ok(app.publicEvents.some(event => event.name === 'game-state' && event.source === 'visualizer-scene'))
assert.ok(app.children.includes('visualizer-scene'))
assert.ok(app.children.includes('visualizer-hud'))
assert.ok(app.children.includes('visualizer-dialogue'))

const data = manifest(model)
assert.ok(data.components['visualizer-scene'].inputs.game)
assert.ok(data.components['visualizer-hud'].inputs.state)
assert.ok(data.components['visualizer-dialogue'].inputs.dialogue)
assert.equal(data.components['visualizer-scene'].emits['game-state'].bubbles, true)
assert.equal(data.components['visualizer-dialogue'].emits['dialogue-choice'].composed, true)

console.log('night-shift model: game world property input, first-person scene, HUD commands, NPC dialogue choices and native composed event graph verified.')
