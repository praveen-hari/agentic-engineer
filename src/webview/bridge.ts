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

  constructor() {
    // Listen for messages from the extension host
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as MessageToWebview;
      if (message && typeof message === 'object' && 'type' in message) {
        this.handlers.forEach((handler) => handler(message));
      }
    });
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
}

/** Singleton bridge instance. */
export const bridge = new Bridge();
