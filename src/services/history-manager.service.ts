import type {
  ArtifactManifest,
  FileIO,
  HistoryEntry,
  HistoryMeta,
  HistoryYearFile,
  WorkflowArchive,
  WorkflowDefinition,
} from '../core/types';
import {
  WORKFLOW_DIR,
  ARCHIVE_DIR,
  HISTORY_DIR,
  HISTORY_META_FILE,
  ARTIFACTS_MANIFEST,
  CURRENT_WORKFLOW_DIR,
  WORKFLOW_FILE,
} from '../constants';

/**
 * Manages workflow archival and history (Phase 4).
 *
 * Uses a **git-pack-file-inspired** archive structure:
 * - Each completed workflow is packed into `archive/YYYY/MM/wf-xxx/`
 * - `archive.json` contains workflow state + artifact metadata (small)
 * - Artifact `.md` files are copied alongside (read on demand)
 * - History is indexed in yearly shards: `history/2026.json`
 * - A tiny `history/meta.json` tracks which years exist
 *
 * Designed for 10-year scalability:
 * - ~90 files per month directory (3 workflows/day)
 * - ~300 KB per yearly shard (~1000 entries)
 * - Metadata only in git, content local-only
 */
export class HistoryManager {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
  ) {}

  // ─── Archive a completed workflow ─────────────────────────────────

  /**
   * Archive a completed workflow:
   * 1. Create archive dir (archive/YYYY/MM/wf-xxx/)
   * 2. Write archive.json (workflow + artifact metadata)
   * 3. Copy artifact content files
   * 4. Add entry to yearly history shard
   * 5. Update history meta
   * 6. Clear workflows/current/
   */
  async archiveWorkflow(workflow: WorkflowDefinition): Promise<HistoryEntry> {
    const completedAt = workflow.state.lastActivityAt || new Date().toISOString();
    const date = new Date(completedAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const archiveRelPath = `${ARCHIVE_DIR}/${year}/${month}/${workflow.id}`;
    const archiveAbsPath = `${this.rootPath}/${WORKFLOW_DIR}/${archiveRelPath}`;

    // 1. Create archive directory
    await this.fs.mkdir(archiveAbsPath);

    // 2. Read artifact manifest
    const manifest = await this.loadManifest();
    const artifacts = manifest.artifacts;

    // 3. Write archive.json (workflow state + artifact metadata, NO content)
    const archive: WorkflowArchive = {
      version: 1,
      archivedAt: new Date().toISOString(),
      workflow,
      artifacts,
    };
    await this.fs.write(`${archiveAbsPath}/archive.json`, JSON.stringify(archive, null, 2));

    // 4. Copy artifact content files to archive directory
    for (const entry of artifacts) {
      const srcPath = `${this.rootPath}/${WORKFLOW_DIR}/workflows/current/artifacts/${this.getArtifactSubdir(entry.type)}/${entry.filename}`;
      try {
        const content = await this.fs.read(srcPath);
        await this.fs.write(`${archiveAbsPath}/${entry.filename}`, content);
      } catch {
        // Artifact file missing — skip (metadata still in archive.json)
      }
    }

    // 5. Create history entry
    const historyEntry = this.buildHistoryEntry(workflow, archiveRelPath, completedAt);

    // 6. Append to yearly shard
    await this.appendToYearlyShard(year, historyEntry);

    // 7. Update meta
    await this.updateMeta(year);

    // 8. Clear current workflow
    await this.clearCurrent();

    return historyEntry;
  }

  // ─── Load history ─────────────────────────────────────────────────

  /**
   * Load history entries for a specific year.
   * Defaults to current year if not specified.
   */
  async loadHistory(year?: number): Promise<readonly HistoryEntry[]> {
    const targetYear = year ?? new Date().getFullYear();
    const shardPath = `${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_DIR}/${targetYear}.json`;

    try {
      if (!(await this.fs.exists(shardPath))) return [];
      const content = await this.fs.read(shardPath);
      const shard = JSON.parse(content) as HistoryYearFile;
      return shard.entries;
    } catch {
      return [];
    }
  }

  /**
   * Load the history meta file.
   */
  async loadMeta(): Promise<HistoryMeta> {
    const metaPath = `${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_META_FILE}`;
    try {
      if (!(await this.fs.exists(metaPath))) {
        return { years: [], totalWorkflows: 0 };
      }
      const content = await this.fs.read(metaPath);
      return JSON.parse(content) as HistoryMeta;
    } catch {
      return { years: [], totalWorkflows: 0 };
    }
  }

  // ─── Load archived workflow ───────────────────────────────────────

  /**
   * Load a specific archived workflow by its archive path.
   * Returns the full archive including workflow state and artifact metadata.
   */
  async loadArchivedWorkflow(archivePath: string): Promise<WorkflowArchive | null> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${archivePath}/archive.json`;
    try {
      if (!(await this.fs.exists(fullPath))) return null;
      const content = await this.fs.read(fullPath);
      return JSON.parse(content) as WorkflowArchive;
    } catch {
      return null;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private buildHistoryEntry(
    workflow: WorkflowDefinition,
    archivePath: string,
    completedAt: string,
  ): HistoryEntry {
    const stagesCompleted = workflow.stages.filter((s) => s.status === 'completed').length;
    const stagesSkipped = workflow.stages.filter((s) => s.status === 'skipped').length;
    const approvalsGranted = workflow.approvals.filter((a) => a.status === 'approved').length;

    return {
      id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workflowId: workflow.id,
      objective: workflow.objective,
      workType: workflow.workType,
      processLevel: workflow.processLevel,
      startedAt: workflow.state.startedAt,
      completedAt,
      archivePath,
      stats: {
        stagesCompleted,
        stagesSkipped,
        approvalsGranted,
        approvalsRejected: workflow.approvals.filter((a) => a.status === 'rejected').length,
      },
    };
  }

  private async appendToYearlyShard(year: number, entry: HistoryEntry): Promise<void> {
    const shardPath = `${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_DIR}/${year}.json`;

    let shard: HistoryYearFile;
    try {
      if (await this.fs.exists(shardPath)) {
        const content = await this.fs.read(shardPath);
        shard = JSON.parse(content) as HistoryYearFile;
      } else {
        shard = { year, entries: [] };
      }
    } catch {
      shard = { year, entries: [] };
    }

    const updated: HistoryYearFile = {
      ...shard,
      entries: [...shard.entries, entry],
    };

    await this.fs.mkdir(`${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_DIR}`);
    await this.fs.write(shardPath, JSON.stringify(updated, null, 2));
  }

  private async updateMeta(year: number): Promise<void> {
    const meta = await this.loadMeta();
    const years = meta.years.includes(year) ? [...meta.years] : [...meta.years, year].sort();
    const updated: HistoryMeta = {
      years,
      totalWorkflows: meta.totalWorkflows + 1,
    };

    await this.fs.mkdir(`${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_DIR}`);
    await this.fs.write(
      `${this.rootPath}/${WORKFLOW_DIR}/${HISTORY_META_FILE}`,
      JSON.stringify(updated, null, 2),
    );
  }

  async clearCurrent(): Promise<void> {
    // Clear workflow.json
    const wfPath = `${this.rootPath}/${WORKFLOW_DIR}/${CURRENT_WORKFLOW_DIR}/${WORKFLOW_FILE}`;
    try {
      await this.fs.write(wfPath, '');
    } catch {
      // Already gone
    }

    // Clear objective.md
    const objPath = `${this.rootPath}/${WORKFLOW_DIR}/${CURRENT_WORKFLOW_DIR}/objective.md`;
    try {
      await this.fs.write(objPath, '');
    } catch {
      // Already gone
    }

    // Delete artifact content files from all subdirectories
    const artifactDirs = ['specs', 'plans', 'reviews', 'reports'];
    for (const dir of artifactDirs) {
      const dirPath = `${this.rootPath}/${WORKFLOW_DIR}/${CURRENT_WORKFLOW_DIR}/artifacts/${dir}`;
      try {
        const files = await this.fs.readDir(dirPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            await this.fs.write(`${dirPath}/${file}`, '');
          }
        }
      } catch {
        // Directory may not exist or be empty
      }
    }

    // Clear artifact manifest
    const manifestPath = `${this.rootPath}/${WORKFLOW_DIR}/${ARTIFACTS_MANIFEST}`;
    try {
      await this.fs.write(manifestPath, JSON.stringify({ version: 1, artifacts: [] }, null, 2));
    } catch {
      // Already gone
    }
  }

  private async loadManifest(): Promise<ArtifactManifest> {
    const manifestPath = `${this.rootPath}/${WORKFLOW_DIR}/${ARTIFACTS_MANIFEST}`;
    try {
      if (await this.fs.exists(manifestPath)) {
        const content = await this.fs.read(manifestPath);
        return JSON.parse(content) as ArtifactManifest;
      }
    } catch {
      // Corrupt or missing
    }
    return { version: 1, artifacts: [] };
  }

  private getArtifactSubdir(type: string): string {
    switch (type) {
      case 'spec':
        return 'specs';
      case 'plan':
        return 'plans';
      case 'review':
        return 'reviews';
      case 'report':
        return 'reports';
      default:
        return 'reports';
    }
  }
}
