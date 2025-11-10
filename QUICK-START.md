# Quick Start Guide - Signal-Based Web Components

## 🚀 Get Started in 30 Seconds

### 1. Create HTML Entry Point
```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="web-component.js"></script>
</head>
<body>
  <my-app></my-app>
</body>
</html>
```

### 2. Create Component (my/app.html)
```html
<script>
  this.count = 0;
  this.increment = () => { this.count++; };
</script>

<div>
  <h1>Counter: {count}</h1>
  <button onclick="$.increment()">+1</button>
</div>

<style>
  div { padding: 20px; text-align: center; }
  button { padding: 10px 20px; font-size: 16px; }
</style>
```

### 3. Done! 🎉
Open your HTML file in a browser. The component automatically:
- Loads from `my/app.html`
- Creates reactive state using Signals
- Binds template variables
- Updates UI on state changes

---

## 📝 Template Syntax Cheat Sheet

### Variables
```html
<p>{message}</p>
<p>{user.name}</p>
<p>{user.address.city}</p>
```

### Attributes
```html
<input value="{inputValue}">
<div class="{activeClass}">
<img src="{imageUrl}" alt="{imageAlt}">
```

### Loops
```html
<!-- Loop over array -->
<div for="{items}">
  <p>{name}: {price}</p>
</div>

<!-- Empty placeholder renders item itself -->
<li for="{tags}">{}</li>
```

### Nested Context
```html
<div in="{user}">
  <p>Name: {name}</p>
  <p>Email: {email}</p>
  <div in="{address}">
    <p>City: {city}</p>
  </div>
</div>
```

### Event Handlers
```html
<!-- Call method on state ($) -->
<button onclick="$.handleClick()">Click</button>
<input oninput="$.updateValue(event)">

<!-- Inline expressions -->
<button onclick="$.count++">Increment</button>
```

---

## 🎯 State Management Patterns

### Basic State
```javascript
// Simple values
this.count = 0;
this.message = 'Hello';
this.isActive = true;

// Access in template: {count}, {message}, {isActive}
```

### Objects
```javascript
this.user = {
  name: 'John',
  age: 30,
  email: 'john@example.com'
};

// Access: {user.name}, {user.age}, {user.email}
```

### Arrays
```javascript
this.items = [
  { id: 1, name: 'Apple', price: 1.99 },
  { id: 2, name: 'Banana', price: 0.99 }
];

// Loop in template:
// <div for="{items}">
//   <p>{name}: ${price}</p>
// </div>
```

### Methods
```javascript
this.increment = () => {
  this.count++;
};

this.addItem = (name) => {
  this.items.push({ name, id: Date.now() });
};

this.toggleActive = () => {
  this.isActive = !this.isActive;
};
```

### Computed Values (Manual)
```javascript
this.total = 0;
this.updateTotal = () => {
  this.total = this.items.reduce((sum, item) => sum + item.price, 0);
};

// Call after changes
this.addItem = (item) => {
  this.items.push(item);
  this.updateTotal();
};
```

---

## 🔧 Common Patterns

### Form Input Binding
```html
<script>
  this.formData = { name: '', email: '' };
  
  this.handleInput = (event) => {
    const { name, value } = event.target;
    this.formData[name] = value;
  };
</script>

<input name="name" value="{formData.name}" oninput="$.handleInput(event)">
<input name="email" value="{formData.email}" oninput="$.handleInput(event)">
```

### Todo List
```html
<script>
  this.todos = [];
  this.newTodo = '';
  
  this.addTodo = () => {
    if (this.newTodo.trim()) {
      this.todos.push({ 
        id: Date.now(), 
        text: this.newTodo, 
        done: false 
      });
      this.newTodo = '';
    }
  };
  
  this.toggleTodo = (id) => {
    const todo = this.todos.find(t => t.id === id);
    if (todo) todo.done = !todo.done;
    this.todos = [...this.todos]; // Trigger update
  };
</script>

<input value="{newTodo}" oninput="$.newTodo = event.target.value">
<button onclick="$.addTodo()">Add</button>

<div for="{todos}">
  <input type="checkbox" checked="{done}" onchange="$.toggleTodo({id})">
  <span>{text}</span>
</div>
```

### Async Data Loading
```html
<script>
  this.data = [];
  this.loading = true;
  this.error = null;
  
  // Load data asynchronously
  (async () => {
    try {
      const response = await fetch('/api/data');
      this.data = await response.json();
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  })();
</script>

<div>
  Loading: {loading}
  Error: {error}
  <div for="{data}">
    <p>{name}</p>
  </div>
</div>
```

