import assert from 'node:assert/strict'
import { buildProjectModel, manifest } from '../tools/skein/model.mjs'

const model = await buildProjectModel('examples/control-room/index.html')
assert.equal(model.components.length, 8)
assert.deepEqual(model.unresolved, [])

const card = model.byTag.get('control-unit-card')
assert.ok(card)
assert.deepEqual(card.inputs.map(input => [input.name, input.type]), [
  ['unit', 'Unit'],
  ['selectedId', 'string']
])
assert.deepEqual(card.emits.map(event => [event.name, event.detailKeys, event.bubbles, event.composed]), [
  ['select-unit', ['id'], true, true]
])
assert.deepEqual(card.slots, ['actions'])
assert.deepEqual(card.parts, ['surface', 'header', 'load'])
assert.deepEqual(card.cssProperties, [
  { name: '--load', syntax: '<number>', inherits: 'false', initialValue: '0' }
])
assert.deepEqual(card.children, ['control-sensor-list'])
assert.deepEqual(card.usedBy, ['control-unit-grid'])

const grid = model.byTag.get('control-unit-grid')
assert.ok(grid)
assert.deepEqual(grid.publicEvents.map(event => [event.name, event.source, event.forwarded]), [
  ['select-unit', 'control-unit-card', true]
])

const app = model.byTag.get('control-app')
assert.ok(app)
assert.ok(app.publicEvents.some(event => event.name === 'select-unit' && event.source === 'control-unit-card' && event.forwarded))

const data = manifest(model)
assert.equal(data.components['control-unit-card'].inputs.unit, 'Unit')
assert.equal(data.components['control-unit-card'].cssProperties['--load'].syntax, '<number>')
assert.equal(data.components['control-unit-grid'].publicEvents['select-unit'].source, 'control-unit-card')

console.log('Skein design-time model: 8 components, typed inputs, events, slots, parts, CSS properties and graph verified.')
