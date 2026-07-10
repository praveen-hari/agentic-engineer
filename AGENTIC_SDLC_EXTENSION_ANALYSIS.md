# Agentic SDLC Extension for Code Studio — Analysis & Design

**Version:** 1.0  
**Date:** 10 July 2026  
**Status:** Design Proposal  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Problem](#2-current-problem)
3. [Repository Findings](#3-repository-findings)
4. [Recommended Product Concept](#4-recommended-product-concept)
5. [Proposed SDLC Workflow](#5-proposed-sdlc-workflow)
6. [Skill-to-Workflow Mapping](#6-skill-to-workflow-mapping)
7. [Information Architecture](#7-information-architecture)
8. [Main Screen Designs](#8-main-screen-designs)
9. [Agent and Workflow Architecture](#9-agent-and-workflow-architecture)
10. [Human Approval Model](#10-human-approval-model)
11. [Guided and Advanced User Experiences](#11-guided-and-advanced-user-experiences)
12. [Risks and Mitigation](#12-risks-and-mitigation)
13. [MVP Scope](#13-mvp-scope)
14. [Future Roadmap](#14-future-roadmap)
15. [Final Recommendation](#15-final-recommendation)

---

## 1. Executive Summary

Code Studio has an opportunity to become the first IDE where AI agents don't just write code — they **engineer software properly**. Today, every major AI coding tool (Cursor, Windsurf, GitHub Copilot) treats chat as the entire development experience. The result: developers "vibe code" their way into fragile, undocumented, untested software that becomes expensive to maintain.

This document proposes **Code Studio Engineering Workspace** — a first-party extension that provides a structured, visual, agentic software-engineering experience. The extension automatically applies the right amount of engineering rigor based on task type, complexity, and risk. A typo fix gets zero ceremony. A new feature gets requirements, a plan, tests, and review. A database migration gets explicit approval gates.

The extension draws on the 24 production-grade engineering skills from the `addyosmani/agent-skills` repository, but does not expose them as raw skills. Instead, it converts them into an invisible engine that powers adaptive workflows, quality gates, and verification checkpoints — all surfaced through a visual UI that makes good engineering practices the path of least resistance.

**Key differentiator:** Chat-based AI coding tools optimize for *speed of code generation*. Code Studio Engineering Workspace optimizes for *confidence in the output* — software you can understand, test, maintain, and ship.

**Binding constraint:** User adoption risk. If the extension feels like overhead, bureaucracy, or a project-management tool, it fails. Every design decision prioritizes lightweight, progressive, immediately useful experiences.

---

## 2. Current Problem

### 2.1 What Breaks When Development Happens Entirely in Chat

Chat is a communication medium, not a development environment. When the entire SDLC runs through chat:

| What Gets Lost | Why It Matters |
|---|---|
| **Requirements** | Buried in conversation history. No structured artifact to verify against. Agents build what they infer, not what was specified. |
| **Architecture decisions** | Made implicitly by the agent. No ADR, no rationale, no record of alternatives considered. Future changes re-decide the same questions. |
| **Task structure** | No dependency ordering, no progress tracking, no checkpoints. The agent works on whatever seems next, not what's strategically ordered. |
| **Project context** | Scattered across sessions. Each new chat starts with stale or missing context. Agents hallucinate APIs, ignore conventions, reinvent existing utilities. |
| **Quality evidence** | "Tests pass" is a chat message, not a verifiable artifact. No test reports, no coverage data, no security scan results, no performance baselines. |
| **Approval history** | Critical decisions (adding dependencies, changing schemas, modifying auth) happen without explicit approval. No audit trail. |
| **Progress visibility** | The user cannot answer "what has been done?" or "what's left?" without re-reading the entire conversation. |
| **Resumability** | If the session ends, context is lost. Resuming requires re-explaining everything. Long-running work becomes fragile. |

### 2.2 The Vibe Coding Problem

"Vibe coding" — asking an AI to generate features through unstructured conversation — produces software with predictable failure modes:

1. **No requirements → scope creep and misalignment.** The agent builds what it infers. The user discovers misalignment after code exists, when switching costs are real.
2. **No architecture → accidental complexity.** Each feature is implemented in isolation. No consistent patterns, no module boundaries, no dependency direction.
3. **No planning → inefficient execution.** The agent tackles work in whatever order it encounters it, not in dependency order. Foundation work gets skipped; integration breaks.
4. **No testing → silent regressions.** Tests are skipped "to save time." Each change risks breaking previous work. The codebase becomes a minefield.
5. **No review → quality drift.** Code quality degrades incrementally. Security vulnerabilities, performance anti-patterns, and accessibility failures accumulate.
6. **No documentation → knowledge loss.** The only record of why decisions were made is buried in chat history that nobody will re-read.

### 2.3 Impact by Developer Experience Level

| Developer Type | Chat-Only Impact |
|---|---|
| **New developers** | Don't know what engineering practices to ask for. Accept whatever the agent produces. Build confidence in fragile software. Learn bad habits. |
| **Experienced developers** | Know what's missing but can't enforce it through chat. Spend time manually checking agent output. Eventually give up and do it themselves. |
| **Team leads** | Cannot verify what agents did, what was tested, what was reviewed. No visibility into quality. Cannot enforce standards across team members' chat sessions. |

### 2.4 What Chat Is Good For

Chat is not the problem. Chat is excellent for:
- Giving natural-language instructions
- Asking questions and getting explanations
- Iterating on specific code changes
- Debugging with conversational context

The problem is making chat the **only** interface. Chat should be one interaction method within a larger engineering experience — the way a terminal is one tool within an IDE, not the entire IDE.

---

## 3. Repository Findings

### 3.1 Repository Structure Overview

The `addyosmani/agent-skills` repository contains:

- **24 skills** organized into 6 lifecycle phases: Define (3), Plan (1), Build (7), Verify (2), Review (4), Ship (6)
- **4 specialist agent personas**: code-reviewer, security-auditor, test-engineer, web-performance-auditor
- **7 reference checklists**: definition-of-done, testing-patterns, security-checklist, performance-checklist, accessibility-checklist, observability-checklist, orchestration-patterns
- **8 slash commands** mapping to lifecycle phases: /spec, /plan, /build, /test, /review, /webperf, /code-simplify, /ship
- **Session lifecycle hooks** for automatic skill activation

### 3.2 Skill Anatomy — Key Design Patterns

Every skill follows a consistent structure that is directly translatable to extension capabilities:

| Skill Component | Extension Translation |
|---|---|
| **When to Use / When NOT to Use** | Automatic skill selection engine — the system decides when to activate a skill based on task type, complexity, and risk |
| **Process (numbered steps)** | Workflow steps with entry/exit criteria — the extension tracks which step the agent is on |
| **Verification checklist** | Quality gates — the extension displays verification status and blocks progression until gates pass |
| **Common Rationalizations table** | Agent guardrails — the system detects when an agent is about to skip a step and intervenes |
| **Red Flags** | Automated warnings — the extension monitors agent behavior and surfaces red flags in the UI |
| **Anti-patterns** | Policy enforcement — the system prevents known bad patterns |

### 3.3 Skill Classification for Extension Integration

#### Skills That Should Run Automatically (Invisible to User)

| Skill | Why Automatic | Extension Behavior |
|---|---|---|
| `using-agent-skills` | Meta-skill for skill discovery | Replaced by the extension's workflow engine — the engine IS the skill router |
| `context-engineering` | Context management | The extension manages project context automatically — loads rules files, relevant source, specs per task |
| `source-driven-development` | Documentation verification | Runs in background during implementation — flags unverified framework patterns |
| `git-workflow-and-versioning` | Commit discipline | Enforced automatically — atomic commits, descriptive messages, pre-commit checks |
| `doubt-driven-development` | Adversarial review | Triggered automatically for high-risk decisions — the extension spawns a fresh-context reviewer without user action |

#### Skills That Require User Interaction

| Skill | Why Interactive | Extension Behavior |
|---|---|---|
| `interview-me` | Extracts user intent through dialogue | Powers the "Capture Objective" step — the extension interviews the user before any work begins |
| `idea-refine` | Divergent/convergent thinking with user | Powers the "Refine Idea" optional step — generates variations, user selects direction |
| `spec-driven-development` | Spec requires user review and approval | Generates spec artifact, presents for review in Artifact Review panel |
| `planning-and-task-breakdown` | Plan requires user approval | Generates task breakdown, presents in Task Board for review |

#### Skills That Should Behave as Quality Gates

| Skill | Gate Type | When It Blocks |
|---|---|---|
| `test-driven-development` | Hard gate | Cannot mark a task "done" without passing tests |
| `code-review-and-quality` | Hard gate | Cannot merge without five-axis review passing |
| `security-and-hardening` | Conditional gate | Blocks when task touches auth, user input, external integrations, or data storage |
| `performance-optimization` | Conditional gate | Blocks when task affects critical user flows or adds significant bundle size |
| `shipping-and-launch` | Hard gate | Cannot deploy without pre-launch checklist completion |

#### Skills That Should Be Background Policies

| Skill | Policy Behavior |
|---|---|
| `incremental-implementation` | Agent is constrained to work in thin vertical slices — the extension enforces one-task-at-a-time execution |
| `code-simplification` | Runs as a post-implementation pass — the extension suggests simplifications before review |
| `documentation-and-adrs` | Automatically prompts for ADR when architectural decisions are detected |
| `observability-and-instrumentation` | Reminds agent to add telemetry when implementing features with I/O, retries, or external calls |
| `deprecation-and-migration` | Activated when removing or replacing existing systems |
| `ci-cd-and-automation` | Validates CI pipeline exists and quality gates are configured |

#### Specialist Agents That Can Be Reused

| Agent | Extension Role |
|---|---|
| `code-reviewer` | Powers the Review quality gate — five-axis review with severity labels |
| `security-auditor` | Powers the Security gate — OWASP assessment, threat modeling |
| `test-engineer` | Powers the Testing gate — coverage analysis, test strategy |
| `web-performance-auditor` | Powers the Performance gate — Core Web Vitals audit |

#### Concepts That Should NOT Be Exposed to End Users

- Skill file names and paths (e.g., `skills/test-driven-development/SKILL.md`)
- Skill frontmatter and metadata format
- Anti-rationalization tables (used internally by agents, not shown to users)
- Orchestration pattern names (fan-out, pipeline, etc.)
- Agent persona file structure
- The distinction between skills, personas, and commands

### 3.4 Complete Skill-to-Extension Mapping

| Repository Concept | Code Studio Capability | UI Representation | Trigger Method | Expected Artifact |
|---|---|---|---|---|
| `interview-me` | Objective Capture | Guided interview dialog in sidebar | User starts new work request | Confirmed statement of intent |
| `idea-refine` | Idea Exploration | Divergent/convergent thinking panel | User has vague idea, optional step | One-pager with problem statement, direction, assumptions, MVP scope |
| `spec-driven-development` | Specification Generator | Artifact review panel with 6-section spec | Automatic for features; skipped for bug fixes | Spec document (objective, commands, structure, style, testing, boundaries) |
| `planning-and-task-breakdown` | Task Planner | Task board with dependency graph | Automatic after spec approval | `tasks/plan.md` + `tasks/todo.md` with sized, ordered tasks |
| `incremental-implementation` | Execution Engine | Task progress tracker with slice-by-slice view | Automatic during implementation | Committed code increments, each tested |
| `test-driven-development` | Testing Gate | Test evidence panel (red→green→refactor cycle) | Automatic during implementation | Test files, coverage report, pass/fail status |
| `context-engineering` | Context Manager | Project context panel (read-only for user) | Automatic — loads right context per task | Rules file, spec sections, relevant source loaded per task |
| `source-driven-development` | Documentation Verifier | Citation badges on framework-specific code | Background during implementation | Source citations in code comments |
| `doubt-driven-development` | Risk Reviewer | "Second opinion" indicator on high-risk decisions | Automatic for non-trivial decisions | Adversarial review findings, classified as actionable/trade-off/noise |
| `frontend-ui-engineering` | UI Quality Policy | Accessibility and design system warnings | Background when building UI | Accessibility audit results, design system compliance |
| `api-and-interface-design` | API Contract Validator | Contract-first design panel | When creating/modifying APIs | Typed API contracts, validation schemas |
| `browser-testing-with-devtools` | Browser Verification | Live browser preview with DevTools data | When verifying UI changes | Screenshots, console logs, network traces, performance data |
| `debugging-and-error-recovery` | Debug Assistant | Triage checklist panel | When tests fail or errors occur | Root cause analysis, regression test |
| `code-review-and-quality` | Review Gate | Five-axis review panel with severity labels | Before merge/commit of completed work | Review report with Critical/Required/Optional/Nit/FYI findings |
| `code-simplification` | Simplification Suggestions | Inline suggestions in editor | Post-implementation, pre-review | Simplified code alternatives |
| `security-and-hardening` | Security Gate | Security checklist panel with OWASP mapping | When task touches auth, input, data, external services | Security audit report, vulnerability findings |
| `performance-optimization` | Performance Gate | Core Web Vitals dashboard, bundle size tracker | When performance requirements exist or regressions detected | Performance report with before/after measurements |
| `git-workflow-and-versioning` | Version Control Policy | Commit message validation, branch management | Always active | Atomic commits, clean history, change summaries |
| `ci-cd-and-automation` | CI/CD Integration | Pipeline status in workflow view | When deploying or setting up CI | CI configuration, quality gate pipeline |
| `deprecation-and-migration` | Migration Planner | Migration checklist panel | When removing/replacing systems | Migration plan, strangler/adapter pattern implementation |
| `documentation-and-adrs` | Documentation Generator | ADR template panel, README updater | When architectural decisions are made | ADR documents, updated README, API docs |
| `observability-and-instrumentation` | Telemetry Reminder | Instrumentation checklist | When implementing features with I/O or external calls | Structured logging, metrics, traces |
| `shipping-and-launch` | Launch Checklist | Pre-launch verification panel | Before deployment | Completed pre-launch checklist, rollback plan, monitoring setup |
| `definition-of-done` (reference) | Done Criteria | Task completion gate | Before marking any task done | Verified checklist (correctness, quality, integration, docs, ship-readiness) |
| `orchestration-patterns` (reference) | Agent Coordination | Agent activity panel | Internal — governs how agents compose | Proper fan-out, no anti-patterns |
| Agent personas (4) | Specialist Reviewers | Review panels with specialist perspectives | Automatic at quality gates | Specialist review reports |

---

## 4. Recommended Product Concept

### 4.1 Product Name

**Code Studio Engineering Workspace** (internal codename: "Forge")

### 4.2 One-Line Positioning

> The IDE that makes proper software engineering the path of least resistance — even when AI agents do the building.

### 4.3 Core Concept: Adaptive Process Depth

The extension does NOT force every task through a full SDLC. Instead, it automatically calibrates the engineering rigor based on three factors:

```
┌─────────────────────────────────────────────────────────┐
│                  ADAPTIVE PROCESS DEPTH                  │
│                                                         │
│  Task Type  ──┐                                         │
│               ├──→  Risk Assessment  ──→  Process Level  │
│  Complexity ──┤         Engine                          │
│               │                                         │
│  Risk Level ──┘                                         │
│                                                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  Light  │  │ Standard │  │ Thorough │  │ Guarded │  │
│  │         │  │          │  │          │  │         │  │
│  │ Fix typo│  │ Add feat │  │ New arch │  │ DB migr │  │
│  │ Update  │  │ Bug fix  │  │ API desgn│  │ Auth chg│  │
│  │ config  │  │ Refactor │  │ New svc  │  │ Deploy  │  │
│  │         │  │          │  │          │  │         │  │
│  │ Context │  │ Context  │  │ Context  │  │ Context │  │
│  │ Plan    │  │ Spec     │  │ Spec     │  │ Spec    │  │
│  │ Impl    │  │ Plan     │  │ Plan     │  │ Plan    │  │
│  │ Test    │  │ Tasks    │  │ Tasks    │  │ Tasks   │  │
│  │ Commit  │  │ Impl     │  │ Arch/ADR │  │ Arch/ADR│  │
│  │         │  │ Test     │  │ Impl     │  │ Approval│  │
│  │         │  │ Review   │  │ Test     │  │ Impl    │  │
│  │         │  │ Commit   │  │ Security │  │ Test    │  │
│  │         │  │          │  │ Perf     │  │ Security│  │
│  │         │  │          │  │ Review   │  │ Perf    │  │
│  │         │  │          │  │ Docs     │  │ Review  │  │
│  │         │  │          │  │ Commit   │  │ Docs    │  │
│  │         │  │          │  │          │  │ Approval│  │
│  │         │  │          │  │          │  │ Deploy  │  │
│  └─────────┘  └──────────┘  └──────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Process levels:**

| Level | Trigger | Steps | Approvals |
|---|---|---|---|
| **Light** | Single-file fix, config change, documentation update | Context → Plan → Implement → Test → Commit | None |
| **Standard** | Multi-file feature, bug fix, refactor | Context → Spec → Plan → Tasks → Implement → Test → Review → Commit | Review before merge |
| **Thorough** | New architecture, API design, new service, major feature | Context → Spec → Architecture/ADR → Plan → Tasks → Implement → Test → Security → Performance → Review → Docs → Commit | Spec approval, architecture approval, review before merge |
| **Guarded** | Database migration, auth changes, deployment, security-sensitive operations | All Thorough steps + explicit approval gates at key decision points | Multiple explicit approvals |

The user can always override: promote a Light task to Standard, or demote a Thorough task to Standard if they accept the risk.

### 4.4 Supported Work Types

| Work Type | Default Process Level | Typical Workflow |
|---|---|---|
| **Greenfield project** | Thorough | Full lifecycle from idea to deployment |
| **New feature** | Standard or Thorough | Spec → Plan → Build → Test → Review |
| **Bug fix** | Light or Standard | Reproduce → Fix → Guard → Review |
| **Refactoring** | Standard | Spec (behavior preservation) → Plan → Incremental changes → Test → Review |
| **Migration** | Guarded | Migration plan → Incremental migration → Verification → Cleanup |
| **Production incident** | Light (immediate) → Standard (follow-up) | Triage → Fix → Guard → Post-mortem |
| **Documentation** | Light | Context → Write → Review |
| **Dependency update** | Standard | Audit → Update → Test → Review |
| **Existing/brownfield project** | Standard | Analyze → Context → Incremental improvement |

---

## 5. Proposed SDLC Workflow

### 5.1 Lifecycle Stages

After analyzing the 21 stages proposed in the original brief, I recommend consolidating to **8 stages** that map cleanly to the repository's 6 phases while adding onboarding and deployment:

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  ONBOARD │──→│  DEFINE  │──→│   PLAN   │──→│  BUILD   │
│          │   │          │   │          │   │          │
│ Analyze  │   │ Capture  │   │ Break    │   │ Implement│
│ workspace│   │ objective│   │ into     │   │ slice by │
│ Generate │   │ Write    │   │ tasks    │   │ slice    │
│ context  │   │ spec     │   │ Order by │   │ Test each│
│ Configure│   │ Design   │   │ deps     │   │ Commit   │
│ agents   │   │ arch     │   │ Size     │   │ each     │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                  │
┌──────────┐   ┌──────────┐   ┌──────────┐       │
│  SHIP    │←──│  REVIEW  │←──│  VERIFY  │←──────┘
│          │   │          │   │          │
│ Pre-     │   │ Code     │   │ Test     │
│ launch   │   │ review   │   │ suite    │
│ checklist│   │ Security │   │ Security │
│ Deploy   │   │ Perf     │   │ Perf     │
│ Monitor  │   │ Docs     │   │ Browser  │
│ Rollback │   │ Approve  │   │ Evidence │
└──────────┘   └──────────┘   └──────────┘
```

### 5.2 Stage Details

#### Stage 1: ONBOARD (runs once per project, or on first extension activation)

**Purpose:** Understand the workspace and establish project context.

**Steps:**
1. Detect workspace type (new/existing, language, framework, dependencies)
2. Analyze repository structure, conventions, patterns
3. Generate project context document (tech stack, commands, conventions, boundaries)
4. Configure agents and skills based on detected stack
5. Create/update rules file (`.codestudio/context.md`)
6. Detect existing CI/CD, testing, and deployment configuration

**Skills activated:** `context-engineering`  
**Artifacts produced:** Project context document, rules file  
**Approval required:** User confirms context accuracy  
**Adaptive behavior:** Skipped for returning projects where context exists and is current

#### Stage 2: DEFINE (per work request)

**Purpose:** Capture what the user wants and produce a specification.

**Steps:**
1. Capture user's objective (natural language or structured input)
2. Assess task type, complexity, and risk → determine process level
3. For Standard+: Interview user to clarify requirements (powered by `interview-me`)
4. For Standard+: Generate specification with 6 sections (powered by `spec-driven-development`)
5. For Thorough+: Generate architecture decision record (powered by `documentation-and-adrs`)
6. For Thorough+: Design API contracts if applicable (powered by `api-and-interface-design`)
7. Present artifacts for user review and approval

**Skills activated:** `interview-me`, `idea-refine` (optional), `spec-driven-development`, `api-and-interface-design`, `documentation-and-adrs`  
**Artifacts produced:** Statement of intent, specification, ADR (if applicable), API contracts (if applicable)  
**Approval required:** User approves spec before proceeding  
**Adaptive behavior:** Light tasks skip directly to PLAN with a minimal one-line spec

#### Stage 3: PLAN (per work request)

**Purpose:** Break the specification into executable tasks.

**Steps:**
1. Identify dependency graph
2. Slice vertically (not horizontally)
3. Size each task (XS/S/M/L — reject XL, break down further)
4. Order by dependencies, risk-first
5. Add verification checkpoints between phases
6. Present task board for user review

**Skills activated:** `planning-and-task-breakdown`  
**Artifacts produced:** `tasks/plan.md`, `tasks/todo.md`, task board  
**Approval required:** User approves plan before implementation  
**Adaptive behavior:** Light tasks get a single auto-generated task; Standard tasks get 3-8 tasks

#### Stage 4: BUILD (per task)

**Purpose:** Implement one task at a time in thin vertical slices.

**Steps (per task):**
1. Load task context (relevant files, spec section, patterns)
2. Write failing test (RED)
3. Implement minimal code to pass (GREEN)
4. Refactor for clarity (REFACTOR)
5. Run full test suite
6. Run build
7. Commit with descriptive message
8. Move to next task

**Skills activated:** `incremental-implementation`, `test-driven-development`, `context-engineering`, `source-driven-development`, `frontend-ui-engineering` (if UI), `api-and-interface-design` (if API), `doubt-driven-development` (if high-risk), `observability-and-instrumentation` (if I/O)  
**Artifacts produced:** Code changes, test files, commits  
**Approval required:** None for individual tasks (automated verification); Guarded tasks require approval before destructive operations  
**Adaptive behavior:** Light tasks execute all steps automatically; Standard tasks show progress; Thorough tasks pause for review at checkpoints

#### Stage 5: VERIFY (after all tasks complete)

**Purpose:** Prove the implementation works end-to-end.

**Steps:**
1. Run full test suite (unit + integration + e2e)
2. Run build
3. Run linter and type checker
4. For Standard+: Browser verification (if UI changes)
5. For Thorough+: Security scan
6. For Thorough+: Performance measurement
7. Compile evidence report

**Skills activated:** `test-driven-development`, `browser-testing-with-devtools`, `security-and-hardening`, `performance-optimization`  
**Artifacts produced:** Test report, security report, performance report, screenshots  
**Approval required:** None (automated gates)  
**Adaptive behavior:** Light tasks run tests only; Standard adds browser verification; Thorough adds security and performance

#### Stage 6: REVIEW (before merge)

**Purpose:** Multi-axis quality review of the complete change.

**Steps:**
1. Five-axis code review (correctness, readability, architecture, security, performance)
2. Categorize findings (Critical, Required, Optional, Nit, FYI)
3. For Thorough+: Specialist security review
4. For Thorough+: Specialist performance review
5. Check Definition of Done
6. Present review for user approval

**Skills activated:** `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`  
**Agents activated:** `code-reviewer`, `security-auditor` (Thorough+), `web-performance-auditor` (Thorough+)  
**Artifacts produced:** Review report with findings and severity labels  
**Approval required:** User approves review (explicit yes, not "sounds good")  
**Adaptive behavior:** Light tasks get automated review only; Standard gets full review; Thorough gets specialist reviews

#### Stage 7: SHIP (when deploying)

**Purpose:** Deploy safely with monitoring and rollback.

**Steps:**
1. Complete pre-launch checklist (code quality, security, performance, accessibility, infrastructure, documentation)
2. Configure feature flags (if applicable)
3. Plan staged rollout
4. Document rollback strategy
5. Deploy to staging → verify → deploy to production
6. Monitor for first hour (error rate, latency, business metrics)

**Skills activated:** `shipping-and-launch`, `ci-cd-and-automation`, `observability-and-instrumentation`  
**Artifacts produced:** Pre-launch checklist, rollback plan, deployment log  
**Approval required:** Explicit approval before production deployment  
**Adaptive behavior:** Light tasks skip SHIP entirely (just commit); Standard tasks prepare for merge; Thorough/Guarded tasks go through full deployment process

#### Stage 8: MAINTAIN (ongoing)

**Purpose:** Monitor, learn, and improve.

**Steps:**
1. Monitor production metrics
2. Respond to incidents (triggers `debugging-and-error-recovery`)
3. Plan deprecation of old systems (triggers `deprecation-and-migration`)
4. Update project context as codebase evolves

**Skills activated:** `debugging-and-error-recovery`, `deprecation-and-migration`, `observability-and-instrumentation`  
**Artifacts produced:** Incident reports, deprecation plans, updated context  
**Approval required:** None (reactive)  
**Adaptive behavior:** Only active when issues arise or maintenance is needed

### 5.3 Stage Applicability by Work Type

| Work Type | ONBOARD | DEFINE | PLAN | BUILD | VERIFY | REVIEW | SHIP | MAINTAIN |
|---|---|---|---|---|---|---|---|---|
| Greenfield project | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ |
| New feature | ⚡ Quick | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ⚡ Merge | ✅ |
| Bug fix | ⚡ Quick | ⚡ Minimal | ⚡ Auto | ✅ Full | ✅ Tests | ✅ Full | ⚡ Merge | — |
| Refactoring | ⚡ Quick | ✅ Behavior spec | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ⚡ Merge | — |
| Migration | ⚡ Quick | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ |
| Production incident | — | ⚡ Triage | ⚡ Auto | ✅ Fix | ✅ Tests | ✅ Full | ✅ Hotfix | ✅ |
| Documentation | — | ⚡ Minimal | — | ✅ Write | — | ⚡ Quick | ⚡ Merge | — |

✅ = Full stage | ⚡ = Abbreviated | — = Skipped

---

## 6. Skill-to-Workflow Mapping

### 6.1 Skills by Lifecycle Stage

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

VERIFY           REVIEW           SHIP             MAINTAIN
─────────        ─────────        ─────────        ─────────
test-driven-dev  code-review      shipping-launch  debugging
browser-testing  code-simplify    ci-cd-auto       deprecation-migr.
security-hard.   security-hard.   git-workflow      observability
performance-opt  performance-opt  documentation
                 documentation    observability
                 git-workflow
```

### 6.2 Skill Activation Rules

```yaml
# Skill activation is determined by the workflow engine, not the user
activation_rules:
  
  # Always active (background policies)
  always:
    - context-engineering        # Manages what the agent sees
    - git-workflow-and-versioning # Enforces commit discipline
    - incremental-implementation  # Constrains to thin slices
  
  # Activated by task type
  by_task_type:
    feature:
      - spec-driven-development
      - planning-and-task-breakdown
      - test-driven-development
      - code-review-and-quality
    bug_fix:
      - debugging-and-error-recovery
      - test-driven-development
      - code-review-and-quality
    refactor:
      - code-simplification
      - test-driven-development
      - code-review-and-quality
    migration:
      - deprecation-and-migration
      - planning-and-task-breakdown
      - test-driven-development
    documentation:
      - documentation-and-adrs
  
  # Activated by detected context
  by_context:
    touches_ui:
      - frontend-ui-engineering
      - browser-testing-with-devtools
    touches_api:
      - api-and-interface-design
    touches_auth_or_input:
      - security-and-hardening
    touches_external_services:
      - observability-and-instrumentation
    performance_sensitive:
      - performance-optimization
    high_risk_decision:
      - doubt-driven-development
  
  # Activated by process level
  by_process_level:
    thorough:
      - security-and-hardening
      - performance-optimization
      - documentation-and-adrs
    guarded:
      - security-and-hardening
      - performance-optimization
      - documentation-and-adrs
      - shipping-and-launch
```

---

## 7. Information Architecture

### 7.1 Navigation Structure

```
┌─────────────────────────────────────────────────────────────┐
│  CODE STUDIO                                                │
│                                                             │
│  ┌─────────┐  ┌──────────────────────────────────────────┐  │
│  │ Activity│  │                                          │  │
│  │ Bar     │  │           EDITOR AREA                    │  │
│  │         │  │                                          │  │
│  │ [📁]    │  │  (Source files, diffs, artifact previews)│  │
│  │ [🔍]    │  │                                          │  │
│  │ [🔧]    │  │                                          │  │
│  │ [🏗️]←──│──│── Engineering Workspace (primary)        │  │
│  │ [🧪]    │  │                                          │  │
│  │ [📦]    │  │                                          │  │
│  │         │  ├──────────────────────────────────────────┤  │
│  │         │  │           PANEL AREA                     │  │
│  │         │  │  (Terminal, Problems, Agent Activity)     │  │
│  └─────────┘  └──────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  STATUS BAR: Current stage • Active task • Progress  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Primary Navigation (Activity Bar Icon → Sidebar)

The Engineering Workspace gets a single activity bar icon (🏗️) that opens a sidebar with these sections:

| Section | Content | View Type |
|---|---|---|
| **Home** | Current objective, stage, progress, next action, recent activity | Webview |
| **Workflow** | Lifecycle stages with status, active stage highlighted | Tree view |
| **Tasks** | Task board with status, dependencies, assigned agent | Tree view + Webview |
| **Artifacts** | Generated documents (specs, plans, ADRs, reports) | Tree view |
| **Activity** | Agent execution log, decisions, tool usage | Tree view |

### 7.3 Secondary Navigation (Within Sidebar Sections)

| Parent Section | Sub-sections |
|---|---|
| **Workflow** | Stage details, entry/exit criteria, quality gates |
| **Tasks** | Planned, In Progress, Blocked, Done; filter by phase |
| **Artifacts** | By type (Specs, Plans, ADRs, Reviews, Reports); by stage |
| **Activity** | Current, History; filter by agent, skill, time |

### 7.4 Editor Panels (Webviews in Editor Area)

| Panel | Opens When | Content |
|---|---|---|
| **Artifact Review** | User clicks an artifact | Full artifact with approve/reject/comment actions |
| **Task Detail** | User clicks a task | Task description, acceptance criteria, changed files, test evidence, commits |
| **Review Report** | Review stage completes | Five-axis review with findings, severity, inline code references |
| **Project Context** | User opens from Home | Repository summary, tech stack, conventions, commands |

### 7.5 Bottom Panel Tabs

| Tab | Content |
|---|---|
| **Agent Activity** (new) | Real-time agent execution: current objective, tools being used, files being changed, decisions made |
| **Terminal** (existing) | Standard terminal |
| **Problems** (existing) | Standard problems panel |
| **Output** (existing) | Standard output panel |

### 7.6 Command Palette Commands

```
Engineering: Start New Work Request
Engineering: View Project Context
Engineering: View Current Workflow
Engineering: Approve Current Artifact
Engineering: Reject Current Artifact
Engineering: Skip Current Stage
Engineering: Override Process Level
Engineering: View Agent Activity
Engineering: Pause Agent Execution
Engineering: Resume Agent Execution
Engineering: Cancel Current Task
Engineering: Open Task Board
Engineering: Run Quality Gate
Engineering: View Review Report
Engineering: Export Workflow State
```

### 7.7 Status Bar Items

```
[🏗️ Feature: Add Stripe Payments] [Stage: BUILD (4/7)] [Task: 3/8 ✅] [Agent: Working...]
```

---

## 8. Main Screen Designs

### 8.1 Project Home

**Purpose:** Single-glance understanding of where the project stands.

```
┌─────────────────────────────────────────────────────┐
│  🏗️ Engineering Workspace                    [⚙️]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  CURRENT OBJECTIVE                                  │
│  ┌─────────────────────────────────────────────┐    │
│  │ Add Stripe payment integration to checkout  │    │
│  │ Process Level: Standard                     │    │
│  │ Started: 2 hours ago                        │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  PROGRESS                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │ DEFINE ✅ → PLAN ✅ → BUILD 🔵 → VERIFY ⬜  │    │
│  │ → REVIEW ⬜ → SHIP ⬜                       │    │
│  │                                             │    │
│  │ Tasks: 3/8 complete  [████████░░░░░] 37%    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ACTIVE TASK                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ Task 4: Create payment intent API endpoint  │    │
│  │ Status: Implementing (GREEN phase)          │    │
│  │ Files: src/routes/payment.ts, tests/...     │    │
│  │ Agent: Writing payment validation schema    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ⚠️ NEEDS ATTENTION                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │ • Stripe API key not found in .env          │    │
│  │ • Security review required (touches auth)   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  RECOMMENDED NEXT ACTION                            │
│  ┌─────────────────────────────────────────────┐    │
│  │ [Add STRIPE_API_KEY to .env.example]        │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  RECENT ACTIVITY                                    │
│  ┌─────────────────────────────────────────────┐    │
│  │ 2m ago  ✅ Task 3 completed (4 files, 3     │    │
│  │            tests added)                     │    │
│  │ 15m ago 📝 Spec approved by user            │    │
│  │ 20m ago 🤖 Agent: "Using Stripe.js v3 per  │    │
│  │            official docs (cited)"           │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.2 Workflow View

**Purpose:** Visualize the lifecycle with stage status, dependencies, and quality gates.

```
┌─────────────────────────────────────────────────────┐
│  WORKFLOW: Add Stripe Payment Integration            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────┐   ┌────────┐   ┌────────┐              │
│  │ONBOARD │   │ DEFINE │   │  PLAN  │              │
│  │   ✅   │──→│   ✅   │──→│   ✅   │              │
│  │        │   │        │   │        │              │
│  │Context │   │Spec    │   │8 tasks │              │
│  │loaded  │   │approved│   │planned │              │
│  └────────┘   └────────┘   └────────┘              │
│                                 │                   │
│                                 ▼                   │
│  ┌────────┐   ┌────────┐   ┌────────┐              │
│  │  SHIP  │   │ REVIEW │   │ BUILD  │              │
│  │   ⬜   │←──│   ⬜   │←──│   🔵   │              │
│  │        │   │        │   │        │              │
│  │Pending │   │Pending │   │Task 4/8│              │
│  │        │   │        │   │37%     │              │
│  └────────┘   └────────┘   └────────┘              │
│                    ▲                                │
│                    │                                │
│               ┌────────┐                            │
│               │ VERIFY │                            │
│               │   ⬜   │                            │
│               │        │                            │
│               │Pending │                            │
│               └────────┘                            │
│                                                     │
│  QUALITY GATES                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✅ Spec approved                            │    │
│  │ ✅ Plan approved                            │    │
│  │ ⬜ All tests pass                           │    │
│  │ ⬜ Security review (required: touches auth) │    │
│  │ ⬜ Code review approved                     │    │
│  │ ⬜ Definition of Done met                   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ARTIFACTS                                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ 📄 Spec: stripe-payment-spec.md      [View] │    │
│  │ 📋 Plan: tasks/plan.md               [View] │    │
│  │ 📝 ADR: adr-005-stripe-integration   [View] │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.3 Task Board

**Purpose:** Track tasks with dependencies, status, and evidence.

```
┌─────────────────────────────────────────────────────┐
│  TASKS: Add Stripe Payment Integration               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  PHASE 1: Foundation                                │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✅ Task 1: Add Stripe SDK dependency        │    │
│  │    Size: XS │ Files: 1 │ Tests: 1           │    │
│  │    Commit: a1b2c3d                          │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ✅ Task 2: Create Stripe client config      │    │
│  │    Size: S │ Files: 2 │ Tests: 3            │    │
│  │    Commit: d4e5f6g                          │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ✅ Task 3: Add payment schema + validation  │    │
│  │    Size: S │ Files: 3 │ Tests: 4            │    │
│  │    Commit: h7i8j9k                          │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ── Checkpoint: Foundation ✅ ──                     │
│  All tests pass │ Build clean │ Types check          │
│                                                     │
│  PHASE 2: Core Payment Flow                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🔵 Task 4: Create payment intent endpoint   │    │
│  │    Size: M │ Depends: Task 2, 3             │    │
│  │    Status: Implementing (GREEN phase)       │    │
│  │    Agent: Writing route handler...          │    │
│  │    ⚠️ Security gate: touches payment data   │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ⬜ Task 5: Build checkout form component    │    │
│  │    Size: M │ Depends: Task 4                │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ⬜ Task 6: Connect form to payment API      │    │
│  │    Size: S │ Depends: Task 4, 5             │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  PHASE 3: Error Handling & Polish                   │
│  ┌─────────────────────────────────────────────┐    │
│  │ ⬜ Task 7: Add payment error handling       │    │
│  │    Size: M │ Depends: Task 6                │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ⬜ Task 8: Add payment confirmation page    │    │
│  │    Size: S │ Depends: Task 6                │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.4 Artifact Review Panel (Editor Webview)

**Purpose:** Review and approve agent-generated artifacts.

```
┌─────────────────────────────────────────────────────┐
│  📄 ARTIFACT REVIEW                                  │
│  Spec: stripe-payment-spec.md                        │
│  Generated: 15 min ago │ Status: Awaiting Approval   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ## Objective                                       │
│  Add Stripe payment processing to the checkout      │
│  flow. Users can pay with credit/debit cards.       │
│  Success: payment completes in <3s, handles         │
│  failures gracefully, PCI-compliant.                │
│                                                     │
│  ## Tech Stack                                      │
│  - Stripe.js v3 (client) + stripe-node v14 (server) │
│  - Source: https://stripe.com/docs/js               │
│                                                     │
│  ## Commands                                        │
│  - Test: npm test -- --grep "payment"               │
│  - Dev: npm run dev                                 │
│                                                     │
│  ## Testing Strategy                                │
│  - Unit: Payment validation, amount calculation     │
│  - Integration: Stripe API mock with test keys      │
│  - E2E: Full checkout flow with Playwright          │
│                                                     │
│  ## Boundaries                                      │
│  - Always: Validate amounts server-side             │
│  - Ask first: Storing card details (we shouldn't)   │
│  - Never: Log full card numbers                     │
│                                                     │
│  ## Success Criteria                                │
│  - [ ] Payment intent created successfully          │
│  - [ ] Card validation errors shown to user         │
│  - [ ] Failed payments handled with retry option    │
│  - [ ] Webhook confirms payment completion          │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  [✅ Approve]  [✏️ Request Changes]  [❌ Reject] │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  💬 Comments                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ Add a note about webhook signature          │    │
│  │ verification in the Boundaries section.     │    │
│  │                                    [Submit] │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.5 Agent Activity Panel (Bottom Panel Tab)

**Purpose:** Real-time visibility into what the agent is doing.

```
┌─────────────────────────────────────────────────────┐
│  🤖 AGENT ACTIVITY                          [⏸ Pause]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  Current: Task 4 — Create payment intent endpoint   │
│  Phase: GREEN (making test pass)                    │
│  Skills: incremental-impl, test-driven-dev,         │
│          security-and-hardening (active)             │
│                                                     │
│  TIMELINE                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │ 14:32:15  📝 Reading src/routes/payment.ts  │    │
│  │ 14:32:18  📝 Reading tests/payment.test.ts  │    │
│  │ 14:32:22  🔴 Wrote failing test:            │    │
│  │           "creates payment intent with       │    │
│  │            valid amount"                     │    │
│  │ 14:32:25  ▶️  Ran: npm test -- payment       │    │
│  │           Result: 1 failing ✅ (expected)    │    │
│  │ 14:32:30  ✏️  Editing: src/routes/payment.ts │    │
│  │           Adding: POST /api/payments/intent  │    │
│  │ 14:32:35  🔒 Security check: Input           │    │
│  │           validation with Zod schema         │    │
│  │ 14:32:38  📖 Source verified: Stripe docs    │    │
│  │           stripe.com/docs/api/payment_intents│    │
│  │ 14:32:42  ✏️  Editing: src/routes/payment.ts │    │
│  │ 14:32:45  ▶️  Ran: npm test -- payment       │    │
│  │           Result: 1 passing ✅               │    │
│  │ 14:32:48  🟢 GREEN phase complete            │    │
│  │ 14:32:50  🔄 Starting REFACTOR phase...      │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  DECISIONS MADE                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ • Using Zod for payment amount validation   │    │
│  │   (consistent with existing validation      │    │
│  │   patterns in src/lib/validation.ts)        │    │
│  │ • Amount in cents (integer) not dollars     │    │
│  │   (float) — per Stripe docs recommendation  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.6 Project Context Panel (Editor Webview)

**Purpose:** View and edit the project context that agents use.

```
┌─────────────────────────────────────────────────────┐
│  📋 PROJECT CONTEXT                    [🔄 Refresh]  │
│  Last updated: 10 min ago                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  REPOSITORY                                         │
│  Name: my-task-app                                  │
│  Type: Full-stack web application                   │
│  Size: 142 files, 12,400 lines                      │
│                                                     │
│  TECH STACK                                         │
│  Frontend: React 19.1, TypeScript 5.7, Vite 6.2    │
│  Backend: Node.js 22, Express 5, Prisma 6           │
│  Database: PostgreSQL 16                             │
│  Styling: Tailwind CSS 4                             │
│  Testing: Vitest, Playwright                         │
│                                                     │
│  COMMANDS                                           │
│  Build: npm run build                               │
│  Test: npm test                                     │
│  Dev: npm run dev                                   │
│  Lint: npm run lint                                 │
│  Type check: npx tsc --noEmit                       │
│                                                     │
│  CONVENTIONS                                        │
│  • Functional components with hooks                 │
│  • Named exports (no default exports)               │
│  • Colocated tests: Button.tsx → Button.test.tsx    │
│  • Zod for validation at API boundaries             │
│  • Error boundaries at route level                  │
│                                                     │
│  ARCHITECTURE                                       │
│  src/                                               │
│  ├── routes/     → API route handlers               │
│  ├── services/   → Business logic                   │
│  ├── components/ → React components                 │
│  ├── lib/        → Shared utilities                 │
│  └── types/      → TypeScript type definitions      │
│                                                     │
│  BOUNDARIES                                         │
│  Always: Run tests before commits, validate inputs  │
│  Ask first: Schema changes, new dependencies        │
│  Never: Commit .env, disable security headers       │
│                                                     │
│  [✏️ Edit Context]                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.7 Approval Center (Sidebar Section)

**Purpose:** Centralized view of all pending approvals.

```
┌─────────────────────────────────────────────────────┐
│  ⚠️ APPROVALS                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  PENDING (2)                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ 🔴 REQUIRED                                 │    │
│  │ Security Review: Payment endpoint           │    │
│  │ Reason: Task touches payment data and       │    │
│  │ external API (Stripe)                       │    │
│  │ Risk: High                                  │    │
│  │ [Review Now]                                │    │
│  ├─────────────────────────────────────────────┤    │
│  │ 🟡 REVIEW REQUIRED                          │    │
│  │ New dependency: stripe@14.0.0               │    │
│  │ Bundle impact: +45KB gzipped                │    │
│  │ License: MIT ✅                              │    │
│  │ Last commit: 3 days ago ✅                   │    │
│  │ npm audit: No vulnerabilities ✅             │    │
│  │ [Approve] [Reject]                          │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  COMPLETED (5)                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✅ Spec approved (2h ago)                   │    │
│  │ ✅ Plan approved (1h 45m ago)               │    │
│  │ ✅ ADR-005 approved (1h 30m ago)            │    │
│  │ ✅ Task 1 checkpoint passed (1h ago)        │    │
│  │ ✅ Task 2 checkpoint passed (45m ago)       │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 9. Agent and Workflow Architecture

### 9.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CODE STUDIO EXTENSION HOST                │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Webview UI  │  │  Tree Views  │  │  Status Bar  │      │
│  │   (React)     │  │  (Native)    │  │  (Native)    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │              │
│         └────────────┬────┴──────────────────┘              │
│                      │                                      │
│              ┌───────▼────────┐                              │
│              │  Extension     │                              │
│              │  Controller    │                              │
│              └───────┬────────┘                              │
│                      │                                      │
│    ┌─────────────────┼─────────────────┐                    │
│    │                 │                 │                    │
│    ▼                 ▼                 ▼                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐              │
│  │ Workflow  │  │ Context  │  │   Artifact   │              │
│  │ Engine   │  │ Manager  │  │   Store      │              │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘              │
│       │              │               │                      │
│       ▼              ▼               ▼                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐              │
│  │  Skill   │  │  Project │  │  Workspace   │              │
│  │ Registry │  │  State   │  │  Files       │              │
│  └────┬─────┘  └──────────┘  │ (.codestudio/)│              │
│       │                      └──────────────┘              │
│       ▼                                                    │
│  ┌──────────────────────────────────────┐                   │
│  │         AGENT RUNTIME                │                   │
│  │                                      │                   │
│  │  ┌──────────┐  ┌──────────────────┐  │                   │
│  │  │ Chat API │  │ Specialist Agents│  │                   │
│  │  │ (LLM)    │  │ (code-reviewer,  │  │                   │
│  │  │          │  │  security-auditor,│  │                   │
│  │  │          │  │  test-engineer,   │  │                   │
│  │  │          │  │  perf-auditor)   │  │                   │
│  │  └──────────┘  └──────────────────┘  │                   │
│  │                                      │                   │
│  │  ┌──────────┐  ┌──────────────────┐  │                   │
│  │  │  Tools   │  │  MCP Servers     │  │                   │
│  │  │ (file,   │  │  (DevTools,      │  │                   │
│  │  │  terminal│  │   DB, etc.)      │  │                   │
│  │  │  search) │  │                  │  │                   │
│  │  └──────────┘  └──────────────────┘  │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │         PERSISTENCE LAYER            │                   │
│  │                                      │                   │
│  │  ┌──────────┐  ┌──────────────────┐  │                   │
│  │  │ Workflow  │  │  Event Stream    │  │                   │
│  │  │ State    │  │  (audit log)     │  │                   │
│  │  │ (JSON)   │  │                  │  │                   │
│  │  └──────────┘  └──────────────────┘  │                   │
│  └──────────────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Component Responsibilities

| Component | Responsibility | Runs Where |
|---|---|---|
| **Extension Controller** | Coordinates UI, workflow engine, and agent runtime. Handles commands, events, and state synchronization. | Extension host (local) |
| **Workflow Engine** | Manages lifecycle stages, determines process level, activates skills, enforces quality gates, tracks progress. | Extension host (local) |
| **Context Manager** | Analyzes workspace, generates project context, loads relevant context per task, manages rules files. | Extension host (local) |
| **Skill Registry** | Stores skill definitions, activation rules, verification criteria. Maps tasks to skills. | Extension host (local) |
| **Artifact Store** | Manages generated documents (specs, plans, ADRs, reviews). Stores in workspace under `.codestudio/`. | Workspace filesystem |
| **Agent Runtime** | Executes LLM calls, manages specialist agents, handles tool invocations. | Code Studio server / local |
| **Event Stream** | Records all actions, decisions, and state changes for audit and resumability. | Workspace filesystem |
| **Webview UI** | Renders Home, Workflow, Task Board, Artifact Review, and other visual panels. | Webview (browser context) |

### 9.3 Workflow Engine Design

#### Workflow Definition Format

```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  processLevel: 'light' | 'standard' | 'thorough' | 'guarded';
  stages: StageDefinition[];
}

interface StageDefinition {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';
  
  // Entry conditions — all must be true to enter this stage
  entryConditions: Condition[];
  
  // Exit conditions — all must be true to leave this stage
  exitConditions: Condition[];
  
  // Skills activated during this stage
  skills: SkillReference[];
  
  // Quality gates that must pass
  qualityGates: QualityGate[];
  
  // Artifacts produced by this stage
  artifacts: ArtifactDefinition[];
  
  // Whether this stage requires human approval to exit
  requiresApproval: boolean;
  
  // Whether this stage can be skipped
  skippable: boolean;
  
  // Stages that must complete before this one
  dependsOn: string[];
}

interface QualityGate {
  id: string;
  name: string;
  type: 'automated' | 'review' | 'approval';
  skill: string;           // Skill that powers this gate
  agent?: string;          // Specialist agent (if applicable)
  condition: Condition;    // What must be true to pass
  blocking: boolean;       // Whether failure blocks progression
  applicableWhen: Condition; // When this gate applies (conditional gates)
}

interface Condition {
  type: 'all_tests_pass' | 'build_succeeds' | 'artifact_approved' | 
        'security_scan_clean' | 'performance_within_budget' | 
        'review_approved' | 'checklist_complete' | 'custom';
  params?: Record<string, unknown>;
}
```

#### Workflow State Persistence

```
.codestudio/
├── context.md              # Project context (rules file)
├── workflows/
│   └── current/
│       ├── workflow.json    # Current workflow definition + state
│       ├── objective.md     # Confirmed statement of intent
│       └── events.jsonl     # Append-only event stream
├── artifacts/
│   ├── specs/               # Generated specifications
│   ├── plans/               # Task plans
│   ├── adrs/                # Architecture decision records
│   ├── reviews/             # Review reports
│   └── reports/             # Test, security, performance reports
└── config.json              # Extension configuration
```

State is persisted to the workspace filesystem so it survives:
- Code Studio restarts
- Session changes
- Git operations (`.codestudio/` is committed to the repo)

#### Git-Tracked Workflow State (Critical Design Decision)

**All workflow state, artifacts, and context are committed to git alongside the code.** This is a non-negotiable architectural decision that enables:

1. **Team resumability:** Any team member who pulls the branch gets the full engineering state — which stage is active, which tasks are done, what approvals are pending, what decisions were made.
2. **Branch-scoped workflows:** Each feature branch has its own `.codestudio/workflows/current/`. Switching branches switches workflow state. No cross-branch contamination.
3. **PR reviewability:** Code reviewers can inspect the full engineering story in the `.codestudio/` directory — the spec that was approved, the plan that was followed, the decisions that were made, the test evidence that was collected.
4. **Audit trail:** The `events.jsonl` file is an append-only log of every action, decision, and approval. It records who did what, when, and why. This survives across sessions, restarts, and team handoffs.
5. **No external dependencies:** Workflow state doesn't require a database, a cloud service, or a separate server. It's just files in the repo. Works offline, works in air-gapped environments, works with any git hosting.

**Commit strategy:** Workflow state changes are committed alongside the code changes they describe. When the agent completes Task 4 and commits the code, the commit also includes the updated `workflow.json` (task 4 marked complete), the updated `events.jsonl` (task completion event), and any new artifacts (test report). This keeps code and engineering state in lockstep.

**Branch workflow:**
```
main (no active workflow)
  │
  ├── feature/stripe-payments
  │   └── .codestudio/workflows/current/
  │       ├── workflow.json  ← BUILD stage, task 4/8
  │       ├── objective.md   ← "Add Stripe payments"
  │       └── events.jsonl   ← full audit trail
  │
  ├── feature/user-auth
  │   └── .codestudio/workflows/current/
  │       ├── workflow.json  ← DEFINE stage, spec pending
  │       ├── objective.md   ← "Add user authentication"
  │       └── events.jsonl   ← audit trail for this work
  │
  └── fix/duplicate-tasks
      └── .codestudio/workflows/current/
          ├── workflow.json  ← VERIFY stage (Light process)
          └── events.jsonl   ← minimal audit trail
```

**Merge behavior:** When a feature branch merges to main, the `.codestudio/workflows/current/` directory is cleared (workflow is complete). The artifacts (specs, ADRs, reviews) move to `.codestudio/archive/` for historical reference. The `context.md` file persists on main as the living project context.

#### Workflow Execution Model

```
User starts work request
        │
        ▼
┌─────────────────────┐
│  Risk Assessment     │  Analyze task type, complexity, files touched,
│  Engine              │  patterns detected → determine process level
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Workflow Generator  │  Create workflow definition with stages,
│                      │  gates, and skills for this process level
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Stage Executor      │  For each stage:
│                      │  1. Check entry conditions
│                      │  2. Activate skills
│                      │  3. Execute agent with loaded context
│                      │  4. Track progress and decisions
│                      │  5. Run quality gates
│                      │  6. Request approval (if required)
│                      │  7. Check exit conditions
│                      │  8. Advance to next stage
└─────────────────────┘
```

### 9.4 Separation of Concerns

| Concern | Owner | Format |
|---|---|---|
| **Workflow definition** | Workflow Engine | TypeScript interfaces, JSON state |
| **Workflow execution** | Stage Executor | Event-driven, async |
| **Skill execution** | Agent Runtime (LLM) | Skill instructions loaded as system/user prompts |
| **Agent execution** | Code Studio Chat API | LLM calls with tool access |
| **UI state** | Webview + Extension Controller | React state + VS Code API |
| **Project artifacts** | Artifact Store | Markdown files in workspace |
| **Audit history** | Event Stream | Append-only JSONL |

### 9.5 Security Considerations

| Concern | Mitigation |
|---|---|
| **Secrets in artifacts** | Artifact store never contains secrets; context manager strips .env values |
| **Agent bypassing gates** | Quality gates are enforced by the workflow engine, not the agent; agent cannot mark a gate as passed |
| **Untrusted agent output** | All agent-generated artifacts require user review before being committed |
| **Multi-project isolation** | Each workspace has its own `.codestudio/` directory; no cross-workspace state |
| **Offline/interrupted sessions** | State persisted to filesystem after every event; workflow resumes from last checkpoint |
| **Extension performance** | Webviews lazy-loaded; tree views use virtual scrolling; agent activity panel throttled |

---

## 10. Human Approval Model

### 10.1 Approval Levels

| Level | Description | User Action | Persistence |
|---|---|---|---|
| **Informational** | Agent made a decision; user is notified but no action required | None (auto-dismiss after 10s) | Logged in event stream |
| **Review Required** | Agent produced an artifact that should be reviewed before proceeding | Review and optionally comment; workflow continues after timeout if no objection | Logged; artifact stored |
| **Explicit Approval** | Agent cannot proceed without user's explicit "yes" | Must click Approve or Reject; no timeout | Logged; blocks workflow |
| **Restricted Operation** | Destructive or irreversible action; requires confirmation with details | Must confirm with full understanding of impact | Logged; blocks workflow; requires re-confirmation after restart |

### 10.2 What Requires Each Level

| Approval Level | Triggers |
|---|---|
| **Informational** | Agent chose a library version, selected a code pattern, made a naming decision, committed a task |
| **Review Required** | Generated specification, generated plan, generated ADR, added a dependency, code review completed |
| **Explicit Approval** | Specification before implementation, plan before execution, review before merge, deployment to production |
| **Restricted Operation** | Database schema migration, authentication/authorization changes, deleting files or code, modifying CI/CD pipeline, changing security configuration |

### 10.3 Approval Persistence

Approvals persist across:

| Scenario | Behavior |
|---|---|
| **Code Studio restart** | All approvals preserved in `.codestudio/workflows/current/workflow.json` |
| **Chat session change** | Approvals are workflow state, not chat state; fully preserved |
| **Different devices** | If `.codestudio/` is committed to git, approvals sync via git |
| **Different team members** | Approvals are attributed to the user who gave them; team members see approval history |

### 10.4 Avoiding Approval Fatigue

The #1 risk is too many approvals. Mitigation strategies:

1. **Process level determines approval count.** Light tasks have 0 approvals. Standard tasks have 2 (spec + review). Thorough tasks have 3-4.
2. **Batch informational notifications.** Don't interrupt for every agent decision; show a summary in the activity panel.
3. **Smart defaults.** When the agent's decision matches project conventions, auto-approve and log.
4. **"Trust this pattern" option.** User can mark a decision pattern as trusted, reducing future approvals of the same type.
5. **Timeout with default.** Review Required items auto-proceed after a configurable timeout (default: 5 minutes) if no objection.

---

## 11. Guided and Advanced User Experiences

### 11.1 Guided Mode (Default for New Users)

**Target:** Developers who are new to structured engineering practices or new to Code Studio.

**Characteristics:**

| Aspect | Guided Behavior |
|---|---|
| **Workflow selection** | Automatic — system recommends process level based on task analysis |
| **Stage progression** | Visual step-by-step with explanations of why each stage matters |
| **Skill activation** | Invisible — skills run automatically; user sees results, not skill names |
| **Approvals** | Prompted with context: "This spec defines what we're building. Review it to make sure it matches what you want." |
| **Configuration** | Minimal — sensible defaults for everything |
| **Error handling** | Guided recovery: "The tests failed. Here's what went wrong and what the agent is doing to fix it." |
| **Learning** | Inline tips: "💡 We're writing tests before code (TDD). This catches bugs early and documents expected behavior." |

**Guided Mode UI additions:**
- Progress wizard at the top of the sidebar showing current step
- "Why this step?" expandable explanations
- "What happens next?" preview
- Simplified task board (no dependency graph, just a list)
- Celebration moments: "✅ All tests pass! Your code is verified."

### 11.2 Advanced Mode (For Experienced Developers)

**Target:** Senior developers who want control, speed, and flexibility.

**Characteristics:**

| Aspect | Advanced Behavior |
|---|---|
| **Workflow selection** | Manual override — user can set process level, skip stages, add custom gates |
| **Stage progression** | Compact view — stages shown as status badges, not a wizard |
| **Skill activation** | Visible — user can see which skills are active, enable/disable specific skills |
| **Approvals** | Minimal — only Explicit Approval and Restricted Operation; Review Required auto-proceeds |
| **Configuration** | Full control — custom workflow definitions, custom quality gates, custom skill activation rules |
| **Error handling** | Raw output — show agent errors, tool failures, and let user intervene directly |
| **CLI access** | Full CLI for all operations: `codestudio workflow start`, `codestudio task list`, `codestudio gate run` |

**Advanced Mode UI additions:**
- Keyboard shortcuts for all operations (approve: `Cmd+Shift+A`, skip: `Cmd+Shift+S`)
- Command palette integration for all workflow operations
- Workflow-as-code: edit `workflow.json` directly
- Direct skill invocation from command palette
- Custom agent configuration
- Parallel task execution (multiple agents on independent tasks)
- Chat-first interaction: do everything from chat, UI updates automatically

### 11.3 Mode Switching

Both modes operate on the **same underlying workflow state**. Switching modes changes the UI presentation and default behaviors, not the data.

```
Guided Mode ←→ Advanced Mode
     │                │
     └───── Same ─────┘
           workflow.json
           artifacts/
           events.jsonl
```

A user can start in Guided Mode, switch to Advanced Mode to make a manual override, then switch back. No data is lost.

### 11.4 Chat Integration

Chat remains available in both modes as a complementary interaction method:

| Chat Action | Extension Response |
|---|---|
| "Start a new feature: add user profiles" | Creates work request, opens Guided/Advanced workflow |
| "What's the current status?" | Shows Home panel summary |
| "Approve the spec" | Marks spec as approved, advances workflow |
| "Skip the security review" | Skips gate (with warning in Guided Mode) |
| "Show me what the agent is doing" | Opens Agent Activity panel |
| "Run the tests" | Executes test suite, shows results in Verify stage |
| "I want to change the plan" | Opens Plan stage for editing |

Chat commands update workflow state; workflow state updates are reflected in chat. They are two views of the same system.

---

## 12. Risks and Mitigation

### 12.1 Product Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Over-engineered workflow** — Too many stages, too much ceremony, users feel slowed down | Critical | High | Adaptive process depth. Light tasks have 3 steps. User can always override. Measure time-to-first-commit and optimize. |
| **Too many approvals** — Users click "approve" without reading, defeating the purpose | High | High | Approval levels with smart defaults. Informational items don't interrupt. "Trust this pattern" reduces future approvals. Timeout with auto-proceed for Review Required. |
| **Extension feels like a PM tool** — Users see it as project management overhead, not engineering assistance | Critical | Medium | No Gantt charts, no time estimates, no resource allocation. Focus on engineering artifacts (specs, tests, reviews), not management artifacts (timelines, budgets). |
| **Duplicate functionality between chat and UI** — Users confused about where to do things | Medium | High | Chat and UI are two views of the same state. Any action in chat updates the UI; any action in the UI is reflected in chat. Clear documentation of when each is better. |
| **Stale project context** — Context generated at onboarding becomes outdated as code changes | Medium | High | Context Manager watches for file changes and flags stale sections. "Refresh context" command. Context is re-validated at the start of each work request. |
| **Skills producing inconsistent artifacts** — Different LLM calls produce specs in different formats | Medium | Medium | Artifact templates enforced by the extension, not the LLM. LLM fills in content; extension enforces structure. Validation on artifact save. |
| **Agents bypassing workflow gates** — Agent marks a gate as passed when it shouldn't | High | Low | Gates are enforced by the workflow engine, not the agent. Agent cannot modify workflow state directly. Only the extension controller can advance stages. |
| **Difficulty supporting existing repositories** — Extension assumes greenfield; brownfield projects don't fit | High | Medium | Onboarding stage analyzes existing repo. Process level defaults to Standard (not Thorough) for existing projects. "Adopt incrementally" — user can start with just the task board and add stages over time. |
| **UI information overload** — Too many panels, too much data, user overwhelmed | Medium | Medium | Progressive disclosure. Home shows summary; details on click. Guided Mode hides advanced information. Sidebar sections are collapsible. |
| **Workflow state diverges from repo state** — User makes changes outside the extension; workflow doesn't know | Medium | High | Git watcher detects changes. Workflow state includes file hashes. "Sync" command reconciles. Warning when external changes detected. |
| **Performance impact** — Extension slows down Code Studio | Medium | Medium | Lazy-load webviews. Tree views use virtual scrolling. Agent activity panel throttled to 1 update/second. Background analysis runs in worker threads. |
| **LLM cost concerns** — Multiple specialist agents per review increases cost | Medium | Medium | Specialist agents only activated for Thorough+ process levels. User can disable specific specialists. Cost estimate shown before activating expensive operations. |

### 12.2 Technical Risks

| Risk | Mitigation |
|---|---|
| **Webview performance with large task boards** | Virtual scrolling, pagination, lazy rendering |
| **State corruption from concurrent edits** | Event sourcing with append-only log; state reconstructable from events |
| **Extension activation time** | Lazy activation — only activate when Engineering Workspace icon is clicked |
| **Git conflicts on `.codestudio/` directory** | Merge-friendly JSON format; events are append-only; artifacts are separate files |
| **Multi-root workspace support** | Each workspace root gets its own `.codestudio/` directory; workflow engine scoped per root |

---

## 13. MVP Scope

### 13.1 MVP Definition

The MVP demonstrates clear value beyond chat for a **single developer completing a feature end-to-end**.

### 13.2 MVP Flow

```
1. Open workspace → Extension detects project → Generates context
2. User: "I want to add user authentication"
3. Extension: Assesses as Standard process level
4. Extension: Interviews user (2-3 questions) → Confirmed intent
5. Extension: Generates specification → User reviews and approves
6. Extension: Generates task plan (5-7 tasks) → User reviews and approves
7. Extension: Executes tasks one at a time
   - Shows progress in sidebar
   - Shows agent activity in bottom panel
   - Each task: implement → test → commit
8. Extension: Runs verification (tests, build, lint)
9. Extension: Runs code review → Shows findings
10. User: Approves review → Extension prepares commit/PR
```

### 13.3 MVP Features (Must Have)

| Feature | Description |
|---|---|
| **Project Context Generation** | Analyze workspace, generate context document, create rules file |
| **Work Request Capture** | Natural language input → risk assessment → process level |
| **Specification Generation** | Generate 6-section spec from user intent; present for review |
| **Task Planning** | Break spec into sized, ordered tasks with acceptance criteria |
| **Task Execution** | Execute tasks one at a time with TDD cycle (RED→GREEN→REFACTOR) |
| **Progress Tracking** | Sidebar showing current stage, active task, completion percentage |
| **Agent Activity** | Bottom panel showing real-time agent actions, decisions, tool usage |
| **Artifact Review** | Editor panel for reviewing and approving specs, plans, reviews |
| **Code Review** | Automated five-axis review with severity labels |
| **Quality Gates** | Tests must pass, build must succeed, review must be approved |
| **State Persistence** | Workflow state survives Code Studio restarts |
| **Chat Integration** | Chat commands update workflow; workflow updates reflected in chat |

### 13.4 MVP Features (Nice to Have)

| Feature | Description |
|---|---|
| Guided Mode tips and explanations | Inline learning for new developers |
| Workflow visualization (stage diagram) | Visual lifecycle with status |
| Approval Center | Centralized pending approvals view |

### 13.5 NOT in MVP

| Feature | Why Deferred |
|---|---|
| **Team collaboration** | MVP is single-developer; team features are V2 |
| **Specialist agents** (security, performance) | MVP uses general code review only; specialists are V2 |
| **Deployment/SHIP stage** | MVP ends at commit/PR; deployment is V2 |
| **Custom workflows** | MVP uses built-in process levels; customization is V2 |
| **CLI interface** | MVP is UI-first; CLI is V2 |
| **Browser testing integration** | MVP uses test suite only; DevTools integration is V2 |
| **Workflow-as-code** | MVP uses UI configuration; code-based workflows are V3 |
| **Multi-repository support** | MVP is single-repo; multi-repo is V3 |
| **Plugin/skill marketplace** | MVP uses built-in skills; marketplace is V3+ |

### 13.6 MVP Success Criteria

1. A developer can go from "I want to add X" to a reviewed, tested, committed change using the extension
2. The extension produces at least 3 engineering artifacts (spec, plan, review) that the developer would not have created through chat alone
3. The total time is no more than 20% longer than pure chat — and the output quality is measurably higher (tests exist, review passed, artifacts documented)
4. The developer can resume interrupted work after restarting Code Studio
5. The developer reports higher confidence in the output compared to chat-only development

---

## 14. Future Roadmap

### 14.1 Version 2 (3-6 months after MVP)

| Feature | Description |
|---|---|
| **Team collaboration** | Shared workflow state, team approvals, role-based access |
| **Specialist agents** | Security auditor, performance auditor, test engineer as quality gates |
| **Advanced Mode** | Full keyboard-first experience, workflow-as-code, custom gates |
| **SHIP stage** | Pre-launch checklist, deployment integration, rollback planning |
| **Browser testing** | Chrome DevTools MCP integration for UI verification |
| **CLI interface** | `codestudio workflow`, `codestudio task`, `codestudio gate` commands |
| **Guided Mode learning** | Inline explanations, "why this step?" tooltips, engineering practice education |
| **Custom process levels** | User-defined process levels with custom stage configurations |
| **Dependency update workflow** | Automated dependency audit, per-package upgrade, changelog review |

### 14.2 Version 3 (6-12 months after MVP)

| Feature | Description |
|---|---|
| **Workflow-as-code** | Define workflows in TypeScript/YAML; version control workflow definitions |
| **Multi-repository support** | Coordinate work across multiple repos |
| **Skill marketplace** | Install community and organization skills |
| **Organization policies** | Enforce minimum process levels, required gates, mandatory reviews |
| **Analytics dashboard** | Track engineering practice adoption, quality metrics over time |
| **API access** | REST/GraphQL API for workflow state, enabling external integrations |
| **Web companion** | Read-only web view of workflow state for stakeholders |

### 14.3 Future Capabilities (12+ months)

| Feature | Description |
|---|---|
| **AI-powered risk assessment** | ML model trained on project history to predict task risk |
| **Automated incident response** | Production monitoring triggers debug workflow automatically |
| **Cross-team coordination** | Multiple teams working on related features with dependency tracking |
| **Compliance and audit** | SOC2/ISO compliance evidence generation from workflow artifacts |
| **Natural language workflow definition** | "For this project, always require security review for auth changes" |

---

## 15. Final Recommendation

### 15.1 Is This a Strong Product Direction?

**Yes — emphatically.** This is the strongest differentiation opportunity available to Code Studio.

The AI coding tool market is converging on a commodity: "chat + code generation." Every tool does this. The differentiation window for "better chat" is closing. The next frontier is not *faster code generation* but *better software engineering* — and no major tool has claimed this position.

Code Studio Engineering Workspace would be the first IDE feature that makes the claim: **"Software built here is engineered properly — requirements documented, architecture decided, code tested, security reviewed, changes tracked — and it happened automatically, not because the developer remembered to ask."**

### 15.2 Primary User Problem Solved

Developers using AI agents produce software they cannot confidently maintain, extend, or ship — because chat-based development skips the engineering practices that make software reliable. The extension solves this by making those practices automatic and invisible.

### 15.3 Most Important Differentiator

**Adaptive process depth.** No other tool automatically calibrates engineering rigor to task risk. This is the feature that prevents the extension from feeling like overhead (the binding constraint) while still ensuring proper engineering for work that needs it.

### 15.4 Recommended Product Positioning

> **Code Studio: The IDE where AI agents engineer software, not just write code.**
> 
> Other tools generate code fast. Code Studio generates software you can trust — with requirements, architecture, tests, security review, and documentation built in. Not because you asked for it. Because the IDE knows when it matters.

### 15.5 Recommended Architecture

- **Extension host** for workflow engine, context manager, and state persistence (local, fast, offline-capable)
- **Webview UI** (React) for rich panels (Home, Artifact Review, Task Board)
- **Native tree views** for sidebar navigation (Workflow, Tasks, Artifacts, Activity)
- **Workspace filesystem** (`.codestudio/`) for state persistence and artifact storage
- **Event sourcing** for audit trail and resumability
- **Code Studio Chat API** for agent runtime integration

### 15.6 Recommended MVP

The 12-feature MVP described in Section 13.3, focused on: **one developer, one feature, end-to-end, with specs + plan + tasks + tests + review — all tracked visually and resumable across sessions.**

### 15.7 Features That Should NOT Be Built Initially

1. **Team collaboration** — adds complexity without proving the core value
2. **Deployment automation** — too many environment-specific variables
3. **Custom workflow definitions** — premature flexibility; learn from usage first
4. **Skill marketplace** — built-in skills are sufficient for MVP
5. **Analytics/metrics** — no data to analyze until users are using the product
6. **Compliance features** — enterprise concern, not individual developer concern

### 15.8 First Five Implementation Milestones

| Milestone | Deliverable | Duration |
|---|---|---|
| **M1: Foundation** | Extension scaffold, sidebar with Home view, project context generation, `.codestudio/` directory structure, state persistence | 3-4 weeks |
| **M2: Define** | Work request capture, risk assessment engine, specification generation with artifact review panel, approval flow | 3-4 weeks |
| **M3: Plan + Build** | Task planning, task board, task execution with TDD cycle, progress tracking, agent activity panel | 4-5 weeks |
| **M4: Verify + Review** | Test suite execution, build verification, automated code review, review report panel, quality gates | 3-4 weeks |
| **M5: Polish + Ship** | Chat integration, state resumability, Guided Mode basics, performance optimization, internal dogfooding | 3-4 weeks |

**Total estimated MVP timeline: 16-21 weeks** with a team of 3-5 engineers.

---

*This document is the confirmed deliverable from the interview-me process. The confirmed intent: build a first-party Code Studio extension that turns agent-assisted development from unstructured chat into a guided, visual engineering workspace — one that automatically applies the right amount of engineering rigor based on task type, complexity, and risk. The binding constraint is user adoption: if it feels like overhead, it fails.*
