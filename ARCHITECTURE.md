# Engineering Workspace — Revised Architecture

**Version:** 2.0  
**Date:** 11 July 2026  
**Status:** Accepted  
**Supersedes:** SPEC.md v1 AI architecture (§5.3 direct LLM calls)

---

## Core Principle: Extension is Viewer + Orchestrator, Agent is the Worker

The extension does NOT call the Language Model API to generate artifacts (specs, plans, reviews). Instead, it **delegates to the agent** via chat/agent mode and **watches for results** via filesystem watchers.

```
┌──────────────────────────────────────────────────────────────┐
│                    EXTENSION (Orchestrator + Viewer)           │
│                                                               │
│  DOES:                              DOES NOT:                 │
│  ✅ Scan workspace                  ❌ Generate specs          │
│  ✅ Detect project context          ❌ Generate plans          │
│  ✅ Assess risk                     ❌ Write code              │
│  ✅ Create workflow                 ❌ Run reviews             │
│  ✅ Track stage state               ❌ Call LLM for content    │
│  ✅ Watch .codestudio/ for changes                            │
│  ✅ Validate artifacts                                        │
│  ✅ Show UI (stages, artifacts, gates)                        │
│  ✅ Send prompts to agent                                     │
│  ✅ Manage approvals                                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
          Sends prompt │ via chat participant / agent mode
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    AGENT (Worker)                              │
│                                                               │
│  ✅ Reads workspace files (built-in capability)               │
│  ✅ Understands project context (built-in capability)         │
│  ✅ Generates spec → saves to .codestudio/artifacts/specs/    │
│  ✅ Generates plan → saves to .codestudio/artifacts/plans/    │
│  ✅ Implements code → commits                                 │
│  ✅ Runs tests → reports results                              │
│  ✅ Reviews code → saves to .codestudio/artifacts/reviews/    │
└──────────────────────┬───────────────────────────────────────┘
                       │
          File changes │ in .codestudio/
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    EXTENSION (Watcher)                         │
│                                                               │
│  FileSystemWatcher detects new/changed files in:              │
│    .codestudio/workflows/current/artifacts/                   │
│                                                               │
│  → Reads artifact → Validates structure                       │
│  → Updates workflow state → Notifies webview                  │
│  → UI shows: "Spec generated ✅ — Review & Approve"           │
└──────────────────────────────────────────────────────────────┘
```

---

## Where the Language Model API IS Used

The extension uses `vscode.lm` for **small, focused, internal intelligence** — NOT for generating user-facing artifacts:

| Use Case                  | API                                 | Purpose                                                                                                       |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Risk Assessment**       | `vscode.lm.sendRequest`             | Enrich deterministic risk analysis with LLM nuance. Fallback: keyword-based `RiskEngine`.                     |
| **LM Tools** (agent mode) | `vscode.lm.registerTool`            | `analyze_work_request`, `get_workflow_status`, `get_project_context` — tools the agent invokes automatically. |
| **Chat Participant**      | `vscode.chat.createChatParticipant` | `@engineering /status`, `/analyze`, `/history` — user queries about workflow state.                           |

The extension NEVER uses `vscode.lm` to generate specs, plans, task breakdowns, or reviews. That's the agent's job.

---

## The Three Interaction Modes

### Mode 1: Sidebar Webview (Primary UI)

The sidebar shows the workflow state, stages, artifacts, gates, approvals. The user interacts with buttons:

```
[Start Building] → creates workflow, sends prompt to agent
[Generate Spec]  → sends prompt to agent chat
[Approve]        → marks approval as granted, checks if stage can advance
[Complete Stage] → checks gates/artifacts, advances if ready
```

### Mode 2: Chat Participant (@engineering)

The `@engineering` chat participant handles queries:

```
@engineering /status     → shows current workflow state
@engineering /analyze    → analyzes an objective for risk
@engineering /history    → shows past workflows
@engineering generate spec for "Add OAuth2 auth"
                         → agent generates spec, saves to .codestudio/
```

### Mode 3: Agent Mode (LM Tools)

In agent mode, the agent automatically invokes our tools:

```
Agent sees user request → invokes analyze_work_request tool
                        → gets risk assessment + recommended process
                        → uses that to guide its work
```

---

## Revised Component Architecture

