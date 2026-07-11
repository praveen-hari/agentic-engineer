import { describe, it, expect, vi } from 'vitest';
import { ArtifactManager } from '../../services/artifact-manager.service';
import type { FileIO } from '../../core/types';

// ─── Mock FileIO ────────────────────────────────────────────────────────────

function createMockFS(): FileIO {
  const storage: Record<string, string> = {};
  return {
    read: vi.fn(async (path: string) => {
      if (path in storage) return storage[path];
      throw new Error(`File not found: ${path}`);
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

describe('ArtifactManager', () => {
  describe('save()', () => {
    it('saves a spec artifact to the correct directory', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifact = await manager.save('spec', 'User Authentication', '# Spec\n\nContent', 'define');

      expect(artifact.type).toBe('spec');
      expect(artifact.title).toBe('User Authentication');
      expect(artifact.path).toContain('specs/');
      expect(artifact.path).toContain('user-authentication.md');
      expect(artifact.stage).toBe('define');
      expect(artifact.status).toBe('draft');
      expect(fs.write).toHaveBeenCalled();
    });

    it('saves a plan artifact to plans directory', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifact = await manager.save('plan', 'Implementation Plan', '# Plan', 'plan');

      expect(artifact.path).toContain('plans/');
      expect(artifact.path).toContain('implementation-plan.md');
    });

    it('saves a review artifact to reviews directory', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifact = await manager.save('review', 'Code Review', '# Review', 'review');

      expect(artifact.path).toContain('reviews/');
    });

    it('generates correct slug for title', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifact = await manager.save('spec', 'Add OAuth2 & Session Management!', '# Spec', 'define');

      expect(artifact.path).toContain('add-oauth2-session-management');
    });
  });

  describe('read()', () => {
    it('reads artifact content from disk', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      // Save first
      const artifact = await manager.save('spec', 'Test', '# Test Content', 'define');

      // Read back
      const content = await manager.read(artifact);
      expect(content).toBe('# Test Content');
    });

    it('returns null for missing artifact', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const content = await manager.read({
        id: 'missing',
        type: 'spec',
        title: 'Missing',
        path: 'workflows/current/artifacts/specs/missing.md',
        stage: 'define',
        createdAt: '',
        updatedAt: '',
        status: 'draft',
      });
      expect(content).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates artifact content and writes to disk', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const original = await manager.save('spec', 'Test', '# Original', 'define');
      const updated = await manager.update(original, '# Updated');

      // updatedAt is refreshed (may be same ms in fast tests)
      expect(updated.updatedAt).toBeDefined();
      expect(fs.write).toHaveBeenCalledTimes(2);

      // Verify the updated content was written
      const content = await manager.read(updated);
      expect(content).toBe('# Updated');
    });
  });

  describe('listAll()', () => {
    it('returns empty array when no artifacts exist', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toEqual([]);
    });

    it('lists artifacts from all directories', async () => {
      const fs = createMockFS();
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path.includes('specs')) return ['auth-spec.md'];
        if (path.includes('plans')) return ['impl-plan.md'];
        return [];
      });
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toHaveLength(2);
      expect(artifacts[0].type).toBe('spec');
      expect(artifacts[1].type).toBe('plan');
    });

    it('ignores non-markdown files', async () => {
      const fs = createMockFS();
      (fs.readDir as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path.includes('specs')) return ['spec.md', 'notes.txt', '.DS_Store'];
        return [];
      });
      const manager = new ArtifactManager(fs, '/workspace');

      const artifacts = await manager.listAll();
      expect(artifacts).toHaveLength(1);
    });
  });

  describe('saveObjective()', () => {
    it('saves objective to workflows/current/objective.md', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      await manager.saveObjective('Add user authentication with OAuth2');

      expect(fs.write).toHaveBeenCalledWith(
        '/workspace/.codestudio/workflows/current/objective.md',
        expect.stringContaining('Add user authentication with OAuth2'),
      );
    });
  });

  describe('readObjective()', () => {
    it('reads saved objective', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      await manager.saveObjective('Test objective');
      const content = await manager.readObjective();

      expect(content).toContain('Test objective');
    });

    it('returns null when no objective exists', async () => {
      const fs = createMockFS();
      const manager = new ArtifactManager(fs, '/workspace');

      const content = await manager.readObjective();
      expect(content).toBeNull();
    });
  });
});
