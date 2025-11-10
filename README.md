# Web Component Framework (Signal-based)

A lightweight, reactive web component framework using TC39 Signals for data binding.

## Features

- ✨ **Signal-based Reactivity** - Uses TC39 Signals proposal for reactive state management
- 🎯 **Template Binding** - Declarative `{variable}` syntax for data binding
- 🔄 **Automatic Updates** - UI updates automatically when state changes
- 📦 **Component Loading** - Automatic loading of nested components from HTML files
- 🎨 **Scoped Styles** - Shadow DOM with component-scoped CSS
- 🧩 **Nested Objects** - Full support for nested objects and arrays
- 🚀 **Zero Dependencies** - No external dependencies, includes Signal polyfill
- 🔮 **Future-proof** - Ready for native Signal support in browsers

## Quick Start

### 1. Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="web-component.js"></script>
</head>
<body>
  <my-counter></my-counter>
</body>
</html>
```

### 2. Create Component (my/counter.html)

```html
<script>
  this.count = 0;
  this.increment = () => { this.count++; };
</script>

<div>
  <p>Count: {count}</p>
  <button onclick="$.increment()">Increment</button>
</div>

<style>
  div { padding: 20px; background: #f0f0f0; }
</style>
```

That's it! The component automatically:
- Loads from `my/counter.html`
- Sets up reactive state
- Binds template variables
- Updates UI on state changes

## Template Syntax

### Variables
```html
<p>{message}</p>
<p>{user.name}</p>
```

### Attributes
```html
<input value="{inputValue}">
<div class="{className}">
```

### Loops
```html
<div for="{items}">
  <p>{name}: {value}</p>
</div>
```

### Nested Context
```html
<div in="{user}">
  <p>{name}</p>
  <p>{email}</p>
</div>
```

### Empty Placeholder
```html
<li for="{items}">{}</li>
<!-- Renders the item itself -->
```

## State Management

### Reactive State
```javascript
// In component script
this.count = 0;              // Creates Signal.State
this.count++;                // Triggers UI update
this.user = { name: 'John' }; // Nested reactivity
this.user.name = 'Jane';     // Also reactive
```

### Arrays
```javascript
this.items = [1, 2, 3];
this.items.push(4);          // Reactive
this.items[0] = 10;          // Reactive
```

### Methods
```javascript
this.increment = () => {
  this.count++;
};

// In template
<button onclick="$.increment()">Click</button>
```

## Component Lifecycle

### Loading
Components are automatically loaded based on tag name:
- `my-component` → `my/component.html`
- `page-home` → `page/home.html`

### Structure
Each component file can contain:
1. `<script>` - Component logic (optional)
2. Template - HTML with bindings
3. `<style>` - Scoped styles (optional)

### Multiple Scripts
```html
<script>
  // Initial state
  this.data = [];
</script>

<!-- Template -->
<div>{message}</div>

<script>
  // Async operations
  this.data = await fetchData();
</script>
```

## Examples

See the `test/` directory for examples:

- **test/binding.html** - Data binding with nested objects and arrays
- **test/canvas.html** - Interactive canvas with reactive coordinates
- **test/function.html** - Callbacks and computed values
- **test/component-demo.html** - Simple counter demo
- **test/unit-tests.html** - Comprehensive test suite

## Testing

Run tests in your browser:

```bash
# Unit tests
open test/unit-tests.html

# Integration tests
open test-signals.html

# Live demo
open index.html
```

## Signal-based Architecture

This framework uses the TC39 Signals proposal for reactivity:

```javascript
// Signals are created automatically for state
const signal = new Signal.State(value);

// Watchers trigger on changes
const watcher = new Signal.subtle.Watcher(() => {
  updateUI();
});
watcher.watch(signal);
```

### Benefits
- Fine-grained reactivity
- Automatic dependency tracking
- Efficient updates (microtask batching)
- Future browser native support

See [SIGNALS-MIGRATION.md](SIGNALS-MIGRATION.md) for detailed information.

## API Reference

### WebComponent

```javascript
class WebComponent extends HTMLElement {
  state: Object          // Reactive state
  open(tag): boolean     // Open component in shadow root
  replace(tag): boolean  // Replace current component
}
```

### StateManager

```javascript
class StateManager {
  bind(node): Node              // Bind node to state
  subscribe(path, vars, fn)     // Subscribe to state changes
}
```

### Template

```javascript
class Template {
  static match(text): Array     // Find {variables}
  static keyFrom(str): string   // Extract key from {key}
  static fill(text, data): string // Fill template with data
}
```

## Advanced Usage

### Component Communication

```javascript
// Parent component
this.data = { message: 'Hello' };

// Child can access via $
<button onclick="$.data.message = 'Updated'">
```

### Dynamic Components

```javascript
// Open new component
this.open('other-component');

// Replace current
this.replace('different-component');
```

### Accessing State

```javascript
// In templates: $
<button onclick="$.doSomething()">

// In scripts: this
this.value = 10;
```

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+

Signal polyfill included for all browsers.

## Performance

- Microtask-based updates (<1ms batching)
- Fine-grained reactivity (only affected DOM updates)
- Lazy component loading
- Shadow DOM isolation

## Contributing

1. Make changes to `web-component.js`
2. Add tests to `test/unit-tests.html`
3. Verify existing examples work
4. Update documentation

## License

MIT