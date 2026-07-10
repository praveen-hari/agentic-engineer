# Code Studio Engineering Workspace — Application Architecture

> **DD-016 applied:** Consolidated from 14 screens → 7 views to eliminate navigation fatigue.  
> Each view answers exactly ONE question. Detail views use inline expansion, not page navigation.

## Navigation

### Pattern: Sidebar (collapsible) + Top bar

The sidebar contains the 7 primary views. The top bar contains contextual info and global actions.

**Primary navigation (sidebar):**
- Workflow → `workflow` (also serves as home + setup)
- Tasks → `tasks`
- Activity → `activity`
- Artifacts → `artifacts`
- Approvals → `approvals`
- History → `history`
- Settings → `settings`

**Secondary (top bar):**
- Search (global across all views)
- Current stage badge (e.g., "BUILD 4/7")
- Pending approvals count badge
- Theme toggle (dark/light)

## View Inventory

| # | View | Priority | Question It Answers | Description |
|---|------|----------|---------------------|-------------|
| 1 | `workflow` | P0 | "Where am I in the process?" | **Empty state:** new work request form (objective input, detected process level, stage config). **Active state:** current objective, visual lifecycle stages with status, progress bar, quality gates checklist, quick stats (tasks, artifacts, commits, approvals). This IS the home screen. |
| 2 | `tasks` | P0 | "What's being built?" | Tasks grouped by phase with status badges, dependency indicators, size labels. **Inline expansion:** click a task → it expands in-place showing acceptance criteria, changed files, test evidence, agent decisions (tabs within the expanded row). No separate task-detail page. |
| 3 | `activity` | P0 | "What's the agent doing now?" | Real-time agent timeline: current task, TDD phase, active skills, execution log with timestamps, decisions with rationale and source citations. Pause/resume agent button. |
| 4 | `artifacts` | P1 | "What's been produced?" | All generated artifacts by type (specs, plans, ADRs, reviews, context, reports) with status and timestamps. **Inline expansion:** click an artifact → it expands in-place showing full content with rendered markdown. Includes project context as a special artifact type. Review reports render inline with five-axis scores and findings. |
| 5 | `approvals` | P1 | "What needs my decision?" | **Pending section:** items needing action with risk level, context summary, approve/reject/comment buttons. Clicking "Review" expands the artifact content inline. **Completed section:** approval history with timestamps and outcomes. Badge count shown in sidebar. |
| 6 | `history` | P1 | "What did we do before?" | Completed work requests grouped by month with summary stats (tasks, files, lines, tests, PR#). **Inline expansion:** click an entry → it expands showing completed workflow pipeline, artifact list, key decisions, approval timeline, commit list. Warm/cold tier entries show "Summary Only" with restore button. |
| 7 | `settings` | P2 | "How do I configure this?" | Process defaults (default level, auto-approve, review timeout), history management (tier thresholds, usage stats), agent configuration (specialist agent toggles). |

**Total: 7 views** (3 P0, 3 P1, 1 P2)

## Inline Expansion Pattern

Instead of navigating to a separate detail page, detail content expands within the list view:

```
┌─────────────────────────────────────┐
│ ▸ Task 3: Create payment model  [S] │  ← collapsed (default)
├─────────────────────────────────────┤
│ ▾ Task 4: POST /api/payments    [M] │  ← expanded (clicked)
│   ┌─────────────────────────────┐   │
│   │ [Criteria] [Files] [Tests] [Log]│  ← tabs within expansion
│   │                                 │
│   │ ✅ Returns 201 with client_se…  │
│   │ ✅ Validates amount > 0         │
│   │ 🔄 Handles Stripe API errors    │
│   │ ○  Idempotency key support      │
│   └─────────────────────────────┘   │
├─────────────────────────────────────┤
│ ▸ Task 5: Error handling middleware  │  ← collapsed
└─────────────────────────────────────┘
```

**Benefits:**
- No context loss — the user sees the detail within the list
- Back button not needed — collapse to return to list
- Keyboard navigable — arrow keys move between items, Enter expands/collapses

## Key User Journeys

### Journey 1: Start a New Feature (End-to-End)
`workflow` (empty state → fill form → start) → `workflow` (watch stages activate) → `approvals` (review spec) → `tasks` (watch tasks appear) → `activity` (monitor agent) → `tasks` (expand task, check tests) → `approvals` (approve review) → `workflow` (see completion)

**5 view switches** (down from 8 page navigations in the old design).

### Journey 2: Monitor Agent Progress
`activity` → `tasks` (expand active task)

**1 view switch** (down from 3).

### Journey 3: Review and Approve
`approvals` (expand artifact inline → approve/reject)

**0 view switches** — everything happens within the approvals view (down from 3).

### Journey 4: Understand Project Context
`artifacts` (expand context.md)

**0 view switches** — context is an artifact that expands inline (down from 1).

### Journey 5: Check Past Work
`history` (expand a completed request → browse artifacts, decisions, commits)

**0 view switches** — all detail is inline (down from 2).

## View States

### Workflow View — Three States

| State | Trigger | Content |
|-------|---------|---------|
| **Empty** | No active work request | New work request form: objective input, AI analysis panel, process level selector, "Start Workflow" button |
| **Active** | Work request in progress | Current objective, stage pipeline, progress bar, quality gates, stats grid, recommended next action |
| **Complete** | All stages done | Completion summary with "Archive & Start New" button, links to review report and artifacts |

### Approvals View — Badge System

The sidebar shows a count badge on the Approvals icon when items are pending:
- 🔴 Red badge = critical/high-risk approval pending
- 🟡 Yellow badge = standard approval pending
- No badge = all clear

## Standalone Pages
None — all views use the app shell with sidebar navigation. Detail content uses inline expansion within each view.
