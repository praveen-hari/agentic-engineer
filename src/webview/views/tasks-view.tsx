import { type FunctionalComponent } from 'preact';
import { useSignal, useComputed } from '@preact/signals';
import { workflowStore, isWorkflowComplete, progress, currentStage } from '../store/workflow.store';
import { bridge } from '../bridge';

export const TasksView: FunctionalComponent = () => {
  const objective = useSignal('');
  const activeTab = useSignal<'stages' | 'artifacts' | 'approvals'>('stages');

  const showAnalyze = useComputed(() => objective.value.trim().length >= 10);

  // ─── Empty State ───────────────────────────────────────────────
  if (!workflowStore.value) {
    return (
      <div class="empty-state">
        <div class="empty-state-icon">🏗️</div>
        <div class="empty-state-title">Start a New Work Request</div>
        <div class="empty-state-description">
          Describe what you want to build. The engineering workspace will analyze the risk, generate
          a workflow, and guide you through the right process.
        </div>
        <textarea
          class="textarea"
          placeholder="e.g., Add user authentication with OAuth and session management"
          value={objective.value}
          onInput={(e: Event) => {
            objective.value = (e.target as HTMLTextAreaElement).value;
          }}
          rows={3}
          style="max-width: 400px; margin-bottom: var(--space-md);"
        />
        <div>
          {showAnalyze.value && (
            <button
              class="btn"
              onClick={() => {
                bridge.send({ type: 'analyzeObjective', objective: objective.value.trim() });
              }}
            >
              Analyze Work Request
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Complete State ────────────────────────────────────────────
  if (isWorkflowComplete.value) {
    return (
      <div>
        <div class="card" style="border-color: var(--color-success);">
          <div class="card-header">
            <span class="card-title">✅ Workflow Complete</span>
          </div>
          <div class="card-body">
            <p style="margin-bottom: var(--space-sm);">
              <strong>Objective:</strong> {workflowStore.value.objective}
            </p>
            <p style="margin-bottom: var(--space-sm);">
              <strong>Process Level:</strong> {workflowStore.value.processLevel}
            </p>
            <p>
              <strong>Stages Completed:</strong>{' '}
              {workflowStore.value.stages.filter((s) => s.status === 'completed').length}/
              {workflowStore.value.stages.length}
            </p>
          </div>
        </div>
        <button
          class="btn-secondary btn"
          onClick={() => bridge.send({ type: 'navigate', view: 'history' })}
        >
          View in History
        </button>
      </div>
    );
  }

  // ─── Active State ──────────────────────────────────────────────
  const wf = workflowStore.value;
  const stage = currentStage.value;
  const completedCount = wf.stages.filter((s) => s.status === 'completed').length;
  const pendingApprovals = wf.approvals.filter((a) => a.status === 'pending');

  return (
    <div>
      {/* Objective + Progress */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">{wf.objective}</span>
          <span
            class={`badge risk-badge--${wf.processLevel === 'light' ? 'low' : wf.processLevel === 'guarded' ? 'high' : 'medium'}`}
          >
            {wf.processLevel}
          </span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style={`width: ${progress.value}%`} />
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{progress.value}%</div>
            <div class="stat-label">Progress</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {completedCount}/{wf.stages.length}
            </div>
            <div class="stat-label">Stages</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{pendingApprovals.length}</div>
            <div class="stat-label">Approvals</div>
          </div>
        </div>
      </div>

      {/* Current Stage */}
      {stage && (
        <div class="card" style="border-color: var(--color-accent);">
          <div class="card-header">
            <span class="card-title">Current: {stage.name}</span>
          </div>
          <div class="card-body">
            <button class="btn" onClick={() => bridge.send({ type: 'advanceStage' })}>
              Complete Stage
            </button>
            {stage.skippable && (
              <button
                class="btn-secondary btn"
                style="margin-left: var(--space-sm);"
                onClick={() => bridge.send({ type: 'skipStage', stageId: stage.id })}
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div class="tab-strip">
        <button
          class={`tab-strip-item ${activeTab.value === 'stages' ? 'is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'stages';
          }}
        >
          Stages
        </button>
        <button
          class={`tab-strip-item ${activeTab.value === 'artifacts' ? 'is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'artifacts';
          }}
        >
          Artifacts
        </button>
        <button
          class={`tab-strip-item ${activeTab.value === 'approvals' ? 'is-active' : ''}`}
          onClick={() => {
            activeTab.value = 'approvals';
          }}
        >
          Approvals {pendingApprovals.length > 0 && `(${pendingApprovals.length})`}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab.value === 'stages' && (
        <div class="stage-list">
          {wf.stages.map((s) => (
            <div key={s.id} class={`stage-item stage-item--${s.status}`}>
              <span class="stage-icon">
                {s.status === 'completed'
                  ? '✓'
                  : s.status === 'active'
                    ? '▶'
                    : s.status === 'skipped'
                      ? '⊘'
                      : '○'}
              </span>
              <span class="stage-label">{s.name}</span>
              <span class="stage-status">{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab.value === 'artifacts' && (
        <div class="empty-state">
          <div class="empty-state-icon">📄</div>
          <div class="empty-state-title">No Artifacts Yet</div>
          <div class="empty-state-description">Artifacts will appear as stages produce them.</div>
        </div>
      )}

      {activeTab.value === 'approvals' && (
        <div>
          {pendingApprovals.length === 0 ? (
            <div class="empty-state">
              <div class="empty-state-icon">✅</div>
              <div class="empty-state-title">No Pending Approvals</div>
            </div>
          ) : (
            pendingApprovals.map((a) => (
              <div key={a.id} class="card">
                <div class="card-header">
                  <span class="card-title">{a.artifact}</span>
                  <span
                    class={`badge ${a.level === 'restricted' ? 'badge-error' : 'badge-warning'}`}
                  >
                    {a.level}
                  </span>
                </div>
                {a.reason && <div class="card-body">{a.reason}</div>}
                <div style="margin-top: var(--space-sm);">
                  <button
                    class="btn"
                    onClick={() => bridge.send({ type: 'approve', approvalId: a.id })}
                  >
                    Approve
                  </button>
                  <button
                    class="btn-secondary btn"
                    style="margin-left: var(--space-sm);"
                    onClick={() => bridge.send({ type: 'reject', approvalId: a.id })}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
