/**
 * Signal-based state stores for the webview (SPEC §6).
 *
 * Uses @preact/signals for fine-grained reactive state.
 * No useState for shared state — signals only.
 */

import { signal, computed } from '@preact/signals';
import type {
  AgentActivityStatus,
  Artifact,
  KnowledgeFileInfo,
  LifecycleStage,
  OnboardingStatus,
  ProjectContext,
  ProjectType,
  RiskAssessment,
  StageAction,
  StageExecutionResult,
  WorkflowDefinition,
  HistoryEntry,
  ArtifactManifestEntry,
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
export const tasksActiveTab = signal<'stages' | 'artifacts'>('stages');

// ─── Assessment State ──────────────────────────────────────────────────────

export const assessmentStore = signal<RiskAssessment | null>(null);

// ─── Context State ─────────────────────────────────────────────────────────

export const contextStore = signal<ProjectContext | null>(null);

// ─── History State ─────────────────────────────────────────────────────────

export const historyStore = signal<readonly HistoryEntry[]>([]);
export const historySearch = signal<string>('');
export const historyDetailEntry = signal<HistoryEntry | null>(null);
export const historyDetailWorkflow = signal<WorkflowDefinition | null>(null);
export const historyDetailArtifacts = signal<readonly ArtifactManifestEntry[]>([]);
export const filteredHistory = computed(() => {
  const search = historySearch.value.toLowerCase().trim();
  if (!search) return historyStore.value;
  return historyStore.value.filter(
    (e) =>
      e.objective.toLowerCase().includes(search) ||
      e.processLevel.toLowerCase().includes(search),
  );
});

// ─── Knowledge State ──────────────────────────────────────────────────────

export const knowledgeStore = signal<readonly KnowledgeFileInfo[]>([]);
export const knowledgeRefreshing = signal<boolean>(false);

// ─── Onboarding State ─────────────────────────────────────────────────────

export const onboardingStatus = signal<OnboardingStatus>('welcome');
export const hasExistingFiles = signal<boolean>(false);
export const projectType = signal<ProjectType | null>(null);
export const isOnboarded = computed(() => onboardingStatus.value === 'ready');

// ─── Artifact Generation State ────────────────────────────────────────────

export const generatingStage = signal<string | null>(null);
export const detectedArtifacts = signal<readonly Artifact[]>([]);

// ─── Stage Detail State (Task 1: Tasks View) ─────────────────────────────

/** Combined detail for the active stage — action, completion, instructions, artifacts. */
export interface StageDetailData {
  readonly stage: LifecycleStage | null;
  readonly action: StageAction | null;
  readonly completion: StageExecutionResult;
  readonly instructions: string;
  readonly artifacts: readonly Artifact[];
}

export const stageDetailStore = signal<StageDetailData | null>(null);

/** Agent activity status — idle, working, or waiting for approval. */
export const agentStatus = signal<AgentActivityStatus>('idle');
export const agentStatusMessage = signal<string | null>(null);
export const agentStatusStage = signal<LifecycleStage | null>(null);

/**
 * Cached artifact content keyed by artifact ID.
 * Bounded to MAX_CACHED_ARTIFACTS entries to prevent unbounded memory growth
 * in long-running sessions with retainContextWhenHidden: true.
 */
export const artifactContents = signal<Readonly<Record<string, string>>>({});
const MAX_CACHED_ARTIFACTS = 30;

// ─── Capabilities State ───────────────────────────────────────────────────

export const capabilitiesStore = signal<{
  readonly recommendations: readonly unknown[];
  readonly installedPacks: readonly string[];
}>({ recommendations: [], installedPacks: [] });

// ─── Store Actions ────────────────────────────────────────────────────────
// Encapsulated mutations so components don't directly write to signals.
// Each action is a named function that describes the intent.

export const actions = {
  /** Cache an artifact's content, evicting oldest entries if over limit. */
  cacheArtifactContent(artifactId: string, content: string): void {
    const current = artifactContents.value;
    const keys = Object.keys(current);
    let next = { ...current, [artifactId]: content };

    // Evict oldest entries if over the cache limit
    if (keys.length >= MAX_CACHED_ARTIFACTS) {
      const toRemove = keys.slice(0, keys.length - MAX_CACHED_ARTIFACTS + 1);
      next = { ...next };
      for (const key of toRemove) {
        delete (next as Record<string, string>)[key];
      }
    }

    artifactContents.value = next;
  },

  /** Clear the artifact content cache entirely. */
  clearArtifactCache(): void {
    artifactContents.value = {};
  },

  /** Set the analyzing state with intent tracking. */
  startAnalyzing(): void {
    isAnalyzing.value = true;
    error.value = null;
  },

  /** Cancel the analyzing state. */
  cancelAnalyzing(): void {
    isAnalyzing.value = false;
  },

  /** Set an error message, optionally auto-clearing after a delay. */
  setError(message: string, autoClearMs?: number): void {
    error.value = message;
    if (autoClearMs) {
      setTimeout(() => {
        if (error.value === message) {
          error.value = null;
        }
      }, autoClearMs);
    }
  },

  /** Clear the current error. */
  clearError(): void {
    error.value = null;
  },

  /** Reset all workflow-related state (used after cancel). */
  resetWorkflowState(): void {
    workflowStore.value = null;
    stageDetailStore.value = null;
    agentStatus.value = 'idle';
    agentStatusMessage.value = null;
    agentStatusStage.value = null;
    generatingStage.value = null;
    detectedArtifacts.value = [];
    artifactContents.value = {};
    assessmentStore.value = null;
    objectiveInput.value = '';
    isAnalyzing.value = false;
  },

  /** Navigate onboarding to a specific step. */
  setOnboardingStatus(status: OnboardingStatus): void {
    onboardingStatus.value = status;
  },
} as const;
