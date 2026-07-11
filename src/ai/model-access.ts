/**
 * Abstraction over VS Code's Language Model API for testability.
 *
 * In production, this is backed by `vscode.lm`. In tests, it's mocked.
 * This interface decouples the AI layer from VS Code so it can be
 * unit-tested without a running extension host.
 */

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly vendor?: string;
  readonly family?: string;
  readonly version?: string;
  readonly maxInputTokens?: number;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly text: string;
}

/**
 * Injectable model access interface (DD-014, SPEC §5).
 *
 * Selects the Copilot model, caches the selection, and sends chat
 * requests. Returns null when no LLM is available — the caller
 * falls back to the deterministic engine.
 */
export interface ModelAccess {
  /** Get the best available language model, or null if none available. */
  getModel(): Promise<ModelInfo | null>;

  /** Send a chat request to the model and return the text response. */
  sendRequest(
    model: ModelInfo,
    messages: readonly ChatMessage[],
    token?: unknown,
  ): Promise<string>;
}
