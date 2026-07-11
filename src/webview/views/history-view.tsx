import { type FunctionalComponent } from 'preact';
import { historyStore, historyHasMore } from '../store/workflow.store';
import { bridge } from '../bridge';

export const HistoryView: FunctionalComponent = () => {
  const entries = historyStore.value;

  if (entries.length === 0) {
    return (
      <div class="empty-state">
        <div class="empty-state-icon">🕐</div>
        <div class="empty-state-title">No History Yet</div>
        <div class="empty-state-description">
          Completed workflows will appear here. You'll be able to review what was done, what
          decisions were made, and what was approved.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Workflow History</span>
        </div>
        <div class="card-body">
          {entries.map((entry) => (
            <div
              key={entry.id}
              style="margin-bottom: var(--space-md); padding-bottom: var(--space-md); border-bottom: 1px solid var(--color-border);"
            >
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-xs);">
                <strong>{entry.objective}</strong>
                <span
                  class={`badge risk-badge--${entry.processLevel === 'light' ? 'low' : entry.processLevel === 'guarded' ? 'high' : 'medium'}`}
                >
                  {entry.processLevel}
                </span>
              </div>
              <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
                {new Date(entry.startedAt).toLocaleDateString()} →{' '}
                {new Date(entry.completedAt).toLocaleDateString()}
              </div>
              {entry.summary && (
                <p style="font-size: var(--font-size-sm); margin-top: var(--space-xs);">
                  {entry.summary}
                </p>
              )}
              {entry.stats && (
                <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-xs);">
                  {entry.stats.stagesCompleted} stages completed · {entry.stats.approvalsGranted}{' '}
                  approvals · {entry.stats.events} events
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {historyHasMore.value && (
        <button class="btn-secondary btn" onClick={() => bridge.send({ type: 'requestHistory' })}>
          Load More
        </button>
      )}
    </div>
  );
};
