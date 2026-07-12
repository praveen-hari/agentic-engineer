import { describe, it, expect } from 'vitest';
import { StageExecutor } from '../../core/stage-executor';
import { SkillRegistry } from '../../core/skill-registry';
import type { WorkflowDefinition, Stage, StageStatus, Artifact } from '../../core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStage(id: string, status: StageStatus = 'pending'): Stage {
  return {
    id: id as Stage['id'],
    name: id.charAt(0).toUpperCase() + id.slice(1),
    status,
    skippable: true,
    entryConditions: [],
    exitConditions: [],
    artifacts: [],
  };
}

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'test-wf',
    version: 1,
    objective: 'Test objective',
    processLevel: 'standard',
    detectedRisks: [],
    stages: [
      makeStage('define', 'active'),
      makeStage('plan', 'pending'),
      makeStage('build', 'pending'),
      makeStage('verify', 'pending'),
      makeStage('review', 'pending'),
      makeStage('ship', 'pending'),
    ],
    qualityGates: [
      {
        id: 'spec-approved',
        name: 'Spec Approved',
        type: 'approval',
        status: 'pending',
        stage: 'define' as Stage['id'],
        blocking: true,
        conditional: false,
      },
      {
        id: 'tests-pass',
        name: 'Tests Pass',
        type: 'automated',
        status: 'pending',
        stage: 'verify' as Stage['id'],
        blocking: true,
        conditional: false,
      },
    ],
    approvals: [
      {
        id: 'approval-spec',
        level: 'explicit',
        artifact: 'spec',
        status: 'pending',
      },
    ],
    activeSkills: [
      'context-engineering',
      'git-workflow-and-versioning',
      'incremental-implementation',
      'spec-driven-development',
      'planning-and-task-breakdown',
      'test-driven-development',
    ],
    skillActivationReason: {},
    state: {
      currentStage: 'define',
      currentTask: null,
      tasksCompleted: 0,
      tasksTotal: 0,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      status: 'active',
    },
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'spec-test',
    type: 'spec',
    title: 'Test Spec',
    path: 'workflows/current/artifacts/specs/test-spec.md',
    stage: 'define',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StageExecutor', () => {
  const registry = new SkillRegistry();
  const executor = new StageExecutor(registry);

  describe('getStageAction()', () => {
    it('returns null when no stage is active', () => {
      const wf = makeWorkflow({
        stages: [makeStage('define', 'completed'), makeStage('plan', 'completed')],
        state: { ...makeWorkflow().state, currentStage: null },
      });
      expect(executor.getStageAction(wf)).toBeNull();
    });

    it('returns action for active define stage', () => {
      const wf = makeWorkflow();
      const action = executor.getStageAction(wf);

      expect(action).not.toBeNull();
      expect(action!.stage).toBe('define');
      expect(action!.description).toContain('Define');
      expect(action!.requiredArtifacts).toContain('spec');
    });

    it('returns skills relevant to the active stage', () => {
      const wf = makeWorkflow();
      const action = executor.getStageAction(wf);

      // spec-driven-development should be in define stage skills
      expect(action!.skills).toContain('spec-driven-development');
    });

    it('build stage has no required artifacts or gates', () => {
      const wf = makeWorkflow({
        stages: [makeStage('build', 'active'), makeStage('verify', 'pending')],
        state: { ...makeWorkflow().state, currentStage: 'build' },
      });
      const action = executor.getStageAction(wf);

      expect(action!.requiredArtifacts).toEqual([]);
      expect(action!.autoAdvance).toBe(false);
    });

    it('light process does not require spec artifact', () => {
      const wf = makeWorkflow({
        processLevel: 'light',
        stages: [
          makeStage('plan', 'active'),
          makeStage('build', 'pending'),
          makeStage('verify', 'pending'),
        ],
        state: { ...makeWorkflow().state, currentStage: 'plan' },
      });
      const action = executor.getStageAction(wf);

      // Light process doesn't require plan artifact
      expect(action!.requiredArtifacts).not.toContain('plan');
    });

    it('build stage after completed stages has no required artifacts', () => {
      const wf = makeWorkflow({
        stages: [
          makeStage('define', 'completed'),
          makeStage('plan', 'completed'),
          makeStage('build', 'active'),
        ],
        state: { ...makeWorkflow().state, currentStage: 'build' },
      });
      const action = executor.getStageAction(wf);

      expect(action!.requiredArtifacts).toEqual([]);
    });
  });

  describe('evaluateStageCompletion()', () => {
    it('returns completed when all requirements met', () => {
      const wf = makeWorkflow({
        qualityGates: [],
        approvals: [],
        stages: [makeStage('build', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'build' },
      });

      const result = executor.evaluateStageCompletion(wf, []);
      expect(result.status).toBe('completed');
    });

    it('returns blocked when spec artifact is missing in define stage', () => {
      const wf = makeWorkflow(); // define is active, needs spec
      const result = executor.evaluateStageCompletion(wf, []);

      expect(result.status).toBe('blocked');
      expect(result.message).toContain('Missing artifacts');
    });

    it('returns blocked when approval is pending', () => {
      const wf = makeWorkflow();
      const specArtifact = makeArtifact({ stage: 'define', type: 'spec' });
      const result = executor.evaluateStageCompletion(wf, [specArtifact]);

      expect(result.status).toBe('blocked');
      expect(result.pendingApprovals.length).toBeGreaterThan(0);
    });

    it('returns completed when artifact exists and gates are passed', () => {
      const wf = makeWorkflow({
        qualityGates: [
          {
            id: 'spec-approved',
            name: 'Spec Approved',
            type: 'approval',
            status: 'passed',
            stage: 'define' as Stage['id'],
            blocking: true,
            conditional: false,
          },
        ],
        approvals: [],
      });
      const specArtifact = makeArtifact({ stage: 'define', type: 'spec' });
      const result = executor.evaluateStageCompletion(wf, [specArtifact]);

      expect(result.status).toBe('completed');
    });

    it('returns completed when no active stage', () => {
      const wf = makeWorkflow({
        stages: [makeStage('plan', 'completed')],
        state: { ...makeWorkflow().state, currentStage: null },
      });
      const result = executor.evaluateStageCompletion(wf, []);
      expect(result.status).toBe('completed');
    });
  });

  describe('getStageInstructions()', () => {
    it('returns instructions for active stage', () => {
      const wf = makeWorkflow();
      const instructions = executor.getStageInstructions(wf);

      expect(instructions).toContain('Define');
      expect(instructions).toContain('specification');
    });

    it('returns fallback when no active stage', () => {
      const wf = makeWorkflow({
        stages: [makeStage('plan', 'completed')],
        state: { ...makeWorkflow().state, currentStage: null },
      });
      const instructions = executor.getStageInstructions(wf);
      expect(instructions).toContain('No active stage');
    });

    it('includes active skills in instructions', () => {
      const wf = makeWorkflow();
      const instructions = executor.getStageInstructions(wf);

      expect(instructions).toContain('Active Skills');
    });
  });
});
