import type {
  Artifact,
  ArtifactManifest,
  ArtifactManifestEntry,
  ArtifactStatus,
  ArtifactType,
  FileIO,
  LifecycleStage,
} from '../core/types';
import {
  WORKFLOW_DIR,
  ARTIFACTS_MANIFEST,
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
} from '../constants';

/**
 * Manages artifact files and their manifest in
 * `.codestudio/workflows/current/artifacts/`.
 *
 * Uses a **manifest.json** (PDF xref pattern) as the single source
 * of truth for artifact metadata: IDs, timestamps, status, and titles.
 * Content lives in separate `.md` files.
 *
 * Key invariants:
 * - Every `save()` writes both the content file AND updates the manifest.
 * - `listAll()` reads from the manifest, never scans the filesystem.
 * - IDs are stable — generated once on first save, preserved on overwrite.
 * - Status is persistent — survives `listAll()` calls and git checkouts.
 *
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 */
export class ArtifactManager {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Save an artifact to the appropriate directory and update the manifest.
   *
   * If an artifact of the same type already exists, it is overwritten
   * (same file, same ID, updated content and updatedAt).
   */
  async save(
    type: ArtifactType,
    title: string,
    content: string,
    stage: LifecycleStage,
  ): Promise<Artifact> {
    const dir = this.getArtifactDir(type);
    const filename = `${type}.md`;
    const path = `${dir}/${filename}`;
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${path}`;
    const now = new Date().toISOString();

    // Write content file
    await this.fs.write(fullPath, content);

    // Update manifest — reuse existing entry if same type (overwrite)
    const manifest = await this.loadManifest();
    const existingIndex = manifest.artifacts.findIndex((a) => a.type === type);

    let entry: ArtifactManifestEntry;
    if (existingIndex >= 0) {
      // Overwrite: preserve ID and createdAt, update title and updatedAt
      const existing = manifest.artifacts[existingIndex];
      entry = {
        ...existing,
        title,
        updatedAt: now,
      };
      const updated = [...manifest.artifacts];
      updated[existingIndex] = entry;
      await this.saveManifest({ ...manifest, artifacts: updated });
    } else {
      // New: generate unique ID
      entry = {
        id: this.generateId(),
        type,
        title,
        filename,
        stage,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
      await this.saveManifest({
        ...manifest,
        artifacts: [...manifest.artifacts, entry],
      });
    }

    return this.entryToArtifact(entry, path);
  }

  /**
   * Read an artifact's content from disk.
   */
  async read(artifact: Artifact): Promise<string | null> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${artifact.path}`;
    try {
      return await this.fs.read(fullPath);
    } catch {
      return null;
    }
  }

  /**
   * Update an existing artifact's content and bump updatedAt in manifest.
   */
  async update(artifact: Artifact, content: string): Promise<Artifact> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${artifact.path}`;
    await this.fs.write(fullPath, content);

    const now = new Date().toISOString();
    const manifest = await this.loadManifest();
    const updated = manifest.artifacts.map((a) =>
      a.id === artifact.id ? { ...a, updatedAt: now } : a,
    );
    await this.saveManifest({ ...manifest, artifacts: updated });

    return { ...artifact, updatedAt: now };
  }

  /**
   * Update an artifact's status in the manifest.
   */
  async updateStatus(artifactId: string, status: ArtifactStatus): Promise<void> {
    const manifest = await this.loadManifest();
    const updated = manifest.artifacts.map((a) => (a.id === artifactId ? { ...a, status } : a));
    await this.saveManifest({ ...manifest, artifacts: updated });
  }

  /**
   * List all artifacts for the current workflow.
   * Reads from the manifest — never scans the filesystem.
   */
  async listAll(): Promise<readonly Artifact[]> {
    const manifest = await this.loadManifest();
    return manifest.artifacts.map((entry) => {
      const dir = this.getArtifactDir(entry.type);
      const path = `${dir}/${entry.filename}`;
      return this.entryToArtifact(entry, path);
    });
  }

  /**
   * List artifacts for a specific stage.
   */
  async listByStage(stage: LifecycleStage): Promise<readonly Artifact[]> {
    const all = await this.listAll();
    return all.filter((a) => a.stage === stage);
  }

  /**
   * Clear all artifacts and the manifest (for workflow reset/archive).
   */
  async clearAll(): Promise<void> {
    await this.saveManifest({ version: 1, artifacts: [] });
  }

  /**
   * Save the objective statement.
   */
  async saveObjective(objective: string): Promise<void> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/workflows/current/objective.md`;
    const content = `# Objective\n\n${objective}\n\n---\n*Created: ${new Date().toISOString()}*\n`;
    await this.fs.write(fullPath, content);
  }

  /**
   * Read the objective statement.
   */
  async readObjective(): Promise<string | null> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/workflows/current/objective.md`;
    try {
      return await this.fs.read(fullPath);
    } catch {
      return null;
    }
  }

  // ─── Manifest I/O ─────────────────────────────────────────────────────

  private get manifestPath(): string {
    return `${this.rootPath}/${WORKFLOW_DIR}/${ARTIFACTS_MANIFEST}`;
  }

  private async loadManifest(): Promise<ArtifactManifest> {
    try {
      if (await this.fs.exists(this.manifestPath)) {
        const content = await this.fs.read(this.manifestPath);
        return JSON.parse(content) as ArtifactManifest;
      }
    } catch {
      // Corrupt manifest — start fresh
    }
    return { version: 1, artifacts: [] };
  }

  private async saveManifest(manifest: ArtifactManifest): Promise<void> {
    await this.fs.write(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private entryToArtifact(entry: ArtifactManifestEntry, path: string): Artifact {
    return {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      path,
      stage: entry.stage,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      status: entry.status,
    };
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `art_${timestamp}_${random}`;
  }

  private getArtifactDir(type: ArtifactType): string {
    switch (type) {
      case 'spec':
        return ARTIFACTS_SPECS_DIR;
      case 'plan':
        return ARTIFACTS_PLANS_DIR;
      case 'review':
        return ARTIFACTS_REVIEWS_DIR;
      case 'report':
      case 'adr':
        return ARTIFACTS_REPORTS_DIR;
      case 'todo':
        return ARTIFACTS_PLANS_DIR;
      default:
        return ARTIFACTS_REPORTS_DIR;
    }
  }
}
