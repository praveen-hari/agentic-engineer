# Architecture — Engineering Workspace

## Overview

A Code Studio extension that provides structured, visual SDLC workflow management for AI-assisted development. The extension auto-calibrates engineering rigor (specs, plans, tests, reviews, approvals) based on task type, complexity, and risk.

## Layered Architecture

The codebase follows a strict **4-layer architecture** with clear dependency rules:

```
┌─────────────────────────────────────────────────────────┐
│  Extension Entry Point (src/extension.ts)               │
│  Wires all layers together, registers commands/tools    │
├─────────────────────────────────────────────────────────┤
│  AI Layer (src/ai/)                                     │
│  Language Model Tools registered with vscode.lm         │
│  Tools: setup-project, start-workflow, save-artifact,   │
│         advance-stage, update-status                    │
├─────────────────────────────────────────────────────────┤
│  Services Layer (src/services/)                         │
│  VS Code API integration — file I/O, git, workspace,   │
│  notifications, artifacts, history, plugins, agent      │
├─────────────────────────────────────────────────────────┤
│  Core Layer (src/core/)                                 │
│  Pure TypeScript — NO VS Code dependencies              │
│  Types, state machine, skill engine, workflow generator, │
│  pipeline config, prompt templates, todo parser         │
├─────────────────────────────────────────────────────────┤
│  Webview Layer (src/webview/)                           │
│  Preact UI — 5 views, Preact Signals state management   │
│  Runs in browser context, communicates via postMessage   │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** Core → (nothing). Services → Core. AI → Core + Services. Views → Core + Services. Extension.ts → all layers.

## Key Modules

### Core (`src/core/`) — Pure TypeScript, zero VS Code deps

| Module                  | Responsibility                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `types.ts`              | All shared type definitions (DD-015). Readonly properties throughout.                                                  |
| `pipeline-config.ts`    | Single source of truth for SDLC pipeline — stages, gates, approvals, skills per level. Data-driven, no if/else chains. |
| `workflow-engine.ts`    | Pure state machine: create → start → advanceStage. Returns new state objects (immutable).                              |
| `workflow-generator.ts` | Builds a `WorkflowDefinition` from a `RiskAssessment` — stages, gates, approvals, active skills.                       |
| `skill-registry.ts`     | Static catalog of 12 bundled engineering skills with activation metadata.                                              |
| `skill-engine.ts`       | Rule engine: given a `RiskAssessment`, computes which skills activate and why.                                         |
| `stage-executor.ts`     | Bridge between workflow definition and agent work — computes what each stage needs.                                    |
| `state-manager.ts`      | Read/write for `workflow.json` with promise-chain mutex for concurrent access.                                         |
| `prompt-templates.ts`   | Stage-specific prompts sent to the agent via AgentBridge.                                                              |
| `todo-parser.ts`        | Parses `todo.md` checklist format for build-stage task tracking.                                                       |

### Services (`src/services/`) — VS Code API wrappers

| Service                       | Responsibility                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `file-system.service.ts`      | `FileIO` implementation using `vscode.workspace.fs`. Per-path write queues for append serialization. |
| `git.service.ts`              | Git operations via VS Code SCM API.                                                                  |
| `workspace.service.ts`        | Workspace root detection, configuration.                                                             |
| `notification.service.ts`     | VS Code notification wrappers.                                                                       |
| `artifact-manager.service.ts` | Artifact CRUD with manifest.json (PDF xref pattern).                                                 |
| `artifact-watcher.service.ts` | Watches `.codestudio/` for artifact file changes.                                                    |
| `branch-watcher.service.ts`   | Detects git branch changes for branch-scoped workflows.                                              |
| `history-manager.service.ts`  | Three-tier history (hot/warm/cold) for completed workflows.                                          |
| `agent-bridge.service.ts`     | Sends prompts to the agent via VS Code chat API.                                                     |
| `plugin-registry.service.ts`  | Plugin marketplace for Syncfusion skill packs.                                                       |

### AI Layer (`src/ai/tools/`) — Language Model Tools

5 tools registered with `vscode.lm` that the agent invokes automatically:

- `setup-project` — Initialize `.codestudio/` directory
- `start-workflow` — Start an SDLC workflow from a risk assessment
- `save-artifact` — Save specs, plans, reviews, reports
- `advance-stage` — Check requirements and advance to next stage
- `update-status` — Report progress to the UI

### Views (`src/views/`) — Webview message handling

- `panel-provider.ts` — Full-width `WebviewPanel` in the editor area
- `message-handler.ts` — Thin router dispatching to domain handlers
- `handlers/` — 10 domain handler modules (workflow, artifact, stage, approval, onboarding, settings, knowledge, history, plugin, agent)
- `helpers/` — Shared utilities like context parsing

### Webview (`src/webview/`) — Preact UI

- **Framework:** Preact with JSX (jsxImportSource: preact)
- **State:** Preact Signals (`@preact/signals`) in `store/workflow.store.ts`
- **Views:** 6 views — Onboarding, Tasks, Capabilities, Knowledge, History, Settings
- **Components:** Reusable — ApprovalCard, ConfirmDialog, Icon, PluginSelector, ProgressBar, RiskBadge, SideNav, StageAccordion
- **Communication:** `bridge.ts` wraps `postMessage` / `onMessage` for type-safe host↔webview messaging

## Data Flow

1. **User enters objective** in Tasks view (webview)
2. Webview sends `startWorkflow` message → message-handler → agent bridge
3. Agent invokes `engineering_start_workflow` tool → WorkflowGenerator creates workflow
4. StateManager persists `workflow.json` to `.codestudio/workflows/current/`
5. Agent follows stage skills, calls `engineering_save_artifact` to save outputs
6. ArtifactWatcher detects new files → updates UI via postMessage
7. Agent calls `engineering_advance_stage` → WorkflowEngine transitions state machine
8. Cycle repeats until all stages complete

## Key Design Decisions

- **Agent-delegated architecture:** The extension orchestrates; the AI agent provides all intelligence
- **Git-tracked state:** All workflow state lives in `.codestudio/`, tracked by git (DD-002)
- **Immutable state transitions:** WorkflowEngine returns new objects, never mutates
- **Data-driven pipeline:** PipelineConfig is the single source of truth — adding stages/gates is a data edit, not code
- **Result type for expected failures:** `Result<T, E>` pattern instead of exceptions (SPEC §6)
- **Promise-chain mutex:** StateManager serializes concurrent updates to prevent lost writes
- **Branch-scoped workflows:** BranchWatcher enables per-branch workflow isolation
