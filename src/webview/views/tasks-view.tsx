/**
 * Tasks View — the main view after SDLC workflow starts.
 *
 * Three states:
 * 1. Empty — no workflow. Shows objective input → "Start in Chat" button.
 * 2. Active — workflow running. Stage-centric accordion layout.
 * 3. Complete — workflow done. Success banner + stats.
 *
 * The Active state uses StageAccordion components — one per SDLC stage.
 * The active stage auto-expands with full detail (agent status, skills,
 * completion requirements, artifacts, gates, actions).
 */
import { type FunctionalComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useComputed, useSignal } from '@preact/signals';
import type { WorkflowDefinition, AgentActivityStatus, Artifact } from '../../core/types';
import type { StageDetailData } from '../store/workflow.store';
import {
  activeView,
  workflowStore,
  isWorkflowComplete,
  progress,
  objectiveInput,
  isAnalyzing,
  tasksActiveTab,
  stageDetailStore,
  agentStatus as agentStatusSignal,
  agentStatusMessage,
} from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import { ProgressBar } from '../components/progress-bar';
import { RiskBadge } from '../components/risk-badge';
import { StageAccordion } from '../components/stage-accordion';
import { ConfirmDialog } from '../components/confirm-dialog';

// ─── Quick Start suggestions ────────────────────────────────────────────────

const QUICK_START_SUGGESTIONS: readonly { readonly icon: string; readonly text: string }[] = [
  { icon: '⚡', text: 'Fix the pagination bug in /api/users endpoint' },
  { icon: '🔧', text: 'Add email notification service with SendGrid' },
  { icon: '🏗️', text: 'Implement OAuth2 authentication with session management' },
];

// ─── Tasks View ─────────────────────────────────────────────────────────────

/** Timeout for the analyzing spinner (30 seconds). */
const ANALYZE_TIMEOUT_MS = 30_000;

