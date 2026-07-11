import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingService } from '../../services/onboarding.service';
import { ProjectDetector } from '../../core/project-detector';
import { ContextAnalyzer } from '../../core/context-analyzer';
import { ContextSignalDetector } from '../../core/context-signal-detector';
import type { FileIO } from '../../core/types';
import {
  WORKFLOW_DIR,
  CODESTUDIO_DIRECTORIES,
  CONFIG_FILE,
  CONTEXT_FILE,
  DEFAULT_CONFIG,
} from '../../constants';

// ─── Mock FileIO ────────────────────────────────────────────────────────────

function createMockFS(
  opts: {
    codestudioExists?: boolean;
    configContent?: string;
    contextContent?: string;
    workspaceFiles?: string[];
  } = {},
): FileIO {
  const storage: Record<string, string> = {};
  const dirs = new Set<string>();

  if (opts.codestudioExists) {
    dirs.add('/workspace/.codestudio');
  }
  if (opts.configContent) {
    storage[`/workspace/${WORKFLOW_DIR}/${CONFIG_FILE}`] = opts.configContent;
  }
  if (opts.contextContent) {
    storage[`/workspace/${WORKFLOW_DIR}/${CONTEXT_FILE}`] = opts.contextContent;
  }

  return {
    read: vi.fn(async (path: string) => {
      if (path in storage) return storage[path];
      throw new Error(`File not found: ${path}`);
    }),
    write: vi.fn(async (path: string, content: string) => {
      storage[path] = content;
    }),
    append: vi.fn(async () => {}),
    exists: vi.fn(async (path: string) => {
      return path in storage || dirs.has(path);
    }),
    mkdir: vi.fn(async (path: string) => {
      dirs.add(path);
    }),
    readDir: vi.fn(async (path: string) => {
      if (path === '/workspace') {
        return opts.workspaceFiles ?? [];
      }
      if (dirs.has(path)) return [];
      throw new Error(`Not a directory: ${path}`);
    }),
  };
}

