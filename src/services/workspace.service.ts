import * as vscode from 'vscode';

/**
 * Workspace service — provides workspace root and configuration (DD-002).
 *
 * Wraps VS Code's workspace API for testability.
 */
export class WorkspaceService {
  private readonly configSection = 'engineeringWorkspace';

  constructor(private readonly vscode: typeof import('vscode')) {}

  /**
   * Get the workspace root path, or null if no workspace is open.
   */
  getWorkspaceRoot(): string | null {
    const folders = this.vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return folders[0].uri.fsPath;
  }

  /**
   * Get a configuration value from the extension's settings section.
   */
  getConfiguration<T>(key: string, defaultValue?: T): T | undefined {
    const config = this.vscode.workspace.getConfiguration(this.configSection);
    return config.get<T>(key, defaultValue as T);
  }

  /**
   * Update a configuration value.
   */
  async setConfiguration(key: string, value: unknown): Promise<void> {
    const config = this.vscode.workspace.getConfiguration(this.configSection);
    await config.update(key, value, false);
  }

  /**
   * Register a callback for configuration changes.
   */
  onConfigChange(callback: () => void): vscode.Disposable {
    return this.vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.configSection)) {
        callback();
      }
    });
  }
}
