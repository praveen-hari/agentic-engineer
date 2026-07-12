import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import {
  historyStore,
  historySearch,
  filteredHistory,
  historyDetailEntry,
  historyDetailWorkflow,
  historyDetailArtifacts,
} from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import type { HistoryEntry, ArtifactManifestEntry, WorkflowDefinition } from '../../core/types';

// ─── Level badge class mapping ──────────────────────────────────────────────

const LEVEL_CLASS: Record<string, string> = {
  light: 'risk-badge--low',
  standard: 'risk-badge--medium',
  thorough: 'risk-badge--medium',
  guarded: 'risk-badge--high',
};

// ─── History View ───────────────────────────────────────────────────────────

export const HistoryView: FunctionalComponent = () => {
  useEffect(() => {
    bridge.send({ type: 'requestHistory' });
  }, []);

  const detail = historyDetailEntry.value;

  // ─── Detail View ───────────────────────────────────────────────
  if (detail) {
    return (
      <HistoryDetailView
        entry={detail}
        workflow={historyDetailWorkflow.value}
        artifacts={historyDetailArtifacts.value}
        onBack={() => {
          historyDetailEntry.value = null;
          historyDetailWorkflow.value = null;
          historyDetailArtifacts.value = [];
        }}
      />
    );
  }

  // ─── Grid View ─────────────────────────────────────────────────
  const entries = filteredHistory.value;
  const totalCount = historyStore.value.length;

  if (totalCount === 0) {
    return (
      <div class="history-empty">
        <div class="empty-state">
          <div class="empty-state-icon">
            <Icon name="history" size={32} />
          </div>
          <div class="empty-state-title">No History Yet</div>
          <div class="empty-state-description">
            Completed workflows will appear here with their artifacts and decisions.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="history-view">
      <div class="history-header">
        <h3>Workflow History</h3>
        <span class="history-count">{totalCount} workflow{totalCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Search */}
      <div class="history-search">
        <Icon name="sparkle" size={14} class="history-search-icon" />
        <input
          class="input history-search-input"
          type="text"
          placeholder="Search workflows..."
          value={historySearch.value}
          onInput={(e: Event) => {
            historySearch.value = (e.target as HTMLInputElement).value;
          }}
        />
        {historySearch.value && (
          <button
            class="history-search-clear"
            onClick={() => { historySearch.value = ''; }}
            aria-label="Clear search"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      {/* Table */}
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th class="history-th history-th--objective">Objective</th>
              <th class="history-th history-th--level">Level</th>
              <th class="history-th history-th--stages">Stages</th>
              <th class="history-th history-th--date">Completed</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                class="history-row"
                onClick={() => {
                  bridge.send({ type: 'requestHistoryDetail', archivePath: entry.archivePath });
                }}
              >
                <td class="history-td history-td--objective">
                  <Icon name="pass-filled" size={14} class="task-card-icon--completed" />
                  <span class="history-objective-text">{entry.objective}</span>
                </td>
                <td class="history-td">
                  <span class={`badge badge-sm ${LEVEL_CLASS[entry.processLevel] ?? ''}`}>
                    {entry.processLevel}
                  </span>
                </td>
                <td class="history-td">
                  {entry.stats
                    ? `${entry.stats.stagesCompleted}/${entry.stats.stagesCompleted + entry.stats.stagesSkipped}`
                    : '—'}
                </td>
                <td class="history-td history-td--date">
                  {formatDate(entry.completedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historySearch.value && entries.length === 0 && (
        <div class="history-no-results">
          <Icon name="info" size={14} />
          <span>No workflows match "{historySearch.value}"</span>
        </div>
      )}
    </div>
  );
};

// ─── Detail View ────────────────────────────────────────────────────────────

interface HistoryDetailProps {
  readonly entry: HistoryEntry;
  readonly workflow: WorkflowDefinition | null;
  readonly artifacts: readonly ArtifactManifestEntry[];
  readonly onBack: () => void;
}

const HistoryDetailView: FunctionalComponent<HistoryDetailProps> = ({
  entry,
  workflow,
  artifacts,
  onBack,
}) => (
  <div class="history-detail">
    {/* Back button */}
    <button class="btn btn-secondary btn-sm history-back-btn" onClick={onBack}>
      <Icon name="chevron-right" size={12} style="transform: rotate(180deg)" /> Back to History
    </button>

    {/* Header */}
    <div class="history-detail-header">
      <h3>{entry.objective}</h3>
      <div class="history-detail-meta">
        <span class={`badge ${LEVEL_CLASS[entry.processLevel] ?? ''}`}>{entry.processLevel}</span>
        <span>{formatDate(entry.startedAt)} → {formatDate(entry.completedAt)}</span>
      </div>
    </div>

    {/* Stages */}
    {workflow && (
      <div class="history-detail-section">
        <div class="history-section-label">Stages</div>
        <div class="history-stages-row">
          {workflow.stages.map((s) => (
            <div key={s.id} class="history-stage-chip">
              <Icon
                name={s.status === 'completed' ? 'pass-filled' : s.status === 'skipped' ? 'close' : 'circle-outline'}
                size={12}
                class={s.status === 'completed' ? 'task-card-icon--completed' : 'task-card-icon--pending'}
              />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Stats */}
    {entry.stats && (
      <div class="history-detail-section">
        <div class="history-section-label">Stats</div>
        <div class="history-stats-grid">
          <div class="history-stat">
            <div class="history-stat-value">{entry.stats.stagesCompleted}</div>
            <div class="history-stat-label">Completed</div>
          </div>
          <div class="history-stat">
            <div class="history-stat-value">{entry.stats.stagesSkipped}</div>
            <div class="history-stat-label">Skipped</div>
          </div>
          <div class="history-stat">
            <div class="history-stat-value">{entry.stats.approvalsGranted}</div>
            <div class="history-stat-label">Approvals</div>
          </div>
        </div>
      </div>
    )}

    {/* Artifacts */}
    <div class="history-detail-section">
      <div class="history-section-label">Artifacts</div>
      {artifacts.length === 0 ? (
        <div class="history-no-artifacts">No artifacts archived for this workflow.</div>
      ) : (
        <div class="history-artifacts-list">
          {artifacts.map((a) => (
            <div
              key={a.id}
              class="history-artifact-row history-artifact-row--clickable"
              role="button"
              tabIndex={0}
              onClick={() => bridge.send({ type: 'openKnowledgeFile', fileName: `${entry.archivePath}/${a.filename}` })}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  bridge.send({ type: 'openKnowledgeFile', fileName: `${entry.archivePath}/${a.filename}` });
                }
              }}
            >
              <Icon name="file-text" size={14} />
              <div class="history-artifact-info">
                <span class="history-artifact-title">{a.title}</span>
                <span class="history-artifact-meta">
                  {a.type} · {a.stage} stage · {a.status}
                </span>
              </div>
              <span class="history-artifact-open">
                <Icon name="chevron-right" size={12} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
