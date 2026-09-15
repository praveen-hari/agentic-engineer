# Engineering Workspace

> Structured, visual SDLC workflow management for AI-assisted development in Code Studio.

**Publisher:** Syncfusion &nbsp;|&nbsp; **Version:** 0.1.0 &nbsp;|&nbsp; **License:** MIT &nbsp;|&nbsp; **VS Code:** ^1.93.0

---

## Overview

Engineering Workspace is a Code Studio extension that brings engineering discipline to AI-assisted development. Instead of letting the agent freestyle every task, the extension auto-calibrates the right amount of process — specs, plans, tests, reviews, approvals — based on the actual risk of each work request.

The result: proper engineering practices become the path of least resistance.

---

## Features

| Feature | Description |
|---|---|
| **Adaptive Process Depth** | Four process levels (Light → Standard → Thorough → Guarded) that auto-select the right ceremony for each task |
| **Risk Assessment Engine** | Analyzes work requests for risk signals (auth, payments, database, security) and recommends the appropriate level |
| **Dynamic Workflow Generation** | Generates stages, quality gates, and approval checkpoints tailored to the task |
| **12 Bundled Engineering Skills** | Skills activate automatically based on task type, context, and process level |
| **AI-Enhanced Analysis** | Uses the Language Model API for enriched risk assessment with a deterministic fallback |
| **`@engineering` Chat Participant** | `/status`, `/analyze`, `/history` commands in the chat panel |
| **5 Language Model Tools** | Agent mode invokes these automatically to drive the full SDLC workflow |
| **6-View Editor Panel** | Onboarding · Tasks · Capabilities · Knowledge · History · Settings |
| **Git-Tracked State** | All workflow state lives in `.codestudio/` and is tracked by git |
| **Branch-Scoped Workflows** | Workflows are automatically scoped to the current git branch |

---

## Installation

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd agentic-engineer
npm install

# 2. Build
npm run build

# 3. Package as .vsix
npm run package

# 4. Install in Code Studio
sfcode --install-extension engineering-workspace-0.1.0.vsix
```

---

## Usage

### Editor Panel

Open the panel with the **Engineering Workspace: Open** command (or via the Command Palette).

The panel has 6 views:

| View | Purpose |
|---|---|
| **Onboarding** | Welcome flow and project setup — detects or creates `.codestudio/` |
| **Tasks** | Start a work request, track workflow progress, approve/reject artifacts |
| **Capabilities** | Context-aware recommendations, active skill summary, Syncfusion skill-pack marketplace |
| **Knowledge** | Project context, ADRs, conventions, boundaries |
| **History** | Three-tier (hot/warm/cold) log of completed workflows |
| **Settings** | Process defaults and history management |

### Chat Participant

Use `@engineering` in the Code Studio chat panel:

```
@engineering /status
@engineering /analyze Add OAuth login with SAML SSO
@engineering /history
```

### Agent Mode

Five Language Model Tools are registered with `vscode.lm` and invoked automatically by the agent:

| Tool | Description |
|---|---|
| `engineering_setup_project` | Initialize `.codestudio/` with project context |
| `engineering_start_workflow` | Start a structured SDLC workflow from a risk assessment |
| `engineering_save_artifact` | Save specs, plans, reviews, reports, and todo checklists |
| `engineering_advance_stage` | Check stage requirements and advance to the next stage |
| `engineering_update_status` | Report progress to the Engineering Workspace UI |

### Commands

| Command | Description |
|---|---|
| `Engineering Workspace: Open` | Open the editor panel |
| `Engineering Workspace: Analyze Work Request` | Run risk analysis on the current request |
| `Engineering Workspace: Show History` | Jump to the History view |
| `Engineering Workspace: Navigate To` | Deep-link to a specific view |

---

## Engineering Skills

The extension bundles 12 skills as `SKILL.md` files in `skills/`. Skills activate automatically based on task type, process level, and risk context.

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

## Architecture

The codebase follows a strict **4-layer architecture** with one-way dependencies:

```
┌─────────────────────────────────────────────────────────┐
│  Extension Entry Point  src/extension.ts                │
│  Wires all layers together, registers commands/tools    │
├─────────────────────────────────────────────────────────┤
│  AI Layer  src/ai/                                      │
│  Language Model Tools registered with vscode.lm         │
├─────────────────────────────────────────────────────────┤
│  Services Layer  src/services/                          │
│  VS Code API integration — file I/O, git, workspace,    │
│  notifications, artifacts, history, plugins, agent      │
├─────────────────────────────────────────────────────────┤
│  Core Layer  src/core/                                  │
│  Pure TypeScript — NO VS Code dependencies              │
│  Types, state machine, skill engine, workflow generator,│
│  pipeline config, prompt templates, todo parser         │
├─────────────────────────────────────────────────────────┤
│  Webview Layer  src/webview/                            │
│  Preact UI — 6 views, Preact Signals state management   │
│  Runs in browser context, communicates via postMessage  │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** Core → nothing. Services → Core. AI → Core + Services. Views → Core + Services. `extension.ts` → all layers.

### Source Layout

