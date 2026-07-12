import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { useEffect, useCallback } from 'preact/hooks';
import { historyStore } from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import type { ProcessLevel } from '../../core/types';

export const SettingsView: FunctionalComponent = () => {
  const processLevel = useSignal<ProcessLevel | 'auto'>('auto');
  const autoApprove = useSignal(false);
  const reviewTimeout = useSignal(30);
  const saveStatus = useSignal<'idle' | 'saving' | 'saved'>('idle');
  const loaded = useSignal(false);

  // Load current settings from host on mount
  useEffect(() => {
    const unsub = bridge.onMessage((msg) => {
      if (msg.type === 'settingsUpdated') {
        saveStatus.value = 'saved';
        setTimeout(() => {
          saveStatus.value = 'idle';
        }, 2000);
      }
      if (msg.type === 'settingsLoaded') {
        processLevel.value = msg.settings.processLevelDefault as ProcessLevel | 'auto';
        autoApprove.value = msg.settings.autoApproveLowRisk;
        reviewTimeout.value = msg.settings.reviewTimeoutMinutes;
        loaded.value = true;
      }
    });

    // Request saved settings and history
    bridge.send({ type: 'requestSettings' });
    bridge.send({ type: 'requestHistory' });

    return unsub;
  }, []);

  // Persist settings to host when any value changes (debounced)
  const saveSettings = useCallback(() => {
    if (!loaded.value) return;
    saveStatus.value = 'saving';
    bridge.send({
      type: 'updateSettings',
      settings: {
        processLevelDefault: processLevel.value,
        autoApproveLowRisk: autoApprove.value,
        reviewTimeoutMinutes: reviewTimeout.value,
      },
    });
  }, []);

  const historyCount = historyStore.value.length;

  return (
    <div>
      {/* Section 1: Process Defaults */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">Process Defaults</span>
          {saveStatus.value === 'saving' && (
            <span class="settings-save-status">
              <Icon name="loading" size={12} spin /> Saving…
            </span>
          )}
          {saveStatus.value === 'saved' && (
            <span class="settings-save-status settings-save-status--saved">
              <Icon name="pass" size={12} /> Saved
            </span>
          )}
        </div>
        <div class="card-body">
          <div class="settings-field">
            <label class="settings-label">Default Process Level</label>
            <select
              class="input"
              value={processLevel.value}
              onChange={(e: Event) => {
                processLevel.value = (e.target as HTMLSelectElement).value as ProcessLevel | 'auto';
                saveSettings();
              }}
            >
              <option value="auto">Auto — agent decides based on each task (recommended)</option>
              <option value="light">Light — typo fixes, docs, config changes (3 stages)</option>
              <option value="standard">Standard — features, bugfixes, refactors (4 stages)</option>
              <option value="thorough">
                Thorough — architecture, API design, major features (6 stages)
              </option>
              <option value="guarded">
                Guarded — DB migrations, auth changes, deployments (6 stages + gates)
              </option>
            </select>
          </div>

          <div class="settings-field">
            <label class="settings-checkbox-label">
              <input
                type="checkbox"
                checked={autoApprove.value}
                onChange={(e: Event) => {
                  autoApprove.value = (e.target as HTMLInputElement).checked;
                  saveSettings();
                }}
              />
              Auto-approve informational approvals
            </label>
          </div>

          <div class="settings-field">
            <label class="settings-label">Review Timeout (minutes)</label>
            <input
              class="input settings-number-input"
              type="number"
              min={5}
              max={120}
              value={reviewTimeout.value}
              onInput={(e: Event) => {
                reviewTimeout.value = Number((e.target as HTMLInputElement).value);
                saveSettings();
              }}
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
              <div class="stat-value">{historyCount}</div>
              <div class="stat-label">Total Workflows</div>
            </div>
          </div>

          <div class="settings-history-tiers">
            <strong>History Tiers:</strong>
            <ul class="settings-tier-list">
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

          <details class="settings-recovery-details">
            <summary class="settings-recovery-summary">Git Recovery</summary>
            <p class="settings-recovery-text">
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
