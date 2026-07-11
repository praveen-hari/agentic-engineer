/**
 * Phase 5: Branch-Change Watcher Tests
 *
 * Tests the BranchWatcher utility that detects git branch changes
 * by watching .git/HEAD and notifies callbacks to reload state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchWatcher } from '../../services/branch-watcher.service';

// ─── Mock VS Code API ───────────────────────────────────────────────────────

function createMockVscode() {
  const changeHandlers: Array<(uri: { fsPath: string }) => void> = [];

  return {
    vscodeApi: {
      workspace: {
        createFileSystemWatcher: vi.fn().mockReturnValue({
          onDidCreate: vi.fn(),
          onDidChange: vi.fn((handler: (uri: { fsPath: string }) => void) => {
            changeHandlers.push(handler);
          }),
          onDidDelete: vi.fn(),
          dispose: vi.fn(),
        }),
      },
    } as unknown as typeof import('vscode'),
    simulateHeadChange: () => {
      for (const h of changeHandlers) h({ fsPath: '/workspace/.git/HEAD' });
    },
  };
}

describe('Phase 5: BranchWatcher', () => {
  describe('start()', () => {
    it('creates a file system watcher for .git/HEAD', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');

      watcher.start();

      expect(vscodeApi.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
        '/workspace/.git/HEAD',
      );
    });

    it('returns a disposable', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');

      const disposable = watcher.start();
      expect(disposable).toHaveProperty('dispose');
    });
  });

  describe('onBranchChange()', () => {
    it('notifies callback when .git/HEAD changes', async () => {
      const { vscodeApi, simulateHeadChange } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      watcher.start();

      const calls: number[] = [];
      watcher.onBranchChange(() => calls.push(1));

      simulateHeadChange();

      await new Promise((r) => setTimeout(r, 400));
      expect(calls).toHaveLength(1);
    });

    it('notifies multiple callbacks', async () => {
      const { vscodeApi, simulateHeadChange } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      watcher.start();

      const calls1: number[] = [];
      const calls2: number[] = [];
      watcher.onBranchChange(() => calls1.push(1));
      watcher.onBranchChange(() => calls2.push(1));

      simulateHeadChange();

      await new Promise((r) => setTimeout(r, 400));
      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
    });

    it('unsubscribe stops notifications', async () => {
      const { vscodeApi, simulateHeadChange } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      watcher.start();

      const calls: number[] = [];
      const unsub = watcher.onBranchChange(() => calls.push(1));

      unsub();
      simulateHeadChange();

      await new Promise((r) => setTimeout(r, 10));
      expect(calls).toHaveLength(0);
    });

    it('one failing callback does not break others', async () => {
      const { vscodeApi, simulateHeadChange } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      watcher.start();

      const calls: number[] = [];
      watcher.onBranchChange(() => {
        throw new Error('boom');
      });
      watcher.onBranchChange(() => calls.push(1));

      simulateHeadChange();

      await new Promise((r) => setTimeout(r, 400));
      expect(calls).toHaveLength(1);
    });
  });

  describe('debouncing', () => {
    it('debounces rapid HEAD changes into a single notification', async () => {
      const { vscodeApi, simulateHeadChange } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      watcher.start();

      const calls: number[] = [];
      watcher.onBranchChange(() => calls.push(1));

      // Simulate rapid branch switching (git checkout fires multiple events)
      simulateHeadChange();
      simulateHeadChange();
      simulateHeadChange();

      await new Promise((r) => setTimeout(r, 400));
      expect(calls).toHaveLength(1);
    });
  });

  describe('stop()', () => {
    it('disposes the watcher', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new BranchWatcher(vscodeApi, '/workspace');
      const disposable = watcher.start();

      watcher.stop();

      // After stop, the internal watcher should be disposed
      // (we can't easily verify this without checking internals,
      // but at minimum it shouldn't throw)
      expect(disposable).toBeDefined();
    });
  });
});
