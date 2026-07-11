# Task List: Engineering Workspace Extension (M1)

**Plan:** `tasks/plan.md`  
**Spec:** `SPEC.md` v2.0

---

## Slice A: Foundation

### Task 1: Project Scaffold

**Description:** Create the extension project structure with package.json (including all VS Code contribution points for chat participant, language model tools, webview), TypeScript configs (separate for extension host and Preact webview), esbuild dual-bundle config, Vitest setup, ESLint, Prettier, and VS Code debug launch config.

**Acceptance criteria:**
- [ ] `package.json` has correct `contributes` section (commands, viewsContainers, views, chatParticipants, languageModelTools)
- [ ] `tsconfig.json` targets Node.js (extension host) with strict mode
- [ ] `tsconfig.webview.json` targets ES2020 with `jsxImportSource: "preact"` and `jsx: "react-jsx"`
- [ ] `esbuild.config.mjs` produces two bundles: `out/extension.js` (CJS, Node) and `out/webview.js` (ESM, browser)
- [ ] `vitest.config.ts` configured with v8 coverage provider
- [ ] `.eslintrc.json` with `@typescript-eslint` rules
- [ ] `.prettierrc` with consistent formatting
- [ ] `.vscode/launch.json` with Extension Development Host debug config
- [ ] `.vscode/tasks.json` with build/watch tasks
- [ ] `.vscodeignore` excludes src/, test/, node_modules/
- [ ] `npm install` succeeds without errors
- [ ] `npm run typecheck` passes (no source files yet, but config is valid)
- [ ] `npm run build` produces output in `out/`

**Verification:**
- [ ] `npm install && npm run typecheck && npm run build`
- [ ] `npm test` runs (0 tests, exits clean)

**Dependencies:** None

**Files created:**
- `package.json`
- `tsconfig.json`
- `tsconfig.webview.json`
- `esbuild.config.mjs`
- `vitest.config.ts`
- `.eslintrc.json`
- `.prettierrc`
- `.vscode/launch.json`
- `.vscode/tasks.json`
- `.vscode/settings.json`
- `.vscodeignore`
- `src/extension.ts` (minimal activate/deactivate stub)
- `src/webview/index.tsx` (minimal Preact render stub)

---

### Task 2: Core Types

**Description:** Define all TypeScript interfaces and types from DD-015 schema in `src/core/types.ts`. This is the shared vocabulary for the entire extension — workflow definitions, risk signals, stages, events, project context, etc.

**Acceptance criteria:**
- [ ] All types from SPEC.md Section 6 are defined
- [ ] All properties are `readonly`
- [ ] `Result<T, E>` utility type is defined
- [ ] `WorkflowDefinition`, `RiskAssessment`, `RiskSignal`, `Stage`, `QualityGate`, `Approval` interfaces complete
- [ ] `WorkflowEvent` discriminated union for event sourcing
- [ ] `ProjectContext` interface for context analyzer output
- [ ] `ProcessLevel`, `StageStatus`, `WorkType`, `Complexity` literal union types
- [ ] `MessageProtocol` types for webview ↔ extension host communication
- [ ] `ChatCommand` types for chat participant
- [ ] `ToolInput` types for language model tools
- [ ] File compiles with `npm run typecheck`

**Verification:**
- [ ] `npm run typecheck` passes
- [ ] No `any` types used

**Dependencies:** Task 1

**Files created:**
- `src/core/types.ts`
- `src/constants.ts`

---

## Slice B: Core Engine

### Task 3: Event Stream

**Description:** Implement append-only JSONL event logger (DD-008). Events are the source of truth — workflow state can be reconstructed by replaying events. Pure TypeScript, no VS Code deps. Uses injected file I/O interface for testability.

**Acceptance criteria:**
- [ ] `EventStream` class with `append(event)`, `read()`, `replay()` methods
- [ ] Events are serialized as one JSON object per line (JSONL format)
- [ ] Each event has `id`, `timestamp`, `type`, `payload` fields
- [ ] `replay()` returns events in chronological order
- [ ] File I/O is injected via interface (not imported from vscode or fs)
- [ ] Invalid JSON lines are skipped with warning (not crash)
- [ ] 8+ unit tests covering append, read, replay, empty file, corrupt line

