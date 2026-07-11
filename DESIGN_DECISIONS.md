# Engineering Workspace — Design Decisions Record

**Project:** Code Studio Engineering Workspace Extension  
**Created:** 10 July 2026  
**Status:** Design Phase  

This document records all design decisions made during the analysis and prototyping phase. Each decision includes the context, the decision, the rationale, and alternatives considered.

---

## DD-001: Adaptive Process Depth

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension needs to support work ranging from a one-line typo fix to a full greenfield feature. Forcing every task through a full SDLC would feel like overhead; skipping engineering practices for complex work produces fragile software.

**Decision:** Implement four process levels that automatically calibrate engineering rigor based on task type, complexity, and risk:

| Level | Trigger | Steps | Approvals |
|---|---|---|---|
| **Light** | Single-file fix, config change, docs | Context → Plan → Implement → Test → Commit | 0 |
| **Standard** | Multi-file feature, bug fix, refactor | Spec → Plan → Tasks → Build → Test → Review | 2 (spec + review) |
| **Thorough** | New architecture, API design, major feature | Full lifecycle + Security + Performance + Docs | 3-4 |
| **Guarded** | DB migration, auth changes, deployment | All Thorough + explicit approval at every decision | Multiple |

The system auto-detects the level; the user can always override up or down.

**Rationale:** The binding constraint is user adoption risk. If the extension feels like overhead, developers will close it and go back to chat. Adaptive depth ensures minimal ceremony for simple tasks and proper rigor for complex ones — without the user deciding "how much process do I need?"

**Alternatives Considered:**
- *Single fixed workflow for all tasks* — Rejected: too heavy for simple tasks, drives users away
- *User always chooses the level* — Rejected: adds friction; most users don't know what level they need
- *No process levels, just optional stages* — Rejected: too unstructured; defeats the purpose of guided engineering

---

## DD-002: Git-Tracked Workflow State

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** Workflow state (current stage, task progress, approvals, artifacts) needs to persist across Code Studio restarts, session changes, and team handoffs. Options: database, cloud service, local storage, or filesystem.

**Decision:** All workflow state, artifacts, and context live in `.codestudio/` in the workspace filesystem and are committed to git alongside the code.

```
.codestudio/
├── context.md              # Project context (rules file)
├── config.json             # Extension settings
├── workflows/
│   └── current/
│       ├── workflow.json   # Current workflow state
│       ├── objective.md    # Statement of intent
│       └── events.jsonl    # Append-only audit log
├── artifacts/
│   ├── specs/
│   ├── plans/
│   ├── adrs/
│   ├── reviews/
│   └── reports/
└── archive/
    ├── index.json          # History index
    └── YYYY-MM/            # Archived completed workflows
```

**Rationale:**
1. **Team resumability** — Any team member who pulls the branch gets the full engineering state
2. **Branch-scoped** — Each feature branch has its own workflow; switching branches switches state
3. **PR reviewability** — Reviewers see the full engineering story in the `.codestudio/` directory
4. **Audit trail** — `events.jsonl` records every action, decision, and approval
5. **No external dependencies** — Works offline, air-gapped, with any git hosting
6. **Commit strategy** — Workflow state changes are committed alongside the code changes they describe, keeping code and engineering state in lockstep

**Alternatives Considered:**
- *SQLite database in workspace* — Rejected: not human-readable, merge conflicts are unresolvable, can't review in PRs
- *Cloud service / API* — Rejected: adds external dependency, doesn't work offline, privacy concerns
- *VS Code globalState / workspaceState* — Rejected: not shareable across team, not in git, lost on extension reinstall
- *Local storage only (not committed)* — Rejected: not shareable, not resumable by teammates

---

## DD-003: One Active Work Request at a Time

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** Should the extension support multiple concurrent work requests (like a backlog/kanban) or focus on one at a time?

**Decision:** The extension handles **one active work request per branch**. When the workflow completes and the branch merges, the task board is cleared and the extension is ready for the next request.

**Rationale:**
- The extension is an **engineering execution tool**, not a project management tool
- Tasks are temporary execution plans generated from a spec, not a permanent backlog
- Multiple concurrent workflows would require complex state management, conflict resolution, and UI that resembles Jira — exactly what we're avoiding
- Developers already use branches for isolation; one workflow per branch is natural
- Deciding *which* work to do next is the human's job (or the PM tool's job); the extension picks up after that decision

**What the extension is NOT:**
- Not a backlog manager (no sprint planning, no prioritization)
- Not a project tracker (no Gantt charts, no time estimates, no resource allocation)
- Not a team coordination tool (no assignments, no workload balancing)

**Alternatives Considered:**
- *Multiple concurrent workflows* — Rejected: turns the extension into a PM tool; violates the "not a project management tool" constraint
- *Queue of work requests* — Rejected: adds backlog management complexity; the user can just start a new request when the current one finishes

---

## DD-004: History Tiering Strategy

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** Completed workflows are archived in `.codestudio/archive/`. Over time (months/years), this directory grows unbounded. At 10,000+ entries, repo bloat becomes a real problem — slow clones, slow `git status`, large `.codestudio/` directory.

**Decision:** Three-tier history with automatic compaction:

| Tier | What's Stored | Size Per Entry | When |
|---|---|---|---|
| **Hot** | ALL artifacts (spec, plan, ADRs, reviews, audit log) | ~100-500 KB | Last N work requests (default: 20) |
| **Warm** | `summary.md` only (objective, decisions, stats, approvals) | ~2 KB | Older than N entries |
| **Cold** | Summary without audit log | ~1 KB | Older than M months (default: 6) |

**Key rules:**
- **Nothing is ever deleted** — compaction removes files from the working tree but they remain in git history forever
- **One-click restore** — any compacted entry can be restored via `git checkout <sha>`
- **Auto-compaction** — runs when a new entry is archived and the hot tier exceeds the limit
- **Configurable** — users can adjust hot tier size and cold tier threshold in Settings

**Size projections:**

| Entries | .codestudio/ Size |
|---|---|
| 100 | ~6.2 MB |
| 1,000 | ~7.5 MB |
| 10,000 | ~16.5 MB |

**Rationale:** Git repos should stay lean. Full artifacts are valuable for recent work (debugging, reference) but unnecessary for 6-month-old entries. The tiering strategy keeps the repo under ~20 MB even at massive scale while preserving full recoverability.

**Alternatives Considered:**
- *Keep everything forever* — Rejected: repo bloat at scale; 10,000 × 300KB = 3 GB
- *Delete old history* — Rejected: loses valuable engineering context; can't answer "why did we build it this way?"
- *External storage for history* — Rejected: adds dependency; breaks the "everything in git" principle
- *Git LFS for large artifacts* — Considered for future: could move `events.jsonl` to LFS if repos get very large

---

## DD-005: History Index File

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The History screen needs to display all completed work requests with metadata (objective, process level, stats, artifacts). Without an index, the extension would scan the entire `archive/` directory and read every file to render the list.

**Decision:** Maintain a single `archive/index.json` file that contains metadata for all history entries.

```jsonc
{
  "version": 1,
  "totalEntries": 7,
  "totalTasks": 49,
  "totalTests": 109,
  "totalLines": 5200,
  "totalADRs": 5,
  "entries": [
    {
      "id": "stripe-payments",
      "objective": "Add Stripe payment integration",
      "processLevel": "standard",
      "status": "merged",
      "tier": "hot",
      "branch": "feature/stripe-payments",
      "pr": "#47",
      "startedAt": "2026-07-08T12:00:00Z",
      "completedAt": "2026-07-08T16:23:00Z",
      "duration": "4h 23m",
      "tasks": 8,
      "files": 12,
      "lines": 340,
      "tests": 24,
      "commits": 8,
      "artifacts": ["spec", "plan", "adr-005", "review", "security"],
      "path": "2026-07/stripe-payments"
    }
    // ... newest first
  ]
}
```

