# Changelog

## 0.1.0 (11 July 2026) — M1: Core Extension

### Added

- **Adaptive Process Depth** (DD-001): Four process levels (Light, Standard, Thorough, Guarded) that auto-calibrate engineering rigor based on task type, complexity, and risk
- **Git-Tracked Workflow State** (DD-002): All state in `.codestudio/` directory, tracked by git for team collaboration
- **Event Sourcing** (DD-008): Append-only JSONL event log — workflow state reconstructed by replaying events
- **Dynamic Workflow Generation** (DD-014): Three-step pipeline (risk assessment → workflow generator → stage executor) generates per-request workflows
- **Workflow Definition Schema** (DD-015): Typed JSON schema for `workflow.json` with stages, quality gates, approvals
- **Skill Auto-Selection** (DD-007, DD-010): 28 engineering skills that activate automatically based on task type, context signals, and process level
- **Risk Assessment Engine**: Deterministic keyword + pattern matching with LLM enrichment fallback (DD-014)
- **Context Signal Detection**: 6 context signals (touches_ui, touches_api, touches_auth_or_input, touches_external_services, performance_sensitive, high_risk_decision)
- **Project Context Analysis**: Auto-detects languages, frameworks, test frameworks, package managers, build tools, conventions
- **Capability Recommender** (DD-024, DD-025): Context-aware recommendations for Syncfusion skill packs (14 packs) and custom instructions
- **AI Layer** (DD-014): LLM-powered risk analysis with deterministic fallback when no LLM available
- **Chat Participant**: `@engineering` with `/status`, `/analyze`, `/history` slash commands
- **Language Model Tools**: `analyze_work_request`, `get_workflow_status`, `get_project_context` for agent mode
- **5-View Preact Webview** (DD-016 through DD-027):
  - Tasks (empty/active/complete states with Stages/Artifacts/Approvals tabs)
  - Capabilities (3-zone: Recommended, Current Setup, Skill Pack Marketplace)
  - Knowledge (Project Context, ADRs, Conventions, Boundaries)
  - History (three-tier hot/warm/cold with pagination)
  - Settings (Process Defaults, History Management)
- **VS Code Services**: FileSystem, Git, Workspace, Notification services using VS Code APIs
- **287 unit tests** with ≥90% coverage on core logic

### Bundle Sizes

- Extension host: 52.7KB (target < 400KB ✅)
- Webview: 36.9KB (target < 100KB ✅)

### Tech Stack

- TypeScript 5.6+, Preact 10.x, @preact/signals 1.x
- esbuild dual-bundle (CJS extension + ESM webview)
- Vitest 3.2 with v8 coverage
- VS Code Extension API 1.93+ (Language Model API, Chat Participants, Language Model Tools)
