import type {
  Artifact,
  ArtifactType,
  FileIO,
  LifecycleStage,
} from '../core/types';
import {
  WORKFLOW_DIR,
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
} from '../constants';

/**
 * Manages artifact files in `.codestudio/workflows/current/artifacts/`.
 *
 * Artifacts are the outputs of each workflow stage — specs, plans,
 * reviews, reports. They live in the current workflow directory and
 * are archived when the workflow completes.
 *
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 */
export class ArtifactManager {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
  ) {}

  /**
   * Save an artifact to the appropriate directory.
   * Creates the file and returns the Artifact metadata.
   */
  async save(
    type: ArtifactType,
    title: string,
    content: string,
    stage: LifecycleStage,
  ): Promise<Artifact> {
    const dir = this.getArtifactDir(type);
    const filename = this.slugify(title) + '.md';
    const path = `${dir}/${filename}`;
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${path}`;
    const now = new Date().toISOString();

    await this.fs.write(fullPath, content);

    return {
      id: `${type}-${this.slugify(title)}`,
      type,
      title,
      path,
      stage,
      createdAt: now,
      updatedAt: now,
      status: 'draft',
    };
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
   * Update an existing artifact's content.
   */
  async update(artifact: Artifact, content: string): Promise<Artifact> {
    const fullPath = `${this.rootPath}/${WORKFLOW_DIR}/${artifact.path}`;
    await this.fs.write(fullPath, content);

    return {
      ...artifact,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * List all artifacts for the current workflow.
   */
  async listAll(): Promise<readonly Artifact[]> {
    const artifacts: Artifact[] = [];

    for (const type of ['spec', 'plan', 'review', 'report'] as ArtifactType[]) {
      const dir = this.getArtifactDir(type);
      const fullDir = `${this.rootPath}/${WORKFLOW_DIR}/${dir}`;

      try {
        const files = await this.fs.readDir(fullDir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const name = file.replace(/\.md$/, '');
          artifacts.push({
            id: `${type}-${name}`,
            type,
            title: this.unslugify(name),
            path: `${dir}/${file}`,
            stage: this.inferStageFromType(type),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'draft',
          });
        }
      } catch {
        // Directory doesn't exist or can't be read — skip
      }
    }

    return artifacts;
  }

  /**
   * List artifacts for a specific stage.
   */
  async listByStage(stage: LifecycleStage): Promise<readonly Artifact[]> {
    const all = await this.listAll();
    return all.filter((a) => a.stage === stage);
  }

  /**
   * Save the objective statement to `.codestudio/workflows/current/objective.md`.
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

  // ─── Private Helpers ──────────────────────────────────────────────────

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
      default:
        return ARTIFACTS_REPORTS_DIR;
    }
  }

  private inferStageFromType(type: ArtifactType): LifecycleStage {
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

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private unslugify(slug: string): string {
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
