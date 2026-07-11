import { describe, it, expect } from 'vitest';
import { GateRunner } from '../../core/gate-runner';
import type { WorkflowDefinition, QualityGate, Stage, StageStatus } from '../../core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGate(overrides: Partial<QualityGate> = {}): QualityGate {
  return {
    id: 'tests-pass',
    name: 'Tests Pass',
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GateRunner', () => {
  const runner = new GateRunner();

  describe('evaluateStageGates()', () => {
    it('returns empty array when no gates for stage', () => {
      const wf = makeWorkflow([]);
      const results = runner.evaluateStageGates(wf, 'verify');
      expect(results).toEqual([]);
    });

    it('evaluates pending automated gate as not passed', () => {
      const wf = makeWorkflow([makeGate()]);
      const results = runner.evaluateStageGates(wf, 'verify');

      expect(results).toHaveLength(1);
      expect(results[0].gateId).toBe('tests-pass');
      expect(results[0].passed).toBe(false);
    });

    it('evaluates passed gate as passed', () => {
      const wf = makeWorkflow([
        makeGate({ status: 'passed', result: { passedAt: new Date().toISOString() } }),
      ]);
      const results = runner.evaluateStageGates(wf, 'verify');

      expect(results[0].passed).toBe(true);
    });

    it('evaluates skipped gate as passed (non-blocking)', () => {
      const wf = makeWorkflow([makeGate({ status: 'skipped' })]);
      const results = runner.evaluateStageGates(wf, 'verify');

      expect(results[0].passed).toBe(true);
    });

    it('evaluates approval gate against approvals list', () => {
      const wf = makeWorkflow(
        [
          makeGate({
            id: 'spec-approved',
            type: 'approval',
            stage: 'define' as QualityGate['stage'],
          }),
        ],
        [
          {
            id: 'a1',
            level: 'explicit',
            artifact: 'spec',
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        ],
      );
      const results = runner.evaluateStageGates(wf, 'define');

      expect(results[0].passed).toBe(true);
    });

    it('approval gate fails when approval is pending', () => {
      const wf = makeWorkflow(
        [
          makeGate({
            id: 'spec-approved',
            type: 'approval',
            stage: 'define' as QualityGate['stage'],
          }),
        ],
        [{ id: 'a1', level: 'explicit', artifact: 'spec', status: 'pending' }],
      );
      const results = runner.evaluateStageGates(wf, 'define');

      expect(results[0].passed).toBe(false);
    });

    it('only returns gates for the specified stage', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'tests-pass', stage: 'verify' as QualityGate['stage'] }),
        makeGate({ id: 'code-review', stage: 'review' as QualityGate['stage'] }),
      ]);
      const results = runner.evaluateStageGates(wf, 'verify');

      expect(results).toHaveLength(1);
      expect(results[0].gateId).toBe('tests-pass');
    });
  });

  describe('areBlockingGatesPassing()', () => {
    it('returns true when no gates exist', () => {
      const wf = makeWorkflow([]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });

    it('returns false when blocking gate is pending', () => {
      const wf = makeWorkflow([makeGate({ blocking: true })]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(false);
    });

    it('returns true when blocking gate is passed', () => {
      const wf = makeWorkflow([makeGate({ blocking: true, status: 'passed' })]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });

    it('returns true when non-blocking gate is pending', () => {
      const wf = makeWorkflow([makeGate({ blocking: false })]);
      expect(runner.areBlockingGatesPassing(wf, 'verify')).toBe(true);
    });
  });

  describe('passGate()', () => {
    it('marks gate as passed with timestamp', () => {
      const wf = makeWorkflow([makeGate()]);
      const updated = runner.passGate(wf, 'tests-pass', 'All 42 tests pass');

      const gate = updated.qualityGates.find((g) => g.id === 'tests-pass');
      expect(gate?.status).toBe('passed');
      expect(gate?.result?.passedAt).toBeDefined();
      expect(gate?.result?.details).toBe('All 42 tests pass');
    });
  });

  describe('failGate()', () => {
    it('marks gate as failed with details', () => {
      const wf = makeWorkflow([makeGate()]);
      const updated = runner.failGate(wf, 'tests-pass', '3 tests failing');

      const gate = updated.qualityGates.find((g) => g.id === 'tests-pass');
      expect(gate?.status).toBe('failed');
      expect(gate?.result?.failedAt).toBeDefined();
      expect(gate?.result?.details).toBe('3 tests failing');
    });
  });

  describe('skipGate()', () => {
    it('marks gate as skipped with reason', () => {
      const wf = makeWorkflow([makeGate({ conditional: true })]);
      const updated = runner.skipGate(wf, 'tests-pass', 'No tests in project');

      const gate = updated.qualityGates.find((g) => g.id === 'tests-pass');
      expect(gate?.status).toBe('skipped');
    });
  });

  describe('getSummary()', () => {
    it('returns correct counts', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'passed' }),
        makeGate({ id: 'g2', status: 'failed' }),
        makeGate({ id: 'g3', status: 'pending' }),
        makeGate({ id: 'g4', status: 'skipped' }),
      ]);
      const summary = runner.getSummary(wf);

      expect(summary.total).toBe(4);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.skipped).toBe(1);
    });

    it('returns zeros for empty gates', () => {
      const wf = makeWorkflow([]);
      const summary = runner.getSummary(wf);

      expect(summary.total).toBe(0);
      expect(summary.passed).toBe(0);
    });
  });

  describe('getPendingGates()', () => {
    it('returns only pending gates for a stage', () => {
      const wf = makeWorkflow([
        makeGate({ id: 'g1', status: 'pending' }),
        makeGate({ id: 'g2', status: 'passed' }),
        makeGate({ id: 'g3', status: 'pending' }),
      ]);
      const pending = runner.getPendingGates(wf, 'verify');

      expect(pending).toHaveLength(2);
      expect(pending.map((g) => g.id)).toEqual(['g1', 'g3']);
    });
  });
});