**Update rules:**
- New entry archived → prepend to `entries[]`, update totals
- Tier change (hot → warm) → update `tier` field
- User restores compacted entry → update `tier` back to `"hot"`
- Index is committed to git alongside archive changes

**Size at scale:** ~300 KB at 1,000 entries, ~3 MB at 10,000 entries.

**Rationale:**
- O(1) file read to render History screen vs O(n) directory scan
- Pre-computed totals for project stats
- All metadata available for filtering/searching without reading individual files
- Simple append-prepend structure — no complex merging

**Alternatives Considered:**
- *No index, scan directory* — Rejected: O(n) reads on every History screen open; slow at 100+ entries
- *SQLite index* — Rejected: not human-readable, merge conflicts, overkill for this use case
- *Yearly index files (index-2026.json)* — Considered for future: only needed if single index exceeds ~5 MB (unlikely before 15,000+ entries)

---

## DD-006: VS Code Native Design Language

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension UI needs a visual design. Options: custom design system, existing component library, or VS Code's native design language.

**Decision:** Use VS Code's actual dark theme colors, font stack, icon library, and layout patterns:

- **Colors:** VS Code dark theme (`#1E1E1E` background, `#252526` sidebar, `#0078D4` accent, `#CCCCCC` text)
- **Fonts:** Segoe UI at 13px body (VS Code's UI font), JetBrains Mono for code values
- **Icons:** Codicons (VS Code's native icon font)
- **Layout:** Activity bar (48px) + Sidebar (220px) + Editor area — matching VS Code's actual layout
- **Spacing:** 4px base grid (VS Code's compact density)
- **Borders:** 1px solid `#3C3C3C` (no shadows — VS Code uses borders, not elevation)
- **Border radius:** Maximum 6px (VS Code uses minimal rounding)

**Rationale:** The extension must feel like a native part of Code Studio, not a separate web app embedded in a panel. Using VS Code's exact design tokens ensures visual consistency and reduces the "this is a foreign tool" perception that drives adoption risk.

**Alternatives Considered:**
- *Custom design system* — Rejected: would look foreign inside the IDE; increases adoption friction
- *Syncfusion component library* — Considered for future: useful for complex components (charts, grids) but the base design must match VS Code
- *Light theme primary* — Rejected: developers overwhelmingly prefer dark themes; dark-first matches Code Studio's default

---

## DD-007: Skills Are Invisible to Users

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension is powered by 24 engineering skills from the agent-skills repository. Should users see skill names, configure individual skills, or interact with skills directly?

**Decision:** Skills are invisible plumbing. Users never see skill names, skill files, or skill configuration. They see:
- **Workflow stages** (not "spec-driven-development" but "Define")
- **Quality gates** (not "code-review-and-quality" but "Code Review")
- **Agent actions** (not "incremental-implementation" but "Implementing Task 4")

The workflow engine maps tasks to skills automatically based on task type, complexity, and detected context.

**Rationale:**
- Skill names are implementation details that add cognitive load without value
- Users care about outcomes (spec, plan, review), not the process that produced them
- Exposing skills turns the extension into a developer tool for power users only — violating the "new developers" target
- Advanced users who want skill-level control can use the CLI or chat commands (V2)

**Alternatives Considered:**
- *Expose all skills in the UI* — Rejected: overwhelming for new users; turns the extension into a skill management tool
- *Show skills in Advanced Mode only* — Accepted for V2: advanced users can see which skills are active and enable/disable them
- *Let users invoke skills directly* — Accepted for V2 via CLI: `codestudio skill run security-and-hardening`

---

## DD-008: Event Sourcing for Audit Trail

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension needs to track all actions, decisions, and approvals for auditability and resumability. Options: update a state file in place, or append events to a log.

**Decision:** Use event sourcing with an append-only `events.jsonl` file. Every action is recorded as an event:

```jsonl
{"ts":"2026-07-08T12:00:00Z","type":"workflow.started","data":{"objective":"Add Stripe payments","processLevel":"standard"}}
{"ts":"2026-07-08T12:15:00Z","type":"artifact.generated","data":{"type":"spec","path":"artifacts/specs/stripe-payment-spec.md"}}
{"ts":"2026-07-08T12:15:30Z","type":"approval.requested","data":{"artifact":"spec","level":"explicit"}}
{"ts":"2026-07-08T12:16:00Z","type":"approval.granted","data":{"artifact":"spec","by":"user","comment":"Add webhook verification note"}}
{"ts":"2026-07-08T12:30:00Z","type":"task.started","data":{"taskId":1,"title":"Add Stripe SDK dependency"}}
{"ts":"2026-07-08T12:35:00Z","type":"task.completed","data":{"taskId":1,"files":1,"tests":1,"commit":"a1b2c3d"}}
```

The `workflow.json` file is the **derived state** — it can be reconstructed from `events.jsonl` at any time.

**Rationale:**
- **Append-only** — no merge conflicts in git (each team member appends, never edits existing lines)
- **Full audit trail** — every action is recorded with timestamp, type, and data
- **Resumable** — if `workflow.json` is corrupted, replay events to reconstruct state
- **Debuggable** — when something goes wrong, the event log shows exactly what happened
- **JSONL format** — one JSON object per line; easy to parse, grep, and stream

**Alternatives Considered:**
- *Update workflow.json in place only* — Rejected: loses history of how state changed; merge conflicts when multiple people work
- *SQLite event store* — Rejected: not human-readable, not git-friendly
- *Structured log file (plain text)* — Rejected: not machine-parseable; can't reconstruct state

---

## DD-009: Branch-Scoped Workflows

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** A developer might work on multiple features across different branches. How should workflow state relate to git branches?

**Decision:** Each branch has its own `.codestudio/workflows/current/` directory. Switching branches switches workflow state automatically.

```
main (no active workflow)
├── feature/stripe-payments
│   └── .codestudio/workflows/current/  ← BUILD stage, task 4/8
├── feature/user-auth
│   └── .codestudio/workflows/current/  ← DEFINE stage, spec pending
└── fix/duplicate-tasks
    └── .codestudio/workflows/current/  ← VERIFY stage (Light process)
```

**Merge behavior:**
- When a feature branch merges to main, `.codestudio/workflows/current/` is cleared
- Artifacts move to `.codestudio/archive/` with a new entry in `index.json`
- `context.md` persists on main as the living project context

**Rationale:** Git branches already provide isolation for code changes. Workflow state should follow the same model — each branch is an independent engineering context. This is natural for developers and requires no additional mental model.

**Alternatives Considered:**
- *Single workflow state on main, shared across branches* — Rejected: conflicts when multiple features are in progress
- *Workflow state stored outside git (e.g., cloud)* — Rejected: breaks the "everything in git" principle; adds external dependency
- *Workflow state in a separate branch (e.g., `codestudio-state`)* — Rejected: adds complexity; state should live with the code it describes

---

## DD-010: Approval Levels with Smart Defaults

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension needs human approval at certain points, but too many approvals cause fatigue and users start clicking "approve" without reading.

**Decision:** Four approval levels with smart defaults to minimize interruptions:

| Level | Description | User Action | Default Behavior |
|---|---|---|---|
| **Informational** | Agent made a low-risk decision | None | Auto-dismiss after 10s; logged |
| **Review Required** | Artifact generated that should be reviewed | Review; auto-proceeds after timeout | 5-minute timeout (configurable) |
| **Explicit Approval** | Cannot proceed without user's "yes" | Must click Approve/Reject | Blocks workflow |
| **Restricted Operation** | Destructive/irreversible action | Must confirm with full context | Blocks; re-confirm after restart |

**Fatigue mitigation:**
1. Process level determines approval count (Light: 0, Standard: 2, Thorough: 3-4)
2. Informational items are batched in the Activity panel, not interrupting
3. "Trust this pattern" option reduces future approvals of the same type
4. Review Required auto-proceeds after configurable timeout

**Rationale:** The #1 adoption risk is approval fatigue. The tiered system ensures critical decisions get human attention while routine decisions don't interrupt flow.

**Alternatives Considered:**
- *Approve everything* — Rejected: defeats the purpose; agents make mistakes that need human review
- *Approve nothing (fully autonomous)* — Rejected: too risky for security-sensitive, destructive, or architectural decisions
- *Single approval level for everything* — Rejected: either too many approvals (fatigue) or too few (risk)

---

## DD-011: Temporary Task Board, Not Permanent Backlog

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The Task Board shows tasks for the current work request. Should it also maintain a backlog of future work?

**Decision:** The Task Board is a **temporary execution plan** that exists only for the duration of the current work request. When the workflow completes and merges, the board is cleared.

**Lifecycle:**
```
Work request starts → Tasks generated from spec → Agent executes → Merge → Board empty
```

**What the Task Board is:**
- A dependency-ordered execution plan for the current work request
- Generated automatically from the spec by the planning skill
- Temporary — tasks live for hours/days, not weeks/months

**What the Task Board is NOT:**
- A backlog of all work across the project
- A sprint board with assignments and estimates
- A kanban board for ongoing work management

**Rationale:** Maintaining a backlog turns the extension into a project management tool — the exact anti-pattern identified in the analysis. The extension's value is executing one piece of work properly, not managing all work.

**Alternatives Considered:**
- *Persistent backlog across work requests* — Rejected: becomes Jira; violates "not a PM tool" constraint
- *"Noticed but not touching" items as future tasks* — Considered for V2: agent can suggest follow-up work requests, but they go to the PM tool, not the extension's backlog

---

## DD-012: `.codestudio/` Directory Naming

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The extension needs a directory in the workspace to store state, artifacts, and configuration. What should it be named?

**Decision:** `.codestudio/` — a hidden directory (dot-prefix) at the workspace root.

**Rationale:**
- **Dot-prefix** — hidden by default in file explorers; doesn't clutter the project
- **codestudio** — clearly identifies the tool that owns this directory; no ambiguity
- **Workspace root** — easy to find; consistent location across all projects
- **Precedent** — follows the pattern of `.github/`, `.vscode/`, `.claude/`, `.cursor/`

**Alternatives Considered:**
- `.forge/` (internal codename) — Rejected: codename may change; use the product name
- `.engineering/` — Rejected: too generic; could conflict with other tools
- `.sdlc/` — Rejected: too technical; not immediately recognizable
- `codestudio/` (no dot) — Rejected: visible in file explorer; clutters the project

---

## DD-013: Summary Auto-Generation on Archive

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** When a workflow completes and is archived, the full artifacts (spec, plan, reviews, audit log) are preserved. But for quick reference and for compacted (warm/cold tier) entries, a concise summary is needed.

**Decision:** Auto-generate a `summary.md` file when a workflow is archived. The summary contains:

- Objective (one line)
- Process level and duration
- Task count, file count, line count, test count
- Key decisions made (extracted from events.jsonl)
- Approval history (who approved what, when)
- Commit list with messages
- Artifacts list with links

The summary is ~2 KB and serves as the **sole artifact** for warm/cold tier entries.

**Rationale:** The summary is the "engineering receipt" — a quick-reference document that answers "what happened?" without reading the full spec, plan, and audit log. It's also the minimum viable artifact for compacted history entries.

**Alternatives Considered:**
- *No summary, just keep all artifacts* — Rejected: doesn't solve the compaction problem; no quick-reference option
- *User writes the summary* — Rejected: adds friction; the extension has all the data to generate it automatically
- *Summary in index.json only* — Rejected: index entries are too terse; summary.md provides human-readable detail

---

## DD-014: Dynamic Workflow Generation

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** Each work request needs a workflow (stages, gates, skills, approvals). Should workflows be static templates or dynamically generated per request?

**Decision:** Workflows are **dynamically generated** for each work request by a three-step pipeline:

### Step 1: Risk Assessment Engine

Analyzes the work request to determine the process level:

```
Input: User's objective text + codebase context
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
 Keyword         Codebase         Pattern
 Analysis        Analysis         Detection
    │               │               │
 Detects:        Detects:         Detects:
 - domain        - files likely   - single vs
   (auth,          touched          multi-file
   payment,      - existing       - new vs
   database)       patterns         modify
 - risk words    - module         - dependency
   (migrate,       boundaries       changes
   delete,       - test coverage  - API surface
   deploy)                          changes
    │               │               │
    └───────────────┼───────────────┘
                    ▼
            Process Level Decision
```

**Risk signals → process level mapping:**

| Signal | Weight | Example |
|---|---|---|
| Keywords: auth, payment, security, migrate, delete, deploy | High | "Add payment processing" → financial risk |
| Touches database schema | High | Detected via file analysis of migration/schema files |
| New external dependency | Medium | New package not in package.json |
| Touches auth/session code | High | Files in auth/, middleware/ directories |
| Multi-file change (>5 files estimated) | Medium | Scope analysis from objective |
| Single-file change | Low | "Fix typo in README" |
| Documentation only | Minimal | "Update API docs" |

### Step 2: Workflow Generator

Based on the process level, dynamically builds `workflow.json`:

**Base templates per process level:**

| Process Level | Base Stages | Base Gates | Base Approvals |
|---|---|---|---|
| Light | plan, build, review(optional) | tests-pass | 0 |
| Standard | onboard, define, plan, build, verify, review, ship | spec-approved, plan-approved, tests-pass, code-review | 2 (spec, review) |
| Thorough | All Standard + architecture | All Standard + security, performance, docs | 3-4 |
| Guarded | All Thorough (none skippable) | All Thorough + rollback-tested, data-integrity | Multiple + restricted |

**Then conditional additions based on detected context:**

| Detected Context | Added Gate | Added Skill | Added Approval |
|---|---|---|---|
| Touches payment/financial data | security-review | security-and-hardening | Explicit: security review |
| New external dependency | dependency-audit | — | Review: dependency approval |
| Touches auth/session code | security-review | security-and-hardening | Restricted: auth change |
| Database schema change | rollback-tested, data-integrity | deprecation-and-migration | Restricted: schema migration |
| New API endpoint | api-contract-review | api-and-interface-design | — |
| UI changes | accessibility-check | frontend-ui-engineering, browser-testing | — |
| Uses new library/framework | source-verification | source-driven-development | — |
| Performance-sensitive path | performance-budget | performance-optimization | — |
| External service integration | — | observability-and-instrumentation | Review: external integration |

### Step 3: Mid-Workflow Promotion

The workflow is a **living document** — it can evolve during execution:

- If the agent discovers during BUILD that the task is riskier than initially assessed (e.g., needs to modify auth middleware), it can **promote** the process level
- Promotion adds gates and approvals but never removes completed ones
- The user is notified: "Risk level increased — security review gate added because Task 4 modifies authentication middleware"
- The user can accept or override the promotion

**Promotion rules:**
- Light → Standard: when agent discovers multi-file changes or architectural decisions needed
- Standard → Thorough: when agent encounters security-sensitive code, database changes, or new API surfaces
- Any → Guarded: only by explicit user action (never auto-promoted to Guarded)

### Example: Three Requests → Three Different Workflows

**"Fix typo in README"** → Light: 3 stages, 0 approvals, 0 gates, 1 skill  
**"Add Stripe payments"** → Standard + security gate: 7 stages, 4 approvals, 5 gates, 8 skills  
**"Migrate MySQL to PostgreSQL"** → Guarded: 7 stages (none skippable), 8 approvals (2 restricted), 10 gates, 12 skills

**Rationale:**
- Static templates can't account for the infinite variety of work requests
- The same "Standard" process level needs different gates depending on what the code touches
- Mid-workflow promotion prevents the "we assessed it as low-risk but it turned out to be high-risk" failure mode
- Dynamic generation means the extension gets smarter as the risk assessment engine improves — without changing the workflow templates

**Alternatives Considered:**
- *Static workflow templates only* — Rejected: can't add security gates dynamically when payment code is detected; every template would need to include every possible gate
- *Fully manual workflow configuration* — Rejected: users don't know what gates they need; the system should figure it out
- *AI-generated workflows (LLM decides the stages)* — Rejected for MVP: too unpredictable; the risk assessment engine uses deterministic rules. LLM-enhanced risk assessment is a V2 feature
- *No mid-workflow changes* — Rejected: risk assessment at the start can't predict everything the agent will encounter during implementation

---

## DD-015: Workflow Definition Schema

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The dynamically generated workflow needs a machine-readable format that the extension can execute, the UI can render, and git can track.

**Decision:** Use a typed JSON schema for `workflow.json`:

```typescript
interface WorkflowDefinition {
  id: string;                          // Unique ID (e.g., "stripe-payments")
  version: number;                     // Incremented on mid-workflow changes
  objective: string;                   // One-line description
  processLevel: ProcessLevel;          // light | standard | thorough | guarded
  detectedRisks: RiskSignal[];         // What the risk engine found
  
  stages: Stage[];                     // Ordered list of stages
  qualityGates: QualityGate[];         // All gates (base + conditional)
  approvals: Approval[];               // All approval requirements
  activeSkills: string[];              // Currently activated skills
  
  state: {
    currentStage: string;              // ID of the active stage
    currentTask: string | null;        // ID of the active task (during BUILD)
    tasksCompleted: number;
    tasksTotal: number;
    startedAt: string;                 // ISO 8601
    lastActivityAt: string;            // ISO 8601
  };
}

interface Stage {
  id: string;                          // onboard | define | plan | build | verify | review | ship
  name: string;                        // Display name
  status: StageStatus;                 // pending | active | completed | skipped | blocked
  skippable: boolean;                  // Can the user skip this stage?
  entryConditions: Condition[];        // What must be true to enter
  exitConditions: Condition[];         // What must be true to leave
  artifacts: string[];                 // Artifact IDs produced by this stage
  startedAt?: string;
  completedAt?: string;
}

interface QualityGate {
  id: string;                          // Unique gate ID
  name: string;                        // Display name
  type: 'automated' | 'review' | 'approval';
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  stage: string;                       // Which stage this gate belongs to
  blocking: boolean;                   // Does failure block progression?
  conditional: boolean;                // Was this gate added dynamically?
  reason?: string;                     // Why this gate was added (for conditional gates)
  result?: {                           // Gate execution result
    passedAt?: string;
    failedAt?: string;
    details?: string;
  };
}

interface RiskSignal {
  type: string;                        // keyword | file-pattern | dependency | scope
  signal: string;                      // What was detected
  severity: 'low' | 'medium' | 'high';
  impact: string;                      // What gate/skill/approval this triggered
}

interface Approval {
  id: string;
  level: 'informational' | 'review' | 'explicit' | 'restricted';
  artifact: string;                    // What's being approved
  status: 'pending' | 'approved' | 'rejected' | 'auto-approved';
  reason?: string;                     // Why this approval is needed
  approvedBy?: string;                 // Who approved
  approvedAt?: string;                 // When
  comment?: string;                    // Reviewer's comment
}

type ProcessLevel = 'light' | 'standard' | 'thorough' | 'guarded';
type StageStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';
```

**Key design choices:**
- **`detectedRisks`** — records what the risk engine found, so the user can see *why* the process level was chosen
- **`conditional` flag on gates** — distinguishes base gates from dynamically-added ones
- **`reason` on gates and approvals** — explains *why* this gate exists (e.g., "Task touches payment data")
- **`version` number** — incremented when mid-workflow promotion adds stages/gates
- **Flat arrays, not nested** — stages, gates, and approvals are top-level arrays linked by IDs, not deeply nested. This makes git diffs readable and merge conflicts manageable.

**Rationale:** A well-typed schema ensures the workflow engine, UI, and persistence layer all agree on the data shape. The schema is designed for git-friendliness (flat structure, readable diffs) and debuggability (every dynamic decision is recorded with a reason).

**Alternatives Considered:**
- *YAML format* — Rejected: JSON is natively parseable in TypeScript; YAML adds a dependency and is harder to validate
- *Deeply nested structure (stages contain their gates)* — Rejected: harder to diff in git; harder to query "all pending gates across all stages"
- *Separate files per stage* — Rejected: too many files; one `workflow.json` is simpler to read and commit

---

## DD-016: Screen Consolidation — 14 Views → 7 Views

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** The initial prototype had 14 separate screens. During design review, we identified three structural problems:

1. **Dashboard anti-pattern** — `home.html` duplicated summary data from 5 other screens (workflow pipeline, task count, approvals, activity, active task) without owning any action. It added a click to reach every real action.
2. **List → Detail explosion** — 4 list/detail pairs (`task-board`→`task-detail`, `artifacts`→`artifact-review`, `history`→`history-detail`, `approvals`→approval detail) that could use inline expansion instead of page navigation.
3. **Separate screens for rare actions** — `workflow-setup` (used once per work request), `review-report` (a specialized artifact), `project-context` (a specialized artifact) each got their own screen despite being used infrequently.

14 screens in a sidebar extension creates **navigation fatigue** — users lose context switching between views and can't remember where things are.

**Decision:** Consolidate to 7 views, each answering exactly ONE question:

| # | View | Absorbs | Question |
|---|------|---------|----------|
| 1 | **Workflow** | `home` + `workflow` + `workflow-setup` | "Where am I in the process?" |
| 2 | **Tasks** | `task-board` + `task-detail` | "What's being built?" |
| 3 | **Activity** | `agent-activity` | "What's the agent doing now?" |
| 4 | **Artifacts** | `artifacts` + `artifact-review` + `review-report` + `project-context` | "What's been produced?" |
| 5 | **Approvals** | `approvals` (with inline artifact review) | "What needs my decision?" |
| 6 | **History** | `history` + `history-detail` | "What did we do before?" |
| 7 | **Settings** | `settings` | "How do I configure this?" |

**Key design patterns:**
- **Inline expansion** replaces page navigation for detail views (tasks, artifacts, history entries expand in-place)
- **Workflow IS the home** — no separate dashboard. Empty state = new work request form (`workflow-setup` absorbed)
- **Approvals stay separate from Artifacts** — approvals are time-sensitive decisions that need their own queue; artifacts are reference material
- **Settings stays as a custom screen** — extension settings have complex interactions (history tiering, agent toggles) that benefit from a purpose-built UI

**Rationale:** 
- 7 views = 7 mental models. Each view answers one question. Users can hold 7±2 items in working memory (Miller's Law).
- Inline expansion preserves context — the user never loses their place in the list.
- Eliminating the dashboard removes a "dead-end" screen that only redirected to other screens.
- 50% fewer screens means 50% less code to build and maintain.

**Alternatives Considered:**
- *Keep all 14 screens* — Rejected: navigation fatigue, too many mental models, dashboard anti-pattern
- *Collapse to 5 views (merge Approvals into Artifacts, use native VS Code settings)* — Rejected: approvals are time-sensitive and deserve their own queue; custom settings UI gives better control over complex interactions like history tiering
- *Tab-based navigation instead of sidebar* — Rejected: VS Code extensions use sidebar panels as the primary pattern; tabs would fight the host IDE's own tab system

---

## DD-017: Work Request Lifecycle — Three Workflow States

**Date:** 10 July 2026  
**Status:** Accepted  
**Context:** After consolidating to 7 views (DD-016), the Workflow view absorbed the old `home` and `workflow-setup` screens. But the prototype only showed the "active" state — there was no way for a user to create a new work request or see what happens when work completes. The extension had no entry point.

**Decision:** The Workflow view has three distinct states:

| State | Trigger | Content |
|-------|---------|--------|
| **Empty** | No active work request, or user clicks "+" | New work request form: objective input, AI analysis panel (type, complexity, risk, estimated tasks, detected risk signals), process level selector (Light/Standard/Thorough/Guarded), workflow preview, "Start Workflow" button, quick-start examples |
| **Active** | Work request in progress | Current objective banner, progress bar, stats grid, lifecycle stages with status, quality gates checklist, recommended next action |
| **Complete** | All stages done | Success banner, completion stats (tasks, tests, coverage, files, lines), completed pipeline, quality gates (all passed), artifacts summary, commit list, "Archive & Start New" button |

**Entry points for creating a new work request:**
1. **Workflow view empty state** — shown automatically when no work is active
2. **"+" button in sidebar header** — always visible, navigates to empty state
3. **"Archive & Start New" button** — on the complete state, archives current work and shows empty state

**State transitions:**
```
Empty → (user clicks "Start Workflow") → Active
Active → (all stages complete) → Complete
Complete → (user clicks "Archive & Start New") → Empty
```

**Rationale:** The Workflow view is the home screen (DD-016). It must handle all three lifecycle phases without requiring separate screens. The empty state doubles as the onboarding experience — new users see a clear CTA ("What do you want to build?") with examples. The complete state provides closure and a natural transition to the next work request.

**Alternatives Considered:**
- *Modal dialog for new work request* — Rejected: modals feel disruptive in VS Code; the empty state is more natural
- *Separate "New" screen in navigation* — Rejected: adds an 8th view; the empty state of Workflow is the right place
- *Auto-archive on completion* — Rejected: user should see the summary and consciously decide to move on

---

## DD-018: Kill the Pipeline — Workflow Shows Outcomes, Not Process

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** The Workflow view showed a 7-stage pipeline (Onboard → Define → Plan → Build → Verify → Review → Ship), a quality gates checklist, a stats grid, and a live agent status card. Audit revealed two problems:

1. **Content fatigue** — 7 sections per screen, most duplicating data available in other views
2. **Process leakage** — The pipeline shows the engine's internal stages, but users don't care about steps — they care about outcomes and current activity

Every stage's useful information already lived in another view:
- Onboard/Define → spec is in Artifacts
- Plan → tasks are in Tasks
- Build → agent activity is in Activity
- Verify/Review → results are in Artifacts
- Ship → PR link is in History

The pipeline was duplicating other views in a vaguer format.

**Decision:** Remove the pipeline, quality gates checklist, and stats grid from the Workflow view. The Workflow screen now shows only:

1. **Objective** — What are we building (one line)
2. **Progress** — How far along (percentage bar + task count + time estimate)
3. **NOW** — What the agent is doing this second (current task, TDD phase, file, recent actions)
4. **Approval** — Inline approval card when the agent needs human input (pops in, disappears when resolved)
5. **Done** — Completion summary when finished

**Approvals are inline, not a separate view.** When the agent hits a gate, an approval card appears inline in the Workflow screen at the point where it's needed. The user doesn't navigate to an Approvals view — approvals come to the user. This removes the Approvals view entirely (7 views → 6 views).

**Stages are internal only.** The workflow engine still tracks stages for event sourcing, skill activation, and history. But the user never sees them. The user sees outcomes (progress %) and current activity (what the agent is doing now), not process steps.

**Rationale:**
- Users care about "what's happening now" and "do you need me" — not "which internal stage is active"
- Stages are engine internals — leaking them into the UI is like showing database queries on a dashboard
- Inline approvals are more natural than a separate queue — approvals happen at specific points in the workflow, not in a separate inbox
- Less content = faster scanning = less fatigue
- 6 views instead of 7 = less navigation

**Alternatives Considered:**
- *Keep pipeline but collapse completed stages* — Rejected: still shows process the user doesn't need; collapsing adds interaction complexity
- *Keep Approvals as separate view* — Rejected: approvals are temporal events, not a browsable category; they belong where they happen
- *Show stages in an expandable "process details" section* — Rejected: if it needs to be collapsed by default, it's not important enough to show

---

## DD-019: Merge Workflow + Tasks into Single Tasks View

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** After DD-018 removed the pipeline, the Workflow view showed: objective + progress + "NOW" section (current task activity) + inline approvals. But the "NOW" section duplicated content from the Tasks view (current task name, TDD phase) and Activity view (recent actions). The separation between "workflow" and "tasks" was artificial — progress through tasks IS the workflow.

**Decision:** Merge Workflow and Tasks into a single **Tasks** view. The Tasks view now shows:

1. **Objective + progress bar** — What are we building and how far along
2. **Task list by phase** — All tasks grouped by phase, with inline expansion for active task
3. **Inline approvals** — Approval cards pop in between tasks at the point where they're needed
4. **Three states** — Empty (new work request), Active (task list + progress), Complete (summary + plan-vs-actual)

The "NOW" section is removed — current task activity lives in the Activity view, not duplicated here. The active task is simply highlighted in the task list with its expanded detail.

**Navigation: 6 → 5 views:**
1. Tasks (merged Workflow + Tasks)
2. Activity
3. Artifacts
4. History
5. Settings

**Rationale:**
- Workflow IS the task list — separating them was artificial
- Removes the last duplication: current task info no longer appears in both Workflow and Tasks
- 5 views is the minimum viable navigation — each answers a distinct question
- Approvals remain inline in the task list at the point where they're needed

**Alternatives Considered:**
- *Keep Workflow as a separate "home" view with just progress + approvals* — Rejected: too little content to justify a separate view; progress bar fits at the top of the task list
- *Move approvals back to a separate view* — Rejected: approvals are temporal events tied to specific tasks, not a browsable category

---

## DD-020: Merge Artifacts into Tasks as Tab

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** Artifacts (specs, plans, ADRs, reviews, reports) are produced BY tasks DURING a work request. Having a separate Artifacts view created the same artificial separation as the old Workflow/Tasks split — the user had to navigate away from the task list to see what the tasks produced.

**Decision:** Merge Artifacts into the Tasks view as a second tab. The Tasks view now has a tab switcher at the top:

- **[Tasks]** tab — task list by phase + inline approvals (default)
- **[Artifacts]** tab — all artifacts produced during this work request, with inline expansion

**Navigation: 5 → 4 views:**
1. Tasks (with Tasks/Artifacts tabs)
2. Activity
3. History
4. Settings

**Rationale:**
- Artifacts are produced by tasks — they belong in the same context
- Removes navigation: user doesn't leave the work request to see its outputs
- Tab switcher is faster than navigating to a separate view
- 4 views is extremely lean — each answers a distinct question

**Alternatives Considered:**
- *Keep Artifacts as separate view* — Rejected: same artificial separation as Workflow/Tasks
- *Show artifacts inline under each task* — Rejected: not all artifacts map to a single task (spec is for the whole work request, ADRs span multiple tasks)
- *Add a third tab for project knowledge* — Deferred: project-level docs (context.md, architecture) can be a third tab in a future iteration

---

## DD-021: Knowledge as Separate Navigation Item

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** After merging Artifacts into Tasks as a tab (DD-020), the question arose: where do project-level persistent documents live? Initially proposed as a third tab inside Tasks, but knowledge is fundamentally different from work request data — it persists across all work requests, grows over time, and serves a different purpose (institutional memory vs. current work outputs).

**Decision:** Knowledge gets its own navigation item, separate from Tasks. The Knowledge view contains:

1. **Project Context** — Auto-generated tech stack, file structure, detected patterns (from `context.md`)
2. **Architecture Decisions (ADRs)** — Accumulated across all work requests, never archived
3. **Conventions** — Coding rules the agent follows (auto-detected + developer overrides)
4. **Boundaries** — Always / Ask first / Never rules
5. **Agent Capabilities** — Skills available, agents available, what's missing, with install prompts

**Navigation: 4 → 5 views:**
1. Tasks (with Tasks/Artifacts tabs — current work request only)
2. Activity (real-time agent timeline)
3. Knowledge (project-level, persistent)
4. History (past work requests)
5. Settings (configuration)

**File system mapping:**
```
.codestudio/
├── context.md              ← Project Context section
├── knowledge/
│   ├── adrs/               ← ADRs (accumulate, never archived)
│   ├── conventions.md      ← Conventions
│   ├── boundaries.md       ← Boundaries
│   └── capabilities.json   ← Agent Capabilities
├── workflows/current/
│   └── artifacts/          ← Artifacts tab (current work request only)
└── history/archive/        ← Past work request artifacts
```

**Rationale:**
- Knowledge is project-level, not work-request-level — different lifecycle, different scope
- Burying it in a tab would make it hard to find when no work request is active
- ADRs accumulate across work requests — they need a persistent home
- Agent capabilities (skills, agents, tools) are project-level configuration, not work request data
- The missing-capability alert (e.g., "security-auditor not installed") needs visibility

**Alternatives Considered:**
- *Third tab inside Tasks* — Rejected: knowledge persists when no work request is active; Tasks view would be empty but Knowledge would still have content
- *Part of Settings* — Rejected: knowledge is reference data the agent uses, not configuration the user sets
- *Part of History* — Rejected: history is past work requests; knowledge is current project state

---

## DD-022: Replace Activity with Capabilities View

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** The Activity view was a log viewer — a chronological timeline of agent actions. Audit revealed that all its useful information already lived in other views: current task status in Tasks, decisions in Knowledge (ADRs), audit trail in events.jsonl. Log viewers are rarely visited proactively — users glance at them when something breaks.

Meanwhile, the Agent Capabilities section was buried inside the Knowledge view. But capabilities are actionable — users need to install missing agents, see which skills are active, configure tools. That's more important than a log.

**Decision:** Replace Activity view with Capabilities view. The Capabilities view shows **user-added customizations** only (not built-in plumbing):

1. **Add Capability** — primary action to create new instructions, agents, skills, prompts, or hooks
2. **Summary** — counts of user-added: Instructions, Agents, Skills, Prompts, Hooks
3. **Custom Instructions** — `.codestudio/instructions/*.instructions.md` with applyTo patterns
4. **Custom Agents** — `.codestudio/agents/*.agent.md` (subagents for context-isolated tasks)
5. **Custom Skills** — `.codestudio/skills/<name>/SKILL.md` (reusable workflows with /slash commands)
6. **Custom Prompts** — `.codestudio/prompts/*.prompt.md` (parameterized single-task commands)
7. **Hooks** — `.codestudio/hooks/*.json` (deterministic lifecycle enforcement)

The Knowledge view's Agent Capabilities section is replaced with a link card to the Capabilities view.

**Navigation: still 5 views (swapped one for another):**
1. Tasks
2. Capabilities (replaces Activity)
3. Knowledge (loses capabilities section, gains link to Capabilities)
4. History
5. Settings

**Rationale:**
- Capabilities are actionable (add, edit, configure) — Activity was passive (read-only log)
- "What can I add to make the agent better?" is a question users ask — "What did the agent do 30s ago?" is not
- The audit trail (events.jsonl) is the source of truth for activity — the UI doesn't need to replicate it
- Agent activity is still visible in the Tasks view (active task badge, TDD phase, criteria progress)

**Note:** This decision was revised by DD-023 — the original DD-022 design showed built-in skills/agents with toggle switches, which violated DD-007 (skills are invisible). DD-023 corrected the view to show only user-added customizations.

**Alternatives Considered:**
- *Keep Activity, add Capabilities as 6th view* — Rejected: 6 views is too many; Activity doesn't earn its slot
- *Keep Activity, put Capabilities in Settings* — Rejected: capabilities are too important to bury in settings
- *Merge Activity into Tasks as a collapsible drawer* — Rejected: still a log viewer, just smaller

---

## DD-023: Capabilities View Shows User-Added Customizations, Not Built-In Plumbing

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** DD-022 designed the Capabilities view to show all 24 built-in engineering skills with toggle switches, and built-in specialist agents (code-reviewer, security-auditor, test-engineer, web-performance-auditor) with install buttons. This directly violated DD-007, which states that built-in skills are invisible plumbing — users never see skill names, skill files, or skill configuration. The workflow engine maps tasks to skills automatically.

Showing built-in skills with toggles creates several problems:
- Users don't know what "Context Engineering" or "Incremental Implementation" means — these are implementation details
- Toggling a built-in skill could break the workflow engine's assumptions (e.g., disabling git-workflow would leave commits unstructured)
- "Install" buttons for built-in agents are misleading — they're already bundled with the extension
- It turns the view into a skill management tool for power users, violating the "new developers" target audience

Meanwhile, Code Studio has a rich agent-customization system (`.codestudio/instructions/`, `.codestudio/agents/`, `.codestudio/skills/`, `.codestudio/prompts/`, `.codestudio/hooks/`) that lets users ADD their own capabilities. That's what users actually need to see and manage.

**Decision:** The Capabilities view shows **user-added customizations** only, organized by the agent-customization primitive types:

1. **Custom Instructions** — `.instructions.md` files with `applyTo` patterns that guide agent behavior for specific files
2. **Custom Agents** — `.agent.md` files that define subagents for context-isolated or multi-stage tasks
3. **Custom Skills** — `SKILL.md` files that bundle reusable workflows with scripts/templates, invoked via /slash commands
4. **Custom Prompts** — `.prompt.md` files for parameterized single-task commands
5. **Hooks** — `.json` files that enforce deterministic behavior at agent lifecycle events

Built-in engineering skills (the 24 from agent-skills), built-in specialist agents, LM tools, and the chat participant are NEVER shown in the UI. They are part of the extension's internal machinery — not user-configurable, not user-visible.

Built-in engineering skills (the 24 from agent-skills) and built-in specialist agents are activated automatically by the skill engine based on task type, context signals, and process level. LM tools and the chat participant are registered by the extension at activation — users interact with them in agent mode and chat, not in this view.

**Rationale:**
- Respects DD-007: built-in skills remain invisible plumbing
- Shows users what they can actually control — their own additions
- The agent-customization system is the right abstraction: users add project-specific knowledge, not toggle generic engineering practices
- The "Add Capability" primary action guides users toward the customization system
- LM tools and chat participant are used where they live (agent mode, chat) — surfacing them in a read-only list adds no value

**Alternatives Considered:**
- *Show built-in skills in an "Advanced Mode" toggle* — Rejected: DD-007 already deferred this to V2 via CLI (`codestudio skill run`), not the UI
- *Show built-in skills but make them read-only* — Rejected: seeing 24 skill names with no action is confusing, not helpful
- *Show LM tools and chat participant in a read-only section* — Rejected: users interact with these in agent mode and chat, not in a capabilities list; showing them here adds noise without value
- *Remove the Capabilities view entirely* — Rejected: user-added customizations still need a home

---

## DD-024: Capabilities View is a Recommendation Engine, Not a Registry

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** DD-023 made the Capabilities view show only user-added customizations. But this created a new problem: the view became a passive registry — it lists what you've added but doesn't help you decide what to add. Users don't know what's available or what's relevant to their project. Additionally, Syncfusion publishes 60+ official agent skills (DataGrid, Charts, Scheduler, RichTextEditor, Kanban, Diagram, etc.) at https://www.syncfusion.com/explore/agent-skills/ that users have no way to discover from within the extension.

The extension already has the intelligence to solve this: the ContextAnalyzer (Task 8) detects the tech stack, the ContextSignalDetector (Task 9) detects what the project touches (UI, API, auth, payments), and the RiskEngine (Task 5) detects risk signals. This context can drive proactive recommendations.

**Decision:** The Capabilities view is an intelligent recommendation engine with three zones:

### Zone 1: Recommended for This Project (context-aware)
The extension analyzes the project context and proactively recommends capabilities the user should add. Each recommendation has a **"Why"** explanation tied to what was detected:

| Detection | Recommendation | Why Text |
|-----------|---------------|----------|
| React + tabular data in components | Install Syncfusion DataGrid skill | "Your project has tabular data in 4 components" |
| No test framework detected | Create Testing Standards instruction | "No test framework detected. Adding testing conventions ensures the agent writes tests that match your standards." |
| Express routes in `src/api/` | Create API Conventions instruction | "Express routes detected in src/api/. Documenting your naming, versioning, and error format prevents the agent from guessing." |
| Stripe/payment integration | Create Security Hardening instruction | "Stripe payment integration detected. Adding security conventions ensures the agent follows PCI-aware patterns." |
| Dashboard screens in prototype | Install Syncfusion Charts skill | "Dashboard screens detected in prototype. Charts skill ensures correct chart types, data binding, and axis configuration." |
| `.designs/` folder present | Install syncfusion-components skill | "Design prototype detected. This skill converts HTML prototypes to production Syncfusion components." |

Recommendations are generated by a new `CapabilityRecommender` component that takes `ProjectContext` + `ContextSignal[]` as input and returns `Recommendation[]` with `{ type, title, description, reason, action }`.

### Zone 2: Installed (what you've added)
Shows currently installed customizations, grouped by type:
- Custom Instructions (`.codestudio/instructions/`)
- Syncfusion Component Skills (installed via `npx skills add syncfusion/react-ui-components-skills`)
- Custom Agents, Prompts, Hooks (collapsible if empty)

### Zone 3: Browse Syncfusion Skills (marketplace)
A browsable grid of all 60+ Syncfusion agent skills, filterable by category (Data, Charts, Inputs, Layout, Navigation, Editors, File/Doc). Each skill card shows:
- Component name (DataGrid, Charts, Scheduler, etc.)
- One-line description of what it covers
- npm package name
- Install button (or "Installed" badge)

This surfaces the Syncfusion skills marketplace (https://www.syncfusion.com/explore/agent-skills/) directly in the extension, making it discoverable without leaving the IDE.

**Rationale:**
- Solves the "I don't know what to add" problem — the extension tells you based on your project
- Syncfusion skills are a key differentiator for Code Studio — they should be front and center, not hidden
- The "Why" explanation builds trust — users understand why a recommendation is made
- Recommendations update as the project context changes (new dependencies, new files)
- The marketplace grid makes 60+ skills discoverable without overwhelming — filterable by category
- This is the intelligent layer that makes the Capabilities view earn its nav slot

**Alternatives Considered:**
- *Static list of all available skills* — Rejected: 60+ skills with no context is overwhelming; users can't evaluate relevance
- *Recommendations only, no browse* — Rejected: users may need a skill the detector didn't trigger on (e.g., Diagram for a flowchart the user hasn't built yet)
- *Separate "Syncfusion Skills" nav item* — Rejected: doesn't earn its own nav slot; belongs under Capabilities
- *AI-powered recommendations via LLM* — Rejected for M1: deterministic rules are sufficient and don't need a model call. V2 can add LLM enrichment for nuanced recommendations.

---

## DD-025: Skill Packs, Not Individual Skills — Plugin Marketplace Model

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** DD-024 introduced a browsable Syncfusion skill marketplace with individual skill cards. But Syncfusion publishes **14 platform repos**, each with **60+ skills** — totaling **700+ individual skills**. Browsing and installing individual skills is the wrong abstraction:

- 700+ skill cards is overwhelming — users can't evaluate relevance
- Users think "I'm building a React app" — not "I need DataGrid skill + Charts skill + Scheduler skill"
- Syncfusion distributes skills as per-framework repos: `npx skills add syncfusion/react-ui-components-skills -y` installs all 60+ at once
- The agent already auto-loads the right skill per component name in the query — users don't need to pick individual skills

The 14 Syncfusion skill pack repos:

| Platform | Repo | Skills | Category |
|----------|------|--------|----------|
| React | `syncfusion/react-ui-components-skills` | 60+ | Web |
| Angular | `syncfusion/angular-ui-components-skills` | 60+ | Web |
| Blazor | `syncfusion/blazor-ui-components-skills` | 60+ | Web |
| Vue | `syncfusion/vue-ui-components-skills` | 60+ | Web |
| JavaScript | `syncfusion/javascript-ui-controls-skills` | 60+ | Web |
| ASP.NET Core | `syncfusion/aspnet-core-ui-components-skills` | 60+ | .NET |
| .NET MAUI | `syncfusion/maui-ui-components-skills` | 60+ | .NET |
| WPF | `syncfusion/wpf-ui-controls-skills` | 60+ | .NET |
| WinUI | `syncfusion/winui-ui-controls-skills` | 60+ | .NET |
| WinForms | `syncfusion/winforms-ui-controls-skills` | 60+ | .NET |
| Document Editor | `syncfusion/document-editor-skills` | 60+ | Document |
| PDF Viewer | `syncfusion/pdf-viewer-skills` | 60+ | Document |
| DOCX Editor | `syncfusion/docx-editor-skills` | 60+ | Document |
| Spreadsheet Editor | `syncfusion/spreadsheet-editor-skills` | 60+ | Document |

**Decision:** The unit of installation is the **Skill Pack** (one GitHub repo = one platform's complete skill set), not individual skills. The Capabilities view's Zone 3 becomes a **Skill Pack Marketplace** with 14 packs, not 700+ individual skills.

### Marketplace structure:
- **14 packs** organized into 3 categories: Web (5), .NET (5), Document (4)
- Each pack card shows: platform name, skill count (60+), representative components, GitHub repo, install button
- Filter tabs: All (14), Web (5), .NET (5), Document (4)
- "Explore on syncfusion.com" link to https://www.syncfusion.com/explore/agent-skills/

### Installation:
- Install button runs `npx skills add syncfusion/<repo-name> -y`
- After install, all 60+ skills in the pack are available to the agent
- The agent auto-loads the right skill per component name in the query (e.g., "build a data grid" → loads DataGrid skill)
- Users never need to pick individual skills — the pack + agent handles selection

### Recommendation engine (Zone 1) updated:
- Detect React → recommend "Syncfusion React UI Components" pack (one recommendation, not 60)
- Detect Angular → recommend Angular pack
- Detect Blazor → recommend Blazor pack
- Detect .csproj → recommend ASP.NET Core or MAUI pack based on SDK type
- Detect PDF/document processing → recommend relevant Document SDK pack

### Installed section (Zone 2) updated:
- Shows installed packs (not individual skills) with "Manage" button
- Manage view shows the 60+ skills within the pack (read-only — for awareness, not toggling)

**Rationale:**
- **One decision, not 60** — "Install React UI Components" vs choosing 60 individual skills
- **Matches Syncfusion's distribution model** — they publish per-framework repos, not individual skills
- **Agent auto-selects within the pack** — after install, the agent matches by component name. This is already how Syncfusion skills work.
- **14 packs is browsable** — 700+ skills is not. Filterable by platform category.
- **Extensible** — third-party skill packs can be added to the marketplace in the future (community packs)
- **Simpler recommendation engine** — "you're using React, install the React pack" is one rule, not 60

**Alternatives Considered:**
- *Browse all 700+ individual skills* — Rejected: overwhelming, wrong abstraction level
- *Show only recommended pack, no marketplace* — Rejected: users may need a pack the detector didn't trigger on (e.g., Document SDK for a PDF feature the user hasn't built yet)
- *Let users pick individual skills from a pack* — Rejected: the agent already auto-loads the right skill per query; manual selection adds friction without value
- *Separate "Marketplace" nav item* — Rejected: doesn't earn its own nav slot; belongs under Capabilities

**Replaces:** DD-024's Zone 3 "Browse Syncfusion Skills" grid of 60+ individual skill cards → replaced by 14 pack cards.

---

## DD-026: Capabilities is a Smart Launcher, Not a Parallel UI

**Date:** 11 July 2026  
**Status:** Accepted  
**Context:** Code Studio already ships a native **Agent Customizations** panel with full management UI for:
- **Overview** — "Customize Your Agent" input + quick-create cards
- **Agents** — custom agent management
- **Skills** — skill management (shows count)
- **Instructions** — always-on instruction management
- **Hooks** — lifecycle hook management
- **MCP Servers** — external integration management (shows count)
- **Plugins** — plugin management

DD-022 through DD-025 progressively designed a Capabilities view with its own UI for managing instructions, agents, skills, prompts, hooks, and a Syncfusion skill pack marketplace. But this duplicates what Code Studio already provides natively. Building a parallel UI means:
- Double maintenance burden — our webview UI will go stale as Code Studio evolves
- Inconsistent UX — users see two different UIs for the same thing
- Wasted implementation time — we'd be rebuilding what already exists
- Users already know where customizations live — in the native panel

**Decision:** The Capabilities view is a **smart launcher** with three zones, not a management UI:

### Zone 1: Recommended for This Project (unchanged from DD-024)
Context-aware recommendations with "Why" explanations. This is the intelligence layer that the native panel doesn't have. Actions:
- **"Install Pack"** → runs `npx skills add syncfusion/<repo> -y` in terminal
- **"Create"** → opens the native Agent Customizations panel to the relevant section (Instructions, Agents, etc.) with pre-filled context

### Zone 2: Current Setup (summary + deep links)
A compact summary showing counts for each customization type, matching the native panel's sidebar:
- Skill Packs (1) → click opens native Plugins section
- Skills (11) → click opens native Skills section
- Instructions (2) → click opens native Instructions section
- Agents (0) → click opens native Agents section
- Hooks (0) → click opens native Hooks section
- MCP Servers (4) → click opens native MCP Servers section
- Plugins (2) → click opens native Plugins section

Each row shows: icon, name, description, count, chevron-right. Clicking opens the native panel via `vscode.commands.executeCommand`.

### Zone 3: Syncfusion Skill Pack Marketplace (unchanged from DD-025)
14 pack cards filterable by Web/.NET/Document. Install button runs `npx skills add`. This is the only part that doesn't exist in the native panel — it's our value-add.

**What we DON'T build:**
- No custom instruction editor (native panel has one)
- No agent editor (native panel has one)
- No skill file manager (native panel has one)
- No hook editor (native panel has one)
- No MCP server config (native panel has one)
- No plugin manager (native panel has one)

**What we DO build (our unique value):**
- Context-aware recommendations (Zone 1) — the native panel doesn't analyze your project
- Syncfusion skill pack marketplace (Zone 3) — the native panel doesn't surface these
- Summary dashboard with deep links (Zone 2) — quick overview without opening the full panel

**Rationale:**
- Don't rebuild what exists — leverage the native panel for all CRUD operations
- Our value is intelligence (recommendations) and discovery (marketplace), not management UI
- Deep links keep users in the native flow — they learn one place for customizations
- Reduces implementation scope significantly — no editors, no file managers, no CRUD
- The native panel is maintained by the Code Studio team — it will evolve and improve without our effort

**Alternatives Considered:**
- *Build full management UI in webview* — Rejected: duplicates native panel, double maintenance, inconsistent UX
- *Remove Capabilities view entirely, just use native panel* — Rejected: we lose the recommendation engine and Syncfusion marketplace, which are our unique value
- *Embed native panel inside our webview* — Rejected: not technically possible; webviews can't embed native panels

---

## Decision Index

| ID | Decision | Status |
|---|---|---|
| DD-001 | Adaptive Process Depth (Light/Standard/Thorough/Guarded) | Accepted |
| DD-002 | Git-Tracked Workflow State (.codestudio/ in repo) | Accepted |
| DD-003 | One Active Work Request at a Time (not a backlog) | Accepted |
| DD-004 | History Tiering Strategy (Hot/Warm/Cold) | Accepted |
| DD-005 | History Index File (archive/index.json) | Accepted |
| DD-006 | VS Code Native Design Language (colors, fonts, icons) | Accepted |
| DD-007 | Skills Are Invisible to Users | Accepted |
| DD-008 | Event Sourcing for Audit Trail (events.jsonl) | Accepted |
| DD-009 | Branch-Scoped Workflows | Accepted |
| DD-010 | Approval Levels with Smart Defaults | Accepted |
| DD-011 | Temporary Task Board, Not Permanent Backlog | Accepted |
| DD-012 | .codestudio/ Directory Naming | Accepted |
| DD-013 | Summary Auto-Generation on Archive | Accepted |
| DD-014 | Dynamic Workflow Generation (risk engine + conditional gates + mid-workflow promotion) | Accepted |
| DD-015 | Workflow Definition Schema (typed JSON with flat arrays, risk signals, reasons) | Accepted |
| DD-016 | Screen Consolidation: 14 → 7 Views | Accepted |
| DD-017 | Work Request Lifecycle: Three Workflow States (Empty/Active/Complete) | Accepted |
| DD-018 | Kill the Pipeline — Workflow Shows Outcomes, Not Process (inline approvals, 7→6 views) | Accepted |
| DD-019 | Merge Workflow + Tasks into Single Tasks View (6→5 views) | Accepted |
| DD-020 | Merge Artifacts into Tasks as Tab (5→4 views) | Accepted |
| DD-021 | Knowledge as Separate Navigation Item (4→5 views) | Accepted |
| DD-022 | Replace Activity with Capabilities View (actionable, not passive) | Accepted (revised by DD-023) |
| DD-023 | Capabilities Shows User-Added Customizations, Not Built-In Plumbing | Accepted |
| DD-024 | Capabilities View is a Recommendation Engine (context-aware + Syncfusion marketplace) | Accepted (revised by DD-025) |
| DD-025 | Skill Packs, Not Individual Skills — Plugin Marketplace Model (14 packs, 700+ skills) | Accepted |
| DD-026 | Capabilities is a Smart Launcher, Not a Parallel UI (delegate to native Agent Customizations) | Accepted |
