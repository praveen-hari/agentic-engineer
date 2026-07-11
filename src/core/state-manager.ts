import type { FileIO, WorkflowDefinition } from './types';

/**
 * Read/write manager for `workflow.json` — the current workflow state
 * file in `.codestudio/` (DD-002, DD-004).
 *
 * Handles missing file (first run), corrupt file (recovery), and
 * concurrent access (optimistic concurrency via version check).
 *
 * File I/O is injected via the {@link FileIO} interface for testability.
 */
export class StateManager {
  constructor(
    private readonly fs: FileIO,
    private readonly filePath: string,
  ) {}

  /**
   * Load the current workflow state.
   * Returns null if the file doesn't exist (first run) or is corrupt.
   */
  async load(): Promise<WorkflowDefinition | null> {
    if (!(await this.fs.exists(this.filePath))) {
      return null;
    }

    try {
      const content = await this.fs.read(this.filePath);
      return JSON.parse(content) as WorkflowDefinition;
    } catch {
      // Corrupt file — recovery mode returns null so caller can reinitialize
      return null;
    }
  }

  /**
   * Save the workflow state as JSON.
   * Creates the directory if it doesn't exist.
   */
  async save(state: WorkflowDefinition): Promise<void> {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
    if (dir && !(await this.fs.exists(dir))) {
      await this.fs.mkdir(dir);
    }

    const json = JSON.stringify(state, null, 2);
    await this.fs.write(this.filePath, json);
  }

  /**
   * Atomically update the workflow state: load → transform → save.
   * The transform function receives the current state and returns the new state.
   * Version is automatically bumped on each update.
   *
   * @param fn Transform function
   * @param expectedVersion If provided, rejects if the on-disk version doesn't match
   * @throws Error if no workflow exists or version mismatch
   */
  async update(
    fn: (current: WorkflowDefinition) => WorkflowDefinition,
    expectedVersion?: number,
  ): Promise<WorkflowDefinition> {
    const current = await this.load();
    if (!current) {
      throw new Error('Cannot update: no workflow state exists');
    }

    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, found ${current.version}`);
    }

    const transformed = fn(current);
    const updated: WorkflowDefinition = {
      ...transformed,
      version: current.version + 1,
      state: {
        ...transformed.state,
        lastActivityAt: new Date().toISOString(),
      },
    };

    await this.save(updated);
    return updated;
  }
}
