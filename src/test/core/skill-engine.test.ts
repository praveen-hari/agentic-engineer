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
    it('always includes the 4 always-active skills', () => {
      const result = engine.computeActiveSkills(makeAssessment());
      expect(result.activeSkills).toContain('context-engineering');
      expect(result.activeSkills).toContain('git-workflow-and-versioning');
      expect(result.activeSkills).toContain('incremental-implementation');
      expect(result.activeSkills).toContain('using-agent-skills');
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
        makeAssessment({ workType: 'refactor', processLevel: 'thorough' }),
      );
      expect(result.activeSkills).toContain('spec-driven-development');
      expect(result.activeSkills).toContain('deprecation-and-migration');
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
      const result = engine.computeActiveSkills(
        makeAssessment({ workType: 'infrastructure' }),
      );
      expect(result.activeSkills).toContain('spec-driven-development');
      expect(result.activeSkills).toContain('planning-and-task-breakdown');
    });
  });

  describe('context signal activation', () => {
    it('adds frontend-ui-engineering when touches_ui signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_ui'] }),
      );
      expect(result.activeSkills).toContain('frontend-ui-engineering');
    });

    it('adds api-and-interface-design when touches_api signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_api'] }),
      );
      expect(result.activeSkills).toContain('api-and-interface-design');
    });

    it('adds security-and-hardening when touches_auth_or_input signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_auth_or_input'] }),
      );
      expect(result.activeSkills).toContain('security-and-hardening');
    });

    it('adds observability when touches_external_services signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['touches_external_services'] }),
      );
      expect(result.activeSkills).toContain('observability-and-instrumentation');
    });

    it('adds performance-optimization when performance_sensitive signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['performance_sensitive'] }),
      );
      expect(result.activeSkills).toContain('performance-optimization');
    });

    it('adds ci-cd-and-automation when high_risk_decision signal present', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ contextSignals: ['high_risk_decision'] }),
      );
      expect(result.activeSkills).toContain('ci-cd-and-automation');
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
      expect(result.activeSkills).toContain('using-agent-skills');
    });

    it('standard process includes quality-gate skills', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'standard' }),
      );
      expect(result.activeSkills).toContain('code-review-and-quality');
    });

    it('thorough process includes standard skills + doubt-driven + shipping', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'thorough', workType: 'feature' }),
      );
      expect(result.activeSkills).toContain('doubt-driven-development');
      expect(result.activeSkills).toContain('shipping-and-launch');
    });

    it('guarded process includes all thorough skills + security-auditor', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'guarded', workType: 'security' }),
      );
      expect(result.activeSkills).toContain('security-auditor');
      expect(result.activeSkills).toContain('shipping-and-launch');
    });

    it('higher process levels include lower level skills (additive)', () => {
      const standard = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'standard' }),
      );
      const thorough = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'thorough' }),
      );
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
        makeAssessment({ contextSignals: ['touches_ui'] }),
      );
      expect(result.activationReasons['frontend-ui-engineering']).toMatch(/ui/i);
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

    it('guarded process level → includes shipping, security, performance, documentation', () => {
      const result = engine.computeActiveSkills(
        makeAssessment({ processLevel: 'guarded' }),
      );
      expect(result.activeSkills).toContain('shipping-and-launch');
      expect(result.activeSkills).toContain('security-and-hardening');
      expect(result.activeSkills).toContain('performance-optimization');
      expect(result.activeSkills).toContain('documentation-and-adrs');
    });
  });
});
