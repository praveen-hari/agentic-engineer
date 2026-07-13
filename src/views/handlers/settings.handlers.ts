/**
 * Settings handlers.
 *
 * Handles: requestSettings, updateSettings.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { WORKFLOW_DIR } from '../../constants';

export const settingsHandlers: HandlerRegistration = {
  requestSettings: handleRequestSettings,
  updateSettings: handleUpdateSettings,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Allowed config keys — prevents arbitrary key injection from the webview. */
const ALLOWED_SETTINGS_KEYS = new Set([
  'version',
  'processLevelDefault',
  'approvalMode',
  'autoApproveLowRisk',
  'reviewTimeoutMinutes',
  'autoRefreshContext',
]);

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestSettings(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({
      type: 'settingsLoaded',
      settings: {
        processLevelDefault: 'auto',
        autoApproveLowRisk: false,
        reviewTimeoutMinutes: 30,
      },
    });
    return;
  }

  const configPath = `${root}/${WORKFLOW_DIR}/config.json`;
  try {
    if (await deps.fileSystem.exists(configPath)) {
      const content = await deps.fileSystem.read(configPath);
      const config = JSON.parse(content) as Record<string, unknown>;
      reply({
        type: 'settingsLoaded',
        settings: {
          processLevelDefault: (config.processLevelDefault as string) ?? 'auto',
          autoApproveLowRisk: (config.autoApproveLowRisk as boolean) ?? false,
          reviewTimeoutMinutes: (config.reviewTimeoutMinutes as number) ?? 30,
        },
      });
      return;
    }
  } catch {
    // Corrupt config — return defaults
  }
  reply({
    type: 'settingsLoaded',
    settings: { processLevelDefault: 'auto', autoApproveLowRisk: false, reviewTimeoutMinutes: 30 },
  });
}

async function handleUpdateSettings(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { settings } = msg as Extract<MessageToHost, { type: 'updateSettings' }>;
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'error', message: 'No workspace open' });
    return;
  }

  const configPath = `${root}/${WORKFLOW_DIR}/config.json`;

  // Load existing config or start fresh
  let existing: Record<string, unknown> = {};
  try {
    if (await deps.fileSystem.exists(configPath)) {
      const content = await deps.fileSystem.read(configPath);
      existing = JSON.parse(content) as Record<string, unknown>;
    }
  } catch {
    // Corrupt config — start fresh
  }

  // Filter to only allowed keys — prevents arbitrary key injection
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (ALLOWED_SETTINGS_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }

  // Merge sanitized settings
  const updated = { ...existing, ...sanitized };
  await deps.fileSystem.write(configPath, JSON.stringify(updated, null, 2));

  reply({ type: 'settingsUpdated' });
}
