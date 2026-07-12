import * as vscode from 'vscode';

/**
 * Notification service — manages status bar and user messages.
 *
 * Wraps VS Code's window API for testability.
 */
export class NotificationService {
  private statusBarItem: vscode.StatusBarItem | null = null;

  constructor(private readonly vscode: typeof import('vscode')) {}

  /**
   * Show an information message to the user.
   */
  showInfo(message: string): void {
    void this.vscode.window.showInformationMessage(message);
  }

  /**
   * Show an error message to the user.
   */
  showError(message: string): void {
    void this.vscode.window.showErrorMessage(message);
  }

  /**
   * Update the status bar with workflow state.
   * Creates the status bar item on first call, reuses it after.
   */
  updateStatusBar(text: string, tooltip?: string): void {
    if (!this.statusBarItem) {
      this.statusBarItem = this.vscode.window.createStatusBarItem(
        this.vscode.StatusBarAlignment.Left,
        50,
      );
    }
    this.statusBarItem.text = text;
    this.statusBarItem.command = 'engineeringWorkspace.openView';
    if (tooltip) {
      this.statusBarItem.tooltip = tooltip;
    }
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item.
   */
  hideStatusBar(): void {
    this.statusBarItem?.hide();
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.statusBarItem?.dispose();
    this.statusBarItem = null;
  }
}
