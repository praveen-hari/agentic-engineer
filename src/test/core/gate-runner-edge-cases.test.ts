/**
 * Edge-case tests for GateRunner.
 *
 * Covers: review gates, failed gates, mixed gate types, gate status
 * transitions, multiple gates per stage, conditional gates, and
 * summary edge cases.
 */
import { describe, it, expect } from 'vitest';
import { GateRunner } from '../../core/gate-runner';
import type {
  WorkflowDefinition,
  QualityGate,
  Stage,
  StageStatus,
  GateStatus,
  GateType,
} from '../../core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGate(overrides: Partial<QualityGate> = {}): QualityGate {
  return {
    id: 'test-gate',
    name: 'Test Gate',
    type: 'automated',
    status: 'pending',
    stage: 'verify' as QualityGate['stage'],
    blocking: true,
    conditional: false,
    ...overrides,
  };
}

function makeWorkflow(
  gates: QualityGate[] = [],
  approvals: WorkflowDefinition['approvals'] = [],
): WorkflowDefinition {
  return {
    id: 'test-wf',
    version: 1,
    objective: 'Test',
    processLevel: 'standard',
    detectedRisks: [],
    stages: [
      {
        id: 'define' as Stage['id'],
        name: 'Define',
        status: 'completed' as StageStatus,
        skippable: false,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
      {
        id: 'verify' as Stage['id'],
        name: 'Verify',
        status: 'active' as StageStatus,
        skippable: false,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
      {
        id: 'review' as Stage['id'],
        name: 'Review',
        status: 'pending' as StageStatus,
        skippable: false,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
    ],
    qualityGates: gates,
    approvals,
    activeSkills: [],
    skillActivationReason: {},
    state: {
      currentStage: 'verify',
      currentTask: null,
      tasksCompleted: 0,
      tasksTotal: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      status: 'active',
    },
  };
}

describe('GateRunner — Edge Cases', () => {
  const runner = new GateRunner();

  // ─── Review Gate Evaluation ───────────────────────────────────────

  describe('review gate evaluation', () => {
    it('review gate passes when matching approval is approved', () => {
      const wf = makeWorkflow(
        [makeGate({ id: 'code-review', type: 'review', stage: 'review' as QualityGate['stage'] })],
        [
          {
            id: 'a1',
            level: 'review',
            artifact: 'code-review',
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        ],
      );
      const results = runner.evaluateStageGates(wf, 'review');
      expect(results[0].passed).toBe(true);
    });

    it('review gate fails when no matching approval exists', () => {
      const wf = makeWorkflow(
        [makeGate({ id: 'code-review', type: 'review', stage: 'review' as QualityGate['stage'] })],
        [],
      );
      const results = runner.evaluateStageGates(wf, 'review');
      expect(results[0].passed).toBe(false);
    });

    it('review gate fails when approval is rejected', () => {
      const wf = makeWorkflow(
        [makeGate({ id: 'code-review', type: 'review', stage: 'review' as QualityGate['stage'] })],
        [{ id: 'a1', level: 'review', artifact: 'code-review', status: 'rejected' }],
      );
      const results = runner.evaluateStageGates(wf, 'review');
      expect(results[0].passed).toBe(false);
    });

    it('review gate with -review suffix matches approval without suffix', () => {
      const wf = makeWorkflow(
        [
          makeGate({
            id: 'security-review',
            type: 'review',
            stage: 'review' as QualityGate['stage'],
          }),
        ],
        [
          {
            id: 'a1',
            level: 'review',
            artifact: 'security',
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        ],
      );
      const results = runner.evaluateStageGates(wf, 'review');
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── Failed Gate Evaluation ───────────────────────────────────────

  describe('failed gate evaluation', () => {
    it('already-failed gate returns not passed', () => {
      const wf = makeWorkflow([
        makeGate({
          status: 'failed',
          result: { failedAt: new Date().toISOString(), details: '3 tests failing' },
        }),
      ]);
      const results = runner.evaluateStageGates(wf, 'verify');
      expect(results[0].passed).toBe(false);
      expect(results[0].details).toContain('3 tests failing');
    });

    it('failed gate preserves failure details', () => {
      const wf = makeWorkflow([
        makeGate({
          status: 'failed',
          result: { failedAt: '2026-01-01T00:00:00Z', details: 'Build error in module X' },
        }),
      ]);
      const results = runner.evaluateStageGates(wf, 'verify');
      expect(results[0].details).toContain('Build error in module X');
    });
  });

  // ─── Mixed Gate Types Per Stage ───────────────────────────────────

  describe('mixed gate types per stage', () => {
    it('evaluates automated + approval + review gates in same stage', () => {
      const wf = makeWorkflow(
        [
          makeGate({ id: 'tests-pass', type: 'automated', status: 'passed' }),
          makeGate({ id: 'spec-approved', type: 'approval', status: 'pending' }),
          makeGate({
            id: 'code-review',
            type: 'review',
            stage: 'verify' as QualityGate['stage'],
          }),
        ],
        [{ id: 'a1', level: 'explicit', artifact: 'spec', status: 'pending' }],
      );
      const results = runner.evaluateStageGates(wf, 'verify');

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true); // automated passed
      expect(results[1].passed).toBe(false); // approval pending
      expect(results[2].passed).toBe(false); // review no approval
    });
  });

  // ─── areBlockingGatesPassing Edge Cases ───────────────────────────

  describe('areBlockingGatesPassing edge cases', () => {
    it('returns true when all blocking gates are passed', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', blocking: true, status: 'passed' }),
        makeGate({ id: 'g2', blocking: true, status: 'passed' }),
      ]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });

    it('returns false when any blocking gate is failed', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', blocking: true, status: 'passed' }),
        makeGate({ id: 'g2', blocking: true, status: 'failed' }),
      ]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(false);
    });

    it('ignores non-blocking gates when checking blocking status', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', blocking: true, status: 'passed' }),
        makeGate({ id: 'g2', blocking: false, status: 'failed' }),
      ]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });

    it('skipped blocking gates count as passing', () => {
      const wf = makeWorkflow([makeGate({ id: 'g1', blocking: true, status: 'skipped' })]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });

    it('returns true for a stage with no gates at all', () => {
      const wf = makeWorkflow([makeGate({ id: 'g1', stage: 'review' as QualityGate['stage'] })]);
      // No gates for 'define' stage
      expect(runner.areBlockingGatesPassing(wf, 'define')).toBe(true);
    });
  });

  // ─── Gate Status Transitions ──────────────────────────────────────

  describe('gate status transitions', () => {
    it('passGate on already-passed gate overwrites timestamp', () => {
      const wf = makeWorkflow([
        makeGate({ status: 'passed', result: { passedAt: '2026-01-01T00:00:00Z' } }),
      ]);
      const updated = runner.passGate(wf, 'test-gate', 'Re-verified');
      const gate = updated.qualityGates[0];

      expect(gate.status).toBe('passed');
      expect(gate.result?.passedAt).not.toBe('2026-01-01T00:00:00Z');
      expect(gate.result?.details).toBe('Re-verified');
    });

    it('failGate on a passed gate changes status to failed', () => {
      const wf = makeWorkflow([makeGate({ status: 'passed' })]);
      const updated = runner.failGate(wf, 'test-gate', 'Regression found');
      const gate = updated.qualityGates[0];

      expect(gate.status).toBe('failed');
      expect(gate.result?.failedAt).toBeDefined();
    });

    it('skipGate preserves reason in details', () => {
      const wf = makeWorkflow([makeGate()]);
      const updated = runner.skipGate(wf, 'test-gate', 'Not applicable for this project');
      const gate = updated.qualityGates[0];

      expect(gate.status).toBe('skipped');
      expect(gate.result?.details).toBe('Not applicable for this project');
    });

    it('updateGateStatus does not affect other gates', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'pending' }),
        makeGate({ id: 'g2', status: 'pending' }),
      ]);
      const updated = runner.passGate(wf, 'g1', 'OK');

      expect(updated.qualityGates[0].status).toBe('passed');
      expect(updated.qualityGates[1].status).toBe('pending');
    });

    it('updateGateStatus on non-existent gate leaves workflow unchanged', () => {
      const wf = makeWorkflow([makeGate({ id: 'g1' })]);
      const updated = runner.passGate(wf, 'nonexistent', 'OK');

      expect(updated.qualityGates).toHaveLength(1);
      expect(updated.qualityGates[0].id).toBe('g1');
      expect(updated.qualityGates[0].status).toBe('pending');
    });
  });

  // ─── getPendingGates Edge Cases ───────────────────────────────────

  describe('getPendingGates edge cases', () => {
    it('returns empty when all gates are resolved', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'passed' }),
        makeGate({ id: 'g2', status: 'failed' }),
        makeGate({ id: 'g3', status: 'skipped' }),
      ]);
      expect(runner.getPendingGates(wf, 'verify')).toHaveLength(0);
    });

    it('only returns gates for the specified stage', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'pending', stage: 'verify' as QualityGate['stage'] }),
        makeGate({ id: 'g2', status: 'pending', stage: 'review' as QualityGate['stage'] }),
      ]);
      const pending = runner.getPendingGates(wf, 'verify');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('g1');
    });
  });

  // ─── getSummary Edge Cases ────────────────────────────────────────

  describe('getSummary edge cases', () => {
    it('handles all gates in same status', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'passed' }),
        makeGate({ id: 'g2', status: 'passed' }),
        makeGate({ id: 'g3', status: 'passed' }),
      ]);
      const summary = runner.getSummary(wf);
      expect(summary.total).toBe(3);
      expect(summary.passed).toBe(3);
      expect(summary.failed).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.skipped).toBe(0);
    });

    it('handles single gate', () => {
      const wf = makeWorkflow([makeGate({ status: 'failed' })]);
      const summary = runner.getSummary(wf);
      expect(summary.total).toBe(1);
      expect(summary.failed).toBe(1);
    });
  });

  // ─── Immutability ─────────────────────────────────────────────────

  describe('immutability', () => {
    it('passGate returns a new workflow object', () => {
      const wf = makeWorkflow([makeGate()]);
      const updated = runner.passGate(wf, 'test-gate');

      expect(wf.qualityGates[0].status).toBe('pending');
      expect(updated.qualityGates[0].status).toBe('passed');
      expect(wf).not.toBe(updated);
    });

    it('failGate returns a new workflow object', () => {
      const wf = makeWorkflow([makeGate()]);
      const updated = runner.failGate(wf, 'test-gate', 'Failed');

      expect(wf.qualityGates[0].status).toBe('pending');
      expect(updated.qualityGates[0].status).toBe('failed');
    });
  });

  // ─── Automated Gate Evaluation ────────────────────────────────────

  describe('automated gate evaluation', () => {
    it('pending automated gate evaluates as not passed', () => {
      const wf = makeWorkflow([makeGate({ type: 'automated', status: 'pending' })]);
      const results = runner.evaluateStageGates(wf, 'verify');
      expect(results[0].passed).toBe(false);
    });

    it('unknown gate type evaluates as not passed', () => {
      const wf = makeWorkflow([makeGate({ type: 'unknown-type' as GateType, status: 'pending' })]);
      const results = runner.evaluateStageGates(wf, 'verify');
      expect(results[0].passed).toBe(false);
      expect(results[0].details).toContain('Unknown gate type');
    });
  });
});