### Conditional Rendering
```html
<script>
  this.isLoggedIn = false;
  this.username = '';
  
  this.login = () => {
    this.isLoggedIn = true;
    this.username = 'John';
  };
</script>

<!-- Use CSS display or separate components -->
<div style="display: {isLoggedIn ? 'block' : 'none'}">
  <p>Welcome, {username}!</p>
</div>

<div style="display: {isLoggedIn ? 'none' : 'block'}">
  <button onclick="$.login()">Login</button>
</div>
```

---

## 🧩 Component Communication

### Parent → Child (via attributes)
```html
<!-- parent/component.html -->
<script>
  this.message = 'Hello from parent';
</script>

<child-component data="{message}"></child-component>

<!-- child/component.html -->
<p>Received: {data}</p>
```

### Child → Parent (via state)
```html
<!-- All children access parent state via $ -->
<script>
  this.parentData = [];
</script>

<child-component></child-component>

<!-- child/component.html -->
<button onclick="$.parentData.push('item')">
  Add to Parent
</button>
```

### Navigate Between Components
```javascript
// Open component in current shadow root
this.open('other-component');

// Replace current component
this.replace('different-component');
```

---

## 🎨 Styling Tips

### Scoped Styles (Recommended)
```html
<style>
  /* Styles are scoped to this component */
  div { color: blue; }
  .container { padding: 20px; }
</style>
```

### Global Styles
```html
<!-- In your main HTML -->
<style>
  /* Global styles */
  :root {
    --primary-color: #667eea;
  }
</style>
```

### Dynamic Classes
```html
<script>
  this.isActive = false;
  this.theme = 'dark';
</script>

<div class="base {theme} {isActive ? 'active' : ''}">
  Content
</div>
```

---

## 🐛 Debugging Tips

### Console Logging
```javascript
this.debugState = () => {
  console.log('Current state:', {
    count: this.count,
    items: this.items,
    user: this.user
  });
};

// Call in template or async
// <button onclick="$.debugState()">Debug</button>
```

### Browser DevTools
1. Open DevTools (F12)
2. In Console: `WebComponent.instances`
3. Access component state: `WebComponent.instances['my-app-1'].state`
4. Modify state directly: `WebComponent.instances['my-app-1'].state.count = 100`

### Check Signal API
```javascript
// In browser console
console.log(typeof Signal); // 'function'
console.log(typeof Signal.State); // 'function'
```

---

## 📚 Learning Path

### Beginner
1. ✅ Start with `test/component-demo.html` - simple counter
2. ✅ Study `test/binding.html` - data binding basics
3. ✅ Try `test/canvas.html` - event handling

### Intermediate
4. ✅ Build a todo list
5. ✅ Create form with validation
6. ✅ Implement navigation between components

### Advanced
7. ✅ Study `web-component.js` source
8. ✅ Read `SIGNALS-MIGRATION.md`
9. ✅ Contribute improvements!

---

## 🆘 Common Issues

### Issue: Updates not reflecting
```javascript
// ❌ Don't store references
const items = this.items;
items.push(4); // Won't trigger update

// ✅ Always access via state
this.items.push(4);
// OR reassign
this.items = [...this.items, 4];
```

### Issue: Template not filling
```html
<!-- ❌ Wrong syntax -->
<p>{{message}}</p>
<p>${message}</p>

<!-- ✅ Correct syntax -->
<p>{message}</p>
```

### Issue: Event handler not working
```html
<!-- ❌ Missing $ prefix -->
<button onclick="increment()">

<!-- ✅ Use $ to access state -->
<button onclick="$.increment()">
```

### Issue: Component not loading
- Check file path: `my-component` loads from `my/component.html`
- Ensure hyphen in tag name: `mycomponent` won't work, use `my-component`
- Check browser console for errors

---

## 🎓 Next Steps

1. **Run Examples**: `open index.html`
2. **Run Tests**: `open test/unit-tests.html`
3. **Read Docs**: Check `README.md` and `SIGNALS-MIGRATION.md`
4. **Build Something**: Start with a simple counter, then expand!

---

## 📖 Quick Reference

| Concept | Syntax | Example |
|---------|--------|---------|
| Variable | `{var}` | `{name}` |
| Nested | `{obj.prop}` | `{user.email}` |
| Loop | `for="{arr}"` | `<div for="{items}">` |
| Context | `in="{obj}"` | `<div in="{user}">` |
| Event | `onclick="$.fn()"` | `<button onclick="$.save()">` |
| State access | `$` | `$.count++` |
| Method | `this.fn = () => {}` | `this.save = () => {}` |

---

**Happy Coding! 🚀**

For full documentation, see [README.md](README.md)
