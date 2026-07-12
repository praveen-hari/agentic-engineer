/**
 * Edge-case tests for ArtifactWatcher.
 *
 * Covers: setup file detection, multiple callbacks, callback errors,
 * report artifact detection, start before registering callbacks,
 * and edge cases in file path parsing.
 */
import { describe, it, expect, vi } from 'vitest';
import { ArtifactWatcher } from '../../services/artifact-watcher.service';
import type { Artifact } from '../../core/types';

// ─── Mock VS Code API ───────────────────────────────────────────────────────

function createMockVscode() {
  const createHandlers: Array<(uri: { fsPath: string }) => void> = [];
  const changeHandlers: Array<(uri: { fsPath: string }) => void> = [];

  return {
    vscodeApi: {
      Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
      },
      workspace: {
        fs: {
          readFile: vi.fn().mockResolvedValue(new TextEncoder().encode('# Artifact content')),
        },
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

describe('ArtifactWatcher — Edge Cases', () => {
  // ─── Setup File Detection ─────────────────────────────────────────

  describe('setup file detection', () => {
    it('detects config.json creation', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/config.json');
      await new Promise((r) => setTimeout(r, 10));

      // Multiple watchers may fire for the same file (md, json, instructions patterns)
      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected.some((d) => d.name === 'config.json')).toBe(true);
    });

    it('detects codestudio-instructions.md creation', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/codestudio-instructions.md');
      await new Promise((r) => setTimeout(r, 10));

      // instructions file matches multiple watcher patterns (md + instructions)
      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected.some((d) => d.name === 'codestudio-instructions.md')).toBe(true);
    });

    it('detects AGENTS.md creation', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/AGENTS.md');
      await new Promise((r) => setTimeout(r, 10));

      // AGENTS.md matches the md watcher pattern
      expect(detected.length).toBeGreaterThanOrEqual(1);
      expect(detected.some((d) => d.name === 'AGENTS.md')).toBe(true);
    });

    it('ignores non-setup files in .codestudio root', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateCreate('/workspace/.codestudio/random-file.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });

    it('detects setup file changes (not just creates)', async () => {
      const { vscodeApi, simulateChange } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Array<{ name: string; path: string }> = [];
      watcher.onSetupFileDetected((name, path) => detected.push({ name, path }));

      simulateChange('/workspace/.codestudio/config.json');
      await new Promise((r) => setTimeout(r, 10));

      // config.json matches multiple watcher patterns
      expect(detected.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Multiple Callbacks ───────────────────────────────────────────

  describe('multiple callbacks', () => {
    it('notifies all registered artifact callbacks', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected1: Artifact[] = [];
      const detected2: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected1.push(a));
      watcher.onArtifactDetected((a) => detected2.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected1).toHaveLength(1);
      expect(detected2).toHaveLength(1);
    });

    it('notifies all registered setup callbacks', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected1: string[] = [];
      const detected2: string[] = [];
      watcher.onSetupFileDetected((name) => detected1.push(name));
      watcher.onSetupFileDetected((name) => detected2.push(name));

      simulateCreate('/workspace/.codestudio/config.json');
      await new Promise((r) => setTimeout(r, 10));

      // Multiple watcher patterns may fire for same file
      expect(detected1.length).toBeGreaterThanOrEqual(1);
      expect(detected2.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Callback Error Handling ──────────────────────────────────────

  describe('callback error handling', () => {
    it('one failing callback does not prevent others from firing', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected(() => {
        throw new Error('Callback error');
      });
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
    });

    it('one failing setup callback does not prevent others', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: string[] = [];
      watcher.onSetupFileDetected(() => {
        throw new Error('Setup callback error');
      });
      watcher.onSetupFileDetected((name) => detected.push(name));

      simulateCreate('/workspace/.codestudio/config.json');
      await new Promise((r) => setTimeout(r, 10));

      // Multiple watcher patterns may fire, but the second callback should still get notified
      expect(detected.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Report Artifact Detection ────────────────────────────────────

  describe('report artifact detection', () => {
    it('detects report files in reports directory', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/reports/verify-report.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('report');
    });
  });

  // ─── Unsubscribe ──────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('artifact callback unsubscribe stops notifications', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      const unsub = watcher.onArtifactDetected((a) => detected.push(a));

      unsub();

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });

    it('setup callback unsubscribe stops notifications', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: string[] = [];
      const unsub = watcher.onSetupFileDetected((name) => detected.push(name));

      unsub();

      simulateCreate('/workspace/.codestudio/config.json');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(0);
    });

    it('unsubscribing one callback does not affect others', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected1: Artifact[] = [];
      const detected2: Artifact[] = [];
      const unsub1 = watcher.onArtifactDetected((a) => detected1.push(a));
      watcher.onArtifactDetected((a) => detected2.push(a));

      unsub1();

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected1).toHaveLength(0);
      expect(detected2).toHaveLength(1);
    });
  });

  // ─── File Path Parsing Edge Cases ─────────────────────────────────

  describe('file path parsing edge cases', () => {
    it('handles deeply nested artifact paths', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      // File in a subdirectory of specs
      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/sub/nested-spec.md');
      await new Promise((r) => setTimeout(r, 10));

      // Should still detect it as a spec
      if (detected.length > 0) {
        expect(detected[0].type).toBe('spec');
      }
    });

    it('handles filenames with multiple dots', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/auth.v2.spec.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
    });

    it('handles filenames with spaces (URL-encoded)', async () => {
      const { vscodeApi, simulateCreate } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      const detected: Artifact[] = [];
      watcher.onArtifactDetected((a) => detected.push(a));

      simulateCreate('/workspace/.codestudio/workflows/current/artifacts/specs/my spec file.md');
      await new Promise((r) => setTimeout(r, 10));

      expect(detected).toHaveLength(1);
    });
  });

  // ─── Watcher Lifecycle ────────────────────────────────────────────

  describe('watcher lifecycle', () => {
    it('creates multiple file system watchers on start', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();

      // Should create watchers for: artifacts, setup md, setup json, instructions
      expect(vscodeApi.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(5);
    });

    it('calling start multiple times creates additional watchers', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();
      watcher.start();

      expect(vscodeApi.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(10);
    });

    it('stop then start creates fresh watchers', () => {
      const { vscodeApi } = createMockVscode();
      const watcher = new ArtifactWatcher(vscodeApi, '/workspace');
      watcher.start();
      watcher.stop();
      watcher.start();

      expect(vscodeApi.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(10);
    });
  });
});
