/**
 * Phase 1 — ensureDirectory idempotency tests
 *
 * The current ensureDirectory() has a TOCTOU race: it checks exists()
 * then calls createDirectory(). Since createDirectory() is idempotent
 * in VS Code's API, the exists() check is unnecessary overhead.
 * After the fix, ensureDirectory() should just call createDirectory()
 * directly — always idempotent, no race.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FileSystemService } from '../../services/file-system.service';
import { createMockVscode, createVscodeShim } from '../../test-utils/vscode-mock';

describe('FileSystemService — ensureDirectory', () => {
  let service: FileSystemService;
  let mock: ReturnType<typeof createMockVscode>;

  beforeEach(() => {
    mock = createMockVscode('/project');
    const vscode = createVscodeShim(mock);
    service = new FileSystemService(vscode);
  });

  it('creates a directory that does not exist', async () => {
    await service.ensureDirectory('/project/.codestudio');
    expect(mock._files.get('/project/.codestudio')?.isDirectory).toBe(true);
  });

  it('is idempotent — calling twice does not throw', async () => {
    await service.ensureDirectory('/project/.codestudio');
    await expect(service.ensureDirectory('/project/.codestudio')).resolves.toBeUndefined();
  });

  it('concurrent calls to ensureDirectory do not throw', async () => {
    // Two concurrent calls — both should succeed without error
    await expect(
      Promise.all([
        service.ensureDirectory('/project/.codestudio'),
        service.ensureDirectory('/project/.codestudio'),
      ]),
    ).resolves.toBeDefined();

    expect(mock._files.get('/project/.codestudio')?.isDirectory).toBe(true);
  });
});
