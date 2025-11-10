# TC39 Signals Migration Guide

## Overview

This web component framework has been refactored to use the [TC39 Signals proposal](https://github.com/tc39/proposal-signals) for reactive data binding instead of the previous Proxy-based observer pattern.

## What Changed

### Before (Proxy-based)
- Used `Proxy` with custom handlers to intercept property access
- Event-based system with `requestAnimationFrame` for batching updates
- Manual event emission and subscription management

### After (Signal-based)
- Uses `Signal.State` for reactive state management
- Uses `Signal.subtle.Watcher` for watching state changes
- Leverages native Signal reactivity with microtask batching
- Built-in polyfill for browsers without native Signal support

## Key Components

### 1. Signal Polyfill

A complete polyfill implementation is included that provides:
- `Signal.State` - Reactive state container
- `Signal.Computed` - Derived computed values
- `Signal.subtle.Watcher` - Low-level watcher API

```javascript
// Automatically loaded if Signal is not available
const signal = new Signal.State(42);
signal.get(); // 42
signal.set(100); // Updates and notifies watchers
```

### 2. SignalStateWrapper

Wraps objects and arrays with `Signal.State` for fine-grained reactivity:

```javascript
const wrapper = new SignalStateWrapper({
  name: 'John',
  age: 30,
  hobbies: ['coding', 'reading']
});

// Each property becomes a Signal
const nameSignal = wrapper.getSignal('name');
nameSignal.get(); // 'John'
nameSignal.set('Jane'); // Triggers reactivity
```

### 3. StateManager

Refactored to use Signals instead of Proxies:

```javascript
class StateManager {
  #stateWrapper = null;
  #watchers = new Map();
  #effects = new Map();

  subscribe(path, vars, consumer) {
    // Uses Signal.subtle.Watcher internally
    // Automatically batches updates via microtasks
  }
}
```

## Benefits

### 1. **Standards-based**
- Following TC39 proposal means future browser native support
- More predictable behavior aligned with web standards

### 2. **Better Performance**
- Signal updates are batched via microtasks (faster than requestAnimationFrame)
- Fine-grained reactivity - only affected consumers are notified
- No-op when setting the same value (automatic optimization)

### 3. **Improved Debugging**
- Clearer dependency tracking
- Better integration with browser DevTools (when natively supported)
- Simpler mental model than Proxy traps

### 4. **Future-proof**
- When browsers implement native Signals, the polyfill is automatically bypassed
- Progressive enhancement approach

## API Compatibility

The public API remains **100% compatible**. All existing components work without changes:

```javascript
// Your existing code continues to work
this.users = [{ name: 'John', age: 30 }];
this.users[0].age += 1; // Still triggers reactivity
```

## Testing

Three test suites are included:

### 1. Signal Tests (`test-signals.html`)
Basic signal functionality tests:
- Signal creation and updates
- Watcher notifications
- Template binding
- Component integration

### 2. Unit Tests (`test/unit-tests.html`)
Comprehensive unit tests covering:
- Signal API (State, Computed, Watcher)
- SignalStateWrapper functionality
- Template system
- WebComponent class
- StateManager
- CodeLoader
- Integration tests

### 3. Component Demo (`test/component-demo.html`)
Interactive demo showing signals in action

## Running Tests

Open any of the following in your browser:

```bash
# Main test page
open test-signals.html

# Unit tests with detailed results
open test/unit-tests.html

# Demo component
open test/component-demo.html

# Existing examples (all still work!)
open index.html
```

## Migration Notes

If you were directly using the internal observer API (not recommended), note these changes:

### Removed
- `createObserver()` function
- `EVENT_TYPES` constants
- Event-based emission system

### Added
- `SignalStateWrapper` class
- Signal polyfill
- `Signal.State` based reactivity

### Modified
- `StateManager` constructor and methods
- Internal state representation

## Performance Comparison

| Metric | Proxy-based | Signal-based |
|--------|------------|--------------|
| Update batching | requestAnimationFrame (~16ms) | microtask (<1ms) |
| Overhead per property | Medium (Proxy trap) | Low (Signal getter) |
| Memory | Higher (multiple proxies) | Lower (single wrapper) |
| Browser support | All modern | Polyfill + future native |

## Examples

All existing examples continue to work:

- `/page/test.html` - Grid layout with multiple components
- `/test/binding.html` - Complex data binding with nested objects and arrays
- `/test/canvas.html` - Canvas interaction with reactive coordinates
- `/test/function.html` - Function callbacks and computed values

## Browser Support

- ✅ All modern browsers (via polyfill)
- ✅ Future browsers with native Signal support (automatic)
- ✅ No breaking changes for end users

## Implementation Details

### Signal.State Lifecycle

```javascript
// 1. Create signal
const signal = new Signal.State(initialValue);

// 2. Read value (trackable)
const value = signal.get();

// 3. Update value (triggers watchers)
signal.set(newValue);

// 4. Watch for changes
const watcher = new Signal.subtle.Watcher(() => {
  console.log('Signal changed!');
});
watcher.watch(signal);
```

### Nested Object Handling

```javascript
const state = {
  user: {
    profile: {
      name: 'John'
    }
  }
};

// Each level is wrapped in a signal
// Updates at any level trigger reactivity
element.state.user.profile.name = 'Jane'; // ✅ Reactive
```

### Array Mutations

```javascript
element.state.items = [1, 2, 3];

// Array mutations trigger parent signal
element.state.items.push(4); // ✅ Reactive
element.state.items[0] = 10; // ✅ Reactive
```

## Troubleshooting

### Issue: Updates not reflecting
**Solution**: Ensure you're modifying the state through the proxy, not a cached reference

```javascript
// ❌ Won't work
const items = element.state.items;
items.push(4); // Won't trigger update

// ✅ Works
element.state.items.push(4);
// OR
element.state.items = [...element.state.items, 4];
```

### Issue: Console warnings about Signal
**Solution**: The polyfill should load automatically. Check browser console for errors.

## Contributing

When making changes to the signal implementation:

1. Update the polyfill if needed
2. Ensure all tests pass
3. Test with existing components
4. Update this documentation

## Resources

- [TC39 Signals Proposal](https://github.com/tc39/proposal-signals)
- [Signals API Documentation](https://github.com/tc39/proposal-signals/blob/main/README.md)
- [Web Component Standards](https://developer.mozilla.org/en-US/docs/Web/Web_Components)

## License

Same as the main project.