```
src/
├── core/                          # Pure TypeScript — NO vscode imports
│   ├── types.ts                   # All interfaces and types
│   ├── risk-engine.ts             # Deterministic risk assessment
│   ├── workflow-engine.ts         # State machine (create/start/advance/skip/complete)
│   ├── workflow-generator.ts      # Dynamic workflow builder (stages/gates/approvals)
│   ├── skill-registry.ts          # 28 skill definitions (metadata only)
│   ├── skill-engine.ts            # Skill activation rules
│   ├── stage-executor.ts          # What each stage needs (artifacts/gates/skills)
│   ├── gate-runner.ts             # Quality gate evaluation
│   ├── event-stream.ts            # Append-only JSONL event log
│   ├── state-manager.ts           # Read/write workflow.json
│   ├── project-detector.ts        # Detect languages/frameworks/conventions
│   ├── context-analyzer.ts        # Generate context.md markdown
│   ├── context-signal-detector.ts # Detect context signals (UI/API/auth/etc.)
│   ├── capability-recommender.ts  # Context-aware recommendations
│   ├── skill-pack-catalog.ts      # 14 Syncfusion skill packs
│   └── prompt-templates.ts        # ← NEW: Prompt templates per stage
│
├── ai/                            # Uses vscode.lm — ONLY for internal intelligence
│   ├── model-access.ts            # LM API abstraction (injectable)
│   ├── risk-analyzer.ts           # LLM-enriched risk assessment
│   └── tools/                     # Language Model Tools (agent mode)
│       ├── analyze-work-request.tool.ts
│       ├── get-workflow-status.tool.ts
│       └── get-project-context.tool.ts
│
├── chat/                          # Chat Participant (@engineering)
│   └── chat-participant.ts        # Handles /status, /analyze, /history + agent delegation
│
├── services/                      # VS Code API integration
│   ├── file-system.service.ts     # .codestudio/ file operations
│   ├── git.service.ts             # Git branch detection
│   ├── workspace.service.ts       # Workspace config
│   ├── notification.service.ts    # Status bar + notifications
│   ├── workspace-scanner.service.ts # Scan workspace files
│   ├── onboarding.service.ts      # Initialize .codestudio/ + detect project
│   ├── artifact-manager.service.ts # Read/write/list artifacts
│   ├── artifact-watcher.service.ts # ← NEW: FileSystemWatcher for .codestudio/artifacts/
│   └── agent-bridge.service.ts    # ← NEW: Send prompts to agent via chat API
│
├── views/                         # Webview providers (extension host side)
│   ├── panel-provider.ts          # WebviewViewProvider
│   ├── message-handler.ts         # postMessage protocol handler
│   ├── navigation-tree.ts         # Sidebar tree view
│   └── sidebar-provider.ts        # Sidebar webview provider
│
├── webview/                       # Preact webview (runs in iframe)
│   ├── app.tsx                    # Root component
│   ├── bridge.ts                  # postMessage bridge
│   ├── store/workflow.store.ts    # Signal-based state
│   ├── views/                     # 5 view components
│   └── components/                # Reusable UI components
│
└── extension.ts                   # Entry point — wires everything
```

### What's NEW vs What EXISTS

| Component                              | Status     | Change                                                     |
| -------------------------------------- | ---------- | ---------------------------------------------------------- |
| `core/prompt-templates.ts`             | **NEW**    | Pre-built prompt strings per stage                         |
| `services/artifact-watcher.service.ts` | **NEW**    | Watches `.codestudio/artifacts/` for file changes          |
| `services/agent-bridge.service.ts`     | **NEW**    | Sends prompts to agent via chat API                        |
| `core/stage-executor.ts`               | **MODIFY** | Remove LLM generation logic, add prompt template selection |
| `views/message-handler.ts`             | **MODIFY** | Add `generateArtifact` → delegates to agent bridge         |
| `chat/chat-participant.ts`             | **MODIFY** | Handle artifact generation requests from extension         |
| `extension.ts`                         | **MODIFY** | Wire watcher + agent bridge                                |
| Everything else                        | **KEEP**   | No changes needed                                          |

### What Gets REMOVED

