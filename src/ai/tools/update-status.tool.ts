import type * as vscode from 'vscode';

/**
 * Input for the engineering_update_status tool.
 */
export interface UpdateStatusInput {
  readonly message: string;
  readonly phase?: string;
}

/**
 * Language Model Tool: engineering_update_status
 *
 * Lightweight tool the agent calls to report progress to the UI.
 * Updates the webview's status banner with the agent's current activity.
 *
 * The agent should call this periodically during long-running operations
 * (setup, build, verify, etc.) to keep the user informed.
 *
 * Example calls:
 *   engineering_update_status({ message: "Reading package.json..." })
 *   engineering_update_status({ message: "Task 2/5: Writing tests..." })
 *   engineering_update_status({ message: "Running npm test..." })
 */
export class UpdateStatusTool implements vscode.LanguageModelTool<UpdateStatusInput> {
  constructor(
    private readonly onStatusUpdate: (message: string, phase?: string) => void,
  ) {}

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<UpdateStatusInput>,
    _token: vscode.CancellationToken,
  ) {
    // No confirmation needed — this is a passive status update
    return {
      invocationMessage: 'Updating status...',
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<UpdateStatusInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');
    const { message, phase } = options.input;

    // Notify the extension → webview
    this.onStatusUpdate(message, phase);

    return new vscodeModule.LanguageModelToolResult([
      new vscodeModule.LanguageModelTextPart('Status updated. Continue with your work.'),
    ]);
  }
}
