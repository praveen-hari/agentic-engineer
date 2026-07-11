# Engineering Workspace

A Code Studio extension that provides structured, visual SDLC workflow management for AI-assisted development.

## What It Does

Engineering Workspace automatically calibrates engineering rigor (specs, plans, tests, reviews, approvals) based on task type, complexity, and risk — making proper engineering practices the path of least resistance.

### Features

- **Adaptive Process Depth** — Four process levels (Light → Standard → Thorough → Guarded) that auto-detect the right amount of ceremony for each task
- **Risk Assessment Engine** — Analyzes work requests for risk signals (auth, payment, database, security) and recommends the appropriate process level
- **Dynamic Workflow Generation** — Generates workflows with stages, quality gates, and approvals tailored to the specific task
- **Skill Auto-Activation** — 28 engineering skills that activate automatically based on task type, context, and process level
- **AI-Enhanced Analysis** — Uses the Language Model API for enriched risk assessment with deterministic fallback
- **Chat Participant** — `@engineering` with `/status`, `/analyze`, `/history` commands
- **Language Model Tools** — Three tools (`analyze_work_request`, `get_workflow_status`, `get_project_context`) that agent mode invokes automatically
- **5-View Sidebar** — Tasks, Capabilities, Knowledge, History, Settings
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

### Sidebar

The Engineering Workspace sidebar has 5 views:

1. **Tasks** — Start a new work request, track workflow progress, approve/reject artifacts
2. **Capabilities** — Context-aware recommendations, current setup summary, Syncfusion skill pack marketplace
3. **Knowledge** — Project context, ADRs, conventions, boundaries
4. **History** — Three-tier history (hot/warm/cold) of completed workflows
5. **Settings** — Process defaults, history management

### Chat

Use `@engineering` in the chat panel:

```
@engineering /status
@engineering /analyze Add OAuth login with SAML SSO
@engineering /history
```

### Agent Mode

The extension contributes three tools that agent mode invokes automatically:

- `analyze_work_request` — Analyzes a task description for type, risk, and process level
- `get_workflow_status` — Returns current workflow state
- `get_project_context` — Returns detected tech stack and conventions

## Architecture

```
src/
├── core/           # Pure TypeScript, no VS Code deps
│   ├── types.ts              # All type definitions (DD-015)
│   ├── event-stream.ts       # JSONL event sourcing (DD-008)
│   ├── state-manager.ts      # workflow.json read/write (DD-002)
│   ├── risk-engine.ts        # Deterministic risk assessment (DD-001)
│   ├── workflow-engine.ts    # State machine (DD-014)
│   ├── skill-registry.ts     # 28-skill catalog (DD-007)
│   ├── skill-engine.ts       # Skill activation rules (DD-010)
│   ├── workflow-generator.ts # Dynamic workflow builder (DD-014)
│   ├── project-detector.ts   # Tech stack detection
│   ├── context-analyzer.ts   # Context markdown generation
│   ├── context-signal-detector.ts # Context signal detection
│   ├── capability-recommender.ts  # Capabilities recommendations
│   └── skill-pack-catalog.ts # 14 Syncfusion skill packs
├── ai/             # AI layer (LLM + deterministic fallback)
│   ├── model-access.ts       # ModelAccess interface
│   ├── risk-analyzer.ts      # LLM risk analysis with fallback
│   └── tools/                # Language Model Tools
├── services/       # VS Code API integration
├── chat/           # Chat participant
├── views/          # Webview provider + message handler
├── webview/        # Preact UI (5 views)
└── extension.ts    # Entry point
```

## Testing

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
npm run typecheck     # Type check both configs
npm run build         # Build both bundles
```

## Design Decisions

See `DESIGN_DECISIONS.md` for the full record (DD-001 through DD-027).

## License

MIT
