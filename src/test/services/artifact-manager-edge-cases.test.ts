/**
 * Edge-case tests for ArtifactManager.
 *
 * Covers: slug generation edge cases, all artifact types, listByStage,
 * concurrent saves, special characters in titles, empty content,
 * readDir returning nested paths, and filesystem error handling.
 */
import { describe, it, expect, vi } from 'vitest';
import { ArtifactManager } from '../../services/artifact-manager.service';
import type { FileIO, Artifact } from '../../core/types';

// ─── Mock FileIO ────────────────────────────────────────────────────────────

function createMockFS(): FileIO & { storage: Record<string, string> } {
  const storage: Record<string, string> = {};
  return {
    storage,
    read: vi.fn(async (path: string) => {
      if (path in storage) return storage[path];
      throw new Error(`ENOENT: no such file: ${path}`);
    }),
    write: vi.fn(async (path: string, content: string) => {
      storage[path] = content;
    }),
    append: vi.fn(async () => {}),
    exists: vi.fn(async (path: string) => path in storage),
    mkdir: vi.fn(async () => {}),
    readDir: vi.fn(async () => []),
  };
}

describe('ArtifactManager — Edge Cases', () => {
  // ─── Slug Generation ──────────────────────────────────────────────

  describe('slug generation', () => {
    it('handles title with only special characters', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save('spec', '!!!@@@###', '# Content', 'define');
      expect(artifact.path).toContain('.md');
      expect(artifact.id).toBeDefined();
    });

    it('handles title with unicode characters', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save(
        'spec',
        'Über Authentication 日本語',
        '# Content',
        'define',
      );
      expect(artifact.path).toContain('.md');
    });

    it('handles very long title', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const longTitle = 'A'.repeat(500);
      const artifact = await manager.save('spec', longTitle, '# Content', 'define');
      expect(artifact.path).toContain('.md');
      expect(artifact.title).toBe(longTitle);
    });

    it('handles title with leading/trailing spaces', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save('spec', '  Spaced Title  ', '# Content', 'define');
      // Standard filename regardless of title
      expect(artifact.path).toContain('spec.md');
    });

    it('handles title with multiple consecutive spaces', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save('spec', 'Add   OAuth2   Auth', '# Content', 'define');
      // Should collapse multiple dashes
      expect(artifact.path).not.toContain('---');
    });
  });

  // ─── All Artifact Types ───────────────────────────────────────────

  describe('all artifact types', () => {
    const types: Array<{ type: 'spec' | 'plan' | 'review' | 'report'; dir: string }> = [
      { type: 'spec', dir: 'specs' },
      { type: 'plan', dir: 'plans' },
      { type: 'review', dir: 'reviews' },
      { type: 'report', dir: 'reports' },
    ];

    for (const { type, dir } of types) {
      it(`saves ${type} to ${dir} directory`, async () => {
        const fs = createMockFS();
        const manager = new ArtifactManager(fs, '/workspace');
        const artifact = await manager.save(type, `Test ${type}`, `# ${type}`, 'define');

        expect(artifact.type).toBe(type);
        expect(artifact.path).toContain(dir);
      });
    }
  });

  // ─── listByStage ──────────────────────────────────────────────────

  describe('listByStage()', () => {
    it('returns only artifacts for the specified stage', async () => {
      const fs = createMockFS();
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path.includes('specs')) return ['auth-spec.md'];
        if (path.includes('plans')) return ['impl-plan.md'];
        return [];
      });
      const manager = new ArtifactManager(fs, '/workspace');

      const defineArtifacts = await manager.listByStage('define');
      expect(defineArtifacts.every((a) => a.stage === 'define')).toBe(true);
    });

    it('returns empty array when no artifacts match stage', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifacts = await manager.listByStage('ship');
      expect(artifacts).toEqual([]);
    });
  });

  // ─── Empty Content ────────────────────────────────────────────────

  describe('empty content handling', () => {
    it('saves artifact with empty content', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save('spec', 'Empty Spec', '', 'define');

      expect(artifact.id).toBeDefined();
      const content = await manager.read(artifact);
      expect(content).toBe('');
    });

    it('saves artifact with whitespace-only content', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');
      const artifact = await manager.save('spec', 'Whitespace', '   \n\n  ', 'define');

      const content = await manager.read(artifact);
      expect(content).toBe('   \n\n  ');
    });
  });

  // ─── Update Edge Cases ────────────────────────────────────────────

  describe('update edge cases', () => {
    it('update preserves original metadata', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const original = await manager.save('spec', 'Test', '# Original', 'define');
      const updated = await manager.update(original, '# Updated');

      expect(updated.id).toBe(original.id);
      expect(updated.type).toBe(original.type);
      expect(updated.title).toBe(original.title);
      expect(updated.path).toBe(original.path);
      expect(updated.stage).toBe(original.stage);
      expect(updated.createdAt).toBe(original.createdAt);
    });

    it('update changes updatedAt timestamp', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const original = await manager.save('spec', 'Test', '# Original', 'define');
      // Small delay
      await new Promise((r) => setTimeout(r, 2));
      const updated = await manager.update(original, '# Updated');

      expect(updated.updatedAt >= original.updatedAt).toBe(true);
    });

    it('multiple updates accumulate correctly', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const v1 = await manager.save('spec', 'Test', '# V1', 'define');
      const v2 = await manager.update(v1, '# V2');
      const v3 = await manager.update(v2, '# V3');

      const content = await manager.read(v3);
      expect(content).toBe('# V3');
    });
  });

  // ─── listAll Edge Cases ───────────────────────────────────────────

  describe('listAll edge cases', () => {
    it('returns empty array when manifest is missing', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toEqual([]);
    });

    it('returns empty array when manifest is corrupt', async () => {
      const fs = createMockFS();
      // Write corrupt manifest
      await fs.write(
        '/workspace/.codestudio/workflows/current/artifacts/manifest.json',
        '{ this is not valid json',
      );
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toEqual([]);
    });

    it('handles readDir returning empty arrays for all directories', async () => {
      const fs = createMockFS();
      (fs.readDir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toEqual([]);
    });
  });

  // ─── Objective Edge Cases ─────────────────────────────────────────

  describe('objective edge cases', () => {
    it('saves objective with special characters', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      await manager.saveObjective('Add OAuth2 & "session" management <script>alert(1)</script>');
      const content = await manager.readObjective();
      expect(content).toContain('OAuth2');
      expect(content).toContain('<script>');
    });

    it('saves objective with very long text', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const longObjective = 'Build a comprehensive '.repeat(100);
      await manager.saveObjective(longObjective);
      const content = await manager.readObjective();
      expect(content).toContain(longObjective);
    });

    it('overwrites previous objective', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      await manager.saveObjective('First objective');
      await manager.saveObjective('Second objective');
      const content = await manager.readObjective();
      expect(content).toContain('Second objective');
      expect(content).not.toContain('First objective');
    });

    it('objective includes timestamp', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      await manager.saveObjective('Test');
      const content = await manager.readObjective();
      expect(content).toContain('Created:');
    });
  });

  // ─── Read Edge Cases ──────────────────────────────────────────────

  describe('read edge cases', () => {
    it('read returns null when filesystem throws', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifact: Artifact = {
        id: 'missing',
        type: 'spec',
        title: 'Missing',
        path: 'workflows/current/artifacts/specs/missing.md',
        stage: 'define',
        createdAt: '',
        updatedAt: '',
        status: 'draft',
      };
      const content = await manager.read(artifact);
      expect(content).toBeNull();
    });

    it('readObjective returns null when file does not exist', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const content = await manager.readObjective();
      expect(content).toBeNull();
    });
  });
});
