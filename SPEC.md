# Spec: Code Studio Engineering Workspace Extension

**Version:** 2.0  
**Date:** 10 July 2026  
**Status:** Draft — Awaiting Human Review  
**Prerequisite Documents:** `AGENTIC_SDLC_EXTENSION_ANALYSIS.md`, `DESIGN_DECISIONS.md` (DD-001 through DD-017), `.designs/APP_ARCHITECTURE.md`

---

## ASSUMPTIONS I'M MAKING

1. **Target IDE:** Code Studio (Syncfusion's VS Code fork) — extension API is VS Code-compatible (`@types/vscode`)
2. **Extension type:** Sidebar webview extension + Chat Participant + Language Model Tools
3. **Runtime:** Node.js (extension host) + Webview (Preact rendered in iframe)
4. **Webview framework:** Preact (3KB gzipped) from day one — not vanilla TS, not React. Preact gives us JSX, hooks, signals, and component model at near-zero cost
5. **No backend server:** All state is local filesystem (`.codestudio/` directory) — no cloud, no database
6. **AI integration from M1:** The extension uses VS Code's Language Model API (`vscode.lm`) for risk assessment and workflow generation. Deterministic fallback when no LLM is available
7. **Chat Participant:** The extension registers `@engineering` chat participant for natural language workflow management
8. **Language Model Tools:** The extension contributes tools (`analyze_work_request`, `get_workflow_status`, `get_project_context`) that agent mode can invoke automatically
9. **Single-user:** No multi-user collaboration in MVP. Branch-scoped state (DD-009) enables team use via git
10. **Package manager:** npm (not yarn, not pnpm)
11. **Minimum VS Code API version:** 1.93+ (for latest Language Model API + webview APIs)
12. **The `.designs/` prototype is a reference, not production code** — we build from scratch using the prototype as a visual spec

→ **Correct me now or I proceed with these.**

---

## 1. Objective

### What We're Building

A Code Studio extension called **"Engineering Workspace"** that provides:

1. **Sidebar Webview** — A 7-view visual interface (Preact) for managing structured SDLC workflows
2. **Chat Participant** (`@engineering`) — Natural language interface for workflow management in ask mode
3. **Language Model Tools** — Domain-specific tools that agent mode invokes automatically during agentic coding sessions
4. **Language Model API Integration** — AI-powered risk assessment, workflow generation, and project analysis

The extension automatically calibrates engineering rigor (specs, plans, tests, reviews, approvals) based on task type, complexity, and risk — making proper engineering practices the path of least resistance.

### Who Is the User

1. **New developers** who don't know what engineering practices to ask for
2. **Experienced developers** who want structured rigor without manual enforcement
3. **Team leads** who need visibility into what agents did, what was tested, what was reviewed

### What Does Success Look Like

| Criteria | Measurement |
|----------|-------------|
| Extension installs and activates without errors | `sfcode --install-extension` succeeds; no activation errors in Output panel |
| Sidebar shows 5 views with correct navigation | Visual verification against `.designs/` prototype |
| Tasks view handles all 3 states (empty/active/complete) | State transitions work correctly |
| `.codestudio/` directory is created and persisted | Files survive Code Studio restart |
| Event sourcing records all state changes | `events.jsonl` contains correct entries |
| Risk assessment uses LLM when available, falls back to rules | Unit tests pass for both paths |
| `@engineering` chat participant responds to workflow queries | Chat interaction test |
| `analyze_work_request` tool is invocable in agent mode | Tool appears in agent mode tool list |
| Project context is auto-generated on first activation | `context.md` is created with detected stack info |
| Extension loads in < 500ms | Measured via activation event timing |
| Webview bundle < 100KB (Preact + all components) | Measured via esbuild output |
| All unit tests pass with > 80% coverage on core logic | `npm test -- --coverage` |

### User Stories (MVP — Milestone 1)

1. **As a developer**, I can install the extension and see the Engineering Workspace sidebar with 5 navigation items
2. **As a developer**, I can type a work request objective and see AI-powered analysis (type, complexity, risk, process level)
3. **As a developer**, I can start a workflow and see it progress through stages
4. **As a developer**, I can see my project context auto-generated in `.codestudio/context.md`
5. **As a developer**, I can see the workflow state persist across Code Studio restarts
6. **As a developer**, I can see the event log of all actions taken
7. **As a developer**, I can switch between the 5 views without losing state
8. **As a developer**, I can ask `@engineering what's my workflow status?` in chat and get a response
9. **As a developer**, I can use agent mode and it automatically invokes `analyze_work_request` when I describe a task
10. **As a developer**, I can use the extension even without an LLM (deterministic fallback)

### User Stories (MVP — Milestone 2)

11. **As a developer**, I can see tasks generated from a spec and track their progress
12. **As a developer**, I can review and approve/reject artifacts (specs, plans, reviews)
13. **As a developer**, I can see real-time agent activity as tasks are executed
14. **As a developer**, I can archive completed workflows and browse history
15. **As a developer**, I can configure process defaults and agent settings

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Language** | TypeScript | 5.5+ | Extension host + webview code |
| **Extension API** | `@types/vscode` | 1.93+ | VS Code extension APIs (incl. Language Model API) |
| **Webview Framework** | Preact | 10.x | Lightweight JSX/hooks UI framework (3KB gzipped) |
| **Webview Signals** | `@preact/signals` | 1.x | Fine-grained reactive state management |
| **Build** | esbuild | 0.21+ | Fast bundling for extension + webview |
| **Package** | `@vscode/vsce` | latest | Extension packaging (.vsix) |
| **Test** | Vitest | 2.0+ | Unit tests for core logic |
| **Test (integration)** | `@vscode/test-electron` | latest | Extension integration tests (M2) |
| **Lint** | ESLint + `@typescript-eslint` | latest | Code quality |
| **Format** | Prettier | latest | Code formatting |
| **Icons** | Codicons (`@vscode/codicons`) | latest | VS Code native icons |
| **Prompt Crafting** | `@vscode/prompt-tsx` | latest | TSX-based LLM prompt composition |
| **Chat Utils** | `@vscode/chat-extension-utils` | latest | Simplified tool calling in chat participant |
| **State format** | JSON + JSONL + Markdown | — | Workflow state, events, artifacts |

### Why Preact Over Alternatives

| Option | Size | JSX | Hooks | Signals | Verdict |
|--------|------|-----|-------|---------|---------|
| Vanilla TS + templates | 0KB | ❌ | ❌ | ❌ | Too much boilerplate for 7 interactive views |
| React | ~45KB | ✅ | ✅ | ❌ | Overkill for webview; bloats bundle |
| Lit | ~7KB | ❌ | ❌ | ❌ | Web components add complexity; no JSX |
| **Preact** | **~3KB** | ✅ | ✅ | ✅ | Best power-to-weight ratio; React-compatible API |
| Solid | ~7KB | ✅ | ❌ | ✅ | Different mental model; smaller ecosystem |

Preact gives us React's developer experience at 1/15th the size. `@preact/signals` provides fine-grained reactivity without re-rendering entire component trees — critical for a sidebar that updates frequently.

---

## 3. Commands

```bash
# Development
npm install                          # Install dependencies
npm run dev                          # Watch mode (esbuild + tsc)
npm run build                        # Production build
npm run package                      # Create .vsix package

# Testing
npm test                             # Run all unit tests (Vitest)
npm run test:watch                   # Watch mode tests
npm run test:coverage                # Tests with coverage report
npm run test:integration             # VS Code integration tests (M2)

# Quality
npm run lint                         # ESLint check
npm run lint:fix                     # ESLint auto-fix
npm run format                       # Prettier format
npm run typecheck                    # tsc --noEmit

# Extension
npm run compile                      # Compile extension (esbuild)
sfcode --install-extension ./out/*.vsix  # Install locally
```

---

## 4. Project Structure

```
codestudio-engineering-workspace/
├── .vscode/
│   ├── launch.json                  # Extension debug config
│   ├── tasks.json                   # Build tasks
│   └── settings.json                # Workspace settings
├── src/
│   ├── extension.ts                 # Extension entry point (activate/deactivate)
│   ├── constants.ts                 # Shared constants (commands, view IDs, etc.)
│   │
│   ├── core/                        # Core business logic (NO vscode imports)
│   │   ├── types.ts                 # All TypeScript interfaces (DD-015 schema)
│   │   ├── workflow-engine.ts       # State machine for workflow transitions
│   │   ├── risk-engine.ts           # Deterministic risk assessment (fallback)
│   │   ├── workflow-generator.ts    # Dynamic workflow builder (DD-014 step 2)
│   │   ├── skill-engine.ts          # Skill activation rules + stage-to-skill mapping (DD-007)
│   │   ├── skill-registry.ts        # Skill catalog: 24 skills with metadata + activation config
│   │   ├── event-stream.ts          # Append-only JSONL logger (DD-008)
│   │   ├── state-manager.ts         # Read/write workflow.json
│   │   ├── history-manager.ts       # Archive, compact, index (DD-004, DD-005)
│   │   ├── context-analyzer.ts      # Workspace analysis engine
│   │   ├── project-detector.ts      # Detect stack, conventions, structure
│   │   └── context-signal-detector.ts # Detect context signals (UI, API, auth, etc.)
│   │
│   ├── ai/                          # AI integration layer (uses vscode.lm)
│   │   ├── model-access.ts          # Language Model selection + fallback
│   │   ├── risk-analyzer.ts         # LLM-powered risk assessment
│   │   ├── workflow-advisor.ts      # LLM-powered workflow recommendations
│   │   ├── context-enricher.ts      # LLM-powered project context analysis
│   │   ├── prompts/                 # Prompt templates
│   │   │   ├── risk-assessment.ts   # Risk analysis prompt
│   │   │   ├── workflow-advice.ts   # Workflow recommendation prompt
│   │   │   └── context-analysis.ts  # Project context prompt
│   │   └── tools/                   # Language Model Tools (agent mode)
│   │       ├── analyze-work-request.tool.ts   # Analyze objective → type/risk/level
│   │       ├── get-workflow-status.tool.ts     # Current workflow state
│   │       └── get-project-context.tool.ts     # Project context summary
│   │
│   ├── chat/                        # Chat Participant (@engineering)
│   │   ├── participant.ts           # Chat participant registration + handler
│   │   ├── commands/                # Slash commands
│   │   │   ├── status.command.ts    # /status — current workflow state
│   │   │   ├── analyze.command.ts   # /analyze — analyze a work request
│   │   │   └── history.command.ts   # /history — recent workflows
│   │   └── intents.ts               # Intent detection logic
│   │
│   ├── services/                    # VS Code API integration layer
│   │   ├── file-system.service.ts   # .codestudio/ directory management
│   │   ├── git.service.ts           # Git operations (branch detection, etc.)
│   │   ├── workspace.service.ts     # Workspace context and configuration
│   │   └── notification.service.ts  # VS Code notifications and status bar
│   │
│   ├── views/                       # Webview providers (extension host side)
│   │   ├── sidebar-provider.ts      # WebviewViewProvider for sidebar panel
│   │   └── message-handler.ts       # postMessage protocol handler
│   │
│   ├── webview/                     # Webview client-side code (Preact, runs in iframe)
│   │   ├── index.tsx                # Preact entry point — render(<App />)
│   │   ├── app.tsx                  # Root App component with router
│   │   ├── router.ts               # Client-side view routing (signal-based)
│   │   ├── bridge.ts               # postMessage bridge to extension host
│   │   ├── store/                   # Global state (Preact signals)
│   │   │   ├── workflow.store.ts    # Workflow state signal
│   │   │   ├── ui.store.ts          # UI state (active view, theme, etc.)
│   │   │   └── capabilities.store.ts # Capabilities state signal
│   │   ├── views/                   # Top-level view components (5 views)
│   │   │   ├── tasks-view.tsx       # Tasks (empty/active/complete + Stages/Artifacts/Approvals tabs)
│   │   │   ├── capabilities-view.tsx # Smart launcher: recommendations + deep links + Syncfusion marketplace
│   │   │   ├── knowledge-view.tsx   # Project context, ADRs, conventions, boundaries
│   │   │   ├── history-view.tsx     # History with inline expansion (hot/warm/cold)
│   │   │   └── settings-view.tsx    # Extension configuration
│   │   ├── components/              # Reusable Preact components
│   │   │   ├── sidebar-nav.tsx      # Navigation sidebar (5 nav items)
│   │   │   ├── stage-list.tsx       # Stage list (no pipeline viz — DD-018)
│   │   │   ├── task-card.tsx        # Task with inline expansion
│   │   │   ├── artifact-viewer.tsx  # Markdown artifact renderer
│   │   │   ├── approval-card.tsx    # Approval action card
│   │   │   ├── capability-card.tsx  # Recommendation card with Why explanation + action button
│   │   │   ├── skill-pack-card.tsx  # Syncfusion skill pack card (platform, skill count, install)
│   │   │   ├── launcher-row.tsx     # Deep link row to native Agent Customizations panel
│   │   │   ├── stats-grid.tsx       # Statistics grid
│   │   │   ├── progress-bar.tsx     # Progress indicator
│   │   │   ├── risk-badge.tsx       # Risk level badge
│   │   │   ├── empty-state.tsx      # Reusable empty state
│   │   │   └── icon.tsx             # Codicon wrapper component
│   │   └── styles/                  # CSS
│   │       ├── variables.css        # VS Code theme tokens
│   │       ├── base.css             # Reset + typography
│   │       ├── layout.css           # Sidebar + content layout
│   │       └── components.css       # Component styles
│   │
│   └── test/                        # Tests (mirrors src/ structure)
│       ├── core/
│       │   ├── workflow-engine.test.ts
│       │   ├── risk-engine.test.ts
│       │   ├── workflow-generator.test.ts
│       │   ├── skill-engine.test.ts
│       │   ├── skill-registry.test.ts
│       │   ├── context-signal-detector.test.ts
│       │   ├── event-stream.test.ts
│       │   ├── state-manager.test.ts
│       │   ├── history-manager.test.ts
│       │   ├── context-analyzer.test.ts
│       │   └── project-detector.test.ts
│       ├── ai/
│       │   ├── risk-analyzer.test.ts
│       │   └── model-access.test.ts
│       ├── chat/
│       │   └── participant.test.ts
│       ├── services/
│       │   └── file-system.service.test.ts
│       └── fixtures/                # Test data
│           ├── sample-workflow.json
│           ├── sample-events.jsonl
│           └── sample-context.md
│
├── package.json                     # Extension manifest + contributions
├── tsconfig.json                    # TypeScript config (strict mode)
├── tsconfig.webview.json            # Separate TS config for webview (Preact JSX)
├── esbuild.config.mjs              # Build configuration (2 bundles: ext + webview)
├── vitest.config.ts                 # Test configuration
├── .eslintrc.json                   # ESLint config
├── .prettierrc                      # Prettier config
├── .vscodeignore                    # Files to exclude from .vsix
├── CHANGELOG.md                     # Release notes
├── README.md                        # Extension documentation
└── LICENSE                          # License file
```

### Key Architectural Boundaries

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Extension Host (Node.js)                          │
│                                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  core/   │  │  services/   │  │   ai/     │  │    chat/       │  │
│  │          │  │              │  │           │  │                │  │
│  │ Pure TS  │◄─│ VS Code API  │─►│ LM API   │  │ @engineering   │  │
│  │ No deps  │  │ Integration  │  │ + Tools  │  │ participant    │  │
│  │ Testable │  │              │  │           │  │                │  │
│  └──────────┘  └──────────────┘  └───────────┘  └────────────────┘  │
│       ▲                │                                             │
│       │                │ views/sidebar-provider.ts                   │
│       │                ▼                                             │
└───────┼────────────────┼─────────────────────────────────────────────┘
        │                │ postMessage
        │   ┌────────────┼─────────────────────────────────────────┐
        │   │            ▼         Webview (iframe)                │
        │   │  ┌───────────────────────────────────────────────┐   │
        │   │  │  webview/ (Preact)                            │   │
        │   │  │                                               │   │
        │   │  │  index.tsx → <App />                          │   │
        │   │  │    ├── router.ts (signal-based routing)       │   │
        │   │  │    ├── store/ (Preact signals)                │   │
        │   │  │    ├── views/ (5 view components)             │   │
        │   │  │    ├── components/ (reusable UI)              │   │
        │   │  │    └── bridge.ts (postMessage ↔ host)         │   │
        │   │  └───────────────────────────────────────────────┘   │
        │   └──────────────────────────────────────────────────────┘
        │
        │   ┌──────────────────────────────────────────────────────┐
        │   │  Chat Interface                                      │
        │   │                                                      │
        │   │  @engineering /status  → chat/participant.ts         │
        │   │  @engineering /analyze → chat/commands/analyze.ts    │
        │   │  Agent mode            → ai/tools/*.tool.ts          │
        │   └──────────────────────────────────────────────────────┘
```

**Rules:**
- `core/` has ZERO imports from `vscode` module — fully unit-testable
- `ai/` uses `vscode.lm` but always has a deterministic fallback from `core/`
- `chat/` owns the `@engineering` participant — delegates to `core/` and `ai/`
- `webview/` is a separate Preact bundle — communicates only via `postMessage`

---

## 5. AI Extensibility Architecture

### 5.1 Language Model Tools (Agent Mode)

The extension contributes three tools that agent mode can invoke automatically:

```jsonc
// package.json — contributes.languageModelTools
[
  {
    "name": "engineering_analyze_work_request",
    "displayName": "Analyze Work Request",
    "modelDescription": "Analyzes a software development task description to determine its type (feature, bugfix, refactor, etc.), complexity, risk signals, and recommended engineering process level. Use when the user describes a development task and you need to understand what engineering rigor is appropriate.",
    "canBeReferencedInPrompt": true,
    "toolReferenceName": "analyzeWork",
    "icon": "$(beaker)",
    "userDescription": "Analyze a development task for type, risk, and recommended process level",
    "inputSchema": {
      "type": "object",
      "properties": {
        "objective": {
          "type": "string",
          "description": "The work request objective or task description to analyze"
        },
        "workspaceContext": {
          "type": "string",
          "description": "Optional project context (tech stack, file patterns, etc.)"
        }
      },
      "required": ["objective"]
    }
  },
  {
    "name": "engineering_get_workflow_status",
    "displayName": "Get Workflow Status",
    "modelDescription": "Returns the current engineering workflow status including active stage, progress, pending approvals, and recent activity. Use when the user asks about the current state of their development workflow or what stage they are in.",
    "canBeReferencedInPrompt": true,
    "toolReferenceName": "workflowStatus",
    "icon": "$(pulse)",
    "userDescription": "Get current engineering workflow status and progress",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "engineering_get_project_context",
    "displayName": "Get Project Context",
    "modelDescription": "Returns analyzed project context including detected tech stack, file structure, conventions, dependencies, and risk areas. Use when you need to understand the project before making changes or when the user asks about their project setup.",
    "canBeReferencedInPrompt": true,
    "toolReferenceName": "projectContext",
    "icon": "$(folder-library)",
    "userDescription": "Get analyzed project context (tech stack, structure, conventions)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "refresh": {
          "type": "boolean",
          "description": "Force re-analysis of the workspace (default: use cached)"
        }
      }
    }
  }
]
```

**Tool Implementation Pattern:**

```typescript
// src/ai/tools/analyze-work-request.tool.ts
import * as vscode from 'vscode';
import { RiskEngine } from '../../core/risk-engine';
import { WorkflowGenerator } from '../../core/workflow-generator';

export interface IAnalyzeWorkRequestParams {
  objective: string;
  workspaceContext?: string;
}

export class AnalyzeWorkRequestTool
  implements vscode.LanguageModelTool<IAnalyzeWorkRequestParams>
{
  constructor(
    private readonly riskEngine: RiskEngine,
    private readonly workflowGenerator: WorkflowGenerator,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IAnalyzeWorkRequestParams>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Analyzing: "${options.input.objective.slice(0, 60)}..."`,
      confirmationMessages: {
        title: 'Analyze Work Request',
        message: new vscode.MarkdownString(
          `Analyze the following work request?\n\n> ${options.input.objective}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IAnalyzeWorkRequestParams>,
    _token: vscode.CancellationToken,
  ) {
    const { objective, workspaceContext } = options.input;

    // Use deterministic core engine (LLM enrichment happens in ai/risk-analyzer.ts)
    const riskAssessment = this.riskEngine.assess(objective, workspaceContext);
    const workflow = this.workflowGenerator.generate(riskAssessment);

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({
        type: riskAssessment.workType,
        complexity: riskAssessment.complexity,
        riskLevel: riskAssessment.riskLevel,
        processLevel: riskAssessment.processLevel,
        riskSignals: riskAssessment.signals,
        recommendedStages: workflow.stages.map(s => s.name),
        qualityGates: workflow.qualityGates.map(g => g.name),
      }, null, 2)),
    ]);
  }
}
```

### 5.2 Chat Participant (`@engineering`)

```jsonc
// package.json — contributes.chatParticipants
[
  {
    "id": "engineering-workspace.engineering",
    "name": "engineering",
    "fullName": "Engineering Workspace",
    "description": "Manage engineering workflows, analyze tasks, and track progress",
    "isSticky": false,
    "commands": [
      {
        "name": "status",
        "description": "Show current workflow status and progress"
      },
      {
        "name": "analyze",
        "description": "Analyze a work request for type, risk, and process level"
      },
      {
        "name": "history",
        "description": "Show recent workflow history"
      }
    ],
    "disambiguation": [
      {
        "category": "engineering_workflow",
        "description": "The user wants to manage, check, or interact with their software engineering workflow, development process, or task pipeline.",
        "examples": [
          "What stage is my workflow at?",
          "Analyze this feature request for risk",
          "What engineering process should I use for this task?",
          "Show my recent completed workflows",
          "What approvals are pending?"
        ]
      }
    ]
  }
]
```

### 5.3 Language Model API Usage (AI-Powered Analysis)

```typescript
// src/ai/model-access.ts — Defensive model selection with fallback
import * as vscode from 'vscode';

export class ModelAccess {
  private model: vscode.LanguageModelChat | null = null;

  async getModel(): Promise<vscode.LanguageModelChat | null> {
    if (this.model) return this.model;

    try {
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      this.model = models[0] ?? null;
    } catch {
      this.model = null;
    }
    return this.model;
  }

  get isAvailable(): boolean {
    return this.model !== null;
  }
}
```

```typescript
// src/ai/risk-analyzer.ts — LLM-enriched risk assessment with deterministic fallback
import * as vscode from 'vscode';
import { ModelAccess } from './model-access';
import { RiskEngine } from '../core/risk-engine';
import type { RiskAssessment } from '../core/types';

export class AiRiskAnalyzer {
  constructor(
    private readonly modelAccess: ModelAccess,
    private readonly fallbackEngine: RiskEngine,
  ) {}

  async analyze(objective: string, context?: string): Promise<RiskAssessment> {
    // Always compute deterministic baseline
    const baseline = this.fallbackEngine.assess(objective, context);

    // Try LLM enrichment
    const model = await this.modelAccess.getModel();
    if (!model) return baseline; // Graceful fallback

    try {
      const messages = [
        vscode.LanguageModelChatMessage.User(
          `You are a senior software engineer assessing risk for a development task.
          Analyze the following objective and return a JSON object with:
          - workType: "feature" | "bugfix" | "refactor" | "infrastructure" | "documentation" | "security"
          - complexity: "trivial" | "simple" | "moderate" | "complex" | "critical"
          - riskSignals: array of { type, signal, severity, impact }
          - processLevel: "light" | "standard" | "thorough" | "guarded"

          Objective: "${objective}"
          ${context ? `Project context: ${context}` : ''}

          Respond with ONLY valid JSON, no markdown.`
        ),
      ];

      const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
      let text = '';
      for await (const fragment of response.text) {
        text += fragment;
      }

      const parsed = JSON.parse(text);
      return { ...baseline, ...parsed, source: 'llm' };
    } catch {
      return { ...baseline, source: 'deterministic' };
    }
  }
}
```

### 5.4 AI Fallback Strategy

Every AI-powered feature has a deterministic fallback:

| Feature | LLM Available | LLM Unavailable |
|---------|--------------|-----------------|
| Risk Assessment | `ai/risk-analyzer.ts` — nuanced analysis | `core/risk-engine.ts` — keyword + pattern matching |
| Workflow Advice | `ai/workflow-advisor.ts` — contextual recommendations | `core/workflow-generator.ts` — rule-based generation |
| Project Context | `ai/context-enricher.ts` — semantic analysis | `core/context-analyzer.ts` — file pattern detection |
| Chat Participant | Full natural language responses | Structured responses from core logic |

**The extension MUST be fully functional without any LLM.** AI enriches; it never gates.

### 5.5 Skill Engine Architecture (DD-007)

The extension is powered by **24 engineering skills** from the `addyosmani/agent-skills` repository. Skills are **invisible plumbing** — users never see skill names, files, or configuration. They see workflow stages, quality gates, and agent actions.

#### Skill Classification

| Category | Skills | Extension Behavior |
|----------|--------|-------------------|
| **Always Active** (background policies) | `context-engineering`, `git-workflow-and-versioning`, `incremental-implementation` | Run silently — manage context, enforce commit discipline, constrain to thin slices |
| **Automatic by Task Type** | `spec-driven-development`, `planning-and-task-breakdown`, `test-driven-development`, `debugging-and-error-recovery`, `code-simplification`, `deprecation-and-migration`, `documentation-and-adrs` | Activated by workflow engine based on detected work type |
| **Automatic by Context** | `frontend-ui-engineering`, `browser-testing-with-devtools`, `api-and-interface-design`, `security-and-hardening`, `performance-optimization`, `observability-and-instrumentation`, `doubt-driven-development` | Activated when workspace analysis detects relevant patterns (UI files, API routes, auth code, etc.) |
| **Interactive** | `interview-me`, `idea-refine`, `spec-driven-development` (review), `planning-and-task-breakdown` (approval) | Require user interaction — power the objective capture, spec review, and plan approval flows |
| **Quality Gates** | `test-driven-development`, `code-review-and-quality`, `security-and-hardening`, `performance-optimization`, `shipping-and-launch` | Block stage progression until gate criteria are met |
| **Specialist Agents** | `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor` | Power review panels with specialist perspectives |

#### Skill Activation Rules

```typescript
// src/core/skill-engine.ts — Activation rule engine
export interface SkillActivationRules {
  // Always active (background policies)
  readonly always: readonly SkillId[];

  // Activated by work type
  readonly byTaskType: Readonly<Record<WorkType, readonly SkillId[]>>;

  // Activated by detected workspace context
  readonly byContext: Readonly<Record<ContextSignal, readonly SkillId[]>>;

  // Activated by process level (additive — higher levels include lower)
  readonly byProcessLevel: Readonly<Record<ProcessLevel, readonly SkillId[]>>;
}

export type ContextSignal =
  | 'touches_ui'
  | 'touches_api'
  | 'touches_auth_or_input'
  | 'touches_external_services'
  | 'performance_sensitive'
  | 'high_risk_decision';
```

#### Skill-to-Stage Mapping

```
ONBOARD          DEFINE           PLAN             BUILD
─────────        ─────────        ─────────        ─────────
context-eng.     interview-me     planning-and-    incremental-impl.
                 idea-refine      task-breakdown   test-driven-dev.
                 spec-driven-dev                   context-eng.
                 api-and-iface                     source-driven-dev.
                 documentation                     doubt-driven-dev.
                                                   frontend-ui-eng.
                                                   api-and-iface
                                                   observability

VERIFY           REVIEW           SHIP
─────────        ─────────        ─────────
test-driven-dev  code-review      shipping-launch
browser-testing  code-simplify    ci-cd-auto
security-hard.   security-hard.   git-workflow
performance-opt  performance-opt  documentation
                 documentation    observability
                 git-workflow
```

#### Skill Registry

```typescript
// src/core/skill-registry.ts — Catalog of all 24 skills
export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;                    // Human-readable (shown in advanced mode only)
  readonly userFacingLabel: string;          // What users see: "Code Review", not "code-review-and-quality"
  readonly category: SkillCategory;
  readonly lifecycleStages: readonly LifecycleStage[];
  readonly activationMode: 'always' | 'by-task-type' | 'by-context' | 'interactive' | 'quality-gate';
  readonly taskTypes: readonly WorkType[];   // Which work types trigger this skill
  readonly contextSignals: readonly ContextSignal[]; // Which context signals trigger this skill
  readonly minProcessLevel: ProcessLevel;    // Minimum process level to activate
  readonly isGate: boolean;                  // Does this skill block stage progression?
  readonly gateType: 'hard' | 'conditional' | 'none';
}
```

#### How the Workflow Engine Uses Skills

1. **Risk assessment** determines `WorkType`, `Complexity`, `RiskLevel` → `ProcessLevel`
2. **Skill engine** computes `activeSkills` = `always` ∪ `byTaskType[workType]` ∪ `byContext[signals]` ∪ `byProcessLevel[level]`
3. **Workflow generator** uses `activeSkills` to determine which stages to include, which quality gates to insert, and which approval levels to require
4. **Stage executor** (M2+) activates the relevant skills when entering each stage
5. **Quality gates** check skill-specific criteria before allowing stage progression

#### What Users See (DD-007: Skills Are Invisible)

| Internal Skill | User Sees |
|---------------|-----------|
| `spec-driven-development` | "Define" stage with spec artifact |
| `planning-and-task-breakdown` | "Plan" stage with task board |
| `test-driven-development` | "Testing" quality gate with pass/fail |
| `code-review-and-quality` | "Code Review" gate with 5-axis report |
| `security-and-hardening` | "Security Check" gate with findings |
| `performance-optimization` | "Performance Check" gate with metrics |
| `shipping-and-launch` | "Pre-Launch Checklist" in Ship stage |

---

## 6. Code Style

### Example: Core Module (Pure TypeScript, No VS Code Deps)

```typescript
// src/core/types.ts
export type ProcessLevel = 'light' | 'standard' | 'thorough' | 'guarded';
export type StageStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';
export type WorkType = 'feature' | 'bugfix' | 'refactor' | 'infrastructure' | 'documentation' | 'security';
export type Complexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';
export type LifecycleStage = 'onboard' | 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship';
export type SkillCategory = 'always' | 'by-task-type' | 'by-context' | 'interactive' | 'quality-gate' | 'specialist';

// All 24 skill IDs as a union type
export type SkillId =
  | 'context-engineering' | 'git-workflow-and-versioning' | 'incremental-implementation'
  | 'interview-me' | 'idea-refine' | 'spec-driven-development'
  | 'planning-and-task-breakdown' | 'test-driven-development'
  | 'source-driven-development' | 'doubt-driven-development'
  | 'frontend-ui-engineering' | 'api-and-interface-design'
  | 'browser-testing-with-devtools' | 'debugging-and-error-recovery'
  | 'code-review-and-quality' | 'code-simplification'
  | 'security-and-hardening' | 'performance-optimization'
  | 'observability-and-instrumentation' | 'documentation-and-adrs'
  | 'deprecation-and-migration' | 'ci-cd-and-automation'
  | 'shipping-and-launch' | 'using-agent-skills';

export type ContextSignal =
  | 'touches_ui' | 'touches_api' | 'touches_auth_or_input'
  | 'touches_external_services' | 'performance_sensitive' | 'high_risk_decision';

export interface RiskAssessment {
  readonly workType: WorkType;
  readonly complexity: Complexity;
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly processLevel: ProcessLevel;
  readonly signals: readonly RiskSignal[];
  readonly contextSignals: readonly ContextSignal[];
  readonly source: 'deterministic' | 'llm';
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: number;
  readonly objective: string;
  readonly processLevel: ProcessLevel;
  readonly detectedRisks: readonly RiskSignal[];
  readonly stages: readonly Stage[];
  readonly qualityGates: readonly QualityGate[];
  readonly approvals: readonly Approval[];
  readonly activeSkills: readonly SkillId[];
  readonly skillActivationReason: Readonly<Record<SkillId, string>>; // Why each skill was activated
  readonly state: WorkflowState;
}

export interface RiskSignal {
  readonly type: 'keyword' | 'file-pattern' | 'dependency' | 'scope';
  readonly signal: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly impact: string;
}
```

### Example: Preact Webview Component

```tsx
// src/webview/components/stage-list.tsx
import { h, FunctionComponent } from 'preact';
import { useComputed } from '@preact/signals';
import { workflowStore } from '../store/workflow.store';
import { Icon } from './icon';

interface StageData {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
}

// DD-018: No pipeline visualization — stages shown as a list with outcomes
export const StageList: FunctionComponent = () => {
  const stages = useComputed(() => workflowStore.value?.stages ?? []);

  return (
    <div class="stage-list">
      {stages.value.map((stage: StageData) => (
        <div key={stage.id} class={`stage stage--${stage.status}`}>
          <div class="stage__icon">
            <Icon name={getStageIcon(stage)} />
          </div>
          <div class="stage__body">
            <span class="stage__label">{stage.name}</span>
            <span class="stage__status">{stage.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

function getStageIcon(stage: StageData): string {
  switch (stage.status) {
    case 'completed': return 'check';
    case 'active': return 'loading~spin';
    case 'skipped': return 'circle-slash';
    default: return 'circle-outline';
  }
}
```

### Example: Preact Signal Store

```typescript
// src/webview/store/workflow.store.ts
import { signal, computed } from '@preact/signals';
import type { WorkflowDefinition } from '../../core/types';

export const workflowStore = signal<WorkflowDefinition | null>(null);
export const activeView = signal<string>('tasks');

export const isWorkflowActive = computed(() => workflowStore.value?.state.status === 'active');
export const currentStage = computed(() =>
  workflowStore.value?.stages.find(s => s.status === 'active')
);
export const progress = computed(() => {
  const wf = workflowStore.value;
  if (!wf) return 0;
  const completed = wf.stages.filter(s => s.status === 'completed').length;
  return Math.round((completed / wf.stages.length) * 100);
});
```

### Conventions

| Convention | Rule |
|-----------|------|
| **Naming** | `camelCase` for variables/functions, `PascalCase` for types/classes/components, `UPPER_SNAKE` for constants |
| **Files** | `kebab-case.ts` for logic, `kebab-case.tsx` for Preact components |
| **Exports** | Named exports only (no default exports) |
| **Immutability** | `readonly` on all interface properties; prefer `const` and spread over mutation |
| **Error handling** | Return `Result<T, E>` types for expected failures; throw only for programmer errors |
| **Async** | Always `async/await`, never raw `.then()` chains |
| **Components** | Functional components only; use `FunctionComponent` type from Preact |
| **State** | Preact signals for webview state; no `useState` for shared state |
| **CSS** | BEM naming (`block__element--modifier`); CSS custom properties for theming |
| **Imports** | Absolute from `src/` root using path aliases; group: vscode → preact → external → internal |

---

## 7. Testing Strategy

### Framework & Location

| Aspect | Choice |
|--------|--------|
| **Unit test framework** | Vitest 2.0+ |
| **Integration test framework** | `@vscode/test-electron` (M2) |
| **Test location** | `src/test/` mirroring `src/` structure |
| **Test naming** | `*.test.ts` |
| **Coverage tool** | Vitest built-in (v8 provider) |
| **Coverage target** | ≥ 80% on `src/core/`, ≥ 60% overall |

### Test Levels

| Level | What | Where | When |
|-------|------|-------|------|
| **Unit** | Core logic (workflow engine, risk engine, skill engine, state manager, event stream) | `src/test/core/` | Every commit |
| **Unit** | AI layer (with LM API mocked) | `src/test/ai/` | Every commit |
| **Unit** | Chat participant (with chat API mocked) | `src/test/chat/` | Every commit |
| **Unit** | Service layer (with VS Code API mocked) | `src/test/services/` | Every commit |
| **Integration** | Extension activation, command registration, webview loading | `src/test/integration/` | M2+ |
| **Visual** | Webview rendering matches prototype | Manual against `.designs/` | Per milestone |

### What Gets Tested

| Module | Test Focus | Example Tests |
|--------|-----------|---------------|
| `workflow-engine` | State transitions, invalid transitions rejected | "Standard workflow has 7 stages in correct order" |
| `risk-engine` | Risk signal detection, process level mapping | "Objective mentioning 'auth' returns high risk" |
| `workflow-generator` | Correct stages/gates/approvals per process level | "Standard + payment context adds security gate" |
| `skill-engine` | Skill activation by task type, context, process level | "Feature task activates spec-driven-development" |
| `skill-registry` | All 24 skills registered, metadata correct | "Registry contains 24 skills", "Each skill has valid lifecycle stages" |
| `event-stream` | Append, read, replay, file format | "Events are valid JSONL" |
| `state-manager` | Read/write/update workflow.json | "State survives write-read cycle" |
| `ai/risk-analyzer` | LLM path + fallback path | "Returns deterministic result when model unavailable" |
| `ai/model-access` | Model selection, error handling | "Returns null when no models available" |
| `chat/participant` | Command routing, response format | "/status returns workflow summary" |
| `context-analyzer` | Workspace detection | "Detects TypeScript + React project" |

---

## 8. Boundaries

### Always Do

- Run `npm test` before every commit
- Run `npm run typecheck` before every commit
- Follow the naming conventions in Section 6
- Keep `core/` free of VS Code API imports
- Provide deterministic fallback for every AI feature
- Use `readonly` on all interface properties
- Write unit tests for all core logic before implementation (TDD)
- Record all state changes as events in `events.jsonl`
- Validate JSON before writing to `.codestudio/`
- Use VS Code's `workspace.fs` API (not Node.js `fs`) for file operations
- Handle errors gracefully — never let the extension crash
- Use Preact signals (not useState) for shared webview state

### Ask First

- Adding a new npm dependency (justify the need)
- Changing the `.codestudio/` directory structure
- Modifying the `WorkflowDefinition` schema (DD-015)
- Adding a new VS Code command or contribution point
- Adding a new Language Model Tool
- Adding a new chat slash command
- Modifying the risk assessment rules
- Adding new process levels beyond the four defined

### Never Do

- Import `vscode` in `src/core/` modules
- Use `eval()` or `Function()` in webview code
- Store secrets or API keys in `.codestudio/`
- Use synchronous file I/O (`fs.readFileSync`, etc.)
- Commit `node_modules/` or build artifacts
- Remove or weaken existing tests without approval
- Use `any` type (use `unknown` + type guards instead)
- Mutate shared state directly (always create new objects)
- Gate any feature behind LLM availability (always have fallback)
- Use React instead of Preact (alias if needed for compat)

---

## 9. Success Criteria

### Milestone 1: Foundation (Target: 2 weeks)

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Extension activates in Code Studio without errors | `sfcode --install-extension` + check Output panel |
| 2 | Sidebar shows 5 navigation items with correct icons | Visual check against prototype |
| 3 | Tasks view renders empty state with objective input | Visual check |
| 4 | Risk assessment engine returns correct process level for 10+ test cases | `npm test` — risk-engine.test.ts |
| 5 | AI risk analyzer uses LLM when available, falls back gracefully | `npm test` — risk-analyzer.test.ts |
| 6 | Workflow can be created, stages transition correctly | `npm test` — workflow-engine.test.ts |
| 7 | `.codestudio/` directory is created on first activation | File system check |
| 8 | `workflow.json` persists and loads across restarts | Manual test: restart Code Studio |
| 9 | `events.jsonl` records all state changes | Read file after workflow operations |
| 10 | Project context auto-generated in `context.md` | File content check |
| 11 | `@engineering` chat participant responds to `/status` and `/analyze` | Chat interaction test |
| 12 | `analyze_work_request` tool appears in agent mode tool list | Agent mode check |
| 13 | `get_workflow_status` tool returns current state | Agent mode check |
| 14 | Skill engine activates correct skills for each work type + context | `npm test` — skill-engine.test.ts |
| 15 | Skill registry contains all 24 skills with correct metadata | `npm test` — skill-registry.test.ts |
| 16 | Workflow generator uses active skills to determine stages/gates | `npm test` — workflow-generator.test.ts |
| 17 | Status bar shows current workflow state | Visual check |
| 18 | All unit tests pass with ≥ 80% coverage on `core/` | `npm run test:coverage` |
| 19 | Webview bundle < 100KB (Preact + all components) | `ls -la out/` |
| 20 | Extension host bundle < 400KB | `ls -la out/` |
| 21 | Activation time < 500ms | Console timing in extension.ts |

### Milestone 2: Interactive Views + Full Chat (Target: 2 weeks after M1)

| # | Criterion | Verification |
|---|-----------|-------------|
| 22 | Tasks view shows stages with inline expansion (DD-019) | Visual check |
| 23 | Tasks view Artifacts tab shows generated specs/plans (DD-020) | Visual check |
| 24 | Tasks view Approvals tab shows pending items with approve/reject (DD-020) | Visual check |
| 25 | Capabilities view shows context-aware recommendations, deep links to native Agent Customizations, and Skill Pack Marketplace (DD-022–DD-026) | Visual check |
| 26 | History view shows archived workflows with inline expansion | Visual check |
| 27 | Settings view allows configuration changes (incl. skill visibility in advanced mode) | Visual check |
| 28 | Chat participant handles natural language queries beyond slash commands | Chat test |
| 29 | `get_project_context` tool returns enriched context | Agent mode check |

### Milestone 3: Agent Integration + Polish (Target: 1 week after M2)

| # | Criterion | Verification |
|---|-----------|-------------|
| 30 | History tiering (hot/warm/cold) works correctly | Unit tests |
| 31 | Workflow complete state shows summary + archive button | Visual check |
| 32 | All 5 views are fully functional and match prototype | Full walkthrough |
| 33 | Chat participant provides contextual follow-up suggestions | Chat test |
| 34 | Advanced mode shows active skills per stage (V2 prep) | Visual check |

---

## 10. Open Questions

| # | Question | Impact | Default If Unanswered |
|---|----------|--------|----------------------|
| 1 | Should we use a single webview panel with client-side routing, or separate webview panels per view? | Architecture | **Single panel with Preact router** (simpler, matches prototype) |
| 2 | Should the extension contribute to the Activity Bar or Secondary Sidebar? | UX | **Activity Bar** (primary tool, needs visibility) |
| 3 | What is the extension's publisher ID for the marketplace? | Packaging | `syncfusion` (assumed) |
| 4 | Should `.codestudio/` be added to `.gitignore` by default, or committed? | DD-002 | **Committed** (per DD-002) |
| 5 | Should the chat participant use `@vscode/prompt-tsx` for prompt composition or plain strings? | AI quality | **`@vscode/prompt-tsx`** (better token management) |
| 6 | Should Language Model Tools require user confirmation or auto-approve? | UX | **Auto-approve for read-only tools** (status, context); **confirm for mutations** (analyze) |

---

## 11. Milestone Breakdown

### M1: Foundation & Shell (This Spec)
- Extension scaffold + build pipeline (esbuild dual-bundle: extension + Preact webview)
- Core types (DD-015 schema + skill types)
- State persistence (`.codestudio/` read/write)
- Event sourcing (JSONL append/read)
- **Skill registry** (24 skills with metadata, lifecycle stages, activation config)
- **Skill engine** (activation rules by task type, context signals, process level)
- Workflow engine (state machine)
- Risk assessment engine (deterministic rules + context signal detection)
- AI risk analyzer (LLM-powered with fallback)
- Workflow generator (uses active skills to determine stages/gates/approvals)
- Sidebar webview with Preact (5-view navigation: Tasks, Capabilities, Knowledge, History, Settings)
- Tasks view (all 3 states: empty/active/complete, with Stages/Artifacts/Approvals tabs)
- Project context analyzer
- Status bar integration
- Chat participant (`@engineering` with `/status`, `/analyze`, `/history`)
- Language Model Tools (3 tools for agent mode)
- Unit tests (≥ 80% on core/)

### M2: Interactive Views + Full Chat (Next Spec)
- Tasks view: Stages tab with inline expansion (DD-019)
- Tasks view: Artifacts tab with markdown rendering (DD-020)
- Tasks view: Approvals tab with approve/reject actions (DD-020)
- Capabilities view: smart launcher — recommendations + deep links to native Agent Customizations + Skill Pack Marketplace (DD-022–DD-026)
- Knowledge view: project context, ADRs, conventions, boundaries (DD-021)
- History view with inline expansion
- Settings view with configuration
- Enhanced chat participant (natural language beyond slash commands)
- Webview ↔ Extension host message protocol (full)

### M3: Agent Integration (Future Spec)
- Skill orchestration engine
- Agent execution (TDD cycle, code generation)
- Real-time agent activity streaming
- Approval workflow with artifact review
- Chat participant follow-up suggestions

---

*This spec covers M1. M2 and M3 will have their own specs built on this foundation.*
