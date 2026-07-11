import { describe, it, expect, beforeEach } from 'vitest';
import { FileSystemService } from '../../services/file-system.service';
import { createMockVscode, createVscodeShim } from '../../test-utils/vscode-mock';

describe('FileSystemService', () => {
  let mock: ReturnType<typeof createMockVscode>;
  let service: FileSystemService;

  beforeEach(() => {
    mock = createMockVscode('/project');
    const vscode = createVscodeShim(mock);
    service = new FileSystemService(vscode);
  });

  describe('ensureDirectory', () => {
    it('creates a directory if it does not exist', async () => {
      await service.ensureDirectory('/project/.codestudio');
      expect(mock._files.get('/project/.codestudio')?.isDirectory).toBe(true);
    });

    it('does not throw if directory already exists', async () => {
      await service.ensureDirectory('/project/.codestudio');
      await expect(service.ensureDirectory('/project/.codestudio')).resolves.toBeUndefined();
    });
  });

  describe('writeJson / readJson', () => {
    it('writes and reads JSON data', async () => {
      const data = { name: 'test', value: 42 };
      await service.writeJson('/project/.codestudio/workflow.json', data);
      const result = await service.readJson<{ name: string; value: number }>(
        '/project/.codestudio/workflow.json',
      );
      expect(result).toEqual(data);
    });

    it('returns null for missing file', async () => {
      const result = await service.readJson('/project/.codestudio/nonexistent.json');
      expect(result).toBeNull();
    });
  });

  describe('appendLine / readLines', () => {
    it('appends lines to a file', async () => {
      await service.appendLine('/project/.codestudio/events.jsonl', '{"id":"1"}');
      await service.appendLine('/project/.codestudio/events.jsonl', '{"id":"2"}');
      const lines = await service.readLines('/project/.codestudio/events.jsonl');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('{"id":"1"}');
      expect(lines[1]).toBe('{"id":"2"}');
    });

    it('returns empty array for missing file', async () => {
      const lines = await service.readLines('/project/.codestudio/nonexistent.jsonl');
      expect(lines).toEqual([]);
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      await service.writeJson('/project/.codestudio/workflow.json', { ok: true });
      expect(await service.exists('/project/.codestudio/workflow.json')).toBe(true);
    });

    it('returns false for missing file', async () => {
      expect(await service.exists('/project/.codestudio/nonexistent.json')).toBe(false);
    });
  });

  describe('listFiles', () => {
    it('lists files in a directory', async () => {
      await service.ensureDirectory('/project/.codestudio');
      await service.writeJson('/project/.codestudio/workflow.json', {});
      await service.writeJson('/project/.codestudio/context.json', {});
      const files = await service.listFiles('/project/.codestudio');
      expect(files).toContain('workflow.json');
      expect(files).toContain('context.json');
    });
  });

  describe('FileIO interface implementation', () => {
    it('implements read() from FileIO', async () => {
      await service.write('/project/.codestudio/test.txt', 'hello');
      const content = await service.read('/project/.codestudio/test.txt');
      expect(content).toBe('hello');
    });

    it('implements write() from FileIO', async () => {
      await service.write('/project/.codestudio/test.txt', 'content');
      expect(mock._files.get('/project/.codestudio/test.txt')?.content).toBe('content');
    });

    it('implements append() from FileIO', async () => {
      await service.write('/project/.codestudio/test.txt', 'a');
      await service.append('/project/.codestudio/test.txt', 'b');
      expect(mock._files.get('/project/.codestudio/test.txt')?.content).toBe('ab');
    });

    it('implements mkdir() from FileIO', async () => {
      await service.mkdir('/project/.codestudio/new-dir');
      expect(mock._files.get('/project/.codestudio/new-dir')?.isDirectory).toBe(true);
    });

    it('implements readDir() from FileIO', async () => {
      await service.ensureDirectory('/project/.codestudio');
      await service.writeJson('/project/.codestudio/a.json', {});
      await service.writeJson('/project/.codestudio/b.json', {});
      const entries = await service.readDir('/project/.codestudio');
      expect(entries).toContain('a.json');
      expect(entries).toContain('b.json');
    });
  });
});
