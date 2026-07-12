import { describe, it, expect } from 'vitest';
import { SkillEngine } from '../../core/skill-engine';
import { SkillRegistry } from '../../core/skill-registry';
import type { RiskAssessment, SkillId } from '../../core/types';

describe('SkillEngine', () => {
  const registry = new SkillRegistry();
  const engine = new SkillEngine(registry);

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

  describe('computeActiveSkills', () => {
    it('always includes the 3 always-active skills', () => {
      const result = engine.computeActiveSkills(makeAssessment());
      expect(result.activeSkills).toContain('context-engineering');
      expect(result.activeSkills).toContain('git-workflow-and-versioning');
      expect(result.activeSkills).toContain('incremental-implementation');
    });

    it('includes task-type skills for feature work', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'feature' }));
      expect(result.activeSkills).toContain('spec-driven-development');
      expect(result.activeSkills).toContain('planning-and-task-breakdown');
    });

    it('includes task-type skills for bugfix work', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'bugfix' }));
      expect(result.activeSkills).toContain('debugging-and-error-recovery');
      expect(result.activeSkills).toContain('test-driven-development');
    });

    it('includes task-type skills for refactor work', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ workType: 'refactor', processLevel: 'standard' }),
      );
      expect(result.activeSkills).toContain('spec-driven-development');
      expect(result.activeSkills).toContain('test-driven-development');
    });

    it('includes task-type skills for security work', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'security' }));
      expect(result.activeSkills).toContain('test-driven-development');
      expect(result.activeSkills).toContain('debugging-and-error-recovery');
    });

    it('includes task-type skills for documentation work', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'documentation' }));
      expect(result.activeSkills).toContain('documentation-and-adrs');
    });

    it('includes task-type skills for infrastructure work', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'infrastructure' }));
      expect(result.activeSkills).toContain('spec-driven-development');
      expect(result.activeSkills).toContain('planning-and-task-breakdown');
    });
  });

  describe('context signal activation', () => {
    it('adds security-and-hardening when touches_auth_or_input signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_auth_or_input'] }),
      );
      expect(result.activeSkills).toContain('security-and-hardening');
    });

    it('adds security-and-hardening when touches_external_services signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_external_services'] }),
      );
      expect(result.activeSkills).toContain('security-and-hardening');
    });

    it('adds security-and-hardening when high_risk_decision signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['high_risk_decision'] }),
      );
      expect(result.activeSkills).toContain('security-and-hardening');
    });
  });

  describe('process level activation (additive)', () => {
    it('light process includes always-active skills', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'light', workType: 'documentation' }),
      );
      expect(result.activeSkills).toContain('context-engineering');
      expect(result.activeSkills).toContain('git-workflow-and-versioning');
      expect(result.activeSkills).toContain('incremental-implementation');
    });

    it('standard process includes quality-gate skills', () => {
      const result = engine.computeActiveSkills(makeAssessment({ processLevel: 'standard' }));
      expect(result.activeSkills).toContain('code-review-and-quality');
    });

    it('thorough process includes standard skills + shipping + security + docs', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'thorough', workType: 'feature' }),
      );
      expect(result.activeSkills).toContain('shipping-and-launch');
      expect(result.activeSkills).toContain('security-and-hardening');
      expect(result.activeSkills).toContain('documentation-and-adrs');
    });

    it('guarded process includes all thorough skills', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'guarded', workType: 'security' }),
      );
      expect(result.activeSkills).toContain('shipping-and-launch');
      expect(result.activeSkills).toContain('security-and-hardening');
    });

    it('higher process levels include lower level skills (additive)', () => {
      const standard = engine.computeActiveSkills(makeAssessment({ processLevel: 'standard' }));
      const thorough = engine.computeActiveSkills(makeAssessment({ processLevel: 'thorough' }));
      // Every standard skill should be in thorough
      for (const skill of standard.activeSkills) {
        expect(thorough.activeSkills).toContain(skill);
      }
    });
  });

  describe('deduplication', () => {
    it('a skill activated by multiple rules appears only once', () => {
      // test-driven-development is by-task-type (bugfix) AND quality-gate (standard)
      const result = engine.computeActiveSkills(
        makeAssessment({
          workType: 'bugfix',
          processLevel: 'standard',
        }),
      );
      const tddCount = result.activeSkills.filter((s) => s === 'test-driven-development').length;
      expect(tddCount).toBe(1);
    });

    it('security-and-hardening activated by context AND process level appears once', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({
          contextSignals: ['touches_auth_or_input'],
          processLevel: 'thorough',
        }),
      );
      const secCount = result.activeSkills.filter((s) => s === 'security-and-hardening').length;
      expect(secCount).toBe(1);
    });
  });

  describe('activation reasons', () => {
    it('provides a human-readable reason for each activated skill', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ workType: 'feature', processLevel: 'standard' }),
      );
      expect(result.activationReasons['context-engineering']).toBeDefined();
      expect(result.activationReasons['spec-driven-development']).toBeDefined();
      expect(result.activationReasons['code-review-and-quality']).toBeDefined();
    });

    it('reason for always-active skill mentions "always"', () => {
      const result = engine.computeActiveSkills(makeAssessment());
      expect(result.activationReasons['context-engineering']).toMatch(/always/i);
    });

    it('reason for task-type skill mentions the work type', () => {
      const result = engine.computeActiveSkills(makeAssessment({ workType: 'bugfix' }));
      expect(result.activationReasons['debugging-and-error-recovery']).toMatch(/bugfix/i);
    });

    it('reason for context skill mentions the signal', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_auth_or_input'] }),
      );
      expect(result.activationReasons['security-and-hardening']).toMatch(/touches_auth_or_input/i);
    });

    it('reason for process-level skill mentions the process level', () => {
      // shipping-and-launch is activated only at thorough+ process level
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'thorough', workType: 'bugfix' }),
      );
      expect(result.activationReasons['shipping-and-launch']).toMatch(/thorough/i);
    });
  });

  describe('combinations', () => {
    it('feature + touches_auth → includes security-and-hardening', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({
          workType: 'feature',
          contextSignals: ['touches_auth_or_input'],
          processLevel: 'standard',
        }),
      );
      expect(result.activeSkills).toContain('security-and-hardening');
      expect(result.activeSkills).toContain('spec-driven-development');
    });

    it('guarded process level → includes shipping, security, documentation', () => {
      const result = engine.computeActiveSkills(makeAssessment({ processLevel: 'guarded' }));
      expect(result.activeSkills).toContain('shipping-and-launch');
      expect(result.activeSkills).toContain('security-and-hardening');
      expect(result.activeSkills).toContain('documentation-and-adrs');
    });
  });
});
