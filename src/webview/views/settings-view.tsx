import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';

export const SettingsView: FunctionalComponent = () => {
  const processLevel = useSignal('standard');
  const autoApprove = useSignal(false);
  const reviewTimeout = useSignal(30);

  return (
    <div>
      {/* Section 1: Process Defaults */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">Process Defaults</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom: var(--space-md);">
            <label style="display: block; margin-bottom: var(--space-xs); font-size: var(--font-size-sm);">
              Default Process Level
            </label>
            <select
              class="input"
              value={processLevel.value}
              onChange={(e: Event) => {
                processLevel.value = (e.target as HTMLSelectElement).value;
              }}
            >
              <option value="light">Light — typo fixes, docs, config changes</option>
              <option value="standard">Standard — features, bugfixes, refactors</option>
              <option value="thorough">Thorough — architecture, API design, major features</option>
              <option value="guarded">Guarded — DB migrations, auth changes, deployments</option>
            </select>
          </div>

          <div style="margin-bottom: var(--space-md);">
            <label style="display: flex; align-items: center; gap: var(--space-sm); font-size: var(--font-size-sm);">
              <input
                type="checkbox"
                checked={autoApprove.value}
                onChange={(e: Event) => {
                  autoApprove.value = (e.target as HTMLInputElement).checked;
                }}
              />
              Auto-approve informational approvals
            </label>
          </div>

          <div>
            <label style="display: block; margin-bottom: var(--space-xs); font-size: var(--font-size-sm);">
              Review Timeout (minutes)
            </label>
            <input
              class="input"
              type="number"
              min={5}
              max={120}
              value={reviewTimeout.value}
              onInput={(e: Event) => {
                reviewTimeout.value = Number((e.target as HTMLInputElement).value);
              }}
              style="max-width: 100px;"
            />
          </div>
        </div>
      </div>

      {/* Section 2: History Management */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">History Management</span>
        </div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">7</div>
              <div class="stat-label">Total Workflows</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">~45 KB</div>
              <div class="stat-label">Storage Used</div>
            </div>
          </div>

          <div style="margin-bottom: var(--space-md);">
            <strong>History Tiers:</strong>
            <ul style="margin-left: var(--space-lg); margin-top: var(--space-xs); font-size: var(--font-size-sm);">
              <li>
                <strong>Hot</strong> — last 5 entries (full detail)
              </li>
              <li>
                <strong>Warm</strong> — entries 6-20 (summary only)
              </li>
              <li>
                <strong>Cold</strong> — older entries (archived)
              </li>
            </ul>
          </div>

          <details style="font-size: var(--font-size-sm); color: var(--color-text-muted);">
            <summary style="cursor: pointer; margin-bottom: var(--space-xs);">Git Recovery</summary>
            <p style="margin-top: var(--space-xs); padding-left: var(--space-md);">
              All workflow state is stored in <code>.codestudio/</code> and tracked by git. If state
              is lost, you can recover from any commit:
              <br />
              <code>git checkout HEAD -- .codestudio/</code>
            </p>
          </details>
        </div>
      </div>
    </div>
  );
};
