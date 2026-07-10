# Code Studio Engineering Workspace — Application Architecture

## Navigation

### Pattern: Sidebar (collapsible) + Top bar

This simulates Code Studio's extension sidebar. The sidebar contains the primary navigation sections of the Engineering Workspace. The top bar contains search, notifications, and user actions.

**Primary navigation (sidebar):**
- Home → `home`
- Workflow → `workflow`
- Tasks → `task-board`
- Artifacts → `artifacts`
- Activity → `agent-activity`
- Approvals → `approvals`
- Context → `project-context`

**Secondary (top bar):**
- Search
- Current stage badge (e.g., "BUILD 4/7")
- Theme toggle (dark/light)
- Settings icon

## Screen Inventory

| # | Screen | Type | Priority | Description |
|---|--------|------|----------|-------------|
| 1 | `home` | dashboard | P0 | Current objective, progress bar, active task, pending approvals, recent activity, recommended next action |
| 2 | `workflow` | detail | P0 | Visual lifecycle stages with status (completed/active/pending/skipped), quality gates checklist, artifacts list |
| 3 | `task-board` | list | P0 | Tasks grouped by phase with status badges, dependency indicators, size labels, file counts, test evidence |
| 4 | `task-detail` | detail | P0 | Single task with description, acceptance criteria, changed files, test results, commits, agent log |
| 5 | `artifact-review` | detail | P0 | Full artifact content (spec/plan/ADR/review) with approve/reject/comment actions |
| 6 | `agent-activity` | detail | P0 | Real-time agent timeline: actions, decisions, tool usage, TDD phase, source citations |
| 7 | `approvals` | list | P1 | Pending approvals with risk level, context, approve/reject buttons; completed approvals history |
| 8 | `artifacts` | list | P1 | All generated artifacts by type (specs, plans, ADRs, reviews, reports) with status and timestamps |
| 9 | `project-context` | detail | P1 | Repository summary, tech stack, conventions, commands, boundaries, architecture overview |
| 10 | `workflow-setup` | form | P1 | New work request form: objective input, detected process level, stage configuration |
| 11 | `review-report` | detail | P1 | Five-axis code review with findings categorized by severity (Critical/Required/Optional/Nit/FYI) |
| 12 | `settings` | settings | P2 | Extension settings: default process level, approval preferences, agent configuration |

**Total: 12 screens** (6 P0, 4 P1, 2 P2)

## Key User Journeys

### Journey 1: Start a New Feature (End-to-End)
`home` → `workflow-setup` → `workflow` → `artifact-review` (spec) → `task-board` → `agent-activity` → `task-detail` → `artifact-review` (review) → `home`

The developer opens the workspace, starts a new work request, sees the workflow stages activate, reviews the generated spec, watches tasks appear on the board, monitors agent progress, reviews individual task results, approves the final code review, and returns to home showing completion.

### Journey 2: Monitor Agent Progress
`home` → `agent-activity` → `task-detail` → `task-board`

The developer checks what the agent is currently doing, drills into the active task to see changed files and test evidence, then views the overall task board for progress.

### Journey 3: Review and Approve
`home` → `approvals` → `artifact-review` → `approvals`

The developer sees pending approvals on home, opens the approval center, reviews an artifact (spec, plan, or review report), approves or requests changes, returns to see remaining approvals.

### Journey 4: Understand Project Context
`home` → `project-context`

The developer views the auto-generated project context to understand what the agents know about the codebase — tech stack, conventions, commands, and boundaries.

## Standalone Pages
None — all screens use the app shell with sidebar navigation. This simulates the Code Studio extension experience where all views are within the same panel.
