import type { FileIO, WorkflowDefinition } from './types';

/**
 * Read/write manager for `workflow.json` — the current workflow state
 * file in `.codestudio/` (DD-002, DD-004).
 *
 * Handles missing file (first run), corrupt file (recovery), and
 * concurrent access (mutex + optimistic concurrency via version check).
 *
 * File I/O is injected via the {@link FileIO} interface for testability.
 */
export class StateManager {
  /**
   * Mutex for serializing update() calls.
   * Prevents the race condition where two concurrent updates both read
   * the same version, transform independently, and the second save
   * overwrites the first (lost update).
   * Pattern: promise-chain mutex — each update waits for the previous.
   */
  private updateLock: Promise<void> = Promise.resolve();

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
   * Clear the workflow state file from disk.
   * Used after archiving or cancelling a workflow so that
   * subsequent `load()` calls return null instead of stale state.
   */
  async clear(): Promise<void> {
    if (await this.fs.exists(this.filePath)) {
      // Write empty JSON null — load() will parse and return null
      await this.fs.write(this.filePath, 'null');
    }
  }

  /**
   * Atomically update the workflow state: load → transform → save.
   * The transform function receives the current state and returns the new state.
   * Version is automatically bumped on each update.
   *
   * Serialized via a promise-chain mutex so concurrent callers
   * (e.g., UI "Approve & Continue" + agent `advance_stage` tool)
   * cannot interleave and cause lost updates.
   *
   * @param fn Transform function
   * @param expectedVersion If provided, rejects if the on-disk version doesn't match
   * @throws Error if no workflow exists or version mismatch
   */
  async update(
    fn: (current: WorkflowDefinition) => WorkflowDefinition,
    expectedVersion?: number,
  ): Promise<WorkflowDefinition> {
    // Acquire the mutex: chain onto the previous update's promise.
    // This ensures only one update runs at a time, even if multiple
    // callers invoke update() concurrently.
    let result!: WorkflowDefinition;
    const release = this.updateLock.then(async () => {
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
      result = updated;
    });

    // Update the lock to point to this operation (whether it succeeds or fails).
    // Use .catch() on the lock chain so a failed update doesn't block future ones.
    this.updateLock = release.catch(() => {});

    // Await the actual operation — this WILL throw if it fails.
    await release;
    return result;
  }
}