| Component                                     | Why                                  |
| --------------------------------------------- | ------------------------------------ |
| Direct LLM calls for artifact generation      | Agent does this, not extension       |
| `context-enricher.ts` (was planned)           | Agent already reads workspace files  |
| Complex prompt building with token management | Agent handles its own context window |

---

## Detailed Flow: From Objective to Completed Workflow

### Phase 1: Onboarding (Automatic — Already Built ✅)

```
Extension activates
  → OnboardingService.initialize()
  → Creates .codestudio/ directory tree
  → WorkspaceScanner.scan() → ProjectDetector.detect()
  → Generates context.md
  → Creates config.json
  → Status bar: "🏗️ brownfield" or "🌱 greenfield"
```

### Phase 2: Objective & Analysis (Already Built ✅)

```
User types objective in Tasks view
  → Clicks "Analyze & Plan"
  → RiskEngine.assess() + ContextSignalDetector.detect()
  → Shows: type, risk, process level, signals
  → User clicks "Start Building"
  → WorkflowGenerator.generate() → WorkflowEngine.start()
  → Saves workflow.json + objective.md
  → First stage (ONBOARD) becomes active
```

### Phase 3: ONBOARD Stage (Auto-advance — Needs Wiring)

```
ONBOARD stage active
  → StageExecutor: no artifacts needed, autoAdvance=true
  → Extension auto-advances to DEFINE
```

### Phase 4: DEFINE Stage (Agent Generates Spec — NEW)

```
DEFINE stage active
  → UI shows: "Spec needed — [Generate Spec]"
  → User clicks "Generate Spec"
  → AgentBridge sends prompt to chat:
    ┌──────────────────────────────────────────────────┐
    │ Generate a specification for this work request.   │
    │                                                   │
    │ Objective: {objective}                            │
    │ Process Level: {processLevel}                     │
    │ Risk Signals: {signals}                           │
    │                                                   │
    │ Instructions:                                     │
    │ 1. Scan the workspace to understand the codebase  │
    │ 2. Write a spec covering:                         │
    │    - Objective & success criteria                 │
    │    - Tech stack & commands                        │
    │    - Project structure                            │
    │    - Code style (match existing patterns)         │
    │    - Testing strategy                             │
    │    - Boundaries (always/ask first/never)          │
    │ 3. Save to: .codestudio/workflows/current/        │
    │    artifacts/specs/{slug}.md                      │
    └──────────────────────────────────────────────────┘
  → Agent scans workspace, generates spec, saves file
  → ArtifactWatcher detects new file in artifacts/specs/
  → Extension reads file → updates workflow state
  → UI shows: "Spec ready ✅ — [Review & Approve]"
  → User reviews → clicks Approve
  → spec-approved gate passes → advance to PLAN
```

### Phase 5: PLAN Stage (Agent Generates Plan — NEW)

```
PLAN stage active
  → UI shows: "Plan needed — [Generate Plan]"
  → User clicks "Generate Plan"
  → AgentBridge sends prompt:
    "Read the spec at .codestudio/.../specs/{name}.md
     Break it into tasks. Save to .codestudio/.../plans/{name}.md"
  → Agent reads spec, generates plan, saves file
  → ArtifactWatcher detects → UI shows plan → User approves
  → plan-approved gate passes → advance to BUILD
```

### Phase 6: BUILD Stage (Agent Implements — Existing Agent Mode)

```
BUILD stage active
  → UI shows: tasks from plan, current task highlighted
  → User works with agent in editor/chat to implement
  → Extension tracks: which tasks are done (via git commits or manual check)
  → All tasks done → advance to VERIFY
```

### Phase 7: VERIFY Stage (Extension Runs Checks — NEW)

```
VERIFY stage active
  → Extension runs: npm test, npm run build, npm run typecheck
  → Collects results → saves report to artifacts/reports/
  → tests-pass gate: pass or fail
  → If pass → advance to REVIEW
```

### Phase 8: REVIEW Stage (Agent Reviews — NEW)

```
REVIEW stage active
  → AgentBridge sends prompt:
    "Review the changes made in this workflow. 5-axis review.
     Save to .codestudio/.../reviews/{name}.md"
  → Agent reviews → saves review file
  → ArtifactWatcher detects → UI shows review → User approves
  → code-review gate passes → advance to SHIP
```

### Phase 9: SHIP Stage

