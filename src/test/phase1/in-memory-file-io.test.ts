/**
 * Phase 1 — InMemoryFileIO readDir fix tests
 *
 * The current InMemoryFileIO.readDir() returns full relative paths
 * including nested subdirectories (e.g., "subdir/file.md" instead of
 * just "subdir"). The real vscode.workspace.fs.readDirectory() returns
 * only immediate children. This mismatch means tests pass with behavior
 * that fails in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';

describe('InMemoryFileIO — readDir', () => {
  let fs: InMemoryFileIO;

  beforeEach(() => {
    fs = new InMemoryFileIO();
  });

  it('returns only immediate children, not nested paths', async () => {
    await fs.write('/project/dir/file1.md', 'content1');
    await fs.write('/project/dir/file2.md', 'content2');
    await fs.write('/project/dir/sub/nested.md', 'nested');

    const entries = await fs.readDir('/project/dir');

    // Should return ['file1.md', 'file2.md', 'sub'] — not 'sub/nested.md'
    expect(entries).toContain('file1.md');
    expect(entries).toContain('file2.md');
    expect(entries).toContain('sub');
    expect(entries).not.toContain('sub/nested.md');
    expect(entries).toHaveLength(3);
  });

  it('does not duplicate directory names from multiple nested files', async () => {
    await fs.write('/project/dir/sub/a.md', 'a');
    await fs.write('/project/dir/sub/b.md', 'b');
    await fs.write('/project/dir/sub/deep/c.md', 'c');

    const entries = await fs.readDir('/project/dir');

    // 'sub' should appear exactly once, not three times
    expect(entries).toEqual(['sub']);
  });

  it('returns empty array for empty directory', async () => {
    await fs.mkdir('/project/empty');

    const entries = await fs.readDir('/project/empty');
    expect(entries).toEqual([]);
  });

  it('returns empty array for non-existent directory', async () => {
    const entries = await fs.readDir('/project/nonexistent');
    expect(entries).toEqual([]);
  });

  it('handles trailing slash in path', async () => {
    await fs.write('/project/dir/file.md', 'content');

    const withSlash = await fs.readDir('/project/dir/');
    const withoutSlash = await fs.readDir('/project/dir');

    expect(withSlash).toEqual(withoutSlash);
  });

  it('returns files at root level correctly', async () => {
    await fs.write('/project/a.json', '{}');
    await fs.write('/project/b.json', '{}');
    await fs.write('/project/sub/c.json', '{}');

    const entries = await fs.readDir('/project');

    expect(entries).toContain('a.json');
    expect(entries).toContain('b.json');
    expect(entries).toContain('sub');
    expect(entries).not.toContain('sub/c.json');
    expect(entries).toHaveLength(3);
  });
});
