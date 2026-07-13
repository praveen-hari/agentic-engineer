/**
 * Agent control handlers.
 *
 * Handles: cancelAgent.
 *
 * Also exports the `cancelAgent` utility function used by other
 * domains (workflow pause, delete) to stop the running agent.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';

export const agentHandlers: HandlerRegistration = {
  cancelAgent: handleCancelAgent,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleCancelAgent(
  _msg: MessageToHost,
  _deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  await cancelAgent();
}

// ─── Shared Utility ─────────────────────────────────────────────────────────

/**
 * Cancel the running agent. Exported so other domains (workflow pause,
 * workflow delete) can stop the agent without going through the router.
 */
export async function cancelAgent(): Promise<void> {
  try {
    const vscodeModule = await import('vscode');
    try {
      await vscodeModule.commands.executeCommand('workbench.action.chat.cancel');
    } catch {
      try {
        await vscodeModule.commands.executeCommand('workbench.action.chat.stop');
      } catch {
        // No cancel API available — agent will continue in background
      }
    }
  } catch {
    // vscode import failed — running in test environment
  }
}
