/**
 * History and archive handlers.
 *
 * Handles: requestHistory, requestHistoryDetail.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';

export const historyHandlers: HandlerRegistration = {
  requestHistory: handleRequestHistory,
  requestHistoryDetail: handleRequestHistoryDetail,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestHistory(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const entries = await deps.historyManager.loadHistory();
  reply({ type: 'history', entries });
}

async function handleRequestHistoryDetail(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { archivePath } = msg as Extract<MessageToHost, { type: 'requestHistoryDetail' }>;
  const archive = await deps.historyManager.loadArchivedWorkflow(archivePath);
  if (!archive) {
    reply({ type: 'error', message: 'Archived workflow not found' });
    return;
  }

  const entries = await deps.historyManager.loadHistory();
  const entry = entries.find((e) => e.archivePath === archivePath);
  if (!entry) {
    reply({ type: 'error', message: 'History entry not found' });
    return;
  }

  reply({
    type: 'historyDetail',
    entry,
    workflow: archive.workflow,
    artifacts: archive.artifacts,
  });
}
