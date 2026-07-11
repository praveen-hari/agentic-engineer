/**
 * Phase 1 — Append Serialization Tests
 *
 * These tests prove that concurrent append() calls are serialized
 * so no data is lost. This is the core bug: FileSystemService.append()
 * does read-modify-write without locking, so two concurrent appends
 * can both read the same "existing" content and the second write
 * overwrites the first append.
 *
 * We test at the InMemoryFileIO level (which is what EventStream uses
 * in tests) and at the FileSystemService level (production).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import { FileSystemService } from '../../services/file-system.service';
import { createMockVscode, createVscodeShim } from '../../test-utils/vscode-mock';

describe('Append Serialization', () => {
  // ─── InMemoryFileIO ──────────────────────────────────────────────

  describe('InMemoryFileIO — concurrent appends', () => {
    let fs: InMemoryFileIO;

    beforeEach(() => {
      fs = new InMemoryFileIO();
    });

    it('serializes concurrent appends so no data is lost', async () => {
      const path = '/project/events.jsonl';

      // Fire 10 concurrent appends — all should survive
      const promises = Array.from({ length: 10 }, (_, i) => fs.append(path, `line-${i}\n`));
      await Promise.all(promises);

      const content = await fs.read(path);
      const lines = content.trim().split('\n');

      // All 10 lines must be present — no data loss
      expect(lines).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(content).toContain(`line-${i}`);
      }
    });

    it('preserves order within sequential appends', async () => {
      const path = '/project/events.jsonl';

      await fs.append(path, 'first\n');
      await fs.append(path, 'second\n');
      await fs.append(path, 'third\n');

      const content = await fs.read(path);
      expect(content).toBe('first\nsecond\nthird\n');
    });

    it('handles concurrent appends to different files independently', async () => {
      const path1 = '/project/a.jsonl';
      const path2 = '/project/b.jsonl';

      await Promise.all([
        fs.append(path1, 'a1\n'),
        fs.append(path2, 'b1\n'),
        fs.append(path1, 'a2\n'),
        fs.append(path2, 'b2\n'),
      ]);

      const contentA = await fs.read(path1);
      const contentB = await fs.read(path2);

      expect(contentA).toContain('a1');
      expect(contentA).toContain('a2');
      expect(contentB).toContain('b1');
      expect(contentB).toContain('b2');
    });
  });

  // ─── FileSystemService ───────────────────────────────────────────

  describe('FileSystemService — concurrent appends', () => {
    let service: FileSystemService;
    let mock: ReturnType<typeof createMockVscode>;

    beforeEach(() => {
      mock = createMockVscode('/project');
      const vscode = createVscodeShim(mock);
      service = new FileSystemService(vscode);
    });

    it('serializes concurrent appends so no data is lost', async () => {
      const path = '/project/events.jsonl';

      // Fire 10 concurrent appends
      const promises = Array.from({ length: 10 }, (_, i) => service.append(path, `line-${i}\n`));
      await Promise.all(promises);

      const content = mock._files.get(path)?.content ?? '';
      const lines = content.trim().split('\n');

      // All 10 lines must be present
      expect(lines).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(content).toContain(`line-${i}`);
      }
    });

    it('serializes concurrent appendLine calls', async () => {
      const path = '/project/events.jsonl';

      const promises = Array.from({ length: 5 }, (_, i) => service.appendLine(path, `event-${i}`));
      await Promise.all(promises);

      const content = mock._files.get(path)?.content ?? '';
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(content).toContain(`event-${i}`);
      }
    });
  });
});
