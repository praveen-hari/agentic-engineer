/**
 * Signal-based state stores for the webview (SPEC §6).
 *
 * Uses @preact/signals for fine-grained reactive state.
 * No useState for shared state — signals only.
 */

import { signal, computed } from '@preact/signals';
import type {
  ProjectContext,
  RiskAssessment,
  WorkflowDefinition,
  HistoryEntry,
} from '../../core/types';

// ─── Workflow State ────────────────────────────────────────────────────────

export const workflowStore = signal<WorkflowDefinition | null>(null);
export const isWorkflowActive = computed(() => workflowStore.value?.state.status === 'active');
export const isWorkflowComplete = computed(() => workflowStore.value?.state.status === 'completed');
export const currentStage = computed(
  () => workflowStore.value?.stages.find((s) => s.status === 'active') ?? null,
);
export const progress = computed(() => {
  const wf = workflowStore.value;
  if (!wf) return 0;
  const completed = wf.stages.filter((s) => s.status === 'completed').length;
  return Math.round((completed / wf.stages.length) * 100);
});

// ─── UI State ──────────────────────────────────────────────────────────────

export const activeView = signal<string>('tasks');
export const isLoading = signal<boolean>(false);
export const error = signal<string | null>(null);

// Tasks view UI state — lifted here so it survives view switches
export const objectiveInput = signal<string>('');
export const isAnalyzing = signal<boolean>(false);
export const tasksActiveTab = signal<'tasks' | 'artifacts'>('tasks');

// ─── Assessment State ──────────────────────────────────────────────────────

export const assessmentStore = signal<RiskAssessment | null>(null);

// ─── Context State ─────────────────────────────────────────────────────────

export const contextStore = signal<ProjectContext | null>(null);

// ─── History State ─────────────────────────────────────────────────────────

export const historyStore = signal<readonly HistoryEntry[]>([]);
export const historyHasMore = signal<boolean>(false);

// ─── Capabilities State ───────────────────────────────────────────────────

export const capabilitiesStore = signal<{
  readonly recommendations: readonly unknown[];
  readonly installedPacks: readonly string[];
}>({ recommendations: [], installedPacks: [] });
