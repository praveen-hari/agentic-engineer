# Engineering Workspace

> A Code Studio extension that brings structured, visual SDLC workflow management to AI-assisted development — auto-calibrating engineering rigor based on task type, complexity, and risk.

![VS Code ^1.93.0](https://img.shields.io/badge/VS%20Code-%5E1.93.0-007ACC)
![TypeScript ^5.6.2](https://img.shields.io/badge/TypeScript-%5E5.6.2-3178C6)
![License MIT](https://img.shields.io/badge/License-MIT-green)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Editor Panel](#editor-panel)
  - [Chat Participant](#chat-participant)
  - [Agent Mode (LM Tools)](#agent-mode-lm-tools)
- [Architecture](#architecture)
  - [Layered Design](#layered-design)
  - [Source Layout](#source-layout)
  - [Build Output](#build-output)
  - [Data Flow](#data-flow)
- [Skills](#skills)
- [Tech Stack](#tech-stack)
- [Development](#development)
  - [Scripts](#scripts)
  - [Testing](#testing)
  - [TypeScript Configs](#typescript-configs)
  - [Conventions](#conventions)
- [Key Design Decisions](#key-design-decisions)
- [License](#license)

---

## Overview

Engineering Workspace makes proper engineering practices the **path of least resistance**. When you describe a work request, the extension assesses risk signals (authentication, payments, databases, security) and automatically generates a tailored SDLC workflow — with the right stages, quality gates, approvals, and activated skills — tracked visually in an editor panel and persisted in git.

---

## Features

| Feature | Description |
|---|---|
| **Adaptive Process Depth** | Four levels — Light → Standard → Thorough → Guarded — matched automatically to each task |
| **Risk Assessment Engine** | Detects risk signals in work requests; falls back to deterministic scoring when LLM is unavailable |
| **Dynamic Workflow Generation** | Generates stages, quality gates, and approvals tailored to the specific task and risk level |
| **12 Bundled Engineering Skills** | Skills that activate automatically based on task type, context, and process level |
| **AI-Enhanced Analysis** | Uses the VS Code Language Model API for enriched risk assessment |
| **`@engineering` Chat Participant** | `/status`, `/analyze`, and `/history` slash commands |
| **5 Language Model Tools** | Agent-mode tools invoked automatically during a workflow run |
| **6-View Editor Panel** | Onboarding · Tasks · Capabilities · Knowledge · History · Settings |
| **Git-Tracked State** | All workflow state lives in `.codestudio/` and is tracked by git |
| **Branch-Scoped Workflows** | Per-branch workflow isolation via `BranchWatcher` |
| **Three-Tier History** | Hot / warm / cold history of completed workflows |
| **Plugin Marketplace** | Syncfusion skill pack registry for extended capabilities |

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd agentic-engineer

# Install dependencies
npm install

# Build (production)
npm run build

# Package as .vsix
npm run package

# Install in Code Studio
sfcode --install-extension engineering-workspace-0.1.0.vsix
```

---

## Usage

### Editor Panel

Open via the **Engineering Workspace** command. The panel has 6 views:

| View | Purpose |
|---|---|
| **Onboarding** | Welcome flow, project setup — detects or creates `.codestudio/` |
| **Tasks** | Start a work request, track workflow progress, approve/reject artifacts |
| **Capabilities** | Context-aware recommendations, current setup summary, skill pack marketplace |
| **Knowledge** | Project context, ADRs, conventions, boundaries |
| **History** | Three-tier history of completed workflows |
| **Settings** | Process defaults, history management |

### Chat Participant

Use `@engineering` in the Code Studio chat panel:

```
@engineering /status
@engineering /analyze Add OAuth login with SAML SSO
@engineering /history
```

| Command | Description |
|---|---|
| `/status` | Show the current workflow state and active stage |
| `/analyze <request>` | Run a risk assessment on a work request |
| `/history` | List recently completed workflows |

### Agent Mode (LM Tools)

The extension registers five Language Model Tools that agent mode invokes automatically:

| Tool | Description |
|---|---|
| `engineering_setup_project` | Initialize `.codestudio/` directory with project context |
| `engineering_start_workflow` | Start a structured SDLC workflow from a risk assessment |
| `engineering_save_artifact` | Save specs, plans, reviews, reports, and todo checklists |
| `engineering_advance_stage` | Check stage requirements and advance to the next stage |
| `engineering_update_status` | Report progress to the Engineering Workspace UI |

---

## Architecture

### Layered Design

The codebase follows a strict **4-layer architecture** with one-way dependencies:

```
┌─────────────────────────────────────────────────────────┐
│  Extension Entry Point  (src/extension.ts)              │
│  Wires all layers together, registers commands/tools    │
├─────────────────────────────────────────────────────────┤
│  AI Layer  (src/ai/)                                    │
│  5 Language Model Tools registered with vscode.lm       │
├─────────────────────────────────────────────────────────┤
│  Services Layer  (src/services/)                        │
│  VS Code API integration — file I/O, git, workspace,   │
│  notifications, artifacts, history, plugins, agent      │
├─────────────────────────────────────────────────────────┤
│  Core Layer  (src/core/)                                │
│  Pure TypeScript — NO VS Code dependencies              │
│  Types, state machine, skill engine, workflow generator,│
│  pipeline config, prompt templates, todo parser         │
├─────────────────────────────────────────────────────────┤
│  Webview Layer  (src/webview/)                          │
│  Preact UI — 6 views, Preact Signals state management   │
│  Runs in browser context, communicates via postMessage  │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** Core → _(nothing)_. Services → Core. AI → Core + Services. Views → Core + Services. `extension.ts` → all layers.

### Source Layout

```
src/
├── core/                        # Pure TypeScript, zero VS Code deps
│   ├── types.ts                 # All shared type definitions (readonly throughout)
│   ├── pipeline-config.ts       # Single source of truth for SDLC pipeline
│   ├── workflow-engine.ts       # Immutable state machine (create → start → advanceStage)
│   ├── workflow-generator.ts    # Builds WorkflowDefinition from RiskAssessment
│   ├── skill-registry.ts        # Static catalog of 12 bundled skills
│   ├── skill-engine.ts          # Rule engine — computes which skills activate and why
│   ├── stage-executor.ts        # Computes per-stage agent action plans
│   ├── state-manager.ts         # workflow.json read/write with promise-chain mutex
│   ├── prompt-templates.ts      # Stage-specific prompts for AgentBridge
│   └── todo-parser.ts           # Parses todo.md for build-stage task tracking
│
├── ai/
│   └── tools/                   # 5 LM Tools registered with vscode.lm
│       ├── setup-project.tool.ts
│       ├── start-workflow.tool.ts
│       ├── save-artifact.tool.ts
│       ├── advance-stage.tool.ts
│       └── update-status.tool.ts
│
├── services/                    # VS Code API wrappers
│   ├── file-system.service.ts   # vscode.workspace.fs + per-path write queues
│   ├── git.service.ts           # Git operations via VS Code SCM API
│   ├── workspace.service.ts     # Workspace root detection, configuration
│   ├── notification.service.ts  # VS Code notification wrappers
│   ├── artifact-manager.service.ts  # Artifact CRUD with manifest.json
│   ├── artifact-watcher.service.ts  # Watches .codestudio/ for file changes
│   ├── branch-watcher.service.ts    # Detects git branch changes
│   ├── history-manager.service.ts   # Three-tier hot/warm/cold history
│   ├── agent-bridge.service.ts      # Sends prompts to agent via VS Code chat API
│   └── plugin-registry.service.ts   # Syncfusion skill pack marketplace
│
├── chat/
│   └── chat-participant.ts      # @engineering chat participant + slash commands
│
├── views/                       # Webview message handling (extension host side)
│   ├── panel-provider.ts        # Full-width WebviewPanel in the editor area
│   ├── message-handler.ts       # Thin router dispatching to domain handlers
│   └── handlers/                # 10 domain handlers (workflow, artifact, stage, approval…)
│
├── webview/                     # Preact UI (browser context)
│   ├── app.tsx                  # Root component
│   ├── bridge.ts                # Type-safe postMessage / onMessage wrapper
│   ├── store/                   # Preact Signals state (workflow.store.ts)
│   ├── views/                   # 6 view components
│   ├── components/              # Reusable — ApprovalCard, ProgressBar, RiskBadge, etc.
│   └── styles/                  # CSS custom properties (variables.css + scoped files)
│
├── constants.ts                 # All .codestudio/ path constants
└── extension.ts                 # Extension entry point
```

### Build Output

esbuild produces a dual bundle plus codicon assets:

```
out/
├── extension.js        # CJS/Node (extension host)
├── webview.js          # ESM/browser (Preact UI)
├── webview.css         # Extracted CSS
└── codicons/           # Copied from @vscode/codicons (excluded in .vscodeignore)
    ├── codicon.css
    └── codicon.ttf
```

### Data Flow

1. User enters an objective in the **Tasks** view (webview)
2. Webview sends a `startWorkflow` message → `message-handler` → `AgentBridge`
3. Agent invokes `engineering_start_workflow` → `WorkflowGenerator` creates the workflow
4. `StateManager` persists `workflow.json` to `.codestudio/workflows/current/`
5. Agent follows stage skills, calls `engineering_save_artifact` to save outputs
6. `ArtifactWatcher` detects new files → updates UI via `postMessage`
7. Agent calls `engineering_advance_stage` → `WorkflowEngine` transitions state machine
8. Cycle repeats until all stages complete; history is archived via `HistoryManager`

---

## Skills

The extension bundles 12 engineering skills as `SKILL.md` files in `skills/`. Each skill activates automatically based on task type and process level:

| Skill | Category | Activates During |
|---|---|---|
| Context Engineering | Always | Define, Plan, Build |
| Git Workflow & Versioning | Always | Build, Review, Ship |
| Incremental Implementation | Always | Plan, Build |
| Spec-Driven Development | By task type | Define, Plan |
| Planning & Task Breakdown | By task type | Plan |
| Test-Driven Development | By task type | Build, Verify |
| Code Review & Quality | Quality gate | Review |
| Documentation & ADRs | By task type | Ship |
| Security & Hardening | By context | Build, Review |
| Debugging & Error Recovery | By task type | Build |
| Interview Me | Interactive | Define |
| Shipping & Launch | By task type | Ship |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript (strict) | ^5.6.2 |
| Runtime | Node.js | ≥20.0.0 |
| Extension API | VS Code Extension API | ^1.93.0 |
| UI Framework | Preact | ^10.24.3 |
| UI State | @preact/signals | ^1.3.1 |
| AI / Chat | @vscode/chat-extension-utils | ^0.0.0-alpha.5 |
| Prompt Templating | @vscode/prompt-tsx | ^0.4.0-alpha.1 |
| Icons | @vscode/codicons | ^0.0.36 |
| Bundler | esbuild | ^0.27.0 |
| Test Runner | Vitest | ^3.2.7 |
| Coverage | @vitest/coverage-v8 | ^3.2.7 |
| Linter | ESLint + @typescript-eslint | ^9.12.0 / ^8.8.0 |
| Formatter | Prettier | ^3.3.3 |
| Packager | @vscode/vsce | ^3.1.0 |

---

## Development

### Scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `node esbuild.config.mjs --production` | Production build (minified, no sourcemaps) |
| `watch` | `node esbuild.config.mjs --watch` | Dev watch mode |
| `typecheck` | `tsc --noEmit` (both tsconfigs) | Type check extension host + webview |
| `test` | `vitest run --passWithNoTests` | Run all tests |
| `test:watch` | `vitest` | Watch mode tests |
| `test:coverage` | `vitest run --coverage` | Coverage report |
| `lint` | `eslint src --ext ts,tsx` | Lint |
| `format` | `prettier --write` | Format |
| `package` | `vsce package --no-yarn` | Build `.vsix` |

### Testing

Tests live in `src/test/` organized by domain and development phase:

```
src/test/
├── core/               # Unit tests for core modules
├── services/           # Unit tests for services
├── ai/                 # Tests for LM tools
├── views/              # Tests for message handlers
├── webview/            # Tests for webview components
├── phase1/ … phase7/   # Phase-gated integration tests
└── hardening/          # Edge-case and resilience tests
```

**Coverage thresholds (enforced):** 80% lines · 80% functions · 75% branches · 80% statements  
**Coverage scope:** `src/core/**`, `src/services/**`, `src/ai/**`

### TypeScript Configs

This project uses two separate TypeScript configurations:

| Config | Context | Module | Target | Libraries |
|---|---|---|---|---|
| `tsconfig.json` | Extension host | Node16 / CJS | ES2022 | Node built-ins |
| `tsconfig.webview.json` | Webview (browser) | ESNext / Bundler | ES2020 | DOM, Preact JSX |

Run `npm run typecheck` to validate both.

### Conventions

- **`readonly` everywhere** — all interface properties in `types.ts` are `readonly`
- **Literal union types, not enums** — `type ProcessLevel = 'light' | 'standard' | 'thorough' | 'guarded'`
- **`Result<T, E>` for expected failures** — use `ok()` / `err()` helpers, not thrown exceptions
- **Immutable state transitions** — functions return new objects, never mutate
- **Dependency injection via constructor** — services receive dependencies in constructors
- **`FileIO` interface** for filesystem access — injectable for tests (in-memory mock)
- **No `any`** — `noImplicitAny` is enforced; use `unknown` + type guards
- **File naming** — kebab-case with layer suffix: `.service.ts`, `.tool.ts`, `.handlers.ts`, `.test.ts`

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Agent-delegated architecture** | The extension orchestrates; the AI agent provides all intelligence. Prompts go out via `AgentBridge`, results come back via `ArtifactWatcher`. |
| **Data-driven pipeline config** | `PipelineConfig` is the single source of truth for stages, gates, and approvals. Adding workflow behavior is a config data edit — not an engine code change. |
| **Immutable state machine** | `WorkflowEngine` returns new `WorkflowDefinition` objects on every transition. No mutation means no hidden side effects and straightforward testing. |
| **Promise-chain mutex** | `StateManager.update()` serializes concurrent writes via chained promises, preventing lost updates from parallel tool calls. |
| **`Result<T, E>` error pattern** | Expected failures (corrupt files, missing workflow) are modelled as values, not exceptions — keeping error handling explicit and exhaustive. |
| **Git-tracked state** | All workflow state lives in `.codestudio/`, tracked by git. Workflow history is durable and auditable across branches and clones. |
| **Branch-scoped workflows** | `BranchWatcher` isolates workflows per git branch, enabling parallel feature development with independent process tracking. |
| **Preact over React** | Chosen for bundle size. The webview bundle must be self-contained (no `node_modules/` in `.vsix`). |
| **Dual esbuild bundles** | Extension host (CJS/Node) and webview (ESM/browser) have incompatible module systems and runtimes — separate bundles are required. |

---

## License

MIT