describe('OnboardingService', () => {
  let projectDetector: ProjectDetector;
  let contextAnalyzer: ContextAnalyzer;
  let contextSignalDetector: ContextSignalDetector;

  beforeEach(() => {
    projectDetector = new ProjectDetector();
    contextAnalyzer = new ContextAnalyzer();
    contextSignalDetector = new ContextSignalDetector();
  });

  describe('initialize() — first run (greenfield)', () => {
    it('creates .codestudio/ directory tree', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      await service.initialize();

      // Should have called mkdir for root + all subdirectories
      const mkdirCalls = (fs.mkdir as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as string,
      );
      expect(mkdirCalls).toContain(`/workspace/${WORKFLOW_DIR}`);
      for (const dir of CODESTUDIO_DIRECTORIES) {
        expect(mkdirCalls).toContain(`/workspace/${WORKFLOW_DIR}/${dir}`);
      }
    });

    it('creates config.json with defaults', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.config).toEqual(DEFAULT_CONFIG);
      expect(fs.write).toHaveBeenCalledWith(
        `/workspace/${WORKFLOW_DIR}/${CONFIG_FILE}`,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
      );
    });

    it('returns projectType greenfield for empty workspace', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.projectType).toBe('greenfield');
      expect(result.isFirstRun).toBe(true);
    });

    it('generates context.md', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      await service.initialize();

      expect(fs.write).toHaveBeenCalledWith(
        `/workspace/${WORKFLOW_DIR}/${CONTEXT_FILE}`,
        expect.stringContaining('# Project Context'),
      );
    });

    it('returns empty context for greenfield', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.context.languages).toEqual([]);
      expect(result.context.frameworks).toEqual([]);
      expect(result.signals).toEqual([]);
    });
  });

  describe('initialize() — first run (brownfield)', () => {
    it('returns projectType brownfield for workspace with source files', async () => {
      const pkgContent = JSON.stringify({
        dependencies: { react: '^18.0.0', express: '^4.0.0' },
        devDependencies: { vitest: '^2.0.0' },
      });
      const fs = createMockFS({
        workspaceFiles: [
          'package.json',
          'src',
          'tsconfig.json',
          'app.ts',
          'router.ts',
          'store.ts',
          'utils.ts',
          'types.ts',
          'index.ts',
        ],
      });
      // Override read to return package.json content
      (fs.read as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace/package.json') return pkgContent;
        throw new Error(`File not found: ${path}`);
      });
      // Override readDir to handle src as directory
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace') {
          return [
            'package.json',
            'src',
            'tsconfig.json',
            'app.ts',
            'router.ts',
            'store.ts',
            'utils.ts',
            'types.ts',
            'index.ts',
          ];
        }
        if (path === '/workspace/src') return ['components'];
        if (path === '/workspace/src/components') return [];
        throw new Error(`Not a directory: ${path}`);
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.projectType).toBe('brownfield');
      expect(result.isFirstRun).toBe(true);
    });

    it('detects React framework from package.json', async () => {
      const pkgContent = JSON.stringify({
        dependencies: { react: '^18.0.0' },
      });
      const fs = createMockFS({ workspaceFiles: [] });
      (fs.read as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace/package.json') return pkgContent;
        throw new Error(`File not found: ${path}`);
      });
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace') {
          return [
            'package.json',
            'src',
            'app.tsx',
            'index.tsx',
            'router.tsx',
            'store.ts',
            'utils.ts',
            'types.ts',
          ];
        }
        if (path === '/workspace/src') return [];
        throw new Error(`Not a directory: ${path}`);
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.context.frameworks).toContain('React');
    });

    it('detects context signals from project context', async () => {
      const pkgContent = JSON.stringify({
        dependencies: { react: '^18.0.0', express: '^4.0.0' },
      });
      const fs = createMockFS({ workspaceFiles: [] });
      (fs.read as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace/package.json') return pkgContent;
        throw new Error(`File not found: ${path}`);
      });
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/workspace') {
          return [
            'package.json',
            'src',
            'app.tsx',
            'index.tsx',
            'router.tsx',
            'store.ts',
            'utils.ts',
            'types.ts',
          ];
        }
        if (path === '/workspace/src') return [];
        throw new Error(`Not a directory: ${path}`);
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      // React → touches_ui, Express → touches_api
      expect(result.signals).toContain('touches_ui');
      expect(result.signals).toContain('touches_api');
    });
  });

  describe('initialize() — returning user', () => {
    it('loads existing config.json', async () => {
      const customConfig = {
        ...DEFAULT_CONFIG,
        processLevelDefault: 'thorough' as const,
        reviewTimeoutMinutes: 10,
      };
      const fs = createMockFS({
        codestudioExists: true,
        configContent: JSON.stringify(customConfig),
        contextContent: `# Project Context\n\n> Auto-generated on ${new Date().toISOString()}\n`,
        workspaceFiles: [],
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      expect(result.isFirstRun).toBe(false);
      expect(result.config.processLevelDefault).toBe('thorough');
      expect(result.config.reviewTimeoutMinutes).toBe(10);
    });

    it('does not recreate directory tree', async () => {
      const fs = createMockFS({
        codestudioExists: true,
        configContent: JSON.stringify(DEFAULT_CONFIG),
        contextContent: `# Project Context\n\n> Auto-generated on ${new Date().toISOString()}\n`,
        workspaceFiles: [],
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      await service.initialize();

      // mkdir should NOT be called for the root (it already exists)
      const mkdirCalls = (fs.mkdir as ReturnType<typeof vi.fn>).mock.calls;
      const rootCall = mkdirCalls.find((c) => (c[0] as string) === `/workspace/${WORKFLOW_DIR}`);
      expect(rootCall).toBeUndefined();
    });

    it('handles corrupt config.json gracefully', async () => {
      const fs = createMockFS({
        codestudioExists: true,
        configContent: 'not valid json{{{',
        workspaceFiles: [],
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const result = await service.initialize();

      // Should fall back to defaults
      expect(result.config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('isContextStale()', () => {
    it('returns true when context.md does not exist', async () => {
      const fs = createMockFS({ codestudioExists: true, workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const stale = await service.isContextStale();
      expect(stale).toBe(true);
    });

    it('returns false when context.md was generated recently', async () => {
      const recentDate = new Date().toISOString();
      const fs = createMockFS({
        codestudioExists: true,
        contextContent: `# Project Context\n\n> Auto-generated on ${recentDate}\n`,
        workspaceFiles: [],
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const stale = await service.isContextStale();
      expect(stale).toBe(false);
    });

    it('returns true when context.md is older than 24 hours', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const fs = createMockFS({
        codestudioExists: true,
        contextContent: `# Project Context\n\n> Auto-generated on ${oldDate}\n`,
        workspaceFiles: [],
      });

      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      const stale = await service.isContextStale();
      expect(stale).toBe(true);
    });
  });

  describe('createDirectoryTree()', () => {
    it('creates all required directories per DD-002', async () => {
      const fs = createMockFS({ workspaceFiles: [] });
      const service = new OnboardingService(
        fs,
        '/workspace',
        projectDetector,
        contextAnalyzer,
        contextSignalDetector,
      );

      await service.createDirectoryTree();

      const mkdirCalls = (fs.mkdir as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as string,
      );

      // Root
      expect(mkdirCalls).toContain('/workspace/.codestudio');

      // Workflow
      expect(mkdirCalls).toContain('/workspace/.codestudio/workflows/current');
      expect(mkdirCalls).toContain('/workspace/.codestudio/workflows/current/artifacts/specs');
      expect(mkdirCalls).toContain('/workspace/.codestudio/workflows/current/artifacts/plans');
      expect(mkdirCalls).toContain('/workspace/.codestudio/workflows/current/artifacts/reviews');
      expect(mkdirCalls).toContain('/workspace/.codestudio/workflows/current/artifacts/reports');

      // Knowledge
      expect(mkdirCalls).toContain('/workspace/.codestudio/knowledge');
      expect(mkdirCalls).toContain('/workspace/.codestudio/knowledge/adrs');

      // Agent customizations
      expect(mkdirCalls).toContain('/workspace/.codestudio/instructions');
      expect(mkdirCalls).toContain('/workspace/.codestudio/agents');
      expect(mkdirCalls).toContain('/workspace/.codestudio/skills');
      expect(mkdirCalls).toContain('/workspace/.codestudio/prompts');
      expect(mkdirCalls).toContain('/workspace/.codestudio/hooks');

      // Archive
      expect(mkdirCalls).toContain('/workspace/.codestudio/archive');
    });
  });
});
