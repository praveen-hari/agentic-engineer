/**
 * Phase 3: StateManager Hardening Tests (TDD — RED first)
 *
 * Tests that fix:
 * 1. update() overwrites transformed state with current.state
 *    (silently reverts stage transitions made by the transform fn)
 * 2. update() should be the ONLY way to mutate state
 *    (save() should only be used for initial creation)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../../core/state-manager';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

describe('Phase 3: StateManager Hardening', () => {
  let fs: InMemoryFileIO;
  let manager: StateManager;

  const filePath = '/project/.codestudio/workflow.json';

  const sampleWorkflow: WorkflowDefinition = {
    id: 'wf-001',
    version: 1,
    objective: 'Add OAuth2',
    processLevel: 'standard',
    detectedRisks: [],
    stages: [
      {
        id: 'define',
        name: 'Define',
        status: 'active',
        skippable: false,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
      {
        id: 'plan',
        name: 'Plan',
        status: 'pending',
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
      currentStage: 'define',
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

  // ─── Bug Fix: update() must preserve transformed state ────────────

  describe('update() preserves transformed state', () => {
    it('preserves currentStage change from transform function', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        state: {
          ...wf.state,
          currentStage: 'plan', // Transform advances to plan
        },
      }));

      // BUG: Before fix, this would be 'define' because update()
      // spread ...current.state over the transformed state
      expect(result.state.currentStage).toBe('plan');
    });

    it('preserves status change from transform function', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        state: {
          ...wf.state,
          status: 'completed',
        },
      }));

      expect(result.state.status).toBe('completed');
    });

    it('preserves tasksCompleted change from transform function', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        state: {
          ...wf.state,
          tasksCompleted: 5,
          tasksTotal: 10,
        },
      }));

      expect(result.state.tasksCompleted).toBe(5);
      expect(result.state.tasksTotal).toBe(10);
    });

    it('still auto-updates lastActivityAt', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        state: {
          ...wf.state,
          currentStage: 'plan',
        },
      }));

      // lastActivityAt should be updated to now, not the original
      expect(result.state.lastActivityAt > sampleWorkflow.state.lastActivityAt).toBe(true);
    });

    it('still auto-bumps version', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        objective: 'Changed objective',
      }));

      expect(result.version).toBe(2);
    });

    it('preserves stage array changes from transform', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({
        ...wf,
        stages: wf.stages.map((s) =>
          s.id === 'define' ? { ...s, status: 'completed' as const } : s,
        ),
      }));

      expect(result.stages[0].status).toBe('completed');
    });

    it('preserves approval changes from transform', async () => {
      const wfWithApprovals: WorkflowDefinition = {
        ...sampleWorkflow,
        approvals: [
          {
            id: 'apr-1',
            level: 'explicit',
            artifact: 'spec',
            status: 'pending',
            reason: 'Spec review',
          },
        ],
      };
      await manager.save(wfWithApprovals);

      const result = await manager.update((wf) => ({
        ...wf,
        approvals: wf.approvals.map((a) =>
          a.id === 'apr-1'
            ? { ...a, status: 'approved' as const, approvedAt: new Date().toISOString() }
            : a,
        ),
      }));

      expect(result.approvals[0].status).toBe('approved');
    });
  });

  // ─── Version conflict detection ───────────────────────────────────

  describe('version conflict detection', () => {
    it('rejects update when expectedVersion does not match', async () => {
      await manager.save(sampleWorkflow);

      // Simulate external write bumping version to 5
      const external = { ...sampleWorkflow, version: 5 };
      await fs.write(filePath, JSON.stringify(external));

      await expect(manager.update((wf) => ({ ...wf, objective: 'stale' }), 1)).rejects.toThrow(
        /version/i,
      );
    });

    it('accepts update when expectedVersion matches', async () => {
      await manager.save(sampleWorkflow);

      const result = await manager.update((wf) => ({ ...wf, objective: 'fresh' }), 1);

      expect(result.objective).toBe('fresh');
    });

    it('consecutive updates bump version correctly', async () => {
      await manager.save(sampleWorkflow);

      await manager.update((wf) => ({ ...wf, objective: 'v2' }));
      await manager.update((wf) => ({ ...wf, objective: 'v3' }));
      const result = await manager.update((wf) => ({ ...wf, objective: 'v4' }));

      expect(result.version).toBe(4);
    });
  });

  // ─── Round-trip integrity ─────────────────────────────────────────

  describe('round-trip integrity', () => {
    it('update result matches what load() returns', async () => {
      await manager.save(sampleWorkflow);

      const updateResult = await manager.update((wf) => ({
        ...wf,
        state: { ...wf.state, currentStage: 'plan', status: 'active' },
        stages: wf.stages.map((s) =>
          s.id === 'define'
            ? { ...s, status: 'completed' as const }
            : s.id === 'plan'
              ? { ...s, status: 'active' as const }
              : s,
        ),
      }));

      const loaded = await manager.load();

      expect(loaded!.state.currentStage).toBe('plan');
      expect(loaded!.state.currentStage).toBe(updateResult.state.currentStage);
      expect(loaded!.stages[0].status).toBe('completed');
      expect(loaded!.version).toBe(updateResult.version);
    });
  });
});
