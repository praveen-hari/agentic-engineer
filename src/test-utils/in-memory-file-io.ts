import type { FileIO } from '../core/types';

/**
 * In-memory implementation of FileIO for unit testing.
 * Simulates a filesystem using a Map<string, string>.
 */
export class InMemoryFileIO implements FileIO {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  async read(path: string): Promise<string> {
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }
    return this.files.get(path)!;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async append(path: string, content: string): Promise<void> {
    const existing = this.files.get(path) ?? '';
    this.files.set(path, existing + content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async readDir(path: string): Promise<readonly string[]> {
    const prefix = path.endsWith('/') ? path : path + '/';
    const seen = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        // Extract only the immediate child name (first path segment)
        // e.g., for prefix '/a/' and key '/a/sub/file.md', extract 'sub'
        // This matches vscode.workspace.fs.readDirectory() behavior
        const relative = key.slice(prefix.length);
        const firstSegment = relative.split('/')[0];
        if (firstSegment) {
          seen.add(firstSegment);
        }
      }
    }
    return [...seen];
  }
}
