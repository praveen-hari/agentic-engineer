/**
 * Expandable stage accordion for the Tasks View.
 *
 * Each SDLC stage is rendered as an accordion:
 * - Completed stages: collapsed, single line with checkmark
 * - Active stage: auto-expanded with full detail
 * - Pending stages: collapsed, dimmed
 *
 * The active stage shows:
 * 1. Agent status banner (working / waiting / idle)
 * 2. Active skills badges
 * 3. Completion requirements checklist
 * 4. Artifacts list
 * 5. Action buttons (Send to Agent, Complete Stage, Skip)
 */
import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { Icon, type IconName } from './icon';
import { buildCompletionItems } from '../utils/build-completion-items';
import type {
  AgentActivityStatus,
  Approval,
  Artifact,
  QualityGate,
  StageAction,
  StageExecutionResult,
  Stage,
} from '../../core/types';
import type { TodoProgressView } from '../store/workflow.store';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface StageAccordionProps {
  readonly stage: Stage;
  readonly isActive: boolean;
  /** Stage action — skills, required artifacts, gates. Null if no action computed. */
  readonly action?: StageAction | null;
  /** Completion check result — what's met and what's missing. */
  readonly completion?: StageExecutionResult | null;
  /** Artifacts produced for this stage. */
  readonly artifacts?: readonly Artifact[];
  /** Quality gates for this stage. */
  readonly gates?: readonly QualityGate[];
  /** Pending approvals for this stage. */
  readonly approvals?: readonly Approval[];
  /** Agent activity status. */
  readonly agentStatus?: AgentActivityStatus;
  readonly agentMessage?: string;
  // Actions
  readonly onSendToAgent?: () => void;
  readonly onCompleteStage?: () => void;
  readonly onSkipStage?: () => void;
  readonly onApprove?: (approvalId: string) => void;
  readonly onReject?: (approvalId: string) => void;
  readonly onViewArtifact?: (artifactId: string) => void;
  /** Todo progress for Build stage task tracking. */
  readonly todoProgress?: TodoProgressView | null;
}

// ─── Status Helpers ─────────────────────────────────────────────────────────

const STATUS_ICON: Record<Stage['status'], IconName> = {
  completed: 'pass-filled',
  active: 'loading',
  skipped: 'close',
  pending: 'circle-outline',
  blocked: 'warning',
};

const STATUS_CLASS: Record<Stage['status'], string> = {
  completed: 'task-card-icon--completed',
  active: 'task-card-icon--active',
  skipped: 'task-card-icon--pending',
  pending: 'task-card-icon--pending',
  blocked: 'task-card-icon--pending',
};

// ─── Component ──────────────────────────────────────────────────────────────

