# Workspace composition proof

This is intentionally an application-scale Skein example rather than a feature demo. It contains 18 custom-element types and uses no store, router, provide/inject layer, framework slot API or event bus.

## Component graph

```text
workspace-app
└─ workspace-shell
   ├─ workspace-sidebar          (slot=sidebar)
   ├─ workspace-topbar           (slot=topbar)
   ├─ workspace-overview         (default slot)
   │  ├─ workspace-metrics
   │  │  └─ ui-metric ×5
   │  ├─ ui-panel → project-list → project-row
   │  ├─ ui-panel → task-board → task-column → task-card
   │  ├─ ui-panel → team-strip → ui-avatar
   │  └─ ui-panel → activity-feed → activity-item
   └─ detail-drawer              (slot=aside)
```

The 18 component types are `workspace-app`, `workspace-shell`, `workspace-sidebar`, `workspace-topbar`, `workspace-overview`, `workspace-metrics`, `ui-metric`, `ui-panel`, `project-list`, `project-row`, `task-board`, `task-column`, `task-card`, `team-strip`, `ui-avatar`, `activity-feed`, `activity-item`, and `detail-drawer`.

## Composition contract exercised

```text
data      → .property
/actions/ ← bubbling + composed CustomEvent
content   → native <slot>
```

- static primitive configuration uses ordinary attributes, e.g. `<ui-metric name="Active" tone="lime">`
- live or non-primitive input uses `.property={path}`
- task-card events cross several nested shadow roots without relay handlers
- collection UI uses keyed `each={...}`
- the inspector uses `if={open}`
- forms use native dynamic `for={searchId}`, `.value`, and `@input`
- derived views use `computed()`

## DX finding

The application did **not** require a new framework composition primitive. Native slots, DOM properties and composed events were sufficient across 18 component types.

The scale test did expose one real ergonomic gap: literal props such as `name="Active"` were previously invisible to `input()`. Skein 0.6.1 now lets primitive static attributes seed matching inputs, with pre-mount properties taking precedence. Live values still use `.property={...}`.

The remaining visible cost is `this.` inside component scripts. Removing it would require a source transform or a different reactive state model, so this example does not justify that complexity.

Input names still cannot shadow native host APIs such as `title`, `state` or `dispose`. Use domain-specific names such as `name`, `label`, `task`, `project` and `open`.

## Regression

Run:

```bash
node test/workspace.mjs
```

The test uses the generated `skein.min.js` in real Chromium and checks all 18 definitions, native slot assignment, primitive static inputs, property precedence, search reactivity, deep composed-event propagation, task mutation and conditional teardown.
