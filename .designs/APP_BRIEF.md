# Code Studio Engineering Workspace — Application Brief

## App Overview
- **Type:** IDE Extension Panel (simulated as SaaS web app for prototyping)
- **Description:** A visual engineering workspace inside Code Studio that guides developers through structured SDLC workflows with AI agents — replacing unstructured "vibe coding" with adaptive, lightweight engineering practices.
- **Platform:** Web (responsive) — prototype simulates the Code Studio sidebar, editor panels, and bottom panels

## Target Users
- **Primary:** Individual developers (junior to senior) using Code Studio with AI agents to build software
- **Secondary:** Small team leads (2-5 developers) who need visibility into agent-assisted development
- **Team size:** Individual / Small team (2-20)

## Core Features
1. **Project Home** — Single-glance view of current objective, progress, active task, pending approvals, and recommended next action
2. **Workflow Tracker** — Visual lifecycle stages (Onboard → Define → Plan → Build → Verify → Review → Ship) with status, quality gates, and artifacts
3. **Task Board** — Dependency-ordered tasks with status, acceptance criteria, changed files, test evidence, and commits
4. **Artifact Review** — Review and approve agent-generated specs, plans, ADRs, and review reports with approve/reject/comment actions
5. **Agent Activity** — Real-time view of what the agent is doing: current objective, tools used, files changed, decisions made, TDD phase
6. **Approval Center** — Centralized pending approvals with risk levels and context
7. **Project Context** — Repository summary, tech stack, conventions, commands, and boundaries that agents use

## Style Direction
- **Mood:** Technical but approachable — like a well-designed developer tool (think Linear, Raycast, or GitHub's newer UI). Clean, information-dense without feeling cluttered. Dark-mode-first since developers prefer dark themes.
- **References:** Linear (task management), GitHub Actions (workflow visualization), VS Code sidebar (tree views and panels), Raycast (clean developer UX)
- **Dark mode:** Yes — dark mode as primary, light mode as secondary

## Brand
- **Colors:** Should feel native to Code Studio's dark theme. Use a blue-purple accent (similar to Code Studio's brand). Muted, low-contrast backgrounds with high-contrast text.
- **Fonts:** Inter for UI text (matches Code Studio's interface font). JetBrains Mono for code/technical values.
- **Logo:** Use "🏗️" emoji + "Engineering Workspace" text as the sidebar header

## Constraints
- Must feel like a native IDE panel, not a separate web app
- Information density is high — developers expect compact, scannable layouts
- Must not feel like a project management tool (no Gantt charts, no time estimates, no resource allocation)
- Accessibility: WCAG AA minimum
- The prototype simulates the extension experience — sidebar on the left, editor panels in the center, bottom panel below
