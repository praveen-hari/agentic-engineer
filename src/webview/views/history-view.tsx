import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import { historyStore } from '../store/workflow.store';
import { bridge } from '../bridge';

export const HistoryView: FunctionalComponent = () => {
  // Load history on mount
  useEffect(() => {
    bridge.send({ type: 'requestHistory' });
  }, []);

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
            <div key={entry.id} class="history-entry">
              <div class="history-entry-header">
                <strong>{entry.objective}</strong>
                <span
                  class={`badge risk-badge--${entry.processLevel === 'light' ? 'low' : entry.processLevel === 'guarded' ? 'high' : 'medium'}`}
                >
                  {entry.processLevel}
                </span>
              </div>
              <div class="history-entry-dates">
                {new Date(entry.startedAt).toLocaleDateString()} →{' '}
                {new Date(entry.completedAt).toLocaleDateString()}
              </div>
              {entry.summary && <p class="history-entry-summary">{entry.summary}</p>}
              {entry.stats && (
                <div class="history-entry-stats">
                  {entry.stats.stagesCompleted} stages completed · {entry.stats.approvalsGranted}{' '}
                  approvals · {entry.stats.events} events
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
