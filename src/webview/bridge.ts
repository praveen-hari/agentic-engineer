/**
 * Type-safe postMessage bridge between webview and extension host.
 *
 * Sends {@link MessageToHost} to the extension host and receives
 * {@link MessageToWebview} from it. Uses the VS Code webview postMessage API.
 */

import type { MessageToHost, MessageToWebview } from '../core/types';

type MessageHandler = (message: MessageToWebview) => void;

/**
 * Bridge for sending messages to the extension host and receiving
 * messages from it.
 */
export class Bridge {
  private handlers: Set<MessageHandler> = new Set();
  private readonly listener: (event: MessageEvent) => void;

  constructor() {
    // Listen for messages from the extension host.
    // Stored as a named reference so it can be removed via destroy().
    this.listener = (event: MessageEvent) => {
      const message = event.data as MessageToWebview;
      if (message && typeof message === 'object' && 'type' in message) {
        this.handlers.forEach((handler) => handler(message));
      }
    };
    window.addEventListener('message', this.listener);
  }

  /**
   * Send a message to the extension host.
   */
  send(message: MessageToHost): void {
    const vscode = (window as unknown as { vscode?: { postMessage: (msg: unknown) => void } })
      .vscode;
    if (vscode) {
      vscode.postMessage(message);
    }
  }

  /**
   * Register a handler for messages from the extension host.
   * Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Remove the global event listener and clear all handlers.
   * Safe to call multiple times. In a webview context the panel
   * destruction handles cleanup, but this is useful for tests.
   */
  destroy(): void {
    window.removeEventListener('message', this.listener);
    this.handlers.clear();
  }
}

/** Singleton bridge instance. */
export const bridge = new Bridge();
