import { type FunctionalComponent } from 'preact';
import { useComputed, type Signal } from '@preact/signals';
import {
  workflowStore,
  isWorkflowComplete,
  progress,
  currentStage,
  assessmentStore,
  objectiveInput,
  isAnalyzing,
  tasksActiveTab,
} from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import { ProgressBar } from '../components/progress-bar';
import { RiskBadge } from '../components/risk-badge';
import { TaskCard, type TaskStatus, type TaskChecklistItem } from '../components/task-card';
import { ApprovalCard } from '../components/approval-card';
import { ArtifactViewer } from '../components/artifact-viewer';
import type { Stage, Approval, RiskAssessment } from '../../core/types';

// ─── Quick Start suggestions ────────────────────────────────────────────────

const QUICK_START_SUGGESTIONS: readonly { readonly icon: string; readonly text: string }[] = [
  { icon: '⚡', text: 'Fix the pagination bug in /api/users endpoint' },
  { icon: '🔧', text: 'Add email notification service with SendGrid' },
  { icon: '🏗️', text: 'Implement OAuth2 authentication with session management' },
];

// ─── Tasks View ─────────────────────────────────────────────────────────────

export const TasksView: FunctionalComponent = () => {
  // UI state lives in the store so it survives view switches
  const objective = objectiveInput;
  const activeTab = tasksActiveTab;
  const analyzing = isAnalyzing;

  const showAnalyze = useComputed(() => objective.value.trim().length >= 10);
  const hasResults = useComputed(() => assessmentStore.value !== null);

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
          <p>Describe your objective. I'll analyze it and propose a plan.</p>
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

        {/* Analyze button (progressive disclosure) */}
        {showAnalyze.value && !analyzing.value && !hasResults.value && (
          <div class="analyze-section">
            <button
              class="btn btn-primary btn-full"
              onClick={() => {
                analyzing.value = true;
                bridge.send({ type: 'analyzeObjective', objective: objective.value.trim() });
              }}
            >
              <Icon name="sparkle" size={14} /> Analyze &amp; Plan
            </button>
          </div>
        )}

        {/* Analyzing spinner */}
        {analyzing.value && !hasResults.value && (
          <div class="analyze-section">
            <div class="card analyzing-card">
              <Icon name="loading" size={18} spin />
              <div>
                <div class="analyzing-card-title">Analyzing your objective…</div>
                <div class="analyzing-card-sub">
                  Detecting risks, estimating complexity, selecting skills
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analysis results */}
        {hasResults.value && assessmentStore.value && (
          <AnalysisResults
            assessment={assessmentStore.value}
            onCancel={() => {
              assessmentStore.value = null;
              analyzing.value = false;
            }}
            onStart={() => {
              if (assessmentStore.value) {
                bridge.send({
                  type: 'startWorkflow',
                  objective: objective.value.trim(),
                  assessment: assessmentStore.value,
                });
              }
            }}
          />
        )}

        {/* Quick start */}
        {!analyzing.value && !hasResults.value && (
          <div class="quick-start">
            <div class="quick-start-label">Quick Start</div>
            <div class="quick-start-list">
              {QUICK_START_SUGGESTIONS.map((s) => (
                <div
                  class="quick-start-item"
                  onClick={() => {
                    objective.value = s.text;
                  }}
                >
                  <span class="quick-start-item-icon">{s.icon}</span>
                  <span style="flex: 1;">{s.text}</span>
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
  return <ActiveState activeTab={activeTab} />;
};

// ─── Analysis Results Sub-component ─────────────────────────────────────────

interface AnalysisResultsProps {
  readonly assessment: RiskAssessment;
  readonly onCancel: () => void;
  readonly onStart: () => void;
}

const AnalysisResults: FunctionalComponent<AnalysisResultsProps> = ({
  assessment,
  onCancel,
  onStart,
}) => {
  const riskColor =
    assessment.riskLevel === 'high'
      ? 'var(--color-error)'
      : assessment.riskLevel === 'medium'
        ? 'var(--color-warning)'
        : 'var(--color-success)';

  return (
    <div>
      <div class="card analysis-results-card">
        <div class="analysis-results-header">
          <Icon name="sparkle" size={16} />
          <span class="analysis-results-header-title">Analysis Complete</span>
          <button
            class="btn-icon"
            onClick={() => {
              assessmentStore.value = null;
            }}
          >
            <Icon name="refresh" size={12} />
          </button>
        </div>
        <div class="analysis-meta">
          <div>
            <span class="analysis-meta-label">Type:</span> <strong>{assessment.workType}</strong>
          </div>
          <div>
            <span class="analysis-meta-label">Risk:</span>{' '}
            <strong style={`color: ${riskColor};`}>{assessment.riskLevel}</strong>
          </div>
          <div>
            <span class="analysis-meta-label">Process:</span>{' '}
            <strong>{assessment.processLevel}</strong>
          </div>
        </div>
        {assessment.signals.length > 0 && (
          <div class="analysis-risk-signals">
            <Icon name="warning" size={11} /> Risk signals:{' '}
            {assessment.signals.map((s) => s.signal).join(', ')}
          </div>
        )}
        <div class="analysis-recommendation">
          Recommended: <strong>{assessment.processLevel}</strong> process
        </div>
      </div>
      <div class="analysis-actions">
        <button class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button class="btn btn-primary" onClick={onStart}>
          <Icon name="play" size={14} /> Start Building
        </button>
      </div>
    </div>
  );
};

// ─── Active State Sub-component ─────────────────────────────────────────────

interface ActiveStateProps {
  readonly activeTab: Signal<'tasks' | 'artifacts'>;
}

const ActiveState: FunctionalComponent<ActiveStateProps> = ({ activeTab }) => {
  const wf = workflowStore.value!;
  const stage = currentStage.value;
  const pendingApprovals = wf.approvals.filter((a) => a.status === 'pending');

  return (
    <div class="tasks-active">
      {/* Objective + Progress */}
      <div class="tasks-header">
        <h3>{wf.objective}</h3>
        <ProgressBar value={progress.value} />
        <div class="tasks-progress-meta">
          <span>
            {wf.state.tasksCompleted} of {wf.state.tasksTotal} tasks done
          </span>
          <RiskBadge level={wf.processLevel} size="sm" />
        </div>
      </div>

      {/* Tab Switcher */}
      <div class="tab-strip">
        <button
          class={`tab-strip-item${activeTab.value === 'tasks' ? ' is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'tasks';
          }}
        >
          <Icon name="tasklist" size={12} /> Tasks
        </button>
        <button
          class={`tab-strip-item${activeTab.value === 'artifacts' ? ' is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'artifacts';
          }}
        >
          <Icon name="file-code" size={12} /> Artifacts
        </button>
      </div>

      {/* Tab Content */}
      {activeTab.value === 'tasks' ? (
        <TasksTab stages={wf.stages} approvals={pendingApprovals} currentStage={stage} />
      ) : (
        <ArtifactsTab stages={wf.stages} />
      )}
    </div>
  );
};

// ─── Tasks Tab ──────────────────────────────────────────────────────────────

interface TasksTabProps {
  readonly stages: readonly Stage[];
  readonly approvals: readonly Approval[];
  readonly currentStage: Stage | null;
}

const TasksTab: FunctionalComponent<TasksTabProps> = ({ stages, approvals, currentStage }) => {
  return (
    <div>
      {stages.map((stage) => (
        <PhaseGroup
          key={stage.id}
          stage={stage}
          approvals={approvals}
          isCurrent={currentStage?.id === stage.id}
        />
      ))}
    </div>
  );
};

// ─── Phase Group ────────────────────────────────────────────────────────────

interface PhaseGroupProps {
  readonly stage: Stage;
  readonly approvals: readonly Approval[];
  readonly isCurrent: boolean;
}

const PhaseGroup: FunctionalComponent<PhaseGroupProps> = ({ stage, approvals, isCurrent }) => {
  const phaseStatus: TaskStatus =
    stage.status === 'completed' ? 'completed' : stage.status === 'active' ? 'active' : 'pending';

  return (
    <div class="phase-group">
      <div class={`phase-header phase-header--${stage.status}`}>
        <Icon
          name={
            stage.status === 'completed'
              ? 'pass-filled'
              : stage.status === 'active'
                ? 'loading'
                : 'circle-outline'
          }
          size={14}
          spin={stage.status === 'active'}
          class="phase-header-icon"
        />
        <span class="phase-header-title">{stage.name}</span>
        <span class="phase-header-count">{stage.artifacts.length} artifacts</span>
      </div>

      {/* Inline approvals for this phase */}
      {stage.status === 'active' &&
        approvals.map((a) => (
          <ApprovalCard
            key={a.id}
            title={`${stage.name} — approval needed`}
            subtitle={a.reason}
            riskBadge={a.level === 'restricted' ? 'High Risk' : undefined}
            onApprove={() => bridge.send({ type: 'approve', approvalId: a.id })}
            onReject={() => bridge.send({ type: 'reject', approvalId: a.id })}
          />
        ))}

      {/* Task cards from artifacts */}
      <div class="phase-tasks">
        {stage.artifacts.length > 0 ? (
          stage.artifacts.map((artifact, idx) => (
            <TaskCard
              key={artifact}
              label={`Task ${idx + 1}: ${artifact}`}
              status={phaseStatus}
              sizeBadge={idx % 3 === 0 ? 'M' : 'S'}
              tddBadge={stage.status === 'active' ? 'TDD: GREEN' : undefined}
              checklist={
                stage.status === 'active'
                  ? ([
                      {
                        label: 'Returns 201 with client_secret',
                        status: 'completed' as TaskStatus,
                      },
                      { label: 'Validates amount > 0', status: 'completed' as TaskStatus },
                      { label: 'Handles API errors', status: 'active' as TaskStatus },
                      { label: 'Idempotency key support', status: 'pending' as TaskStatus },
                    ] satisfies TaskChecklistItem[])
                  : undefined
              }
              hasActivity={stage.status === 'active'}
            />
          ))
        ) : (
          <TaskCard label={`Task: ${stage.name}`} status={phaseStatus} sizeBadge="S" />
        )}
      </div>

      {/* Stage actions */}
      {isCurrent && (
        <div style="margin-top: var(--space-sm); display: flex; gap: var(--space-sm);">
          <button
            class="btn btn-primary btn-sm"
            onClick={() => bridge.send({ type: 'executeStage' })}
          >
            <Icon name="pass" size={12} /> Complete Stage
          </button>
          {stage.skippable && (
            <button
              class="btn btn-secondary btn-sm"
              onClick={() => bridge.send({ type: 'skipStage', stageId: stage.id })}
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Artifacts Tab ──────────────────────────────────────────────────────────

interface ArtifactsTabProps {
  readonly stages: readonly Stage[];
}

const ArtifactsTab: FunctionalComponent<ArtifactsTabProps> = ({ stages }) => {
  const allArtifacts = stages.flatMap((s) =>
    s.artifacts.map((a) => ({ name: a, stage: s.name, stageStatus: s.status })),
  );

  if (allArtifacts.length === 0) {
    return (
      <div class="empty-state">
        <div class="empty-state-icon">
          <Icon name="file-code" size={32} />
        </div>
        <div class="empty-state-title">No Artifacts Yet</div>
        <div class="empty-state-description">Artifacts will appear as stages produce them.</div>
      </div>
    );
  }

  return (
    <div>
      {allArtifacts.map((artifact) => {
        const status =
          artifact.stageStatus === 'completed'
            ? 'approved'
            : artifact.stageStatus === 'active'
              ? 'active'
              : 'pending';
        return (
          <ArtifactViewer
            key={artifact.name}
            name={artifact.name}
            meta={`${artifact.stage} • ${artifact.stageStatus}`}
            status={status}
            icon="file-text"
            iconColor={artifact.stageStatus === 'completed' ? 'success' : 'muted'}
            detail={
              artifact.stageStatus === 'completed' ? (
                <div>
                  <div style="margin-bottom: var(--space-sm);">
                    <strong>Objective:</strong> {workflowStore.value?.objective}
                  </div>
                  <div>
                    <strong>Stage:</strong> {artifact.stage}
                  </div>
                </div>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
};

// ─── Complete State ─────────────────────────────────────────────────────────

const CompleteState: FunctionalComponent = () => {
  const wf = workflowStore.value!;
  const completedTasks = wf.state.tasksCompleted;
  const totalTasks = wf.state.tasksTotal;

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
            {completedTasks}/{totalTasks}
          </div>
          <div class="complete-stat-label">Tasks</div>
        </div>
        <div>
          <div class="complete-stat-value">—</div>
          <div class="complete-stat-label">Tests</div>
        </div>
        <div>
          <div class="complete-stat-value">—</div>
          <div class="complete-stat-label">Coverage</div>
        </div>
        <div>
          <div class="complete-stat-value">—</div>
          <div class="complete-stat-label">Lines</div>
        </div>
      </div>

      {/* Plan vs Actual */}
      <div class="card plan-vs-actual">
        <div class="plan-vs-actual-header">
          <span class="plan-vs-actual-title">Plan vs Actual</span>
          <span class="plan-vs-actual-score">
            {Math.round((completedTasks / Math.max(totalTasks, 1)) * 100)}% aligned
          </span>
        </div>
        <div class="plan-vs-actual-list">
          {wf.stages.map((s) => (
            <div class="plan-vs-actual-item">
              <Icon
                name={s.status === 'completed' ? 'pass-filled' : 'warning'}
                size={12}
                class={
                  s.status === 'completed' ? 'task-card-icon--completed' : 'task-card-icon--pending'
                }
              />
              <span>{s.name}</span>
              <span class="plan-vs-actual-item-detail">
                {s.status === 'completed'
                  ? `Matches plan (${s.artifacts.length} artifacts)`
                  : s.status === 'skipped'
                    ? 'Skipped'
                    : 'In progress'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div class="complete-actions">
        <button
          class="btn btn-secondary"
          onClick={() => bridge.send({ type: 'navigate', view: 'history' })}
        >
          <Icon name="history" size={14} /> View in History
        </button>
        <button
          class="btn btn-primary"
          onClick={() => bridge.send({ type: 'navigate', view: 'tasks' })}
        >
          <Icon name="add" size={14} /> Archive &amp; Start New
        </button>
      </div>
    </div>
  );
};
