/**
 * Webview message router — dispatches messages to domain-specific handlers.
 *
 * This file is the thin entry point that replaces the old monolithic
 * switch statement. All handler logic lives in `./handlers/` domain files.
 *
 * Backward-compatible: re-exports `ReplyFn`, `MessageHandlerDeps`, and
 * `handleWebviewMessage` so existing imports continue to work.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md
 * @see ./handlers/ (domain handler files)
 * @see ./message-handler-types.ts (shared types)
 */

import type { MessageToHost } from '../core/types';
import { HANDLER_REGISTRY } from './handlers';

// ─── Re-exports for backward compatibility ──────────────────────────────────
// All existing test files and extension.ts import from this file.
// These re-exports ensure zero import-path changes are needed.

export type { ReplyFn, MessageHandlerDeps } from './message-handler-types';
import type { MessageHandlerDeps, ReplyFn } from './message-handler-types';

// ─── Message Validation ─────────────────────────────────────────────────────

/** All known message types — derived from the handler registry. */
const VALID_MESSAGE_TYPES = new Set(Object.keys(HANDLER_REGISTRY));

/**
 * Runtime validation for incoming messages.
 * Checks structure and that the type is a known message type.
 */
function isValidMessage(message: unknown): message is MessageToHost {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const msg = message as { type: unknown };
  return typeof msg.type === 'string' && VALID_MESSAGE_TYPES.has(msg.type);
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * Handle messages from the webview and route them to the appropriate
 * domain handler. Sends responses back via the `reply` callback.
 *
 * Drop-in replacement for the old monolithic switch statement.
 * Same signature, same behavior, same error handling.
 *
 * @param deps  — core engines and services
 * @param reply — callback to send a {@link MessageToWebview} back to the webview
 */
export function handleWebviewMessage(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): (message: unknown) => Promise<void> {
  return async (message: unknown) => {
    if (!isValidMessage(message)) return;
    const msg = message as MessageToHost;

    try {
      const handler = HANDLER_REGISTRY[msg.type];
      if (handler) {
        await handler(msg, deps, reply);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      reply({ type: 'error', message: errorMessage });
    }
  };
}
