/**
 * Tests for the StateManager mutex (P0 fix).
 *
 * Verifies that concurrent update() calls are serialized so no
 * updates are lost. Without the mutex, two concurrent updates would
 * both read version N, transform independently, and the second save
 * would overwrite the first (lost update).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../../core/state-manager';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

describe('StateManager mutex', () => {
  let fs: InMemoryFileIO;
  let manager: StateManager;
  const filePath = '/project/.codestudio/workflow.json';

  const baseWorkflow: WorkflowDefinition = {
    id: 'wf-001',
    version: 1,
    objective: 'Test mutex',
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

  beforeEach(async () => {
    fs = new InMemoryFileIO();
    manager = new StateManager(fs, filePath);
    await manager.save(baseWorkflow);
  });

  it('serializes concurrent updates so no data is lost', async () => {
    // Fire 5 concurrent updates — each bumps tasksCompleted by 1.
    // Without the mutex, some would read the same version and overwrite each other.
    const promises = Array.from({ length: 5 }, (_, i) =>
      manager.update((wf) => ({
        ...wf,
        state: {
          ...wf.state,
          tasksCompleted: wf.state.tasksCompleted + 1,
        },
      })),
    );

    await Promise.all(promises);

    const final = await manager.load();
    // All 5 increments must survive — version should be 1 + 5 = 6
    expect(final!.version).toBe(6);
    expect(final!.state.tasksCompleted).toBe(5);
  });

  it('concurrent updates each see the result of the previous', async () => {
    // Each update appends to the objective string
    const results = await Promise.all([
      manager.update((wf) => ({ ...wf, objective: wf.objective + '-A' })),
      manager.update((wf) => ({ ...wf, objective: wf.objective + '-B' })),
      manager.update((wf) => ({ ...wf, objective: wf.objective + '-C' })),
    ]);

    const final = await manager.load();
    // All three appends must be present (order is guaranteed by the mutex)
    expect(final!.objective).toBe('Test mutex-A-B-C');
    expect(final!.version).toBe(4);
  });

  it('a failed update does not block subsequent updates', async () => {
    // First update throws
    const failPromise = manager
      .update(() => {
        throw new Error('Intentional failure');
      })
      .catch(() => {});

    // Second update should still succeed
    await failPromise;
    const result = await manager.update((wf) => ({
      ...wf,
      objective: 'After failure',
    }));

    expect(result.objective).toBe('After failure');
    expect(result.version).toBe(2);
  });

  it('concurrent updates with one failure still serialize the rest', async () => {
    const results: Array<WorkflowDefinition | null> = [];

    const p1 = manager.update((wf) => ({ ...wf, objective: 'first' })).then((r) => results.push(r));
    const p2 = manager
      .update(() => {
        throw new Error('boom');
      })
      .catch(() => results.push(null));
    const p3 = manager.update((wf) => ({ ...wf, objective: 'third' })).then((r) => results.push(r));

    await Promise.all([p1, p2, p3]);

    const final = await manager.load();
    expect(final!.objective).toBe('third');
    // version: 1 (base) + 1 (first) + 1 (third) = 3 (failed one doesn't bump)
    expect(final!.version).toBe(3);
  });
});
