# Workspace composition proof

This is intentionally an application-scale Skein example rather than a feature demo. It contains 18 custom elements and uses no store, router, provide/inject layer, framework slot API or event bus.

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

The 18 component types are: `workspace-app`, `workspace-shell`, `workspace-sidebar`, `workspace-topbar`, `workspace-overview`, `workspace-metrics`, `ui-metric`, `ui-panel`, `project-list`, `project-row`, `task-board`, `task-column`, `task-card`, `team-strip`, `ui-avatar`, `activity-feed`, `activity-item`, and `detail-drawer`.

## Composition contract exercised

- content/layout: native default and named `<slot>`
- state down: `.property={path}`
- actions up: bubbling + composed `CustomEvent`
- task-card events cross several nested shadow roots without relay handlers
- collection UI: keyed `each={...}`
- conditional inspector: `if={open}`
- native form semantics: dynamic `for={searchId}`, `.value`, `@input`
- derived views: `computed()`

## DX finding

The application can be assembled without adding a new Skein primitive. The main friction is explicit `this.` inside component scripts and the visual `.property` marker for component inputs; both are costs of keeping zero-build Proxy state and honest DOM property semantics. Neither blocked composition.

A useful constraint emerged: generic HTML host names such as `title` should not be used as Skein inputs because they collide with native element APIs. Components in this example use domain names such as `name`, `label`, `task`, `project`, and `open` instead.
