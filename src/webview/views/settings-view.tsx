import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { useEffect, useCallback } from 'preact/hooks';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import type { ProcessLevel } from '../../core/types';

export const SettingsView: FunctionalComponent = () => {
  const processLevel = useSignal<ProcessLevel | 'auto'>('auto');
  const approvalMode = useSignal<'user' | 'agent'>('user');
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
        approvalMode.value =
          (msg.settings as Record<string, unknown>).approvalMode === 'agent' ? 'agent' : 'user';
        loaded.value = true;
      }
    });

    // Request saved settings
    bridge.send({ type: 'requestSettings' });

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
        approvalMode: approvalMode.value,
      },
    });
  }, []);

  return (
    <div class="settings-view">
      <h3>Settings</h3>

      {/* Save indicator */}
      {saveStatus.value !== 'idle' && (
        <div class={`settings-save-banner${saveStatus.value === 'saved' ? ' settings-save-banner--saved' : ''}`}>
          {saveStatus.value === 'saving'
            ? <><Icon name="loading" size={12} spin /> Saving…</>
            : <><Icon name="pass" size={12} /> Saved</>
          }
        </div>
      )}

      {/* Setting 1: How thorough? */}
      <div class="settings-section">
        <div class="settings-section-header">
          <Icon name="list-tree" size={14} />
          <span>How thorough should each task be?</span>
        </div>
        <p class="settings-section-desc">
          More steps means more review and documentation. Fewer steps means faster delivery.
        </p>
        <select
          class="input"
          value={processLevel.value}
          onChange={(e: Event) => {
            processLevel.value = (e.target as HTMLSelectElement).value as ProcessLevel | 'auto';
            saveSettings();
          }}
        >
          <option value="auto">Automatic — agent picks the right level per task (recommended)</option>
          <option value="light">Quick — plan, build, verify (3 steps)</option>
          <option value="standard">Standard — define, plan, build, verify, review (5 steps)</option>
          <option value="thorough">Thorough — all steps including ship checklist (6 steps)</option>
          <option value="guarded">Maximum — all steps with extra safety gates</option>
        </select>
      </div>

      {/* Setting 2: Who's in control? */}
      <div class="settings-section">
        <div class="settings-section-header">
          <Icon name="shield" size={14} />
          <span>Who moves the task to the next step?</span>
        </div>
        <p class="settings-section-desc">
          You can review and approve each step yourself, or let the agent run on its own.
        </p>
        <select
          class="input"
          value={approvalMode.value}
          onChange={(e: Event) => {
            approvalMode.value = (e.target as HTMLSelectElement).value as 'user' | 'agent';
            saveSettings();
          }}
        >
          <option value="user">I review each step before moving on</option>
          <option value="agent">Agent runs automatically — I'll review at the end</option>
        </select>
      </div>
    </div>
  );
};