```
src/
├── core/                     # Pure TypeScript, zero VS Code deps
│   ├── types.ts              # All shared type definitions (readonly throughout)
│   ├── pipeline-config.ts    # Single source of truth for SDLC pipeline
│   ├── workflow-engine.ts    # Immutable state machine (create → start → advance)
│   ├── workflow-generator.ts # Builds WorkflowDefinition from a RiskAssessment
│   ├── skill-registry.ts     # Catalog of 12 bundled engineering skills
│   ├── skill-engine.ts       # Rule engine: computes which skills activate
│   ├── stage-executor.ts     # Computes what each stage needs from the agent
│   ├── state-manager.ts      # workflow.json read/write with promise-chain mutex
│   ├── prompt-templates.ts   # Stage-specific prompts sent via AgentBridge
│   └── todo-parser.ts        # Parses todo.md checklists for build-stage tracking
├── ai/
│   └── tools/                # 5 Language Model Tools
│       ├── setup-project.tool.ts
│       ├── start-workflow.tool.ts
│       ├── save-artifact.tool.ts
│       ├── advance-stage.tool.ts
│       └── update-status.tool.ts
├── services/                 # VS Code API wrappers
│   ├── file-system.service.ts      # FileIO with per-path write queues
│   ├── git.service.ts              # Git operations via VS Code SCM API
│   ├── workspace.service.ts        # Workspace root detection, configuration
│   ├── notification.service.ts     # VS Code notification wrappers
│   ├── artifact-manager.service.ts # Artifact CRUD + manifest.json
│   ├── artifact-watcher.service.ts # Watches .codestudio/ for file changes
│   ├── branch-watcher.service.ts   # Detects git branch changes
│   ├── history-manager.service.ts  # Three-tier hot/warm/cold history
│   ├── agent-bridge.service.ts     # Sends prompts to the VS Code chat agent
│   └── plugin-registry.service.ts  # Syncfusion skill-pack marketplace
├── chat/
│   └── chat-participant.ts   # @engineering chat participant + slash commands
├── views/                    # Webview host-side message handling
│   ├── panel-provider.ts     # Full-width WebviewPanel in the editor area
│   ├── message-handler.ts    # Thin router dispatching to domain handlers
│   └── handlers/             # 10 domain handler modules
├── webview/                  # Preact UI (browser context)
│   ├── app.tsx               # Root component
│   ├── bridge.ts             # Type-safe postMessage ↔ onMessage wrapper
│   ├── store/                # Preact Signals state (workflow.store.ts)
│   ├── views/                # 6 view components
│   ├── components/           # Reusable UI components
│   └── styles/               # CSS custom properties, no framework
├── constants.ts              # All .codestudio/ path constants
└── extension.ts              # Extension entry point
```

### Build Output

esbuild produces a dual bundle plus copied codicon assets:

```
out/
├── extension.js        # CJS/Node — runs in the extension host
├── webview.js          # ESM/browser — Preact UI
├── webview.css         # Extracted styles
└── codicons/           # Copied from @vscode/codicons (excluded from node_modules in .vsix)
    ├── codicon.css
    └── codicon.ttf
```

---

## Tech Stack

| Area | Technology |
|---|---|
| Language | TypeScript ^5.6.2 (strict mode) |
| Runtime | Node.js ≥20.0.0 |
| VS Code API | ^1.93.0 |
| UI Framework | Preact ^10.24.3 + @preact/signals ^1.3.1 |
| Build | esbuild ^0.27.0 (dual-bundle: CJS extension + ESM webview) |
| Test runner | Vitest ^3.2.7 |
| Linter | ESLint ^9.12.0 + @typescript-eslint ^8.8.0 |
| Formatter | Prettier ^3.3.3 |
| Packager | @vscode/vsce ^3.1.0 |
| Icons | @vscode/codicons ^0.0.36 |

---

## Development

### Scripts

| Script | Command | Purpose |
|---|---|---|
| `build` | `node esbuild.config.mjs --production` | Production build (minified) |
| `watch` | `node esbuild.config.mjs --watch` | Dev watch mode |
| `typecheck` | `tsc --noEmit` (both tsconfigs) | Type-check extension + webview |
| `test` | `vitest run --passWithNoTests` | Run all tests |
| `test:watch` | `vitest` | Watch mode tests |
| `test:coverage` | `vitest run --coverage` | Coverage report (80% thresholds) |
| `lint` | `eslint src --ext ts,tsx` | Lint |
| `format` | `prettier --write` | Format |
| `package` | `vsce package --no-yarn` | Build `.vsix` |

### Two TypeScript Configs

The project has two separate `tsconfig` files due to the dual-bundle architecture:

| Config | Target | Module | Used for |
|---|---|---|---|
| `tsconfig.json` | ES2022 | Node16/CJS | Extension host (`src/` excluding webview) |
| `tsconfig.webview.json` | ESNext | ESNext/ESM | Webview UI (`src/webview/`) |

### Testing

Tests live in `src/test/`, organized by domain and development phase:

```
src/test/
├── core/           # Core layer unit tests
├── services/       # Service layer tests (in-memory FileIO mocks)
├── ai/             # LM tool tests
├── views/          # Handler tests
├── webview/        # UI logic tests
├── phase1/ – phase7/   # Phase-gated integration tests
└── hardening/      # Edge-case and hardening tests
```

Coverage targets: **80% lines · 80% functions · 75% branches · 80% statements**

---

## Key Design Decisions

- **Pipeline config is king** — All SDLC behavior (stages, gates, approvals, skills per level) is defined in `src/core/pipeline-config.ts` as data. To change workflow behavior, edit the config — don't add if/else logic in engines.
- **Immutability throughout** — All interfaces use `readonly` properties; state machines return new objects and never mutate.
- **Result type over exceptions** — `Result<T, E>` with `ok()` / `err()` helpers for expected failures at boundaries.
- **Agent-delegated architecture** — The extension orchestrates; the AI agent provides intelligence. Prompts are dispatched via `AgentBridge`; results come back through `ArtifactWatcher`.
- **Deterministic fallback** — AI tools degrade gracefully to rule-based logic when the LLM is unavailable.
- **Promise-chain mutex** — `StateManager.update()` serializes concurrent writes to `workflow.json` via chained promises.

---

## License

MIT
