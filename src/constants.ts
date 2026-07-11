/**
 * Extension-wide constants.
 *
 * @see SPEC.md §3 (Tech Stack)
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 */

export const EXTENSION_ID = 'engineering-workspace';

export const WORKFLOW_DIR = '.codestudio';
export const WORKFLOW_FILE = 'workflow.json';
export const EVENTS_FILE = 'events.jsonl';
export const CONTEXT_FILE = 'context.md';
export const HISTORY_DIR = 'history';
export const HISTORY_INDEX_FILE = 'index.json';

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

import type { ProcessLevel, LifecycleStage } from './core/types';
