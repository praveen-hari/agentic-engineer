# Implementation Plan: Engineering Workspace Extension (M1)

**Spec:** `SPEC.md` v2.0  
**Target:** 2 weeks  
**Date:** 10 July 2026

---

## Dependency Graph

```
                    ┌─────────────────┐
                    │  1. Scaffold     │
                    │  (project setup) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  2. Core Types   │
                    │  (types.ts)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼──────┐ ┌────▼─────────┐
     │ 3. Event Stream│ │4. State  │ │5. Risk Engine│
     │ (JSONL logger) │ │ Manager  │ │ (determin.)  │
     └────────┬───────┘ └───┬──────┘ └────┬─────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │ 6. Workflow     │
                    │    Engine       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼──────────┐ ┌▼──────────────┐
     │7a. Skill Reg.  │ │8. Context    │ │10. AI Layer   │
     │7b. Skill Eng.  │ │  Analyzer    │ │(LM API + tools)│
     │7c. Workflow Gen.│ │9. Signals   │ │               │
     └────────┬───────┘ └───┬──────────┘ └┬───────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │11. Services     │
                    │(FS, Git, Notif.)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌───▼──────────┐ ┌▼──────────────┐
     │11. Webview     │ │12. Chat      │ │13. Extension  │
     │ (Preact shell) │ │  Participant │ │  Entry Point  │
     └────────┬───────┘ └───┬──────────┘ └┬──────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │14. Integration  │
                    │   & Polish      │
                    └─────────────────┘
```

---

## Vertical Slices

We build in vertical slices — each slice delivers testable, working functionality.

### Slice A: Foundation (Tasks 1–2)
Scaffold + types. No runtime behavior yet, but everything compiles and tests run.

### Slice B: Core Engine (Tasks 3–6)
Event stream + state + risk + workflow engine. All pure TypeScript, fully unit-tested. No VS Code deps.

### Slice C: Intelligence (Tasks 7–10)
Workflow generation + context analysis + context signals + AI layer. The "brain" of the extension.

### Slice D: Integration (Tasks 11–14)
VS Code services + Preact webview + chat participant + extension entry point. The "body" that connects brain to IDE.

### Slice E: Polish (Task 15)
Status bar, activation timing, bundle optimization, final integration testing.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Preact JSX config conflicts with VS Code extension TS config | Medium | Medium | Separate `tsconfig.webview.json` with `jsxImportSource: "preact"` |
| Language Model API not available in Code Studio fork | Medium | High | Every AI feature has deterministic fallback; AI is enrichment, not gating |
| Chat Participant API not available in Code Studio | Low | Medium | Chat is additive; sidebar webview is the primary interface |
| esbuild dual-bundle (extension + webview) complexity | Medium | Low | Well-documented pattern; use separate entry points |
| Preact signals + webview postMessage race conditions | Medium | Medium | Queue messages until Preact app mounts; use `signal.peek()` for reads during message handling |
| `.codestudio/` directory conflicts with existing projects | Low | Low | Check for existing directory on activation; prompt user |

---

## Verification Checkpoints

| After Slice | Checkpoint | Command |
|-------------|-----------|---------|
| A (Foundation) | Project compiles, tests run (0 tests), lint passes | `npm run typecheck && npm test && npm run lint` |
| B (Core Engine) | 30+ unit tests pass, ≥ 80% coverage on core/ | `npm run test:coverage` |
| C (Intelligence) | Skill engine activates correct skills per scenario, AI fallback works, workflow generation uses skills | `npm test` |
| D (Integration) | Extension activates, sidebar renders, chat responds, tools registered | Manual: F5 → Extension Development Host |
| E (Polish) | All M1 success criteria met (18 items from spec) | Full checklist walkthrough |

---

## Implementation Order

Tasks are numbered 1–14. Each task has acceptance criteria and verification steps in `tasks/todo.md`.

| Task | Slice | Description | Est. |
|------|-------|-------------|------|
| 1 | A | Project scaffold (package.json, tsconfig, esbuild, vitest) | 2h |
| 2 | A | Core types (types.ts — all interfaces + skill types) | 1.5h |
| 3 | B | Event stream (JSONL append/read/replay) | 2h |
| 4 | B | State manager (workflow.json read/write) | 2h |
| 5 | B | Risk engine (deterministic keyword + pattern + context signals) | 3h |
| 6 | B | Workflow engine (state machine + transitions) | 3h |
| 7a | C | Skill registry (24 skills catalog with metadata) | 2h |
| 7b | C | Skill engine (activation rules by type/context/level) | 3h |
| 7c | C | Workflow generator (uses active skills → stages/gates) | 2h |
| 8 | C | Context analyzer + project detector | 2h |
| 9 | C | Context signal detector (UI/API/auth/perf pattern detection) | 1.5h |
| 9b | C | Capability recommender + Syncfusion skill catalog (DD-024) | 2.5h |
| 10 | C | AI layer (model access, risk analyzer, LM tools) | 3h |
| 11 | D | Services (file system, git, workspace, notification) | 2h |
| 12 | D | Preact webview shell (sidebar, nav, 5 views, bridge) | 4h |
| 13 | D | Chat participant (@engineering + slash commands) | 2h |
| 14 | D | Extension entry point (activate, register all) | 2h |
| 15 | E | Status bar, bundle optimization, integration test | 2h |
| | | **Total estimated** | **~40.5h** |
| | | **Tasks** | **16** |
