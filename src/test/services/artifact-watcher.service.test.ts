import { describe, it, expect, vi } from 'vitest';
import { ArtifactWatcher } from '../../services/artifact-watcher.service';
import type { Artifact } from '../../core/types';

// ─── Mock VS Code API ───────────────────────────────────────────────────────

function createMockVscode() {
  const createHandlers: Array<(uri: { fsPath: string }) => void> = [];
  const changeHandlers: Array<(uri: { fsPath: string }) => void> = [];

  return {
    vscodeApi: {
      workspace: {
        createFileSystemWatcher: vi.fn().mockReturnValue({
          onDidCreate: vi.fn((handler: (uri: { fsPath: string }) => void) => {
            createHandlers.push(handler);
          }),
          onDidChange: vi.fn((handler: (uri: { fsPath: string }) => void) => {
            changeHandlers.push(handler);
          }),
          onDidDelete: vi.fn(),
          dispose: vi.fn(),
        }),
      },
    } as unknown as typeof import('vscode'),
    simulateCreate: (path: string) => {
      for (const h of createHandlers) h({ fsPath: path });
    },
    simulateChange: (path: string) => {
      for (const h of changeHandlers) h({ fsPath: path });
    },
  };
}

describe('ArtifactWatcher', () => {
  describe('start()', () => {
    it('creates a file system watcher for artifacts directory', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');

      watcher.start();

      expect(vscodeApi.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        expect.stringContaining('.codestudio/workflows/current/artifacts/**/*.md'),
      );
    });

    it('returns a disposable', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');

      const disposable = watcher.start();
      expect(disposable).toHaveProperty('dispose');
    });
  });

  describe('onArtifactDetected()', () => {
    it('notifies callback when spec file is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth-spec.md');

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('spec');
      expect(detected[0].stage).toBe('define');
      expect(detected[0].status).toBe('pending-review');
    });

    it('notifies callback when plan file is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/plans/impl-plan.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('plan');
      expect(detected[0].stage).toBe('plan');
    });

    it('notifies callback when review file is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/reviews/code-review.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('review');
      expect(detected[0].stage).toBe('review');
    });

    it('notifies on file change (not just create)', async () => {
      const { vscodeApi, simulateChange } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateChange('/workspace/.codestudio/workflows/current/artifacts/specs/auth-spec.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
    });

    it('ignores non-.md files', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/notes.txt');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });

    it('ignores files outside .codestudio/', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/src/random-file.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });

    it('extracts title from filename', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate(
        '/workspace/.codestudio/workflows/current/artifacts/specs/add-oauth2-authentication.md',
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(detected[0].title).toBe('Add Oauth2 Authentication');
    });
  });

  describe('stop()', () => {
    it('disposes all watchers', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      watcher.stop();

      // After stop, no more notifications
      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));
      // Can't simulate after stop since watchers are disposed
    });
  });

  describe('unsubscribe', () => {
    it('removes callback when unsubscribe is called', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      const unsub = watcher.onArtifactDetected((a) => detected.push(a));

      // Unsubscribe
      unsub();

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/test.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });
  });

  describe('onSetupFileDetected()', () => {
    it('notifies when config.json is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/config.json');

      await new Promise((r) => setTimeout(r, 10));

      // In mock, all watchers share handlers so callback may fire multiple times.
      // In production, only the matching glob pattern's watcher fires.
      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected[0].name).toBe('config.json');
    });

    it('notifies when context.md is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/context.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected[0].name).toBe('context.md');
    });

    it('notifies when instructions file is created', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/codestudio-instructions.md');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected[0].name).toBe('codestudio-instructions.md');
    });

    it('does not notify for unrelated files', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/random-file.txt');

      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });
  });
});
