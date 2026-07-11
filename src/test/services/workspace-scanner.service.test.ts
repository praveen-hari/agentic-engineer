import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceScanner } from '../../services/workspace-scanner.service';
import type { FileIO } from '../../core/types';

// ─── Mock FileIO ────────────────────────────────────────────────────────────

function createMockFS(structure: Record<string, string | string[]>): FileIO {
  return {
    read: vi.fn(async (path: string) => {
      const val = structure[path];
      if (typeof val === 'string') return val;
      throw new Error(`File not found: ${path}`);
    }),
    write: vi.fn(async () => {}),
    append: vi.fn(async () => {}),
    exists: vi.fn(async (path: string) => path in structure),
    mkdir: vi.fn(async () => {}),
    readDir: vi.fn(async (path: string) => {
      const val = structure[path];
      if (Array.isArray(val)) return val;
      throw new Error(`Not a directory: ${path}`);
    }),
  };
}

describe('WorkspaceScanner', () => {
  describe('scan()', () => {
    it('returns empty array for empty workspace', async () => {
      const fs = createMockFS({
        '/workspace': [],
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();
      expect(result).toEqual([]);
    });

    it('lists files and directories at root level', async () => {
      const fs = createMockFS({
        '/workspace': ['src', 'package.json', 'README.md'],
        '/workspace/src': [], // directory
        '/workspace/package.json': '{"name": "test"}',
        // README.md — readDir throws → it's a file
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      expect(result).toContainEqual({ path: 'src', isDirectory: true });
      expect(result).toContainEqual({
        path: 'package.json',
        isDirectory: false,
        content: '{"name": "test"}',
      });
      expect(result).toContainEqual({ path: 'README.md', isDirectory: false });
    });

    it('reads package.json content for framework detection', async () => {
      const pkgContent = JSON.stringify({
        dependencies: { react: '^18.0.0', express: '^4.0.0' },
      });
      const fs = createMockFS({
        '/workspace': ['package.json'],
        '/workspace/package.json': pkgContent,
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      const pkg = result.find((f) => f.path === 'package.json');
      expect(pkg?.content).toBe(pkgContent);
    });

    it('reads .csproj content for .NET detection', async () => {
      const csprojContent = '<Project Sdk="Microsoft.NET.Sdk.Web">';
      const fs = createMockFS({
        '/workspace': ['MyApp.csproj'],
        '/workspace/MyApp.csproj': csprojContent,
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      const csproj = result.find((f) => f.path === 'MyApp.csproj');
      expect(csproj?.content).toBe(csprojContent);
    });

    it('does NOT read arbitrary source file content', async () => {
      const fs = createMockFS({
        '/workspace': ['src'],
        '/workspace/src': ['app.ts'],
        // app.ts is a file (readDir throws)
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      const appTs = result.find((f) => f.path === 'src/app.ts');
      expect(appTs).toBeDefined();
      expect(appTs?.content).toBeUndefined();
    });

    it('excludes node_modules directory', async () => {
      const fs = createMockFS({
        '/workspace': ['src', 'node_modules'],
        '/workspace/src': [],
        '/workspace/node_modules': ['express'],
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      expect(result.find((f) => f.path === 'node_modules')).toBeUndefined();
      expect(result.find((f) => f.path.includes('node_modules'))).toBeUndefined();
    });

    it('excludes .git directory', async () => {
      const fs = createMockFS({
        '/workspace': ['src', '.git'],
        '/workspace/src': [],
        '/workspace/.git': ['HEAD'],
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      expect(result.find((f) => f.path === '.git')).toBeUndefined();
    });

    it('excludes dist, out, build, coverage directories', async () => {
      const fs = createMockFS({
        '/workspace': ['dist', 'out', 'build', 'coverage', 'src'],
        '/workspace/dist': ['bundle.js'],
        '/workspace/out': ['extension.js'],
        '/workspace/build': ['index.html'],
        '/workspace/coverage': ['lcov.info'],
        '/workspace/src': [],
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      expect(result.find((f) => f.path === 'dist')).toBeUndefined();
      expect(result.find((f) => f.path === 'out')).toBeUndefined();
      expect(result.find((f) => f.path === 'build')).toBeUndefined();
      expect(result.find((f) => f.path === 'coverage')).toBeUndefined();
      expect(result.find((f) => f.path === 'src')).toBeDefined();
    });

    it('scans up to 3 levels deep', async () => {
      const fs = createMockFS({
        '/workspace': ['src'],
        '/workspace/src': ['components'],
        '/workspace/src/components': ['ui'],
        '/workspace/src/components/ui': ['Button.tsx'],
        // Level 4 — should NOT be scanned
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      expect(result.find((f) => f.path === 'src')).toBeDefined();
      expect(result.find((f) => f.path === 'src/components')).toBeDefined();
      expect(result.find((f) => f.path === 'src/components/ui')).toBeDefined();
      // Level 3 files should be listed
      expect(result.find((f) => f.path === 'src/components/ui/Button.tsx')).toBeDefined();
    });

    it('handles read errors gracefully', async () => {
      const fs = createMockFS({
        '/workspace': ['package.json'],
      });
      // Override read to throw for package.json
      (fs.read as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permission denied'));
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      // File should still be listed, just without content
      const pkg = result.find((f) => f.path === 'package.json');
      expect(pkg).toBeDefined();
      expect(pkg?.content).toBeUndefined();
    });

    it('scans a realistic brownfield project structure', async () => {
      const fs = createMockFS({
        '/workspace': ['src', 'package.json', 'tsconfig.json', 'vitest.config.ts', 'node_modules'],
        '/workspace/package.json': '{"dependencies":{"react":"^18"}}',
        '/workspace/tsconfig.json': '{"compilerOptions":{}}',
        '/workspace/src': ['app.tsx', 'components', 'lib'],
        '/workspace/src/components': ['Button.tsx', 'Header.tsx'],
        '/workspace/src/lib': ['utils.ts'],
        '/workspace/node_modules': ['react'],
      });
      const scanner = new WorkspaceScanner(fs, '/workspace');
      const result = await scanner.scan();

      // Should have src dir + its children + config files
      expect(result.length).toBeGreaterThanOrEqual(7);
      // Should NOT have node_modules
      expect(result.find((f) => f.path.includes('node_modules'))).toBeUndefined();
      // package.json should have content
      expect(result.find((f) => f.path === 'package.json')?.content).toBeDefined();
    });
  });

  describe('isGreenfield()', () => {
    it('returns true for empty workspace', () => {
      expect(WorkspaceScanner.isGreenfield([])).toBe(true);
    });

    it('returns true for workspace with only config files', () => {
      const files = [
        { path: 'package.json', isDirectory: false, content: '{}' },
        { path: 'tsconfig.json', isDirectory: false },
        { path: '.gitignore', isDirectory: false },
        { path: 'README.md', isDirectory: false },
      ];
      expect(WorkspaceScanner.isGreenfield(files)).toBe(true);
    });

    it('returns true for workspace with ≤5 source files', () => {
      const files = [
        { path: 'package.json', isDirectory: false, content: '{}' },
        { path: 'src', isDirectory: true },
        { path: 'src/index.ts', isDirectory: false },
        { path: 'src/app.ts', isDirectory: false },
      ];
      expect(WorkspaceScanner.isGreenfield(files)).toBe(true);
    });

    it('returns false for workspace with >5 source files', () => {
      const files = [
        { path: 'package.json', isDirectory: false, content: '{}' },
        { path: 'src/index.ts', isDirectory: false },
        { path: 'src/app.ts', isDirectory: false },
        { path: 'src/router.ts', isDirectory: false },
        { path: 'src/store.ts', isDirectory: false },
        { path: 'src/utils.ts', isDirectory: false },
        { path: 'src/types.ts', isDirectory: false },
      ];
      expect(WorkspaceScanner.isGreenfield(files)).toBe(false);
    });

    it('ignores directories when counting', () => {
      const files = [
        { path: 'src', isDirectory: true },
        { path: 'src/components', isDirectory: true },
        { path: 'src/lib', isDirectory: true },
        { path: 'src/views', isDirectory: true },
        { path: 'src/store', isDirectory: true },
        { path: 'src/test', isDirectory: true },
        { path: 'src/index.ts', isDirectory: false },
      ];
      // Only 1 source file (index.ts), directories don't count
      expect(WorkspaceScanner.isGreenfield(files)).toBe(true);
    });
  });
});
