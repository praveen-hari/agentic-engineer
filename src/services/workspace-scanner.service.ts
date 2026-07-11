import type { FileIO } from '../core/types';
import type { FileEntry } from '../core/project-detector';
import {
  SCAN_EXCLUDE_DIRS,
  SCAN_READ_FILES,
  SCAN_MAX_DEPTH,
  DOTNET_PROJECT_EXTENSIONS,
} from '../constants';

/**
 * Scans workspace files to produce {@link FileEntry[]} for
 * {@link ProjectDetector}. Reads config file content (package.json,
 * tsconfig.json, .csproj) for framework detection.
 *
 * Uses injected {@link FileIO} — no direct VS Code or Node.js deps.
 *
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 * @see tasks/specs/onboarding-and-workspace-init.md
 */
export class WorkspaceScanner {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
  ) {}

  /**
   * Scan the workspace up to {@link SCAN_MAX_DEPTH} levels deep.
   * Excludes directories in {@link SCAN_EXCLUDE_DIRS}.
   * Reads content of config files in {@link SCAN_READ_FILES} and .NET project files.
   */
  async scan(): Promise<readonly FileEntry[]> {
    const entries: FileEntry[] = [];
    await this.scanDirectory('', 0, entries);
    return entries;
  }

  /**
   * Determine if this is a greenfield project (≤5 non-config source files).
   */
  static isGreenfield(files: readonly FileEntry[]): boolean {
    const sourceFiles = files.filter((f) => {
      if (f.isDirectory) return false;
      const name = getBasename(f.path);
      // Config/meta files don't count as "source"
      const configFiles = [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.webview.json',
        '.eslintrc.json',
        '.prettierrc',
        '.gitignore',
        '.editorconfig',
        'README.md',
        'LICENSE',
        'CHANGELOG.md',
        '.env',
        '.env.example',
        'Makefile',
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.yaml',
      ];
      return !configFiles.includes(name);
    });
    return sourceFiles.length <= 5;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async scanDirectory(
    relativePath: string,
    depth: number,
    entries: FileEntry[],
  ): Promise<void> {
    if (depth > SCAN_MAX_DEPTH) return;

    const fullPath = relativePath ? `${this.rootPath}/${relativePath}` : this.rootPath;

    let children: readonly string[];
    try {
      children = await this.fs.readDir(fullPath);
    } catch {
      return; // Directory doesn't exist or can't be read
    }

    for (const name of children) {
      const childRelative = relativePath ? `${relativePath}/${name}` : name;
      const childFull = `${this.rootPath}/${childRelative}`;

      // Skip excluded directories
      if (this.isExcluded(name)) continue;

      // Check if it's a directory by trying to readDir
      const isDir = await this.isDirectory(childFull);

      if (isDir) {
        entries.push({ path: childRelative, isDirectory: true });
        await this.scanDirectory(childRelative, depth + 1, entries);
      } else {
        // Read content for config files and .NET project files
        const content = await this.maybeReadContent(childFull, name);
        entries.push({
          path: childRelative,
          isDirectory: false,
          ...(content !== undefined ? { content } : {}),
        });
      }
    }
  }

  private isExcluded(name: string): boolean {
    // Hidden directories (except .codestudio which is already in SCAN_EXCLUDE_DIRS)
    if (name.startsWith('.') && name !== '.codestudio') return true;
    return (SCAN_EXCLUDE_DIRS as readonly string[]).includes(name);
  }

  private async isDirectory(fullPath: string): Promise<boolean> {
    try {
      const children = await this.fs.readDir(fullPath);
      // If readDir succeeds, it's a directory
      void children;
      return true;
    } catch {
      return false;
    }
  }

  private async maybeReadContent(fullPath: string, name: string): Promise<string | undefined> {
    // Read known config files
    if ((SCAN_READ_FILES as readonly string[]).includes(name)) {
      return this.safeRead(fullPath);
    }

    // Read .NET project files
    const ext = getExtension(name);
    if ((DOTNET_PROJECT_EXTENSIONS as readonly string[]).includes(ext)) {
      return this.safeRead(fullPath);
    }

    return undefined;
  }

  private async safeRead(fullPath: string): Promise<string | undefined> {
    try {
      return await this.fs.read(fullPath);
    } catch {
      return undefined;
    }
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? '';
}

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0) return '';
  return name.substring(dotIndex);
}
