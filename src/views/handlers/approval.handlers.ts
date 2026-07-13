/**
 * Approval and gate handlers.
 *
 * Handles: approve, reject, skipStage, requestGateStatus.
 *
 * Also exports `isApprovalForCurrentStage` for use by stage.handlers
 * (executeStage needs scoped approval logic).
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { LifecycleStage, MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { DEFAULT_PIPELINE, isApprovalForStage } from '../../core/pipeline-config';

export const approvalHandlers: HandlerRegistration = {
  approve: handleApprove,
  reject: handleReject,
  skipStage: handleSkipStage,
  requestGateStatus: handleRequestGateStatus,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleApprove(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { approvalId, comment } = msg as Extract<MessageToHost, { type: 'approve' }>;
  try {
    const updated = await deps.stateManager.update((wf) => ({
      ...wf,
      approvals: wf.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, status: 'approved' as const, approvedAt: new Date().toISOString(), comment }
          : a,
      ),
    }));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleReject(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { approvalId, comment } = msg as Extract<MessageToHost, { type: 'reject' }>;
  try {
    const updated = await deps.stateManager.update((wf) => ({
      ...wf,
      approvals: wf.approvals.map((a) =>
        a.id === approvalId ? { ...a, status: 'rejected' as const, comment } : a,
      ),
    }));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleSkipStage(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { stageId } = msg as Extract<MessageToHost, { type: 'skipStage' }>;
  try {
    const updated = await deps.stateManager.update((wf) =>
      deps.workflowEngine.skipStage(wf, stageId),
    );
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleRequestGateStatus(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'gateStatus', gates: [] });
    return;
  }
  reply({ type: 'gateStatus', gates: wf.qualityGates });
}

// ─── Shared Utilities ───────────────────────────────────────────────────────

/**
 * Check if an approval artifact belongs to the current stage.
 * Delegates to the pipeline config's approvalStageMap — single source of truth.
 */
export function isApprovalForCurrentStage(
  artifactName: string,
  stage: LifecycleStage | null,
): boolean {
  return isApprovalForStage(DEFAULT_PIPELINE, artifactName, stage);
}
