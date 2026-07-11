/**
 * Extension-wide constants.
 *
 * @see SPEC.md §3 (Tech Stack)
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 */

export const EXTENSION_ID = 'engineering-workspace';

// ─── .codestudio/ Root ──────────────────────────────────────────────────────

export const WORKFLOW_DIR = '.codestudio';

// ─── Top-Level Files ────────────────────────────────────────────────────────

export const CONTEXT_FILE = 'context.md';
export const CONFIG_FILE = 'config.json';

// ─── Workflows (DD-002, DD-009: branch-scoped) ─────────────────────────────

export const WORKFLOWS_DIR = 'workflows';
export const CURRENT_WORKFLOW_DIR = 'workflows/current';
export const WORKFLOW_FILE = 'workflow.json';
export const OBJECTIVE_FILE = 'objective.md';
export const EVENTS_FILE = 'events.jsonl';

// ─── Artifacts (DD-002: per work-request, temporary) ────────────────────────

export const ARTIFACTS_DIR = 'workflows/current/artifacts';
export const ARTIFACTS_SPECS_DIR = 'workflows/current/artifacts/specs';
export const ARTIFACTS_PLANS_DIR = 'workflows/current/artifacts/plans';
export const ARTIFACTS_REVIEWS_DIR = 'workflows/current/artifacts/reviews';
export const ARTIFACTS_REPORTS_DIR = 'workflows/current/artifacts/reports';

// ─── Knowledge (DD-021: project-level, persistent) ──────────────────────────

export const KNOWLEDGE_DIR = 'knowledge';
export const KNOWLEDGE_ADRS_DIR = 'knowledge/adrs';
export const CONVENTIONS_FILE = 'knowledge/conventions.md';
export const BOUNDARIES_FILE = 'knowledge/boundaries.md';

// ─── Agent Customizations (DD-022, DD-023, DD-026) ──────────────────────────

export const INSTRUCTIONS_DIR = 'instructions';
export const AGENTS_DIR = 'agents';
export const SKILLS_DIR = 'skills';
export const PROMPTS_DIR = 'prompts';
export const HOOKS_DIR = 'hooks';

// ─── Archive (DD-004, DD-005: completed workflows) ──────────────────────────

export const ARCHIVE_DIR = 'archive';
export const HISTORY_DIR = 'history';
export const HISTORY_INDEX_FILE = 'index.json';

// ─── All directories to create on initialization ────────────────────────────

export const CODESTUDIO_DIRECTORIES = [
  CURRENT_WORKFLOW_DIR,
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
  KNOWLEDGE_DIR,
  KNOWLEDGE_ADRS_DIR,
  INSTRUCTIONS_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  PROMPTS_DIR,
  HOOKS_DIR,
  ARCHIVE_DIR,
] as const;

// ─── Files to exclude from workspace scanning ───────────────────────────────

export const SCAN_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
  '.codestudio',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'bin',
  'obj',
] as const;

// ─── Config file names to read content from during scanning ─────────────────

export const SCAN_READ_FILES = [
  'package.json',
  'tsconfig.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  'composer.json',
] as const;

// ─── .NET project files to read for framework detection ─────────────────────

export const DOTNET_PROJECT_EXTENSIONS = ['.csproj', '.fsproj', '.vbproj', '.sln'] as const;

// ─── Scan depth limit ───────────────────────────────────────────────────────

export const SCAN_MAX_DEPTH = 3;

// ─── Context staleness threshold (24 hours in ms) ───────────────────────────

export const CONTEXT_STALENESS_MS = 24 * 60 * 60 * 1000;

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
  standard: ['onboard', 'define', 'plan', 'build', 'verify', 'review', 'ship'],
  thorough: ['onboard', 'define', 'plan', 'build', 'verify', 'review', 'ship'],
  guarded: ['onboard', 'define', 'plan', 'build', 'verify', 'review', 'ship'],
};

/** Stage display names. */
export const STAGE_NAMES: Readonly<Record<LifecycleStage, string>> = {
  onboard: 'Onboard',
  define: 'Define',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  review: 'Review',
  ship: 'Ship',
};

/** History pagination (DD-007). */
export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_HOT_THRESHOLD = 5;
export const HISTORY_WARM_THRESHOLD = 20;

// ─── Default Config (DD-027) ────────────────────────────────────────────────

export const DEFAULT_CONFIG: WorkspaceConfig = {
  version: 1,
  processLevelDefault: 'auto',
  autoApproveLowRisk: false,
  reviewTimeoutMinutes: 5,
  historyHotThreshold: HISTORY_HOT_THRESHOLD,
  historyWarmThreshold: HISTORY_WARM_THRESHOLD,
  historyColdAgeDays: 180,
  autoRefreshContext: true,
};

import type { ProcessLevel, LifecycleStage, WorkspaceConfig } from './core/types';