export const TasksView: FunctionalComponent = () => {
  const objective = objectiveInput;
  const analyzing = isAnalyzing;
  const showStart = useComputed(() => objective.value.trim().length >= 10);
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-cancel analyzing state after timeout
  useEffect(() => {
    if (analyzing.value) {
      analyzeTimer.current = setTimeout(() => {
        analyzing.value = false;
        // Import error from store to show timeout message
        import('../store/workflow.store').then(({ error }) => {
          error.value = 'The agent did not respond in time. Check the Chat panel or try again.';
          setTimeout(() => {
            error.value = null;
          }, 8000);
        });
      }, ANALYZE_TIMEOUT_MS);
    } else if (analyzeTimer.current) {
      clearTimeout(analyzeTimer.current);
      analyzeTimer.current = null;
    }
    return () => {
      if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    };
  }, [analyzing.value]);

  // ─── Empty State ───────────────────────────────────────────────
  if (!workflowStore.value) {
    return (
      <div class="tasks-empty">
        {/* Hero */}
        <div class="tasks-empty-hero">
          <div class="tasks-empty-hero-icon">
            <Icon name="rocket" size={24} />
          </div>
          <h2>What do you want to build?</h2>
          <p>Describe your objective and the agent will plan &amp; execute it.</p>
        </div>

        {/* Objective input */}
        <div class="objective-input-wrap">
          <textarea
            class="textarea"
            placeholder="e.g., Add user authentication with OAuth2 and session management"
            value={objective.value}
            onInput={(e: Event) => {
              objective.value = (e.target as HTMLTextAreaElement).value;
            }}
            rows={3}
          />
          <div class="objective-meta">
            <span>Be specific — mention APIs, libraries, or constraints</span>
            <span>{objective.value.trim().length} chars</span>
          </div>
        </div>

        {/* Start in Chat button */}
        {showStart.value && !analyzing.value && (
          <div class="analyze-section">
            <button
              class="btn btn-primary btn-full"
              onClick={() => {
                analyzing.value = true;
                bridge.send({
                  type: 'analyzeObjective',
                  objective: objective.value.trim(),
                });
              }}
            >
              <Icon name="sparkle" size={14} /> Start in Chat
            </button>
            <div class="analyze-hint">
              The agent will assess complexity, select skills, and create a workflow.
            </div>
          </div>
        )}

        {/* Analyzing spinner with cancel */}
        {analyzing.value && (
          <div class="analyze-section">
            <div class="card analyzing-card">
              <Icon name="loading" size={18} spin />
              <div>
                <div class="analyzing-card-title">Starting workflow…</div>
                <div class="analyzing-card-sub">
                  The agent is analyzing your objective and creating a plan.
                </div>
              </div>
            </div>
            <button
              class="btn btn-secondary btn-sm analyze-cancel-btn"
              onClick={() => {
                analyzing.value = false;
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Quick start */}
        {!analyzing.value && (
          <div class="quick-start">
            <div class="quick-start-label">Quick Start</div>
            <div class="quick-start-list">
              {QUICK_START_SUGGESTIONS.map((s) => (
                <div
                  key={s.text}
                  class="quick-start-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    objective.value = s.text;
                  }}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      objective.value = s.text;
                    }
                  }}
                >
                  <span class="quick-start-item-icon">{s.icon}</span>
                  <span class="quick-start-item-text">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Complete State ────────────────────────────────────────────
  if (isWorkflowComplete.value) {
    return <CompleteState />;
  }

  // ─── Active State ──────────────────────────────────────────────
  return <ActiveState />;
};

// ─── Active State ───────────────────────────────────────────────────────────

const ActiveState: FunctionalComponent = () => {
  const wf = workflowStore.value!;
  const detail = stageDetailStore.value;
  const agentSt = agentStatusSignal.value;
  const agentMsg = agentStatusMessage.value;
  const activeTab = tasksActiveTab;
  const allArtifacts = detail?.artifacts ?? [];
  const showDeleteConfirm = useSignal(false);

  // Request stage detail on mount and when workflow changes
  useEffect(() => {
    bridge.send({ type: 'requestStageDetail' });
  }, [wf.state.currentStage, wf.state.lastActivityAt]);

  return (
    <div class="tasks-active">
      {/* Objective + Progress Header */}
      <div class="tasks-header">
        <div class="tasks-header-top">
          <h3>{wf.objective}</h3>
          <div class="tasks-header-actions">
            {wf.state.status === 'active' && (
              <button
                class="btn btn-secondary btn-sm"
                title="Pause this task — you can resume later"
                onClick={() => {
                  bridge.send({ type: 'pauseWorkflow' });
                }}
              >
                <Icon name="circle-slash" size={12} /> Pause
              </button>
            )}
            {wf.state.status === 'paused' && (
              <button
                class="btn btn-primary btn-sm"
                title="Resume this task"
                onClick={() => {
                  bridge.send({ type: 'resumeWorkflow' });
                }}
              >
                <Icon name="play" size={12} /> Resume
              </button>
            )}
            <button
              class="btn btn-secondary btn-sm tasks-delete-btn"
              title="Delete this task permanently"
              onClick={() => {
                showDeleteConfirm.value = true;
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
        {wf.state.status === 'paused' && (
          <div class="tasks-paused-banner">
            <Icon name="circle-slash" size={14} />
            <span>Task paused — click Resume to continue</span>
          </div>
        )}
        <ProgressBar value={progress.value} />
        <div class="tasks-progress-meta">
          <span>
            {wf.stages.filter((s) => s.status === 'completed').length} of {wf.stages.length} stages
          </span>
          <RiskBadge level={wf.processLevel} size="sm" />
        </div>
      </div>

      {/* Tab Switcher: Stages / Artifacts */}
      <div class="tab-strip">
        <button
          class={`tab-strip-item${activeTab.value === 'stages' ? ' is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'stages';
          }}
        >
          <Icon name="list-tree" size={12} /> Stages
        </button>
        <button
          class={`tab-strip-item${activeTab.value === 'artifacts' ? ' is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'artifacts';
          }}
        >
          <Icon name="file-code" size={12} /> Artifacts
          {allArtifacts.length > 0 && (
            <span class="badge badge-sm" style="margin-left: var(--space-xs);">
              {allArtifacts.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab.value === 'stages' ? (
        <StagesTab wf={wf} detail={detail} agentSt={agentSt} agentMsg={agentMsg} />
      ) : (
        <ArtifactsTab artifacts={allArtifacts} />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm.value && (
        <ConfirmDialog
          icon="warning"
          title="Delete Task?"
          message="This will permanently delete the current task and all its artifacts. This cannot be undone."
          confirmLabel="Delete"
          confirmDanger
          onCancel={() => {
            showDeleteConfirm.value = false;
          }}
          onConfirm={() => {
            showDeleteConfirm.value = false;
            bridge.send({ type: 'cancelAgent' });
            bridge.send({ type: 'deleteWorkflow' });
          }}
        />
      )}
    </div>
  );
};

// ─── Stages Tab ─────────────────────────────────────────────────────────────

interface StagesTabProps {
  readonly wf: WorkflowDefinition;
  readonly detail: StageDetailData | null;
  readonly agentSt: AgentActivityStatus;
  readonly agentMsg: string | null;
}

/** Maps approval artifact names to the stage they belong to. */
const APPROVAL_STAGE_MAP: Record<string, string> = {
  spec: 'define',
  plan: 'plan',
  review: 'review',
  'code-review': 'review',
  'security-review': 'review',
  architecture: 'review',
  integration: 'review',
  'schema-migration': 'ship',
  deployment: 'ship',
};

const StagesTab: FunctionalComponent<StagesTabProps> = ({ wf, detail, agentSt, agentMsg }) => (
  <div class="stage-accordion-list">
    {wf.stages.map((stage) => {
      const isActive = stage.status === 'active';
      // Only show approvals that belong to this stage
      const stageApprovals = isActive
        ? wf.approvals.filter(
            (a) => a.status === 'pending' && APPROVAL_STAGE_MAP[a.artifact] === stage.id,
          )
        : [];
      return (
        <StageAccordion
          key={stage.id}
          stage={stage}
          isActive={isActive}
          action={isActive ? detail?.action : null}
          completion={isActive ? detail?.completion : null}
          artifacts={detail?.artifacts}
          gates={wf.qualityGates}
          approvals={stageApprovals}
          agentStatus={isActive ? agentSt : undefined}
          agentMessage={isActive ? (agentMsg ?? undefined) : undefined}
          onSendToAgent={
            isActive ? () => bridge.send({ type: 'sendToAgent', stage: stage.id }) : undefined
          }
          onCompleteStage={isActive ? () => bridge.send({ type: 'executeStage' }) : undefined}
          onSkipStage={
            isActive && stage.skippable
              ? () => bridge.send({ type: 'skipStage', stageId: stage.id })
              : undefined
          }
          onApprove={(id) => bridge.send({ type: 'approve', approvalId: id })}
          onReject={(id) => bridge.send({ type: 'reject', approvalId: id })}
          onViewArtifact={(id) => bridge.send({ type: 'openArtifact', artifactId: id })}
        />
      );
    })}
  </div>
);

// ─── Artifacts Tab ──────────────────────────────────────────────────────────

interface ArtifactsTabProps {
  readonly artifacts: readonly Artifact[];
}

const STAGE_LABELS: Record<string, string> = {
  define: 'Define',
  plan: 'Plan',
  build: 'Build',
  verify: 'Verify',
  review: 'Review',
  ship: 'Ship',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: '',
  'pending-review': 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
};

const ArtifactsTab: FunctionalComponent<ArtifactsTabProps> = ({ artifacts }) => {
  if (artifacts.length === 0) {
    return (
      <div class="empty-state">
        <div class="empty-state-icon">
          <Icon name="file-code" size={32} />
        </div>
        <div class="empty-state-title">No Artifacts Yet</div>
        <div class="empty-state-description">
          Artifacts (specs, plans, reviews, reports) will appear here as the agent produces them.
        </div>
      </div>
    );
  }

  return (
    <div class="artifacts-list">
      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          class="artifact-list-item"
          onClick={() => bridge.send({ type: 'openArtifact', artifactId: artifact.id })}
        >
          <Icon
            name="file-text"
            size={16}
            class={
              artifact.status === 'approved'
                ? 'task-card-icon--completed'
                : 'task-card-icon--pending'
            }
          />
          <div class="artifact-list-item-content">
            <div class="artifact-list-item-title">{artifact.title}</div>
            <div class="artifact-list-item-meta">
              {artifact.type} · {STAGE_LABELS[artifact.stage] ?? artifact.stage}
              {artifact.updatedAt && ` · ${new Date(artifact.updatedAt).toLocaleDateString()}`}
            </div>
          </div>
          <span class={`badge badge-sm ${STATUS_BADGE_CLASS[artifact.status] ?? ''}`}>
            {artifact.status}
          </span>
          <Icon name="chevron-right" size={14} class="artifact-list-item-arrow" />
        </div>
      ))}
    </div>
  );
};

// ─── Complete State ─────────────────────────────────────────────────────────

const CompleteState: FunctionalComponent = () => {
  const wf = workflowStore.value!;
  const completedStages = wf.stages.filter((s) => s.status === 'completed').length;
  const skippedStages = wf.stages.filter((s) => s.status === 'skipped').length;

  return (
    <div class="tasks-complete">
      {/* Success banner */}
      <div class="card complete-banner">
        <div class="complete-banner-icon">
          <Icon name="pass-filled" size={20} />
        </div>
        <div>
          <h3>Done.</h3>
          <div class="complete-banner-subtitle">{wf.objective}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div class="complete-stats">
        <div>
          <div class="complete-stat-value complete-stat-value--success">
            {completedStages}/{wf.stages.length}
          </div>
          <div class="complete-stat-label">Stages</div>
        </div>
        <div>
          <div class="complete-stat-value">{skippedStages}</div>
          <div class="complete-stat-label">Skipped</div>
        </div>
        <div>
          <div class="complete-stat-value">
            {wf.qualityGates.filter((g) => g.status === 'passed').length}
          </div>
          <div class="complete-stat-label">Gates Passed</div>
        </div>
        <div>
          <div class="complete-stat-value">
            {wf.approvals.filter((a) => a.status === 'approved').length}
          </div>
          <div class="complete-stat-label">Approvals</div>
        </div>
      </div>

      {/* Plan vs Actual */}
      <div class="card plan-vs-actual">
        <div class="plan-vs-actual-header">
          <span class="plan-vs-actual-title">Plan vs Actual</span>
          <span class="plan-vs-actual-score">
            {Math.round((completedStages / Math.max(wf.stages.length, 1)) * 100)}% completed
          </span>
        </div>
        <div class="plan-vs-actual-list">
          {wf.stages.map((s) => (
            <div key={s.id} class="plan-vs-actual-item">
              <Icon
                name={
                  s.status === 'completed'
                    ? 'pass-filled'
                    : s.status === 'skipped'
                      ? 'close'
                      : 'warning'
                }
                size={12}
                class={
                  s.status === 'completed' ? 'task-card-icon--completed' : 'task-card-icon--pending'
                }
              />
              <span>{s.name}</span>
              <span class="plan-vs-actual-item-detail">
                {s.status === 'completed'
                  ? 'Completed'
                  : s.status === 'skipped'
                    ? 'Skipped'
                    : 'Not reached'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div class="complete-actions">
        <button
          class="btn btn-secondary"
          onClick={() => {
            activeView.value = 'history';
          }}
        >
          <Icon name="history" size={14} /> View in History
        </button>
        <button
          class="btn btn-primary"
          onClick={() => {
            bridge.send({ type: 'cancelWorkflow' });
          }}
        >
          <Icon name="add" size={14} /> Start New
        </button>
      </div>
    </div>
  );
};
