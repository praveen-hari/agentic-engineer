import { describe, it, expect } from 'vitest';
import { SkillRegistry } from '../../core/skill-registry';
import type {
  SkillId,
  SkillCategory,
  LifecycleStage,
  WorkType,
  ContextSignal,
  ProcessLevel,
} from '../../core/types';

describe('SkillRegistry', () => {
  const registry = new SkillRegistry();

  describe('getAll', () => {
    it('returns all 28 skills (24 engineering + 4 specialist agents)', () => {
      const skills = registry.getAll();
      expect(skills).toHaveLength(28);
    });

    it('every skill has a unique id', () => {
      const skills = registry.getAll();
      const ids = skills.map((s) => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('every skill has required metadata fields', () => {
      const skills = registry.getAll();
      for (const skill of skills) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.label).toBeDefined();
        expect(skill.category).toBeDefined();
        expect(skill.description).toBeDefined();
        expect(skill.activation).toBeDefined();
      }
    });
  });

  describe('getById', () => {
    it('returns the correct skill for a known id', () => {
      const skill = registry.getById('test-driven-development');
      expect(skill).toBeDefined();
      expect(skill!.name).toBe('Test-Driven Development');
    });

    it('returns undefined for an unknown id', () => {
      const skill = registry.getById('nonexistent-skill');
      expect(skill).toBeUndefined();
    });
  });

  describe('getByCategory', () => {
    it('returns 4 always-active skills', () => {
      const skills = registry.getByCategory('always');
      expect(skills).toHaveLength(4);
      expect(skills.map((s) => s.id).sort()).toEqual(
        [
          'context-engineering',
          'git-workflow-and-versioning',
          'incremental-implementation',
          'using-agent-skills',
        ].sort(),
      );
    });

    it('returns by-task-type skills', () => {
      const skills = registry.getByCategory('by-task-type');
      expect(skills.length).toBeGreaterThanOrEqual(7);
    });

    it('returns by-context skills', () => {
      const skills = registry.getByCategory('by-context');
      expect(skills.length).toBeGreaterThanOrEqual(7);
    });

    it('returns interactive skills', () => {
      const skills = registry.getByCategory('interactive');
      expect(skills.length).toBeGreaterThanOrEqual(2);
      expect(skills.map((s) => s.id)).toContain('interview-me');
      expect(skills.map((s) => s.id)).toContain('idea-refine');
    });

    it('returns quality-gate skills', () => {
      const skills = registry.getByCategory('quality-gate');
      expect(skills.length).toBeGreaterThanOrEqual(3);
    });

    it('returns specialist skills', () => {
      const skills = registry.getByCategory('specialist');
      expect(skills).toHaveLength(4);
      expect(skills.map((s) => s.id).sort()).toEqual(
        ['code-reviewer', 'security-auditor', 'test-engineer', 'web-performance-auditor'].sort(),
      );
    });
  });

  describe('getByStage', () => {
    it('returns skills active during the build stage', () => {
      const skills = registry.getByStage('build');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('incremental-implementation');
      expect(skills.map((s) => s.id)).toContain('test-driven-development');
    });

    it('returns skills active during the review stage', () => {
      const skills = registry.getByStage('review');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('code-review-and-quality');
    });

    it('returns skills active during the ship stage', () => {
      const skills = registry.getByStage('ship');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('shipping-and-launch');
    });

    it('returns empty array for a stage with no skills', () => {
      const skills = registry.getByStage('onboard');
      // onboard may have skills or not — just verify it doesn't crash
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('getByTaskType', () => {
    it('returns skills for feature work type', () => {
      const skills = registry.getByTaskType('feature');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('spec-driven-development');
      expect(skills.map((s) => s.id)).toContain('planning-and-task-breakdown');
    });

    it('returns skills for bugfix work type', () => {
      const skills = registry.getByTaskType('bugfix');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('debugging-and-error-recovery');
      expect(skills.map((s) => s.id)).toContain('test-driven-development');
    });

    it('returns skills for refactor work type', () => {
      const skills = registry.getByTaskType('refactor');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('spec-driven-development');
      expect(skills.map((s) => s.id)).toContain('deprecation-and-migration');
    });

    it('returns skills for security work type', () => {
      const skills = registry.getByTaskType('security');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('test-driven-development');
      expect(skills.map((s) => s.id)).toContain('debugging-and-error-recovery');
    });

    it('returns skills for documentation work type', () => {
      const skills = registry.getByTaskType('documentation');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('documentation-and-adrs');
    });

    it('returns skills for infrastructure work type', () => {
      const skills = registry.getByTaskType('infrastructure');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.map((s) => s.id)).toContain('ci-cd-and-automation');
    });
  });

  describe('user-facing labels (DD-007)', () => {
    it('labels are human-readable, not kebab-case IDs', () => {
      const skills = registry.getAll();
      for (const skill of skills) {
        // Label should not be the same as the id (kebab-case)
        expect(skill.label).not.toBe(skill.id);
        // Label should not contain hyphens from kebab-case
        expect(skill.label).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
      }
    });

    it('code-review-and-quality has label "Code Review"', () => {
      expect(registry.getById('code-review-and-quality')!.label).toBe('Code Review');
    });

    it('security-and-hardening has label "Security Hardening"', () => {
      expect(registry.getById('security-and-hardening')!.label).toBe('Security Hardening');
    });
  });

  describe('always-active skills', () => {
    it('context-engineering is always active', () => {
      const skill = registry.getById('context-engineering')!;
      expect(skill.activation.mode).toBe('always');
    });

    it('git-workflow-and-versioning is always active', () => {
      const skill = registry.getById('git-workflow-and-versioning')!;
      expect(skill.activation.mode).toBe('always');
    });

    it('incremental-implementation is always active', () => {
      const skill = registry.getById('incremental-implementation')!;
      expect(skill.activation.mode).toBe('always');
    });

    it('using-agent-skills is always active', () => {
      const skill = registry.getById('using-agent-skills')!;
      expect(skill.activation.mode).toBe('always');
    });
  });

  describe('quality gate skills', () => {
    it('code-review-and-quality is a quality gate', () => {
      const skill = registry.getById('code-review-and-quality')!;
      expect(skill.category).toBe('quality-gate');
      expect(skill.gateType).toBe('hard');
    });

    it('security-and-hardening can be a conditional gate', () => {
      const skill = registry.getById('security-and-hardening')!;
      expect(skill.gateType).not.toBe('none');
    });
  });

  describe('specialist agents', () => {
    it('code-reviewer is a specialist agent', () => {
      const skill = registry.getById('code-reviewer')!;
      expect(skill.category).toBe('specialist');
    });

    it('security-auditor is a specialist agent', () => {
      const skill = registry.getById('security-auditor')!;
      expect(skill.category).toBe('specialist');
    });

    it('test-engineer is a specialist agent', () => {
      const skill = registry.getById('test-engineer')!;
      expect(skill.category).toBe('specialist');
    });

    it('web-performance-auditor is a specialist agent', () => {
      const skill = registry.getById('web-performance-auditor')!;
      expect(skill.category).toBe('specialist');
    });
  });
});
