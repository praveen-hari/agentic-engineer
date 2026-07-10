# Implementation Plan: M1 — Foundation

## Overview

Build the extension scaffold, core data layer, sidebar UI shell, and project context generation. At the end of M1, a user can install the extension, see the Engineering Workspace sidebar with a Home view, and have their project automatically analyzed with context generated and persisted in `.codestudio/`.

No agent execution, no workflow execution, no artifact generation — those are M2+. M1 is the skeleton that everything else plugs into.

## Architecture Decisions

- **Language:** TypeScript (strict mode) — standard for VS Code extensions
- **Webview framework:** Vanilla HTML/CSS with lightweight message passing — avoid React in M1 to keep the bundle small and the dependency surface minimal. React can be introduced in M2 when webviews become complex (Artifact Review, Task Board). For M1, the Home view is simple enough for template literals.
- **Build tool:** esbuild via `@vscode/vsce` — fast builds, standard tooling
- **Testing:** Vitest for unit tests on core logic (workflow engine, context manager, state persistence). VS Code extension integration tests deferred to M2.
- **State format:** JSON for workflow state, JSONL for event stream, Markdown for artifacts
- **Directory convention:** `.codestudio/` in workspace root for all persisted state

## Dependency Graph

```
Extension Scaffold (Task 1)
    │
    ├── Core Types & Interfaces (Task 2)
    │       │
    │       ├── State Persistence Layer (Task 3)
    │       │       │
    │       │       └── Event Stream (Task 4)
    │       │
    │       └── Workflow Engine — Data Model Only (Task 5)
    │               │
    │               └── Risk Assessment Engine — Stub (Task 6)
    │
    ├── Sidebar Tree Views (Task 7)
    │       │
    │       └── Home Webview Panel (Task 8)
    │
    └── Context Manager (Task 9)
            │
            └── Project Analyzer (Task 10)
                    │
                    └── Integration: Home View + Context (Task 11)
```

## Task List

### Phase 1: Scaffold & Core

- [ ] Task 1: Extension scaffold with activation, commands, and build pipeline
- [ ] Task 2: Core TypeScript types and interfaces
- [ ] Task 3: State persistence layer (read/write `.codestudio/`)
- [ ] Task 4: Event stream (append-only JSONL logger)

### Checkpoint: Scaffold
- [ ] Extension activates without errors
- [ ] State can be written to and read from `.codestudio/`
- [ ] Events can be appended and read back
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

### Phase 2: Workflow Data Model

- [ ] Task 5: Workflow engine — state machine (data model + transitions only)
- [ ] Task 6: Risk assessment engine — stub with hardcoded rules

### Checkpoint: Workflow Model
- [ ] Workflow can be created, stages can transition
- [ ] Risk assessment returns a process level for sample inputs
- [ ] All state changes are persisted and recoverable
- [ ] `npm test` passes

### Phase 3: UI Shell

- [ ] Task 7: Sidebar tree view providers (Workflow, Tasks, Artifacts, Activity)
- [ ] Task 8: Home webview panel (static layout, reads workflow state)

### Checkpoint: UI Shell
- [ ] Sidebar shows 5 sections in activity bar view
- [ ] Home panel renders with placeholder content
- [ ] Home panel reads and displays workflow state
- [ ] Extension builds and loads without errors

### Phase 4: Context Generation

- [ ] Task 9: Context manager — workspace analysis engine
- [ ] Task 10: Project analyzer — detect stack, conventions, structure
- [ ] Task 11: Integration — Home view displays project context, status bar shows state

### Checkpoint: M1 Complete
- [ ] Extension activates, shows sidebar, displays Home
- [ ] Project context is auto-generated on first activation
- [ ] Context is persisted in `.codestudio/context.md`
- [ ] Workflow state survives Code Studio restart
- [ ] Status bar shows current state
- [ ] All tests pass, build clean
- [ ] Ready for M2 (Define stage) to plug in

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Code Studio extension API differs from VS Code | High | Verify API compatibility early in Task 1; use only stable APIs |
| Webview message passing complexity | Medium | Keep M1 webview simple (read-only); complex webviews in M2 |
| `.codestudio/` conflicts with user's files | Low | Check for existing directory on activation; prompt before creating |
| Context generation too slow for large repos | Medium | Set timeout, analyze only top-level structure in M1; deep analysis in M2 |

## Open Questions

- What is the Code Studio extension API surface? Is it identical to VS Code's `vscode` module, or are there Syncfusion-specific APIs?
- Does Code Studio have a built-in chat API that extensions can hook into, or do we need to build chat integration from scratch?
- Are there existing Syncfusion UI components (webview toolkit) we should use instead of building from scratch?
