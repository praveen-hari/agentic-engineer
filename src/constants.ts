/**
 * Extension-wide constants.
 *
 * @see SPEC.md §3 (Tech Stack)
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 */

export const EXTENSION_ID = 'engineering-workspace';

// ─── .codestudio/ Root ──────────────────────────────────────────────────────

export const WORKFLOW_DIR = '.codestudio';

// ─── Top-Level Files (config + agent instructions) ─────────────────────────

export const CONFIG_FILE = 'config.json';
export const INSTRUCTIONS_FILE = 'codestudio-instructions.md';

// ─── Knowledge Files (project context, inside knowledge/) ───────────────────

export const CONTEXT_FILE = 'knowledge/context.md';
export const ARCHITECTURE_FILE = 'knowledge/architecture.md';
export const STACK_FILE = 'knowledge/stack.md';

// ─── Workflows (DD-002, DD-009: branch-scoped) ─────────────────────────────

export const WORKFLOWS_DIR = 'workflows';
export const CURRENT_WORKFLOW_DIR = 'workflows/current';
export const WORKFLOW_FILE = 'workflow.json';
export const OBJECTIVE_FILE = 'objective.md';

// ─── Artifacts (DD-002: per work-request, temporary) ────────────────────────

export const ARTIFACTS_DIR = 'workflows/current/artifacts';
export const ARTIFACTS_MANIFEST = 'workflows/current/artifacts/manifest.json';
export const ARTIFACTS_SPECS_DIR = 'workflows/current/artifacts/specs';
export const ARTIFACTS_PLANS_DIR = 'workflows/current/artifacts/plans';
export const ARTIFACTS_REVIEWS_DIR = 'workflows/current/artifacts/reviews';
export const ARTIFACTS_REPORTS_DIR = 'workflows/current/artifacts/reports';

// ─── Knowledge (DD-021: project-level, persistent) ──────────────────────────

export const KNOWLEDGE_DIR = 'knowledge';
export const KNOWLEDGE_ADRS_DIR = 'knowledge/adrs';
export const CONVENTIONS_FILE = 'knowledge/conventions.md';
export const BOUNDARIES_FILE = 'knowledge/boundaries.md';
export const CONVENTIONS_FILE_ROOT = CONVENTIONS_FILE;
export const BOUNDARIES_FILE_ROOT = BOUNDARIES_FILE;

// ─── Agent Customizations (DD-022, DD-023, DD-026) ──────────────────────────

export const INSTRUCTIONS_DIR = 'instructions';
export const AGENTS_DIR = 'agents';
export const SKILLS_DIR = 'skills';
export const PROMPTS_DIR = 'prompts';
export const HOOKS_DIR = 'hooks';

// ─── Archive (DD-004, DD-005: completed workflows) ──────────────────────────

export const ARCHIVE_DIR = 'archive';
export const HISTORY_DIR = 'history';
export const HISTORY_META_FILE = 'history/meta.json';

// ─── Directories created on project setup (essential) ───────────────────────

export const CODESTUDIO_DIRECTORIES = [
  CURRENT_WORKFLOW_DIR,
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
  KNOWLEDGE_DIR,
  KNOWLEDGE_ADRS_DIR,
  ARCHIVE_DIR,
] as const;

// ─── Directories created on demand (advanced customization) ─────────────────
// These are only created when the user configures agents, hooks, skills, etc.

export const CODESTUDIO_OPTIONAL_DIRECTORIES = [
  INSTRUCTIONS_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  PROMPTS_DIR,
  HOOKS_DIR,
] as const;

export const CHAT_PARTICIPANT_ID = 'engineering-workspace.participant';
export const CHAT_PARTICIPANT_NAME = 'engineering';

export const WEBVIEW_VIEW_ID = 'engineeringWorkspace.mainView';

/** Process level → minimum number of approvals (DD-010). */
export const MIN_APPROVALS: Readonly<Record<ProcessLevel, number>> = {
  light: 0,
  standard: 2,
  thorough: 3,
  guarded: 4,
};

/** Process level → base stages (DD-014). */
export const BASE_STAGES: Readonly<Record<ProcessLevel, readonly LifecycleStage[]>> = {
  light: ['plan', 'build', 'verify'],
  standard: ['define', 'plan', 'build', 'verify', 'review'],
  thorough: ['define', 'plan', 'build', 'verify', 'review', 'ship'],
  guarded: ['define', 'plan', 'build', 'verify', 'review', 'ship'],
};

/** Stage display names. */
export const STAGE_NAMES: Readonly<Record<LifecycleStage, string>> = {
  define: 'Define',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  review: 'Review',
  ship: 'Ship',
};

// ─── Default Config (DD-027) ────────────────────────────────────────────────

export const DEFAULT_CONFIG: WorkspaceConfig = {
  version: 1,
  processLevelDefault: 'auto',
  approvalMode: 'user',
  autoApproveLowRisk: false,
  reviewTimeoutMinutes: 5,
  autoRefreshContext: true,
};

import type { ProcessLevel, LifecycleStage, WorkspaceConfig } from './core/types';
