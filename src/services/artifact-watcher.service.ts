// VS Code API type — injected via constructor for testability
import type { Artifact, ArtifactType, LifecycleStage } from '../core/types';
import { WORKFLOW_DIR, ARTIFACTS_DIR } from '../constants';

/**
 * Callback when an artifact is detected or changed.
 */
export type ArtifactCallback = (artifact: Artifact) => void;

/**
 * Callback when a setup file is detected (onboarding completion).
 */
export type SetupFileCallback = (fileName: string, filePath: string) => void;

/**
 * Callback when a knowledge file is created or changed.
 */
export type KnowledgeFileCallback = (fileName: string, filePath: string) => void;

/**
 * Watches .codestudio/ for file changes:
 *
 * 1. Artifact watcher — workflows/current/artifacts/ for .md files.
 *    Detects specs, plans, reviews, reports from the agent.
 *
 * 2. Setup watcher — .codestudio/ root for .md and .json files.
 *    Detects onboarding completion files (config.json,
 *    codestudio-instructions.md) so the UI auto-transitions.
 *
 * @see ARCHITECTURE.md (Agent-Delegated Architecture)
 */
export class ArtifactWatcher {
  private watchers: Array<{ dispose(): void }> = [];
  private callbacks: Set<ArtifactCallback> = new Set();
  private setupCallbacks: Set<SetupFileCallback> = new Set();
  private knowledgeCallbacks: Set<KnowledgeFileCallback> = new Set();

  constructor(
    private readonly vscodeApi: typeof import('vscode'),
    private readonly rootPath: string,
  ) {}

  /**
   * Start watching for artifact file changes.
   * Returns a disposable that stops all watchers.
   */
  start(): { dispose(): void } {
    // Watch artifacts directory for specs, plans, reviews, reports
    const artifactPattern = `${this.rootPath}/${WORKFLOW_DIR}/${ARTIFACTS_DIR}/**/*.md`;
    const artifactWatcher = this.vscodeApi.workspace.createFileSystemWatcher(artifactPattern);

    artifactWatcher.onDidCreate((uri) => {
      void this.handleFileChange(uri);
    });
    artifactWatcher.onDidChange((uri) => {
      void this.handleFileChange(uri);
    });
    this.watchers.push(artifactWatcher);

    // Watch .codestudio/ for setup files (onboarding completion)
    const setupMdPattern = `${this.rootPath}/${WORKFLOW_DIR}/*.md`;
    const setupJsonPattern = `${this.rootPath}/${WORKFLOW_DIR}/*.json`;
    const knowledgeMdPattern = `${this.rootPath}/${WORKFLOW_DIR}/knowledge/*.md`;
    const instructionPattern = `${this.rootPath}/${WORKFLOW_DIR}/**/*instructions*.md`;

    for (const pattern of [setupMdPattern, setupJsonPattern, knowledgeMdPattern, instructionPattern]) {
      const watcher = this.vscodeApi.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate((uri) => {
        void this.handleSetupFileChange(uri);
      });
      watcher.onDidChange((uri) => {
        void this.handleSetupFileChange(uri);
      });
      this.watchers.push(watcher);
    }

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
   * Register a callback for setup file detection (onboarding completion).
   * Fires when config.json or *instructions*.md is created/changed.
   * Returns an unsubscribe function.
   */
  onSetupFileDetected(callback: SetupFileCallback): () => void {
    this.setupCallbacks.add(callback);
    return () => this.setupCallbacks.delete(callback);
  }

  /**
   * Register a callback for knowledge file changes.
   * Fires when any file in knowledge/ or codestudio-instructions.md changes.
   */
  onKnowledgeFileChanged(callback: KnowledgeFileCallback): () => void {
    this.knowledgeCallbacks.add(callback);
    return () => this.knowledgeCallbacks.delete(callback);
  }

  /**
   * Handle a setup file create/change event.
   * Notifies setup callbacks so onboarding can auto-transition.
   */
  private async handleSetupFileChange(uri: { fsPath: string }): Promise<void> {
    const filePath = uri.fsPath;
    const fileName = filePath.split('/').pop() ?? '';

    // Only notify for known setup files
    const isSetupFile =
      fileName === 'config.json' ||

      fileName.includes('instructions') ||
      fileName === 'AGENTS.md';

    // Notify knowledge callbacks for knowledge files
    const isKnowledgeFile =
      filePath.includes('/knowledge/') ||
      fileName === 'codestudio-instructions.md';

    if (isKnowledgeFile) {
      for (const cb of this.knowledgeCallbacks) {
        try {
          cb(fileName, filePath);
        } catch {
          // Don't let one callback failure break others
        }
      }
    }

    if (!isSetupFile) return;

    for (const cb of this.setupCallbacks) {
      try {
        cb(fileName, filePath);
      } catch {
        // Don't let one callback failure break others
      }
    }
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
      case 'spec':
        return 'define';
      case 'plan':
        return 'plan';
      case 'review':
        return 'review';
      case 'report':
        return 'verify';
      case 'adr':
        return 'define';
      default:
        return 'build';
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