```
SHIP stage active
  → UI shows pre-launch checklist
  → User confirms → workflow completes
  → Archive workflow to .codestudio/archive/
```

---

## The Three NEW Components

### 1. PromptTemplates (`src/core/prompt-templates.ts`)

Pure TypeScript. Returns prompt strings per stage with placeholders filled in.

```typescript
class PromptTemplates {
  getDefinePrompt(objective, context, riskSignals): string;
  getPlanPrompt(objective, specPath): string;
  getReviewPrompt(objective, changedFiles): string;
  getVerifyPrompt(testCommand, buildCommand): string;
}
```

No LLM calls. Just string templates. The agent receives these as instructions.

### 2. ArtifactWatcher (`src/services/artifact-watcher.service.ts`)

Uses `vscode.workspace.createFileSystemWatcher` to watch `.codestudio/workflows/current/artifacts/**/*.md`.

```typescript
class ArtifactWatcher {
  constructor(rootPath, artifactManager, stateManager)

  // Starts watching. Returns disposable.
  start(): vscode.Disposable

  // Called when a new artifact file is created/changed
  onArtifactChanged(uri): void
    → reads file
    → determines type (spec/plan/review/report) from path
    → updates workflow state
    → notifies webview
}
```

### 3. AgentBridge (`src/services/agent-bridge.service.ts`)

Sends prompts to the agent via VS Code's chat API.

```typescript
class AgentBridge {
  // Send a prompt to the agent via chat
  async sendToAgent(prompt: string): Promise<void>
    → vscode.commands.executeCommand('workbench.action.chat.open', {
        query: prompt
      })

  // Or via the chat participant
  async sendViaParticipant(prompt: string): Promise<void>
    → vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `@engineering ${prompt}`
      })
}
```

---

## What Stays, What Changes, What's Removed

### KEEP (No Changes)

| Component                               | Tests   | Why Keep                      |
| --------------------------------------- | ------- | ----------------------------- |
| `core/types.ts`                         | —       | Shared vocabulary             |
| `core/risk-engine.ts`                   | 33      | Deterministic risk assessment |
| `core/workflow-engine.ts`               | 20      | State machine                 |
| `core/workflow-generator.ts`            | 25      | Dynamic workflow builder      |
| `core/skill-registry.ts`                | 34      | Skill metadata                |
| `core/skill-engine.ts`                  | 27      | Skill activation              |
| `core/event-stream.ts`                  | 11      | Audit log                     |
| `core/state-manager.ts`                 | 11      | Workflow persistence          |
| `core/project-detector.ts`              | 29      | Stack detection               |
| `core/context-analyzer.ts`              | 8       | Context markdown              |
| `core/context-signal-detector.ts`       | 22      | Signal detection              |
| `core/capability-recommender.ts`        | 14      | Recommendations               |
| `core/skill-pack-catalog.ts`            | 12      | Syncfusion packs              |
| `core/stage-executor.ts`                | 14      | Stage requirements            |
| `core/gate-runner.ts`                   | 17      | Gate evaluation               |
| `services/file-system.service.ts`       | 14      | File I/O                      |
| `services/workspace-scanner.service.ts` | 16      | File scanning                 |
| `services/onboarding.service.ts`        | 15      | Init pipeline                 |
| `services/artifact-manager.service.ts`  | 13      | Artifact CRUD                 |
| `services/git.service.ts`               | —       | Git ops                       |
| `services/workspace.service.ts`         | 5       | Config                        |
| `services/notification.service.ts`      | 4       | Status bar                    |
| `ai/model-access.ts`                    | —       | LM abstraction                |
| `ai/risk-analyzer.ts`                   | 6       | LLM risk enrichment           |
| `ai/tools/*.ts`                         | 11      | Agent mode tools              |
| `views/message-handler.ts`              | 20      | Message routing               |
| `webview/*`                             | —       | UI shell                      |
| **Total**                               | **382** |                               |

### MODIFY

| Component                      | What Changes                                              |
| ------------------------------ | --------------------------------------------------------- |
| `views/message-handler.ts`     | Add `generateArtifact` message → calls AgentBridge        |
| `core/types.ts`                | Add `generateArtifact` to MessageToHost                   |
| `chat/chat-participant.ts`     | Handle artifact generation prompts from agent bridge      |
| `extension.ts`                 | Wire ArtifactWatcher + AgentBridge + auto-advance ONBOARD |
| `webview/views/tasks-view.tsx` | Add "Generate Spec/Plan" buttons, show watcher status     |