export const StageAccordion: FunctionalComponent<StageAccordionProps> = ({
  stage,
  isActive,
  action,
  completion,
  artifacts = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gates: _gates = [],
  approvals = [],
  agentStatus: agentSt,
  agentMessage,
  onSendToAgent,
  onCompleteStage,
  onSkipStage,
  onApprove,
  onReject,
  onViewArtifact,
  todoProgress,
}) => {
  const expanded = useSignal(isActive);

  // Sync expanded state: auto-expand when active, collapse when completed
  if (isActive && !expanded.value) {
    expanded.value = true;
  } else if (!isActive && stage.status === 'completed' && expanded.value) {
    expanded.value = false;
  }

  const toggleExpand = () => {
    expanded.value = !expanded.value;
  };

  const stageApprovals = approvals.filter((a) => a.status === 'pending');
  const stageArtifacts = artifacts.filter((a) => a.stage === stage.id);
  // "Approve & Continue" is enabled when non-rejected artifacts exist.
  const hasValidArtifacts = stageArtifacts.some((a) => a.status !== 'rejected');
  // Guard: prevent rapid clicks while an action is in progress
  const isActionInProgress = useSignal(false);
  const isAgentBusy = agentSt === 'working' || agentSt === 'waiting-approval';

  return (
    <div class={`stage-accordion stage-accordion--${stage.status}`}>
      {/* ─── Header (always visible) ─────────────────────────────── */}
      <div
        class="stage-accordion-header"
        role="button"
        tabIndex={0}
        aria-expanded={expanded.value}
        onClick={toggleExpand}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpand();
          }
        }}
      >
        <Icon
          name={STATUS_ICON[stage.status]}
          size={16}
          spin={stage.status === 'active'}
          class={STATUS_CLASS[stage.status]}
        />
        <span class="stage-accordion-title">{stage.name}</span>

        {/* Compact meta for collapsed state */}
        {stage.status === 'completed' && stage.completedAt && (
          <span class="stage-accordion-meta">
            {stageArtifacts.length > 0 &&
              `${stageArtifacts.length} artifact${stageArtifacts.length > 1 ? 's' : ''}`}
          </span>
        )}
        {stage.status === 'skipped' && <span class="stage-accordion-meta">Skipped</span>}

        <Icon
          name={expanded.value ? 'chevron-down' : 'chevron-right'}
          size={14}
          class="stage-accordion-chevron"
        />
      </div>

      {/* ─── Body (expanded) ─────────────────────────────────────── */}
      {expanded.value && (
        <div class="stage-accordion-body">
          {/* Agent Status Banner */}
          {isActive && agentSt && agentSt !== 'idle' && (
            <AgentStatusBanner status={agentSt} message={agentMessage} />
          )}

          {/* Todo Task Checklist (Build stage only) */}
          {todoProgress && todoProgress.total > 0 && <TodoChecklist progress={todoProgress} />}

          {/* Documents — clickable artifact cards (primary content) */}
          {stageArtifacts.length > 0 && (
            <div class="stage-documents">
              {stageArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  class="stage-document-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewArtifact?.(artifact.id)}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onViewArtifact?.(artifact.id);
                    }
                  }}
                >
                  <Icon
                    name="file-text"
                    size={16}
                    class={
                      artifact.status === 'approved'
                        ? 'task-card-icon--completed'
                        : 'task-card-icon--active'
                    }
                  />
                  <div class="stage-document-info">
                    <span class="stage-document-title">{artifact.title}</span>
                    <span class="stage-document-action">Click to review →</span>
                  </div>
                  <span
                    class={`badge badge-sm ${
                      artifact.status === 'approved'
                        ? 'badge-success'
                        : artifact.status === 'rejected'
                          ? 'badge-error'
                          : artifact.status === 'pending-review'
                            ? 'badge-warning'
                            : ''
                    }`}
                  >
                    {artifact.status === 'pending-review' ? 'needs review' : artifact.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* What's needed — simple checklist */}
          {isActive && completion && (
            <CompletionChecklist
              completion={completion}
              action={action}
              artifacts={stageArtifacts}
              approvals={approvals}
            />
          )}

          {/* Inline approval buttons — only show after artifacts exist to review */}
          {stageApprovals.length > 0 && stageArtifacts.length > 0 && (
            <div class="stage-approval-actions">
              {stageApprovals.map((a) => (
                <div key={a.id} class="stage-approval-row">
                  <span class="stage-approval-label">
                    <Icon name="shield" size={12} /> Approve to continue
                  </span>
                  <div class="stage-approval-buttons">
                    <button class="btn btn-success btn-sm" onClick={() => onApprove?.(a.id)}>
                      <Icon name="pass" size={12} /> Approve
                    </button>
                    <button class="btn btn-secondary btn-sm" onClick={() => onReject?.(a.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          {isActive && (
            <div class="stage-actions-bar">
              {onSendToAgent && !isAgentBusy && stageArtifacts.length === 0 && (
                <button
                  class="btn btn-primary btn-sm"
                  disabled={isActionInProgress.value}
                  onClick={() => {
                    if (isActionInProgress.value) return;
                    isActionInProgress.value = true;
                    onSendToAgent();
                    // Reset after a short delay to prevent double-clicks
                    setTimeout(() => {
                      isActionInProgress.value = false;
                    }, 2000);
                  }}
                >
                  <Icon name="sparkle" size={12} /> Send to Agent
                </button>
              )}
              {onSendToAgent && !isAgentBusy && stageArtifacts.length > 0 && (
                <button
                  class="btn btn-secondary btn-sm"
                  disabled={isActionInProgress.value}
                  onClick={() => {
                    if (isActionInProgress.value) return;
                    isActionInProgress.value = true;
                    onSendToAgent();
                    setTimeout(() => {
                      isActionInProgress.value = false;
                    }, 2000);
                  }}
                >
                  <Icon name="refresh" size={12} /> Regenerate
                </button>
              )}
              {onCompleteStage && (
                <button
                  class={`btn btn-sm ${hasValidArtifacts ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    if (isActionInProgress.value || isAgentBusy) return;
                    isActionInProgress.value = true;
                    onCompleteStage();
                    setTimeout(() => {
                      isActionInProgress.value = false;
                    }, 2000);
                  }}
                  disabled={
                    isActionInProgress.value ||
                    isAgentBusy ||
                    (!hasValidArtifacts && completion?.status !== 'completed')
                  }
                  title={
                    isAgentBusy
                      ? 'Wait for the agent to finish'
                      : hasValidArtifacts
                        ? 'Approve and move to next stage'
                        : 'Generate the document first'
                  }
                >
                  <Icon name="pass" size={12} /> Approve &amp; Continue
                </button>
              )}
              {onSkipStage && stage.skippable && (
                <button
                  class="btn btn-secondary btn-sm"
                  disabled={isActionInProgress.value || isAgentBusy}
                  onClick={onSkipStage}
                >
                  Skip
                </button>
              )}
            </div>
          )}

          {/* Description for non-active stages */}
          {!isActive && action && <div class="stage-description">{action.description}</div>}
        </div>
      )}
    </div>
  );
};

// ─── Todo Checklist (Build stage task tracking) ─────────────────────────────

/** Max visible tasks before collapsing. Shows current + 2 upcoming. */
const MAX_VISIBLE_PENDING = 3;

interface TodoChecklistProps {
  readonly progress: NonNullable<StageAccordionProps['todoProgress']>;
}

const TodoChecklist: FunctionalComponent<TodoChecklistProps> = ({ progress }) => {
  const showAll = useSignal(false);

  const doneTasks = progress.tasks.filter((t) => t.status === 'done');
  const pendingTasks = progress.tasks.filter((t) => t.status !== 'done');
  const shouldCollapse = progress.total > 8;
  const isExpanded = showAll.value || !shouldCollapse;

  // When collapsed: show completed summary + current + next 2
  const visiblePending = isExpanded ? pendingTasks : pendingTasks.slice(0, MAX_VISIBLE_PENDING);
  const hiddenPendingCount = pendingTasks.length - visiblePending.length;

  return (
    <div class="todo-checklist">
      <div class="todo-checklist-header">
        <span class="todo-checklist-label">
          Tasks: {progress.completed}/{progress.total}
        </span>
        <span class="todo-checklist-pct">{progress.percentage}%</span>
      </div>
      <div class="todo-checklist-bar">
        <div class="todo-checklist-bar-fill" style={{ width: `${progress.percentage}%` }} />
      </div>
      <div class="todo-checklist-tasks">
        {/* Completed tasks — collapsed summary or full list */}
        {doneTasks.length > 0 && !isExpanded && (
          <button
            class="todo-task todo-task--done-summary"
            onClick={() => {
              showAll.value = true;
            }}
          >
            <Icon name="pass-filled" size={12} class="task-card-icon--completed" />
            <span class="todo-task-title">
              {doneTasks.length} task{doneTasks.length !== 1 ? 's' : ''} completed
            </span>
            <Icon name="chevron-right" size={10} />
          </button>
        )}
        {isExpanded &&
          doneTasks.map((task) => (
            <div key={task.id} class="todo-task todo-task--done">
              <Icon name="pass-filled" size={12} class="task-card-icon--completed" />
              <span class="todo-task-title">
                {task.id}. {task.title}
              </span>
            </div>
          ))}

        {/* Pending/current tasks */}
        {visiblePending.map((task) => (
          <div
            key={task.id}
            class={`todo-task ${task.id === progress.currentTask ? 'todo-task--current' : ''}`}
          >
            <Icon
              name={task.id === progress.currentTask ? 'loading' : 'circle-outline'}
              size={12}
              spin={task.id === progress.currentTask}
              class="task-card-icon--pending"
            />
            <span class="todo-task-title">
              {task.id}. {task.title}
            </span>
          </div>
        ))}

        {/* Hidden count */}
        {hiddenPendingCount > 0 && (
          <button
            class="todo-task todo-task--more"
            onClick={() => {
              showAll.value = true;
            }}
          >
            <Icon name="chevron-right" size={10} style="transform: rotate(90deg)" />
            <span class="todo-task-title">{hiddenPendingCount} more remaining</span>
          </button>
        )}

        {/* Collapse button when expanded */}
        {shouldCollapse && isExpanded && (
          <button
            class="todo-task todo-task--more"
            onClick={() => {
              showAll.value = false;
            }}
          >
            <Icon name="chevron-right" size={10} style="transform: rotate(-90deg)" />
            <span class="todo-task-title">Show less</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Agent Status Banner ────────────────────────────────────────────────────

interface AgentStatusBannerProps {
  readonly status: AgentActivityStatus;
  readonly message?: string;
}

const AgentStatusBanner: FunctionalComponent<AgentStatusBannerProps> = ({ status, message }) => {
  const icon: IconName = status === 'working' ? 'loading' : 'clock';
  const label = status === 'working' ? 'Agent is working…' : 'Waiting for approval';

  return (
    <div class={`agent-status-banner agent-status-banner--${status}`}>
      <Icon name={icon} size={14} spin={status === 'working'} />
      <div class="agent-status-banner-text">
        <span class="agent-status-banner-label">{label}</span>
        {message && <span class="agent-status-banner-message">{message}</span>}
      </div>
    </div>
  );
};

// ─── Completion Checklist ───────────────────────────────────────────────────

interface CompletionChecklistProps {
  readonly completion: StageExecutionResult;
  readonly action?: StageAction | null;
  readonly artifacts?: readonly Artifact[];
  readonly approvals?: readonly Approval[];
}

const CompletionChecklist: FunctionalComponent<CompletionChecklistProps> = ({
  completion,
  action,
  artifacts = [],
  approvals = [],
}) => {
  if (!action) return null;

  const items = buildCompletionItems(action, completion, artifacts, approvals);

  return (
    <div class="completion-checklist">
      <div class="stage-section-label">What's needed</div>
      {items.map((item) => (
        <div
          key={item.id}
          class={`completion-item ${item.met ? 'completion-item--met' : 'completion-item--unmet'}`}
        >
          <Icon
            name={item.met ? 'pass-filled' : 'circle-outline'}
            size={12}
            class={item.met ? 'task-card-icon--completed' : 'task-card-icon--pending'}
          />
          <div class="completion-item-text">
            <span>{item.label}</span>
            {item.hint && <span class="completion-item-hint">{item.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
