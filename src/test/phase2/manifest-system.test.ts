/**
 * Phase 2: Manifest System Tests (TDD — RED first)
 *
 * Tests the PDF-xref-inspired manifest that fixes:
 * 1. Artifact IDs are always the same per type ("spec-spec")
 * 2. listAll() fabricates timestamps and resets status to 'draft'
 * 3. Three different ID generation strategies across save/listAll/watcher
 * 4. Approval status lost on every listAll() call
 *
 * The manifest (manifest.json) is the single source of truth for
 * artifact metadata: IDs, timestamps, and status.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { Artifact } from '../../core/types';

describe('Phase 2: Manifest System', () => {
  let fs: InMemoryFileIO;
  let manager: ArtifactManager;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    manager = new ArtifactManager(fs, '/workspace');
  });

  // ─── Bug Fix 1: Unique IDs ──────────────────────────────────────────

  describe('unique artifact IDs', () => {
    it('save() generates a unique ID (not "spec-spec")', async () => {
      const artifact = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      expect(artifact.id).not.toBe('spec-spec');
      expect(artifact.id.length).toBeGreaterThan(5);
    });

    it('two saves of the same type produce the same ID (overwrite, not duplicate)', async () => {
      const a1 = await manager.save('spec', 'Auth Spec v1', '# V1', 'define');
      const a2 = await manager.save('spec', 'Auth Spec v2', '# V2', 'define');
      // Same type = same file = same manifest entry = same ID
      expect(a2.id).toBe(a1.id);
    });

    it('different types produce different IDs', async () => {
      const spec = await manager.save('spec', 'Spec', '# Spec', 'define');
      const plan = await manager.save('plan', 'Plan', '# Plan', 'plan');
      expect(spec.id).not.toBe(plan.id);
    });
  });

  // ─── Bug Fix 2: Persistent timestamps ───────────────────────────────

  describe('persistent timestamps via manifest', () => {
    it('listAll() returns the ORIGINAL createdAt from save(), not a new timestamp', async () => {
      const saved = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      const originalCreatedAt = saved.createdAt;

      // Wait a tick to ensure Date.now() would differ
      await new Promise((r) => setTimeout(r, 5));

      const listed = await manager.listAll();
      expect(listed).toHaveLength(1);
      expect(listed[0].createdAt).toBe(originalCreatedAt);
    });

    it('save() updates updatedAt but preserves createdAt on overwrite', async () => {
      const v1 = await manager.save('spec', 'Auth Spec', '# V1', 'define');
      const originalCreatedAt = v1.createdAt;

      await new Promise((r) => setTimeout(r, 5));

      const v2 = await manager.save('spec', 'Auth Spec v2', '# V2', 'define');
      expect(v2.createdAt).toBe(originalCreatedAt);
      expect(v2.updatedAt >= v1.updatedAt).toBe(true);
    });
  });

  // ─── Bug Fix 3: Persistent status ──────────────────────────────────

  describe('persistent artifact status via manifest', () => {
    it('save() creates artifact with status "draft"', async () => {
      const artifact = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      expect(artifact.status).toBe('draft');
    });

    it('updateStatus() changes status and listAll() preserves it', async () => {
      const artifact = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      await manager.updateStatus(artifact.id, 'approved');

      const listed = await manager.listAll();
      expect(listed[0].status).toBe('approved');
    });

    it('updateStatus() to pending-review is preserved across listAll()', async () => {
      const artifact = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      await manager.updateStatus(artifact.id, 'pending-review');

      const listed = await manager.listAll();
      expect(listed[0].status).toBe('pending-review');
    });

    it('updateStatus() to rejected is preserved', async () => {
      const artifact = await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      await manager.updateStatus(artifact.id, 'rejected');

      const listed = await manager.listAll();
      expect(listed[0].status).toBe('rejected');
    });
  });

  // ─── Bug Fix 4: Consistent IDs across save/list ────────────────────

  describe('ID consistency between save() and listAll()', () => {
    it('listAll() returns the same ID that save() returned', async () => {
      const saved = await manager.save('spec', 'Auth Spec', '# Spec', 'define');

      const listed = await manager.listAll();
      expect(listed[0].id).toBe(saved.id);
    });

    it('listAll() returns the same title that save() was given', async () => {
      await manager.save('spec', 'OAuth2 Authentication', '# Spec', 'define');

      const listed = await manager.listAll();
      expect(listed[0].title).toBe('OAuth2 Authentication');
    });

    it('listAll() returns the same stage that save() was given', async () => {
      await manager.save('spec', 'Auth Spec', '# Spec', 'define');

      const listed = await manager.listAll();
      expect(listed[0].stage).toBe('define');
    });
  });

  // ─── Manifest persistence ──────────────────────────────────────────

  describe('manifest file on disk', () => {
    it('save() writes manifest.json to the artifacts directory', async () => {
      await manager.save('spec', 'Auth Spec', '# Spec', 'define');

      const manifestPath = '/workspace/.codestudio/workflows/current/artifacts/manifest.json';
      expect(await fs.exists(manifestPath)).toBe(true);
    });

    it('manifest.json contains the artifact entry', async () => {
      await manager.save('spec', 'Auth Spec', '# Spec', 'define');

      const manifestPath = '/workspace/.codestudio/workflows/current/artifacts/manifest.json';
      const content = await fs.read(manifestPath);
      const manifest = JSON.parse(content);

      expect(manifest.version).toBe(1);
      expect(manifest.artifacts).toHaveLength(1);
      expect(manifest.artifacts[0].type).toBe('spec');
      expect(manifest.artifacts[0].title).toBe('Auth Spec');
    });

    it('multiple saves update the manifest correctly', async () => {
      await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      await manager.save('plan', 'Impl Plan', '# Plan', 'plan');

      const manifestPath = '/workspace/.codestudio/workflows/current/artifacts/manifest.json';
      const content = await fs.read(manifestPath);
      const manifest = JSON.parse(content);

      expect(manifest.artifacts).toHaveLength(2);
      const types = manifest.artifacts.map((a: { type: string }) => a.type);
      expect(types).toContain('spec');
      expect(types).toContain('plan');
    });
  });

  // ─── listAll reads from manifest, not filesystem scan ──────────────

  describe('listAll() reads from manifest', () => {
    it('returns empty array when no manifest exists', async () => {
      const artifacts = await manager.listAll();
      expect(artifacts).toEqual([]);
    });

    it('returns artifacts from manifest even if readDir would find different files', async () => {
      // Save a spec through the proper channel
      const saved = await manager.save('spec', 'Auth Spec', '# Spec', 'define');

      // Verify listAll returns manifest data, not filesystem scan data
      const listed = await manager.listAll();
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(saved.id);
      expect(listed[0].status).toBe('draft');
    });
  });

  // ─── update() preserves manifest ───────────────────────────────────

  describe('update() preserves manifest metadata', () => {
    it('update() changes content but preserves ID and status in manifest', async () => {
      const original = await manager.save('spec', 'Auth Spec', '# V1', 'define');
      await manager.updateStatus(original.id, 'approved');

      const updated = await manager.update(original, '# V2');

      // ID preserved
      expect(updated.id).toBe(original.id);

      // Status preserved in manifest
      const listed = await manager.listAll();
      expect(listed[0].status).toBe('approved');

      // Content updated
      const content = await manager.read(updated);
      expect(content).toBe('# V2');
    });

    it('update() bumps updatedAt in manifest', async () => {
      const original = await manager.save('spec', 'Auth Spec', '# V1', 'define');

      await new Promise((r) => setTimeout(r, 5));

      await manager.update(original, '# V2');

      const listed = await manager.listAll();
      expect(listed[0].updatedAt > original.updatedAt).toBe(true);
    });
  });

  // ─── clearAll for workflow reset ───────────────────────────────────

  describe('clearAll()', () => {
    it('clears the manifest', async () => {
      await manager.save('spec', 'Auth Spec', '# Spec', 'define');
      await manager.save('plan', 'Plan', '# Plan', 'plan');

      await manager.clearAll();

      const listed = await manager.listAll();
      expect(listed).toEqual([]);
    });
  });
});
