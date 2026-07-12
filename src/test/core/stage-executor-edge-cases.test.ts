/**
 * Edge-case tests for StageExecutor.
 *
 * Covers: all process levels, all stage types, artifact filtering,
 * gate filtering, rejected artifacts, multiple artifacts per stage,
 * instruction generation, and boundary conditions.
 */
import { describe, it, expect } from 'vitest';
import { StageExecutor } from '../../core/stage-executor';
import { SkillRegistry } from '../../core/skill-registry';
import type {
  WorkflowDefinition,
  Stage,
  StageStatus,
  Artifact,
  ArtifactType,
  LifecycleStage,
  ProcessLevel,
  QualityGate,
} from '../../core/types';

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
    qualityGates: [],
    approvals: [],
    activeSkills: [
      'context-engineering',
      'git-workflow-and-versioning',
      'incremental-implementation',
      'spec-driven-development',
      'planning-and-task-breakdown',
      'test-driven-development',
      'code-review-and-quality',
      'shipping-and-launch',
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
    id: 'artifact-1',
    type: 'spec',
    title: 'Test Artifact',
    path: 'workflows/current/artifacts/specs/test.md',
    stage: 'define',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StageExecutor — Edge Cases', () => {
  const registry = new SkillRegistry();
  const executor = new StageExecutor(registry);

  // ─── getStageAction for Every Stage ─────────────────────────────

  describe('getStageAction for every stage type', () => {
    const stages: LifecycleStage[] = ['define', 'plan', 'build', 'verify', 'review', 'ship'];

    for (const stageId of stages) {
      it(`returns action for ${stageId} stage`, () => {
        const wf = makeWorkflow({
          stages: [makeStage(stageId, 'active')],
          state: { ...makeWorkflow().state, currentStage: stageId },
        });
        const action = executor.getStageAction(wf);

        expect(action).not.toBeNull();
        expect(action!.stage).toBe(stageId);
        expect(action!.description).toBeDefined();
        expect(action!.description.length).toBeGreaterThan(0);
      });
    }

    it('define stage requires spec artifact at standard level', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('spec');
    });

    it('plan stage requires plan artifact at standard level', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('plan', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'plan' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('plan');
    });

    it('verify stage requires report artifact', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('verify', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'verify' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('report');
    });

    it('review stage requires review artifact at standard level', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('review', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'review' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('review');
    });

    it('ship stage has no required artifacts', () => {
      const wf = makeWorkflow({
        stages: [makeStage('ship', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'ship' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toEqual([]);
    });
  });

  // ─── Process Level Artifact Filtering ─────────────────────────────

  describe('process level artifact filtering', () => {
    it('light process does not require spec', () => {
      const wf = makeWorkflow({
        processLevel: 'light',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).not.toContain('spec');
    });

    it('light process does not require plan', () => {
      const wf = makeWorkflow({
        processLevel: 'light',
        stages: [makeStage('plan', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'plan' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).not.toContain('plan');
    });

    it('light process does not require review', () => {
      const wf = makeWorkflow({
        processLevel: 'light',
        stages: [makeStage('review', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'review' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).not.toContain('review');
    });

    it('thorough process requires spec', () => {
      const wf = makeWorkflow({
        processLevel: 'thorough',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('spec');
    });

    it('guarded process requires spec', () => {
      const wf = makeWorkflow({
        processLevel: 'guarded',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.requiredArtifacts).toContain('spec');
    });
  });

  // ─── evaluateStageCompletion Edge Cases ───────────────────────────

  describe('evaluateStageCompletion edge cases', () => {
    it('rejected artifact does not count as present', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const rejectedSpec = makeArtifact({
        type: 'spec',
        stage: 'define',
        status: 'rejected',
      });
      const result = executor.evaluateStageCompletion(wf, [rejectedSpec]);
      expect(result.status).toBe('blocked');
      expect(result.message).toContain('Missing artifacts');
    });

    it('draft artifact counts as present', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const draftSpec = makeArtifact({
        type: 'spec',
        stage: 'define',
        status: 'draft',
      });
      const result = executor.evaluateStageCompletion(wf, [draftSpec]);
      // Should be completed (or only blocked by gates/approvals, not artifacts)
      expect(result.message).not.toContain('Missing artifacts');
    });

    it('artifact from wrong stage does not count', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const planArtifact = makeArtifact({
        type: 'spec',
        stage: 'plan', // wrong stage
        status: 'draft',
      });
      const result = executor.evaluateStageCompletion(wf, [planArtifact]);
      expect(result.status).toBe('blocked');
    });

    it('multiple artifacts of same type — one valid is enough', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const artifacts = [
        makeArtifact({ id: 'spec-1', type: 'spec', stage: 'define', status: 'rejected' }),
        makeArtifact({ id: 'spec-2', type: 'spec', stage: 'define', status: 'draft' }),
      ];
      const result = executor.evaluateStageCompletion(wf, artifacts);
      expect(result.message).not.toContain('Missing artifacts');
    });

    it('blocked by pending gates', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
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
        ],
      });
      const spec = makeArtifact({ type: 'spec', stage: 'define' });
      const result = executor.evaluateStageCompletion(wf, [spec]);
      expect(result.status).toBe('blocked');
      expect(result.pendingGates.length).toBeGreaterThan(0);
    });

    it('blocked by pending approvals', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
        approvals: [{ id: 'a1', level: 'explicit', artifact: 'spec', status: 'pending' }],
      });
      const spec = makeArtifact({ type: 'spec', stage: 'define' });
      const result = executor.evaluateStageCompletion(wf, [spec]);
      expect(result.status).toBe('blocked');
      expect(result.pendingApprovals.length).toBeGreaterThan(0);
    });

    it('build stage is blocked until build-complete gate passes', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('build', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'build' },
      });
      const result = executor.evaluateStageCompletion(wf, []);
      // build-complete gate is required — stage is blocked without it
      expect(result.status).toBe('blocked');
      expect(result.message).toContain('build-complete');
    });

    it('message includes all blocker types when multiple exist', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
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
        ],
        approvals: [{ id: 'a1', level: 'explicit', artifact: 'spec', status: 'pending' }],
      });
      // No artifacts at all
      const result = executor.evaluateStageCompletion(wf, []);
      expect(result.status).toBe('blocked');
      expect(result.message).toContain('Missing artifacts');
      expect(result.message).toContain('Pending gates');
      expect(result.message).toContain('Pending approvals');
    });

    it('returns stage artifacts in result', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const spec = makeArtifact({ type: 'spec', stage: 'define' });
      const result = executor.evaluateStageCompletion(wf, [spec]);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].type).toBe('spec');
    });
  });

  // ─── getStageInstructions Edge Cases ──────────────────────────────

  describe('getStageInstructions edge cases', () => {
    it('includes required artifacts in instructions', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const instructions = executor.getStageInstructions(wf);
      expect(instructions).toContain('Required Artifacts');
      expect(instructions).toContain('spec');
    });

    it('includes required gates in instructions when present', () => {
      const wf = makeWorkflow({
        processLevel: 'standard',
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const instructions = executor.getStageInstructions(wf);
      // define stage has spec-approved gate at standard level
      expect(instructions).toContain('Quality Gates');
    });

    it('includes steps for each stage', () => {
      const stages: LifecycleStage[] = ['define', 'plan', 'build', 'verify', 'review', 'ship'];
      for (const stageId of stages) {
        const wf = makeWorkflow({
          stages: [makeStage(stageId, 'active')],
          state: { ...makeWorkflow().state, currentStage: stageId },
        });
        const instructions = executor.getStageInstructions(wf);
        expect(instructions).toContain('Steps');
      }
    });

    it('returns stage description in header', () => {
      const wf = makeWorkflow({
        stages: [makeStage('build', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'build' },
      });
      const instructions = executor.getStageInstructions(wf);
      expect(instructions).toContain('## Stage:');
      expect(instructions).toContain('Build');
    });
  });

  // ─── Skill Filtering ──────────────────────────────────────────────

  describe('skill filtering', () => {
    it('only includes skills that are in activeSkills', () => {
      const wf = makeWorkflow({
        activeSkills: ['spec-driven-development'],
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      // Should only include spec-driven-development if it's registered for define stage
      for (const skill of action!.skills) {
        expect(wf.activeSkills).toContain(skill);
      }
    });

    it('returns empty skills when no activeSkills match stage', () => {
      const wf = makeWorkflow({
        activeSkills: [], // no skills active
        stages: [makeStage('define', 'active')],
        state: { ...makeWorkflow().state, currentStage: 'define' },
      });
      const action = executor.getStageAction(wf);
      expect(action!.skills).toEqual([]);
    });
  });
});
