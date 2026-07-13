# Engineering Workspace

A Code Studio extension that provides structured, visual SDLC workflow management for AI-assisted development.

## What It Does

Engineering Workspace automatically calibrates engineering rigor (specs, plans, tests, reviews, approvals) based on task type, complexity, and risk — making proper engineering practices the path of least resistance.

### Features

- **Adaptive Process Depth** — Four process levels (Light → Standard → Thorough → Guarded) that auto-detect the right amount of ceremony for each task
- **Risk Assessment Engine** — Analyzes work requests for risk signals (auth, payment, database, security) and recommends the appropriate process level
- **Dynamic Workflow Generation** — Generates workflows with stages, quality gates, and approvals tailored to the specific task
- **12 Bundled Skills** — Engineering skills that activate automatically based on task type, context, and process level
- **AI-Enhanced Analysis** — Uses the Language Model API for enriched risk assessment with deterministic fallback
- **Chat Participant** — `@engineering` with `/status`, `/analyze`, `/history` commands
- **Language Model Tools** — Five tools (`engineering_setup_project`, `engineering_start_workflow`, `engineering_save_artifact`, `engineering_advance_stage`, `engineering_update_status`) that agent mode invokes automatically
- **6-View Editor Panel** — Onboarding, Tasks, Capabilities, Knowledge, History, Settings
- **Git-Tracked State** — All workflow state in `.codestudio/` directory, tracked by git

## Installation

```bash
# Clone and build
git clone <repo-url>
cd agentic_engineer
npm install
npm run build

# Package
npm run package

# Install in Code Studio
sfcode --install-extension engineering-workspace-0.1.0.vsix
```

## Usage

### Editor Panel

The Engineering Workspace opens as a full-width editor panel with 6 views:

1. **Onboarding** — Welcome flow, project setup (detects existing `.codestudio/` or creates new)
2. **Tasks** — Start a new work request, track workflow progress, approve/reject artifacts
3. **Capabilities** — Context-aware recommendations, current setup summary, Syncfusion skill pack marketplace
4. **Knowledge** — Project context, ADRs, conventions, boundaries
5. **History** — Three-tier history (hot/warm/cold) of completed workflows
6. **Settings** — Process defaults, history management

### Chat

Use `@engineering` in the chat panel:

```
@engineering /status
@engineering /analyze Add OAuth login with SAML SSO
@engineering /history
```

### Agent Mode

The extension contributes five Language Model Tools that agent mode invokes automatically:

- `engineering_setup_project` — Initialize `.codestudio/` directory with project context
- `engineering_start_workflow` — Start a structured SDLC workflow from a risk assessment
- `engineering_save_artifact` — Save specs, plans, reviews, reports, and todo checklists
- `engineering_advance_stage` — Check stage requirements and advance to the next stage
- `engineering_update_status` — Report progress to the Engineering Workspace UI

## Architecture

```
src/
├── core/               # Pure TypeScript, no VS Code deps
│   ├── types.ts              # All type definitions
│   ├── pipeline-config.ts    # Single source of truth for SDLC pipeline
│   ├── state-manager.ts      # workflow.json read/write with mutex
│   ├── workflow-engine.ts    # Pure state machine
│   ├── workflow-generator.ts # Dynamic workflow builder
│   ├── skill-registry.ts     # 12-skill catalog
│   ├── skill-engine.ts       # Skill activation rules
│   ├── stage-executor.ts     # Stage action planning
│   ├── prompt-templates.ts   # Agent prompt generation
│   └── todo-parser.ts        # Build-stage task tracking
├── ai/
│   └── tools/                # 5 Language Model Tools
│       ├── setup-project.tool.ts
│       ├── start-workflow.tool.ts
│       ├── save-artifact.tool.ts
│       ├── advance-stage.tool.ts
│       └── update-status.tool.ts
├── services/           # VS Code API integration
│   ├── file-system.service.ts
│   ├── git.service.ts
│   ├── workspace.service.ts
│   ├── notification.service.ts
│   ├── artifact-manager.service.ts
│   ├── artifact-watcher.service.ts
│   ├── branch-watcher.service.ts
│   ├── history-manager.service.ts
│   ├── agent-bridge.service.ts
│   └── plugin-registry.service.ts
├── chat/               # Chat participant (@engineering)
│   └── chat-participant.ts
├── views/              # Webview message handling
│   ├── panel-provider.ts     # Editor-area WebviewPanel
│   ├── message-handler.ts    # Thin router
│   └── handlers/             # 10 domain handler modules
├── webview/            # Preact UI (6 views)
│   ├── app.tsx               # Root component
│   ├── bridge.ts             # postMessage bridge
│   ├── store/                # Preact Signals state
│   ├── views/                # 6 view components
│   ├── components/           # Reusable UI components
│   └── styles/               # CSS custom properties
├── constants.ts        # .codestudio/ path constants
└── extension.ts        # Entry point
```

### Build Output

esbuild produces a dual bundle plus codicon assets:

```
out/
├── extension.js        # CJS/Node (extension host)
├── webview.js          # ESM/browser (Preact UI)
├── webview.css         # Extracted CSS
└── codicons/           # Copied from @vscode/codicons
    ├── codicon.css
    └── codicon.ttf
```

## Testing

```bash
npm test              # Run all tests (652 tests, vitest)
npm run test:coverage # Run with coverage report (80% thresholds)
npm run typecheck     # Type check both tsconfigs
npm run build         # Build both bundles + copy codicon assets
npm run lint          # ESLint
npm run package       # Package as .vsix
```

## Skills

The extension bundles 12 engineering skills as `SKILL.md` files in `skills/`:

| Skill                      | Category     | Activates During    |
| -------------------------- | ------------ | ------------------- |
| Context Engineering        | Always       | Define, Plan, Build |
| Git Workflow & Versioning  | Always       | Build, Review, Ship |
| Incremental Implementation | Always       | Plan, Build         |
| Spec-Driven Development    | By task type | Define, Plan        |
| Planning & Task Breakdown  | By task type | Plan                |
| Test-Driven Development    | By task type | Build, Verify       |
| Code Review & Quality      | Quality gate | Review              |
| Documentation & ADRs       | By task type | Ship                |
| Security & Hardening       | By context   | Build, Review       |
| Debugging & Error Recovery | By task type | Build               |
| Interview Me               | Interactive  | Define              |
| Shipping & Launch          | By task type | Ship                |

## License

MIT
