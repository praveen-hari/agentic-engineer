/**
 * Watches `.git/HEAD` for changes to detect branch switches.
 *
 * When the user switches branches (git checkout, git switch),
 * `.git/HEAD` is rewritten. This watcher detects that and notifies
 * callbacks so the extension can reload workflow state from disk.
 *
 * Includes debouncing (300ms) because git operations can trigger
 * multiple rapid HEAD changes (e.g., rebase, merge).
 *
 * @see Phase 5: Branch-Change Watcher
 */
export type BranchChangeCallback = () => void;

export class BranchWatcher {
  private watcher: { dispose(): void } | null = null;
  private callbacks = new Set<BranchChangeCallback>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly vscodeApi: typeof import('vscode'),
    private readonly rootPath: string,
  ) {}

  /**
   * Start watching .git/HEAD for changes.
   * Returns a disposable that stops the watcher.
   */
  start(): { dispose(): void } {
    const pattern = `${this.rootPath}/.git/HEAD`;
    const fsWatcher = this.vscodeApi.workspace.createFileSystemWatcher(pattern);

    fsWatcher.onDidChange(() => {
      this.handleHeadChange();
    });

    this.watcher = fsWatcher;

    return { dispose: () => this.stop() };
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.watcher?.dispose();
    this.watcher = null;
  }

  /**
   * Register a callback for branch changes.
   * Returns an unsubscribe function.
   */
  onBranchChange(callback: BranchChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Handle .git/HEAD change with debouncing.
   * Multiple rapid changes (rebase, merge) collapse into one notification.
   */
  private handleHeadChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      for (const cb of this.callbacks) {
        try {
          cb();
        } catch {
          // Don't let one callback failure break others
        }
      }
    }, 300);
  }
}