### ADD

| Component                              | Purpose                                  |
| -------------------------------------- | ---------------------------------------- |
| `core/prompt-templates.ts`             | Prompt strings per stage                 |
| `services/artifact-watcher.service.ts` | Watch .codestudio/artifacts/ for changes |
| `services/agent-bridge.service.ts`     | Send prompts to agent chat               |

### REMOVE (Not Needed)

| Was Planned                                  | Why Not Needed                  |
| -------------------------------------------- | ------------------------------- |
| Direct LLM artifact generation               | Agent does this                 |
| Context enricher (read source files for LLM) | Agent already reads files       |
| Token budget management                      | Agent manages its own context   |
| Prompt-tsx integration                       | Simple string templates suffice |
| Streaming response handling for artifacts    | Agent writes files directly     |

---

## Implementation Plan

### Phase 1: Foundation (3 tasks)

| Task     | Description                                                                                                                                                         | Depends On      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **P1-1** | `core/prompt-templates.ts` — Prompt templates for DEFINE, PLAN, REVIEW, VERIFY, SHIP stages. Pure TypeScript, no deps. Unit tests.                                  | Nothing         |
| **P1-2** | `services/agent-bridge.service.ts` — Send prompts to agent via `vscode.commands.executeCommand('workbench.action.chat.open')`.                                      | Nothing         |
| **P1-3** | `services/artifact-watcher.service.ts` — FileSystemWatcher for `.codestudio/artifacts/**/*.md`. On change: read file, determine type, update state, notify webview. | ArtifactManager |

### Phase 2: Wiring (3 tasks)

| Task     | Description                                                                                                                                 | Depends On |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **P2-1** | Update `types.ts` + `message-handler.ts` — Add `generateArtifact` message type. Handler calls AgentBridge with prompt from PromptTemplates. | P1-1, P1-2 |
| **P2-2** | Update `extension.ts` — Wire ArtifactWatcher, AgentBridge. Auto-advance ONBOARD stage on workflow start.                                    | P1-2, P1-3 |
| **P2-3** | Update `chat-participant.ts` — When agent bridge sends a prompt, the chat participant can handle it and delegate to the agent.              | P1-2       |

### Phase 3: UI (2 tasks)

| Task     | Description                                                                                                                                               | Depends On |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **P3-1** | Update `tasks-view.tsx` — Add "Generate Spec" / "Generate Plan" buttons on active stages. Show "Waiting for agent..." state. Show artifact when detected. | P2-1       |
| **P3-2** | Update `tasks-view.tsx` — Artifacts tab shows real artifacts from ArtifactManager. Review/approve flow connected to gates.                                | P2-1       |

### Phase 4: Remaining Views (4 tasks)

| Task     | Description                                                             | Depends On            |
| -------- | ----------------------------------------------------------------------- | --------------------- |
| **P4-1** | `knowledge-view.tsx` — Show real context.md, conventions, boundaries    | Onboarding            |
| **P4-2** | `capabilities-view.tsx` — Real recommendations + Syncfusion marketplace | CapabilityRecommender |
| **P4-3** | `history-view.tsx` — Load archived workflows                            | Archive system        |
| **P4-4** | `settings-view.tsx` — Read/write config.json                            | Config                |

### Phase 5: Polish (2 tasks)

| Task     | Description                                                                                | Depends On |
| -------- | ------------------------------------------------------------------------------------------ | ---------- |
| **P5-1** | Chat participant real handlers — `/status` with real data, `/analyze` with real assessment | All        |
| **P5-2** | Integration testing — Full flow: objective → spec → plan → build → verify → review → ship  | All        |

---

## Summary

**The key insight:** The extension is a **workflow orchestrator and viewer**, not an AI content generator. The agent (via chat/agent mode) is the worker that scans the workspace, generates artifacts, writes code, and runs reviews. The extension tells the agent what to do (via prompts), watches for results (via file watchers), and shows progress (via the webview UI).

This is simpler, more reliable, and leverages the agent's existing capabilities instead of trying to replicate them.
