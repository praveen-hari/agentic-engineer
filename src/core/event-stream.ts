import type { FileIO, WorkflowEvent } from './types';

/**
 * Append-only JSONL event logger (DD-008).
 *
 * Events are the source of truth — workflow state can be reconstructed
 * by replaying events. Each event is serialized as one JSON object per
 * line. Invalid lines are skipped with a warning (not crash).
 *
 * File I/O is injected via the {@link FileIO} interface for testability.
 */
export class EventStream {
  constructor(
    private readonly fs: FileIO,
    private readonly filePath: string,
  ) {}

  /**
   * Append a single event to the JSONL log.
   * Creates the directory and file if they don't exist.
   */
  async append(event: WorkflowEvent): Promise<void> {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
    if (dir && !(await this.fs.exists(dir))) {
      await this.fs.mkdir(dir);
    }

    const line = JSON.stringify(event) + '\n';
    await this.fs.append(this.filePath, line);
  }

  /**
   * Read all events from the log file.
   * Returns an empty array if the file doesn't exist.
   * Skips invalid JSON lines without crashing.
   */
  async read(): Promise<readonly WorkflowEvent[]> {
    if (!(await this.fs.exists(this.filePath))) {
      return [];
    }

    const content = await this.fs.read(this.filePath);
    return this.parseLines(content);
  }

  /**
   * Replay events in chronological order (append order).
   * Optionally filter by workflow ID.
   */
  async replay(workflowId?: string): Promise<readonly WorkflowEvent[]> {
    const events = await this.read();
    if (workflowId) {
      return events.filter((e) => e.workflowId === workflowId);
    }
    return events;
  }

  /**
   * Parse JSONL content into events, skipping invalid lines.
   */
  private parseLines(content: string): readonly WorkflowEvent[] {
    const lines = content.split('\n');
    const events: WorkflowEvent[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as WorkflowEvent;
        events.push(parsed);
      } catch {
        // Skip invalid JSON line — don't crash (DD-008)
      }
    }

    return events;
  }
}
