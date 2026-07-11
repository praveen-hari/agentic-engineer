import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../../core/state-manager';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

describe('StateManager', () => {
  let fs: InMemoryFileIO;
  let manager: StateManager;

  const filePath = '/project/.codestudio/workflow.json';

  const sampleWorkflow: WorkflowDefinition = {
    id: 'wf-001',
    version: 1,
    objective: 'Fix typo in README',
    processLevel: 'light',
    detectedRisks: [],
    stages: [
      {
        id: 'plan',
        name: 'Plan',
        status: 'active',
        skippable: false,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
    ],
    qualityGates: [],
    approvals: [],
    activeSkills: [],
    skillActivationReason: {},
    state: {
      currentStage: 'plan',
      currentTask: null,
      tasksCompleted: 0,
      tasksTotal: 0,
      startedAt: '2026-07-11T10:00:00Z',
      lastActivityAt: '2026-07-11T10:00:00Z',
      status: 'active',
    },
  };

  beforeEach(() => {
    fs = new InMemoryFileIO();
    manager = new StateManager(fs, filePath);
  });

  describe('load', () => {
    it('returns null when the file does not exist (first run)', async () => {
      const state = await manager.load();
      expect(state).toBeNull();
    });

    it('loads a valid workflow from the file', async () => {
      await fs.mkdir('/project/.codestudio');
      await fs.write(filePath, JSON.stringify(sampleWorkflow));

      const state = await manager.load();
      expect(state).toEqual(sampleWorkflow);
    });

    it('returns null for corrupt JSON (recovery mode)', async () => {
      await fs.mkdir('/project/.codestudio');
      await fs.write(filePath, '{ this is not valid json');

      const state = await manager.load();
      expect(state).toBeNull();
    });
  });

  describe('save', () => {
    it('writes the workflow as JSON to the file', async () => {
      await manager.save(sampleWorkflow);

      const content = await fs.read(filePath);
      expect(JSON.parse(content)).toEqual(sampleWorkflow);
    });

    it('creates the directory if it does not exist', async () => {
      await manager.save(sampleWorkflow);
      expect(await fs.exists(filePath)).toBe(true);
    });

    it('overwrites existing content', async () => {
      await manager.save(sampleWorkflow);

      const updated: WorkflowDefinition = {
        ...sampleWorkflow,
        version: 2,
        objective: 'Updated objective',
      };
      await manager.save(updated);

      const content = await fs.read(filePath);
      expect(JSON.parse(content).version).toBe(2);
    });
  });

  describe('update', () => {
    it('loads, transforms, and saves atomically', async () => {
      await manager.save(sampleWorkflow);

      await manager.update((wf) => ({
        ...wf,
        version: 2,
        objective: 'Updated objective',
      }));

      const content = await fs.read(filePath);
      const loaded = JSON.parse(content);
      expect(loaded.version).toBe(2);
      expect(loaded.objective).toBe('Updated objective');
    });

    it('returns the updated state', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        version: wf.version + 1,
      }));

      expect(result.version).toBe(2);
    });

    it('throws if no workflow exists (cannot update null)', async () => {
      await expect(manager.update((wf) => wf)).rejects.toThrow();
    });

    it('bumps version on each update', async () => {
      await manager.save(sampleWorkflow);

      await manager.update((wf) => ({ ...wf, objective: 'v2' }));
      await manager.update((wf) => ({ ...wf, objective: 'v3' }));
      await manager.update((wf) => ({ ...wf, objective: 'v4' }));

      const content = await fs.read(filePath);
      const loaded = JSON.parse(content);
      expect(loaded.version).toBe(4);
    });
  });

  describe('version conflict detection', () => {
    it('detects version mismatch and rejects the save (optimistic concurrency)', async () => {
      await manager.save(sampleWorkflow);

      // Simulate another writer changing the file behind our back
      const externalUpdate = { ...sampleWorkflow, version: 5 };
      await fs.write(filePath, JSON.stringify(externalUpdate));

      // Our in-memory copy still thinks version is 1 — update should fail
      await expect(
        manager.update((wf) => ({ ...wf, objective: 'stale update' }), sampleWorkflow.version),
      ).rejects.toThrow(/version/i);
    });
  });
});
