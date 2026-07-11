import { describe, it, expect } from 'vitest';
import { WorkflowGenerator } from '../../core/workflow-generator';
import { SkillEngine } from '../../core/skill-engine';
import { SkillRegistry } from '../../core/skill-registry';
import type { RiskAssessment, ContextSignal } from '../../core/types';

describe('WorkflowGenerator', () => {
  const registry = new SkillRegistry();
  const skillEngine = new SkillEngine(registry);
  const generator = new WorkflowGenerator(skillEngine);

  const makeAssessment = (overrides: Partial<RiskAssessment> = {}): RiskAssessment => ({
    workType: 'feature',
    complexity: 'moderate',
    riskLevel: 'medium',
    processLevel: 'standard',
    signals: [],
    contextSignals: [],
    source: 'deterministic',
    ...overrides,
  });

  describe('generate', () => {
    it('returns a WorkflowDefinition with the objective', () => {
      const assessment = makeAssessment();
      const wf = generator.generate('wf-001', 'Add user profile', assessment);

      expect(wf.id).toBe('wf-001');
      expect(wf.objective).toBe('Add user profile');
    });

    it('sets process level from assessment', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment({ processLevel: 'light' }));
      expect(wf.processLevel).toBe('light');
    });

    it('includes detected risks from assessment', () => {
      const assessment = makeAssessment({
        signals: [
          { type: 'keyword', signal: 'auth', severity: 'high', impact: 'security gate' },
        ],
      });
      const wf = generator.generate('wf-001', 'Add login', assessment);
      expect(wf.detectedRisks).toEqual(assessment.signals);
    });

    it('populates activeSkills and skillActivationReason', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment());
      expect(wf.activeSkills.length).toBeGreaterThan(0);
      expect(Object.keys(wf.skillActivationReason).length).toBeGreaterThan(0);
    });
  });

  describe('light process', () => {
    it('generates 3 stages: plan, build, verify', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment({ processLevel: 'light' }));
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['plan', 'build', 'verify']);
    });

    it('has 0 approvals for light process', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment({ processLevel: 'light' }));
      expect(wf.approvals).toHaveLength(0);
    });

    it('all stages start as pending', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment({ processLevel: 'light' }));
      expect(wf.stages.every((s) => s.status === 'pending')).toBe(true);
    });

    it('workflow state starts as idle', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment({ processLevel: 'light' }));
      expect(wf.state.status).toBe('idle');
      expect(wf.state.currentStage).toBeNull();
    });
  });

  describe('standard process', () => {
    it('generates 7 stages: onboard, define, plan, build, verify, review, ship', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['onboard', 'define', 'plan', 'build', 'verify', 'review', 'ship']);
    });

    it('has at least 2 approvals (spec + review)', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      expect(wf.approvals.length).toBeGreaterThanOrEqual(2);
    });

    it('includes spec approval at define stage', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      const specApproval = wf.approvals.find((a) => a.artifact === 'spec');
      expect(specApproval).toBeDefined();
    });

    it('includes code review approval at review stage', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      const reviewApproval = wf.approvals.find((a) => a.artifact === 'code-review');
      expect(reviewApproval).toBeDefined();
    });

    it('includes tests-pass quality gate', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      const testGate = wf.qualityGates.find((g) => g.id === 'tests-pass');
      expect(testGate).toBeDefined();
    });
  });

  describe('thorough process', () => {
    it('generates 7 stages (same as standard, more gates)', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'thorough' }));
      expect(wf.stages).toHaveLength(7);
    });

    it('has more quality gates than standard', () => {
      const standard = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'standard' }));
      const thorough = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'thorough' }));
      expect(thorough.qualityGates.length).toBeGreaterThan(standard.qualityGates.length);
    });

    it('has 3-4 approvals', () => {
      const wf = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'thorough' }));
      expect(wf.approvals.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('guarded process', () => {
    it('generates 7 stages with none skippable', () => {
      const wf = generator.generate('wf-001', 'Migrate DB', makeAssessment({ processLevel: 'guarded' }));
      expect(wf.stages).toHaveLength(7);
      expect(wf.stages.every((s) => !s.skippable)).toBe(true);
    });

    it('has more gates than thorough', () => {
      const thorough = generator.generate('wf-001', 'Add feature', makeAssessment({ processLevel: 'thorough' }));
      const guarded = generator.generate('wf-001', 'Migrate DB', makeAssessment({ processLevel: 'guarded' }));
      expect(guarded.qualityGates.length).toBeGreaterThan(thorough.qualityGates.length);
    });

    it('includes restricted approvals', () => {
      const wf = generator.generate('wf-001', 'Migrate DB', makeAssessment({ processLevel: 'guarded' }));
      const restricted = wf.approvals.filter((a) => a.level === 'restricted');
      expect(restricted.length).toBeGreaterThan(0);
    });
  });

  describe('conditional gates based on context signals', () => {
    it('adds security-review gate when touches_auth_or_input signal present', () => {
      const wf = generator.generate(
        'wf-001',
        'Add login',
        makeAssessment({ contextSignals: ['touches_auth_or_input'] }),
      );
      const secGate = wf.qualityGates.find((g) => g.id === 'security-review');
      expect(secGate).toBeDefined();
      expect(secGate!.conditional).toBe(true);
    });

    it('adds accessibility-check gate when touches_ui signal present', () => {
      const wf = generator.generate(
        'wf-001',
        'Add dashboard',
        makeAssessment({ contextSignals: ['touches_ui'] }),
      );
      const a11yGate = wf.qualityGates.find((g) => g.id === 'accessibility-check');
      expect(a11yGate).toBeDefined();
    });

    it('adds api-contract-review gate when touches_api signal present', () => {
      const wf = generator.generate(
        'wf-001',
        'Add REST endpoint',
        makeAssessment({ contextSignals: ['touches_api'] }),
      );
      const apiGate = wf.qualityGates.find((g) => g.id === 'api-contract-review');
      expect(apiGate).toBeDefined();
    });

    it('adds performance-budget gate when performance_sensitive signal present', () => {
      const wf = generator.generate(
        'wf-001',
        'Optimize render',
        makeAssessment({ contextSignals: ['performance_sensitive'] }),
      );
      const perfGate = wf.qualityGates.find((g) => g.id === 'performance-budget');
      expect(perfGate).toBeDefined();
    });

    it('conditional gates have a reason explaining why they were added', () => {
      const wf = generator.generate(
        'wf-001',
        'Add login',
        makeAssessment({ contextSignals: ['touches_auth_or_input'] }),
      );
      const secGate = wf.qualityGates.find((g) => g.id === 'security-review');
      expect(secGate!.reason).toBeDefined();
      expect(secGate!.reason).toMatch(/auth|security/i);
    });
  });

  describe('version', () => {
    it('starts at version 1', () => {
      const wf = generator.generate('wf-001', 'Fix typo', makeAssessment());
      expect(wf.version).toBe(1);
    });
  });
});