**Verification:**
- [ ] `npm test -- --grep "EventStream"` — all pass
- [ ] Coverage ≥ 90% on event-stream.ts

**Dependencies:** Task 2

**Files created:**
- `src/core/event-stream.ts`
- `src/test/core/event-stream.test.ts`
- `src/test/fixtures/sample-events.jsonl`

---

### Task 4: State Manager

**Description:** Implement read/write for `workflow.json` — the current workflow state file in `.codestudio/`. Pure TypeScript with injected file I/O. Handles missing file (first run), corrupt file (recovery), and concurrent access (last-write-wins with version check).

**Acceptance criteria:**
- [ ] `StateManager` class with `load()`, `save(state)`, `update(fn)` methods
- [ ] `load()` returns `null` for missing file (first run)
- [ ] `save()` validates JSON before writing
- [ ] `update()` is atomic: load → transform → save with version bump
- [ ] Version mismatch detection (optimistic concurrency)
- [ ] File I/O injected via interface
- [ ] 8+ unit tests covering load, save, update, missing file, corrupt file, version conflict

**Verification:**
- [ ] `npm test -- --grep "StateManager"` — all pass
- [ ] Coverage ≥ 90% on state-manager.ts

**Dependencies:** Task 2

**Files created:**
- `src/core/state-manager.ts`
- `src/test/core/state-manager.test.ts`
- `src/test/fixtures/sample-workflow.json`

---

### Task 5: Risk Engine (Deterministic)

**Description:** Implement keyword + pattern-based risk assessment. This is the deterministic fallback that works without any LLM. Analyzes objective text for risk signals (auth, payment, database, security keywords), detects work type, estimates complexity, and maps to process level.

**Acceptance criteria:**
- [ ] `RiskEngine` class with `assess(objective, context?)` method
- [ ] Detects work type from objective keywords (feature, bugfix, refactor, etc.)
- [ ] Detects risk signals: security keywords, infrastructure patterns, scope indicators
- [ ] Maps (workType + complexity + riskSignals) → ProcessLevel using DD-001 rules
- [ ] Returns `RiskAssessment` with `source: 'deterministic'`
- [ ] 15+ unit tests covering all work types, risk levels, edge cases
- [ ] "Add login page" → high risk (auth), standard+ process
- [ ] "Fix typo in README" → low risk, light process
- [ ] "Refactor payment module" → high risk (payment + refactor), thorough process

**Verification:**
- [ ] `npm test -- --grep "RiskEngine"` — all pass
- [ ] Coverage ≥ 90% on risk-engine.ts

**Dependencies:** Task 2

**Files created:**
- `src/core/risk-engine.ts`
- `src/test/core/risk-engine.test.ts`

---

### Task 6: Workflow Engine

**Description:** Implement the state machine for workflow lifecycle. Manages stage transitions (pending → active → completed/skipped), enforces ordering, validates transitions, and emits events for each state change.

