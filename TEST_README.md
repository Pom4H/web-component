# Web Component Signal Tests

This directory contains comprehensive tests for the refactored web component framework using TC39 Signals.

## Test Files

### 1. `web-component.test.html`
Unit tests covering:
- Signal creation and value access
- Signal reactivity with effects
- Computed signals
- Reactive objects and arrays
- Template matching and filling
- WebComponent basic functionality
- StateManager functionality

### 2. `integration.test.html`
Integration tests covering:
- Simple data binding
- Reactive state updates
- Array reactivity
- Computed values
- Nested object reactivity
- Array item updates

### 3. `runner.html`
Test runner that displays all tests in a unified interface.

## Running Tests

1. **Unit Tests**: Open `test/web-component.test.html` in a browser
2. **Integration Tests**: Open `test/integration.test.html` in a browser
3. **All Tests**: Open `test/runner.html` for a unified test interface

## Test Coverage

### Signal API
- ✓ Basic signal creation
- ✓ Signal value updates
- ✓ Effect tracking
- ✓ Computed signals
- ✓ Read-only computed signals

### Reactive State
- ✓ Object property reactivity
- ✓ Nested object reactivity
- ✓ Array reactivity
- ✓ Array mutations (push, pop, shift, unshift, splice, sort)
- ✓ Array item updates

### Web Component
- ✓ Component definition
- ✓ State management
- ✓ Data binding
- ✓ Template processing

## Notes

The refactored implementation uses TC39 Signals proposal for fine-grained reactivity:
- Signals track dependencies automatically
- Effects run when dependencies change
- Computed signals cache values and update reactively
- Reactive objects and arrays provide transparent reactivity
