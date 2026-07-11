import type { FileIO } from '../core/types';

/**
 * File system service using VS Code's `workspace.fs` API (DD-002).
 *
 * Manages the `.codestudio/` directory and all file operations.
 * Implements the {@link FileIO} interface so it can be injected into
 * `StateManager` and `ArtifactManager` as the production I/O layer.
 *
 * Uses `vscode.workspace.fs` (not Node.js `fs`) for proper virtual
 * filesystem support (remote workspaces, WSL, etc.).
 */
export class FileSystemService implements FileIO {
  /**
   * Per-path write queues to serialize append operations.
   * Prevents the read-modify-write race condition where concurrent
   * appends both read the same content and the second overwrites the first.
   * Pattern: SQLite single-writer — one writer per file at a time.
   */
  private readonly appendQueues = new Map<string, Promise<void>>();

  constructor(private readonly vscode: typeof import('vscode')) {}

  // ─── FileIO Interface ────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const uri = this.vscode.Uri.file(path);
    const bytes = await this.vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  }

  async write(path: string, content: string): Promise<void> {
    const uri = this.vscode.Uri.file(path);
    await this.vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
  }

  async append(path: string, content: string): Promise<void> {
    // Serialize appends per-path to prevent read-modify-write races.
    // Each append waits for the previous one on the same path to finish
    // before starting its own read-modify-write cycle.
    const prev = this.appendQueues.get(path) ?? Promise.resolve();
    const next = prev.then(async () => {
      let existing = '';
      if (await this.exists(path)) {
        existing = await this.read(path);
      }
      await this.write(path, existing + content);
    });
    this.appendQueues.set(path, next);
    await next;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const uri = this.vscode.Uri.file(path);
      await this.vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.ensureDirectory(path);
  }

  async readDir(path: string): Promise<readonly string[]> {
    return this.listFiles(path);
  }

  // ─── Higher-Level Helpers ────────────────────────────────────────────

  /**
   * Ensure a directory exists, creating it (and parents) if needed.
   * Always calls createDirectory — it's idempotent in VS Code's API,
   * so no exists() check is needed (avoids TOCTOU race).
   */
  async ensureDirectory(path: string): Promise<void> {
    const uri = this.vscode.Uri.file(path);
    await this.vscode.workspace.fs.createDirectory(uri);
  }

  /**
   * Write JSON data to a file with pretty-printing.
   */
  async writeJson(path: string, data: unknown): Promise<void> {
    await this.write(path, JSON.stringify(data, null, 2));
  }

  /**
   * Read and parse JSON from a file. Returns null if file is missing
   * or contains invalid JSON.
   */
  async readJson<T>(path: string): Promise<T | null> {
    try {
      const content = await this.read(path);
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Append a single line to a file (with newline).
   */
  async appendLine(path: string, line: string): Promise<void> {
    await this.append(path, line + '\n');
  }

  /**
   * Read all lines from a file. Returns empty array if file is missing.
   */
  async readLines(path: string): Promise<string[]> {
    try {
      const content = await this.read(path);
      return content.split('\n').filter((l) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  /**
   * List file names in a directory.
   */
  async listFiles(path: string): Promise<readonly string[]> {
    try {
      const uri = this.vscode.Uri.file(path);
      const entries = await this.vscode.workspace.fs.readDirectory(uri);
      return entries.map(([name]) => name);
    } catch {
      return [];
    }
  }
}
