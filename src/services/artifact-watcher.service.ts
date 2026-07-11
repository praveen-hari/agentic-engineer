// VS Code API type — injected via constructor for testability
import type { Artifact, ArtifactType, LifecycleStage } from '../core/types';
import { WORKFLOW_DIR, ARTIFACTS_DIR } from '../constants';

/**
 * Callback when an artifact is detected or changed.
 */
export type ArtifactCallback = (artifact: Artifact) => void;

/**
 * Watches `.codestudio/workflows/current/artifacts/` for file changes.
 *
 * When the agent generates an artifact (spec, plan, review, report)
 * and saves it to the artifacts directory, this watcher detects the
 * new file and notifies the extension so it can:
 * 1. Update the workflow state
 * 2. Notify the webview UI
 * 3. Enable approval/gate flows
 *
 * @see ARCHITECTURE.md (Agent-Delegated Architecture)
 */
export class ArtifactWatcher {
  private watchers: Array<{ dispose(): void }> = [];
  private callbacks: Set<ArtifactCallback> = new Set();

  constructor(
    private readonly vscodeApi: typeof import('vscode'),
    private readonly rootPath: string,
  ) {}

  /**
   * Start watching for artifact file changes.
   * Returns a disposable that stops all watchers.
   */
  start(): { dispose(): void } {
    const pattern = `${this.rootPath}/${WORKFLOW_DIR}/${ARTIFACTS_DIR}/**/*.md`;

    const watcher = this.vscodeApi.workspace.createFileSystemWatcher(pattern);

    // New file created
    watcher.onDidCreate((uri) => {
      void this.handleFileChange(uri);
    });

    // Existing file changed
    watcher.onDidChange((uri) => {
      void this.handleFileChange(uri);
    });

    this.watchers.push(watcher);

    return {
      dispose: () => this.stop(),
    };
  }

  /**
   * Stop all watchers.
   */
  stop(): void {
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }

  /**
   * Register a callback for artifact detection.
   * Returns an unsubscribe function.
   */
  onArtifactDetected(callback: ArtifactCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Handle a file create/change event.
   * Reads the file, determines artifact type, and notifies callbacks.
   */
  private async handleFileChange(uri: { fsPath: string }): Promise<void> {
    const filePath = uri.fsPath;

    // Only process .md files in the artifacts directory
    if (!filePath.endsWith('.md')) return;

    const relativePath = this.getRelativePath(filePath);
    if (!relativePath) return;

    const type = this.detectArtifactType(relativePath);
    if (!type) return;

    const stage = this.inferStage(type);
    const title = this.extractTitle(relativePath);
    const now = new Date().toISOString();

    const artifact: Artifact = {
      id: `${type}-${slugify(title)}`,
      type,
      title,
      path: relativePath,
      stage,
      createdAt: now,
      updatedAt: now,
      status: 'pending-review',
    };

    // Notify all callbacks
    for (const cb of this.callbacks) {
      try {
        cb(artifact);
      } catch {
        // Don't let one callback failure break others
      }
    }
  }

  /**
   * Get the path relative to .codestudio/ from an absolute path.
   */
  private getRelativePath(absolutePath: string): string | null {
    const codestudioRoot = `${this.rootPath}/${WORKFLOW_DIR}/`;
    if (!absolutePath.startsWith(codestudioRoot)) return null;
    return absolutePath.substring(codestudioRoot.length);
  }

  /**
   * Detect artifact type from the file path.
   */
  private detectArtifactType(relativePath: string): ArtifactType | null {
    if (relativePath.includes('/specs/')) return 'spec';
    if (relativePath.includes('/plans/')) return 'plan';
    if (relativePath.includes('/reviews/')) return 'review';
    if (relativePath.includes('/reports/')) return 'report';
    return null;
  }

  /**
   * Infer which stage produced this artifact.
   */
  private inferStage(type: ArtifactType): LifecycleStage {
    switch (type) {
      case 'spec': return 'define';
      case 'plan': return 'plan';
      case 'review': return 'review';
      case 'report': return 'verify';
      case 'adr': return 'define';
      default: return 'build';
    }
  }

  /**
   * Extract a human-readable title from the file path.
   */
  private extractTitle(relativePath: string): string {
    const filename = relativePath.split('/').pop() ?? '';
    const name = filename.replace(/\.md$/, '');
    return name
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