**Acceptance criteria:**
- [ ] `WorkflowEngine` class with `create(assessment, workflow)`, `advanceStage()`, `skipStage()`, `completeWorkflow()` methods
- [ ] Enforces valid transitions: pending→active, active→completed, active→skipped
- [ ] Rejects invalid transitions (e.g., pending→completed, completed→active)
- [ ] Auto-advances to next stage when current completes
- [ ] Emits events via injected `EventStream`
- [ ] Workflow states: `idle`, `active`, `completed`, `failed`
- [ ] Stage ordering is enforced (can't skip ahead without marking intermediate as skipped)
- [ ] 12+ unit tests covering create, advance, skip, complete, invalid transitions, event emission

**Verification:**
- [ ] `npm test -- --grep "WorkflowEngine"` — all pass
- [ ] Coverage ≥ 85% on workflow-engine.ts

**Dependencies:** Tasks 2, 3

**Files created:**
- `src/core/workflow-engine.ts`
- `src/test/core/workflow-engine.test.ts`

---

## Slice C: Intelligence

### Task 7a: Skill Registry

**Description:** Define the catalog of all 24 engineering skills from the `addyosmani/agent-skills` repository. Each skill has metadata: ID, human-readable name, user-facing label (DD-007: skills are invisible), category, lifecycle stages, activation mode, applicable work types, context signals, minimum process level, and gate configuration. Pure TypeScript, no VS Code deps.

**Acceptance criteria:**
- [ ] `SkillRegistry` class with `getAll()`, `getById(id)`, `getByCategory(cat)`, `getByStage(stage)`, `getByTaskType(type)` methods
- [ ] All 24 skills registered with complete `SkillDefinition` metadata
- [ ] 3 "always active" skills: `context-engineering`, `git-workflow-and-versioning`, `incremental-implementation`
- [ ] 7 "by-task-type" skills mapped to correct work types (feature, bugfix, refactor, etc.)
- [ ] 7 "by-context" skills mapped to correct context signals (touches_ui, touches_api, etc.)
- [ ] 4 "interactive" skills: `interview-me`, `idea-refine`, `spec-driven-development`, `planning-and-task-breakdown`
- [ ] 5 "quality-gate" skills with correct gate types (hard vs conditional)
- [ ] 4 "specialist" agents: `code-reviewer`, `security-auditor`, `test-engineer`, `web-performance-auditor`
- [ ] User-facing labels are human-readable (e.g., "Code Review" not "code-review-and-quality")
- [ ] Each skill has valid `lifecycleStages` matching the stage-to-skill mapping from analysis
- [ ] 10+ unit tests: all skills present, metadata valid, lookup methods correct

**Verification:**
- [ ] `npm test -- --grep "SkillRegistry"` — all pass
- [ ] Coverage ≥ 90% on skill-registry.ts

**Dependencies:** Task 2

**Files created:**
- `src/core/skill-registry.ts`
- `src/test/core/skill-registry.test.ts`

---

### Task 7b: Skill Engine

**Description:** Implement the skill activation rule engine (DD-007). Given a `RiskAssessment` (with work type, process level, and context signals), computes the set of active skills. This is the core intelligence that determines what engineering practices apply to a given task. Pure TypeScript, no VS Code deps.

**Acceptance criteria:**
- [ ] `SkillEngine` class with `computeActiveSkills(assessment)` method
- [ ] Returns `{ activeSkills: SkillId[], activationReasons: Record<SkillId, string> }`
- [ ] Always includes the 3 "always active" skills
- [ ] Adds task-type skills based on `assessment.workType`
- [ ] Adds context skills based on `assessment.contextSignals`
- [ ] Adds process-level skills (additive — thorough includes standard's skills)
- [ ] Deduplicates skills (a skill activated by multiple rules appears once)
- [ ] Each activated skill has a human-readable reason (e.g., "Activated because task type is 'feature'")
- [ ] Feature task → activates spec-driven-dev, planning, TDD, code-review (+ always)
- [ ] Bugfix task → activates debugging, TDD, code-review (+ always)
- [ ] Feature + touches_auth → adds security-and-hardening
- [ ] Guarded process level → adds shipping-and-launch, security, performance, documentation
- [ ] 15+ unit tests covering all work types, context signals, process levels, combinations

**Verification:**
- [ ] `npm test -- --grep "SkillEngine"` — all pass
- [ ] Coverage ≥ 90% on skill-engine.ts

**Dependencies:** Tasks 2, 7a

**Files created:**
- `src/core/skill-engine.ts`
- `src/test/core/skill-engine.test.ts`

---

### Task 7c: Workflow Generator (Skill-Aware)

**Description:** Implement dynamic workflow builder (DD-014 step 2). Given a `RiskAssessment` and the computed `activeSkills`, generates a `WorkflowDefinition` with appropriate stages, quality gates, and approval requirements. The active skills determine which stages are included and which gates are inserted.

**Acceptance criteria:**
- [ ] `WorkflowGenerator` class with `generate(assessment, activeSkills)` method
- [ ] Light process: 3 stages (Define → Implement → Verify)
- [ ] Standard process: 5 stages (Define → Plan → Implement → Review → Verify)
- [ ] Thorough process: 7 stages (Define → Plan → Implement → Test → Review → Approve → Deploy)
- [ ] Guarded process: 7 stages + extra quality gates + mandatory approvals
- [ ] Quality gates are inserted based on active gate skills (e.g., security gate only if `security-and-hardening` is active)
- [ ] Each stage records which skills are active during it (from the stage-to-skill mapping)
- [ ] Approval requirements scale with process level
- [ ] `WorkflowDefinition.activeSkills` and `skillActivationReason` are populated
- [ ] 12+ unit tests covering all 4 process levels, skill-driven gate insertion, edge cases

**Verification:**
- [ ] `npm test -- --grep "WorkflowGenerator"` — all pass
- [ ] Coverage ≥ 85% on workflow-generator.ts

**Dependencies:** Tasks 2, 7a, 7b

**Files created:**
- `src/core/workflow-generator.ts`
- `src/test/core/workflow-generator.test.ts`

---

### Task 8: Context Analyzer + Project Detector

**Description:** Implement workspace analysis that detects tech stack, file structure, conventions, and dependencies. Generates `context.md` in `.codestudio/`. Pure TypeScript with injected file system interface.

**Acceptance criteria:**
- [ ] `ProjectDetector` class with `detect(fileList)` method
- [ ] Detects language (TypeScript, JavaScript, Python, etc.) from file extensions
- [ ] Detects framework (React, Next.js, Express, etc.) from package.json/config files
- [ ] Detects test framework from config files
- [ ] Detects build tools from config files
- [ ] `ContextAnalyzer` class with `analyze(detection)` method — generates markdown summary
- [ ] Output is a `ProjectContext` object + markdown string
- [ ] 8+ unit tests with fixture file lists

**Verification:**
- [ ] `npm test -- --grep "ProjectDetector|ContextAnalyzer"` — all pass
- [ ] Coverage ≥ 80% on both files

**Dependencies:** Task 2

**Files created:**
- `src/core/project-detector.ts`
- `src/core/context-analyzer.ts`
- `src/test/core/project-detector.test.ts`
- `src/test/core/context-analyzer.test.ts`

---

### Task 9: Context Signal Detector

**Description:** Implement detection of workspace context signals that drive skill activation. Analyzes file patterns, package.json dependencies, and directory structure to detect signals like `touches_ui`, `touches_api`, `touches_auth_or_input`, etc. These signals feed into the Skill Engine (Task 7b) and Risk Engine (Task 5). Pure TypeScript, no VS Code deps.

**Acceptance criteria:**
- [ ] `ContextSignalDetector` class with `detect(projectContext)` method
- [ ] Returns `ContextSignal[]` — the set of detected signals
- [ ] `touches_ui`: detected when project has React/Vue/Angular/Svelte components, CSS files, or UI test files
- [ ] `touches_api`: detected when project has route files, API handlers, OpenAPI specs, or GraphQL schemas
- [ ] `touches_auth_or_input`: detected when project has auth middleware, login/signup routes, form validation, or user input handling
- [ ] `touches_external_services`: detected when project has HTTP clients, SDK imports, webhook handlers, or queue consumers
- [ ] `performance_sensitive`: detected when project has performance budgets, lighthouse config, or is a public-facing web app
- [ ] `high_risk_decision`: detected when objective mentions architecture, migration, breaking changes, or data model changes
- [ ] Signals are additive — a project can have multiple signals
- [ ] 10+ unit tests with fixture project contexts covering all signal types

**Verification:**
- [ ] `npm test -- --grep "ContextSignalDetector"` — all pass
- [ ] Coverage ≥ 90% on context-signal-detector.ts

**Dependencies:** Tasks 2, 8

**Files created:**
- `src/core/context-signal-detector.ts`
- `src/test/core/context-signal-detector.test.ts`

---

### Task 9b: Capability Recommender

**Description:** Implement the recommendation engine for the Capabilities view (DD-024, DD-025). Given a `ProjectContext` and `ContextSignal[]`, generates context-aware recommendations for what the user should add — custom instructions, Syncfusion skill packs, security conventions, testing standards, etc. Each recommendation includes a human-readable "Why" explanation tied to what was detected. Also provides the Syncfusion skill pack catalog (14 packs covering 700+ skills) for the browsable marketplace. Pure TypeScript, no VS Code deps.

**Acceptance criteria:**
- [ ] `CapabilityRecommender` class with `recommend(projectContext, signals)` method
- [ ] Returns `Recommendation[]` with `{ type, title, description, reason, action, category }`
- [ ] React detected → recommend Syncfusion React UI Components skill pack (one recommendation, not 60)
- [ ] Angular detected → recommend Angular skill pack
- [ ] Blazor detected → recommend Blazor skill pack
- [ ] .csproj with ASP.NET Core SDK → recommend ASP.NET Core skill pack
- [ ] .csproj with MAUI SDK → recommend .NET MAUI skill pack
- [ ] PDF/document processing detected → recommend relevant Document SDK pack
- [ ] No test framework → recommend Testing Standards instruction
- [ ] Express routes in `src/api/` → recommend API Conventions instruction
- [ ] Payment/auth integration → recommend Security Hardening instruction
- [ ] Each recommendation has a "Why" explanation referencing the specific detection
- [ ] `SkillPackCatalog` class with `getAll()`, `getByCategory(cat)`, `getByPlatform(platform)` methods
- [ ] Catalog contains 14 packs with metadata: name, platform, category (Web/.NET/Document), skill count, GitHub repo, representative components
- [ ] Categories: Web (5), .NET (5), Document (4)
- [ ] 12+ unit tests covering recommendation rules, catalog lookup, edge cases

**Verification:**
- [ ] `npm test -- --grep "CapabilityRecommender|SkillPackCatalog"` — all pass
- [ ] Coverage ≥ 85% on capability-recommender.ts

**Dependencies:** Tasks 2, 8, 9

**Files created:**
- `src/core/capability-recommender.ts`
- `src/core/skill-pack-catalog.ts`
- `src/test/core/capability-recommender.test.ts`
- `src/test/core/skill-pack-catalog.test.ts`

---

### Task 10: AI Layer (Language Model API + Tools)

**Description:** Implement the AI integration layer: model access with fallback, LLM-powered risk analyzer, and three Language Model Tools for agent mode. All AI features gracefully degrade when no LLM is available.

**Acceptance criteria:**
- [ ] `ModelAccess` class: selects copilot model, caches, returns null if unavailable
- [ ] `AiRiskAnalyzer` class: uses LLM for enriched analysis, falls back to `RiskEngine`
- [ ] `AnalyzeWorkRequestTool` implements `vscode.LanguageModelTool` — analyzes objectives
- [ ] `GetWorkflowStatusTool` implements `vscode.LanguageModelTool` — returns current state
- [ ] `GetProjectContextTool` implements `vscode.LanguageModelTool` — returns project context
- [ ] All tools have proper `prepareInvocation` with confirmation messages
- [ ] All tools have proper `inputSchema` matching package.json definitions
- [ ] 6+ unit tests (model unavailable fallback, tool invocation with mocked deps)

**Verification:**
- [ ] `npm test -- --grep "ModelAccess|AiRiskAnalyzer|Tool"` — all pass
- [ ] Manual: tools appear in agent mode tool list after extension activation

**Dependencies:** Tasks 2, 5, 6, 8, 9

**Files created:**
- `src/ai/model-access.ts`
- `src/ai/risk-analyzer.ts`
- `src/ai/workflow-advisor.ts`
- `src/ai/context-enricher.ts`
- `src/ai/prompts/risk-assessment.ts`
- `src/ai/tools/analyze-work-request.tool.ts`
- `src/ai/tools/get-workflow-status.tool.ts`
- `src/ai/tools/get-project-context.tool.ts`
- `src/test/ai/model-access.test.ts`
- `src/test/ai/risk-analyzer.test.ts`

---

## Slice D: Integration

### Task 11: Services (VS Code API Integration)

**Description:** Implement the service layer that bridges core logic with VS Code APIs. File system service manages `.codestudio/` directory. Git service detects branch. Workspace service provides configuration. Notification service manages status bar and messages.

**Acceptance criteria:**
- [ ] `FileSystemService`: ensureDirectory, readJson, writeJson, appendLine, readLines, listFiles
- [ ] `GitService`: getCurrentBranch, isGitRepo
- [ ] `WorkspaceService`: getWorkspaceRoot, getConfiguration, onConfigChange
- [ ] `NotificationService`: showInfo, showError, showProgress, updateStatusBar
- [ ] All use `vscode.workspace.fs` (not Node.js `fs`)
- [ ] 4+ unit tests per service (with VS Code API mocked)

**Verification:**
- [ ] `npm test -- --grep "Service"` — all pass
- [ ] Manual: `.codestudio/` directory created on activation

**Dependencies:** Task 2

**Files created:**
- `src/services/file-system.service.ts`
- `src/services/git.service.ts`
- `src/services/workspace.service.ts`
- `src/services/notification.service.ts`
- `src/test/services/file-system.service.test.ts`

---

### Task 12: Preact Webview Shell

**Description:** Build the Preact-based webview with sidebar navigation, 5 view components (Tasks, Capabilities, Knowledge, History, Settings per DD-016 through DD-022), signal-based state management, and postMessage bridge to extension host. This is the visual interface matching the `.designs/` prototype.

**Acceptance criteria:**
- [ ] `index.tsx` renders `<App />` into webview DOM
- [ ] `app.tsx` has sidebar nav + content area with signal-based routing
- [ ] `bridge.ts` handles postMessage send/receive with type-safe protocol
- [ ] `sidebar-nav.tsx` renders 5 nav items + settings pinned to bottom + new work request button
- [ ] `tasks-view.tsx` renders all 3 states (empty/active/complete) with tabs for Stages, Artifacts, Approvals (DD-019, DD-020)
- [ ] Empty state: objective input with progressive disclosure (analyze button appears after ≥10 chars)
- [ ] Active state: current stage details + stats grid + stage list (no pipeline viz — DD-018)
- [ ] Complete state: success banner + summary + archive button
- [ ] `capabilities-view.tsx` renders 3 zones: (1) Recommended for This Project — context-aware suggestions with Why explanations, (2) Current Setup — summary counts with deep links that open native Agent Customizations panel, (3) Syncfusion Skill Pack Marketplace — 14 packs filterable by Web/.NET/Document (DD-022–DD-026)
- [ ] `knowledge-view.tsx` renders: Project Context, ADRs, Conventions, Boundaries, Capabilities link card (DD-021, DD-022)
- [ ] `history-view.tsx` renders: three-tier history (hot/warm/cold) with pagination (DD-006, DD-007)
- [ ] `settings-view.tsx` renders: process level override, approval policy, history retention, agent mode toggle
- [ ] Signal stores: `workflow.store.ts`, `ui.store.ts`, `capabilities.store.ts`
- [ ] CSS uses VS Code theme tokens (`--vscode-*` custom properties)
- [ ] BEM naming convention for all CSS classes
- [ ] Webview bundle < 100KB

**Verification:**
- [ ] `npm run build` — webview bundle produced
- [ ] Manual: F5 → sidebar renders with correct layout
- [ ] Manual: navigation between 5 views works
- [ ] Manual: theme matches VS Code dark theme

**Dependencies:** Tasks 2, 11

**Files created:**
- `src/views/sidebar-provider.ts`
- `src/views/message-handler.ts`
- `src/webview/index.tsx`
- `src/webview/app.tsx`
- `src/webview/router.ts`
- `src/webview/bridge.ts`
- `src/webview/store/workflow.store.ts`
- `src/webview/store/ui.store.ts`
- `src/webview/store/capabilities.store.ts`
- `src/webview/views/tasks-view.tsx`
- `src/webview/views/capabilities-view.tsx`
- `src/webview/views/knowledge-view.tsx`
- `src/webview/views/history-view.tsx`
- `src/webview/views/settings-view.tsx`
- `src/webview/components/sidebar-nav.tsx`
- `src/webview/components/stage-list.tsx`
- `src/webview/components/task-card.tsx`
- `src/webview/components/artifact-viewer.tsx`
- `src/webview/components/approval-card.tsx`
- `src/webview/components/capability-card.tsx`
- `src/webview/components/skill-pack-card.tsx`
- `src/webview/components/launcher-row.tsx`
- `src/webview/components/stats-grid.tsx`
- `src/webview/components/progress-bar.tsx`
- `src/webview/components/risk-badge.tsx`
- `src/webview/components/empty-state.tsx`
- `src/webview/components/icon.tsx`
- `src/webview/styles/variables.css`
- `src/webview/styles/base.css`
- `src/webview/styles/layout.css`
- `src/webview/styles/components.css`

---

### Task 13: Chat Participant

**Description:** Register `@engineering` chat participant with `/status`, `/analyze`, and `/history` slash commands. Handles natural language queries about workflow state, delegates to core engines for analysis.

**Acceptance criteria:**
- [ ] Chat participant registered with ID `engineering-workspace.engineering`
- [ ] `/status` command returns current workflow state as formatted markdown
- [ ] `/analyze` command analyzes user prompt as work request objective
- [ ] `/history` command returns recent workflow summaries
- [ ] Natural language fallback: routes unrecognized prompts to LLM with engineering context
- [ ] Participant detection configured with disambiguation examples
- [ ] Follow-up provider suggests relevant next actions
- [ ] 4+ unit tests (command routing, response format, no-workflow state)

**Verification:**
- [ ] `npm test -- --grep "ChatParticipant"` — all pass
- [ ] Manual: `@engineering /status` returns response in chat
- [ ] Manual: `@engineering analyze adding user authentication` returns risk analysis

**Dependencies:** Tasks 2, 5, 6, 7b, 10

**Files created:**
- `src/chat/participant.ts`
- `src/chat/commands/status.command.ts`
- `src/chat/commands/analyze.command.ts`
- `src/chat/commands/history.command.ts`
- `src/chat/intents.ts`
- `src/test/chat/participant.test.ts`

---

### Task 14: Extension Entry Point

**Description:** Wire everything together in `extension.ts`. Register all services, create core engine instances, register webview provider, register chat participant, register language model tools, set up activation events, and handle deactivation cleanup.

**Acceptance criteria:**
- [ ] `activate()` creates and wires all dependencies (dependency injection via constructors)
- [ ] Registers `WebviewViewProvider` for sidebar
- [ ] Registers chat participant
- [ ] Registers 3 language model tools via `vscode.lm.registerTool`
- [ ] Registers commands: `engineering-workspace.newWorkRequest`, `engineering-workspace.openSidebar`
- [ ] Creates `.codestudio/` directory on first activation
- [ ] Runs project context analysis on first activation
- [ ] `deactivate()` cleans up subscriptions
- [ ] Activation time logged to console
- [ ] All registrations added to `context.subscriptions`

**Verification:**
- [ ] Manual: F5 → extension activates without errors
- [ ] Manual: Output panel shows activation log
- [ ] Manual: `.codestudio/` directory created
- [ ] Manual: `context.md` generated

**Dependencies:** Tasks 7a, 7b, 10, 11, 12, 13

**Files modified:**
- `src/extension.ts` (expand from stub)

---

## Slice E: Polish

### Task 15: Status Bar + Bundle Optimization + Integration Test

**Description:** Add status bar item showing current workflow state, optimize bundle sizes, verify all M1 success criteria, and write a manual integration test checklist.

**Acceptance criteria:**
- [ ] Status bar item shows: "No Workflow" / "⚡ Stage: Define" / "✅ Complete"
- [ ] Status bar item click opens sidebar
- [ ] Extension host bundle < 400KB
- [ ] Webview bundle < 100KB
- [ ] Activation time < 500ms (measured)
- [ ] All 18 M1 success criteria from SPEC.md verified
- [ ] `CHANGELOG.md` updated with M1 release notes
- [ ] `README.md` has installation and usage instructions

**Verification:**
- [ ] `npm run build && ls -la out/` — check bundle sizes
- [ ] Full M1 checklist walkthrough (18 items)
- [ ] `npm run test:coverage` — ≥ 80% on core/

**Dependencies:** Task 13

**Files created/modified:**
- `README.md`
- `CHANGELOG.md`
- `src/services/notification.service.ts` (add status bar)

---

## Summary

| Metric | Target |
|--------|--------|
| Total tasks | 16 (1, 2, 3, 4, 5, 6, 7a, 7b, 7c, 8, 9, 9b, 10, 11, 12, 13, 14, 15) |
| Total estimated hours | ~40.5h |
| Unit tests expected | 100+ |
| Core coverage target | ≥ 80% |
| Files to create | ~64 |
| Bundles | 2 (extension.js + webview.js) |
| Webview views | 5 (Tasks, Capabilities, Knowledge, History, Settings) |
| Skills cataloged | 24 (from addyosmani/agent-skills) |
| Context signals detected | 6 types |
