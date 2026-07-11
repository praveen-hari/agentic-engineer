// VS Code API type — injected via constructor for testability

/**
 * Sends prompts to the agent via VS Code's chat API.
 *
 * The extension is an orchestrator — it tells the agent what to do
 * (via prompts) and watches for results (via ArtifactWatcher).
 * This service handles the "tell the agent" part.
 *
 * Two delivery methods:
 * 1. Open chat panel with pre-filled prompt
 * 2. Send via @engineering chat participant
 *
 * @see ARCHITECTURE.md (Agent-Delegated Architecture)
 */
export class AgentBridge {
  constructor(
    private readonly vscodeApi: typeof import('vscode'),
  ) {}

  /**
   * Send a prompt to the agent by opening the chat panel
   * with the prompt pre-filled. The agent processes it and
   * generates the requested artifact.
   */
  async sendToChat(prompt: string): Promise<void> {
    try {
      await this.vscodeApi.commands.executeCommand(
        'workbench.action.chat.open',
        { query: prompt },
      );
    } catch {
      // Chat panel may not be available — fall back to showing in editor
      await this.showPromptInEditor(prompt);
    }
  }

  /**
   * Send a prompt via the @engineering chat participant.
   * Prefixes the prompt with @engineering so our participant handles it.
   */
  async sendViaParticipant(prompt: string): Promise<void> {
    try {
      await this.vscodeApi.commands.executeCommand(
        'workbench.action.chat.open',
        { query: `@engineering ${prompt}` },
      );
    } catch {
      await this.showPromptInEditor(prompt);
    }
  }

  /**
   * Send a prompt to agent mode (agentic chat).
   * Uses the agent mode command if available.
   */
  async sendToAgentMode(prompt: string): Promise<void> {
    try {
      // Try agent mode first
      await this.vscodeApi.commands.executeCommand(
        'workbench.action.chat.openInSidebar',
        { query: prompt, isPartialQuery: false },
      );
    } catch {
      // Fall back to regular chat
      await this.sendToChat(prompt);
    }
  }

  /**
   * Fallback: show the prompt in a new untitled editor so the user
   * can copy it to their preferred chat interface.
   */
  private async showPromptInEditor(prompt: string): Promise<void> {
    const doc = await this.vscodeApi.workspace.openTextDocument({
      content: prompt,
      language: 'markdown',
    });
    await this.vscodeApi.window.showTextDocument(doc, { preview: true });
  }
}
