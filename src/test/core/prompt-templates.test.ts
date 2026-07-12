import { describe, it, expect } from 'vitest';
import { PromptTemplates } from '../../core/prompt-templates';
import type { ProjectContext, RiskSignal } from '../../core/types';

const templates = new PromptTemplates();

const SAMPLE_CONTEXT: ProjectContext = {
  rootPath: '/workspace',
  languages: ['TypeScript', 'JavaScript'],
  frameworks: ['React', 'Express'],
  testFramework: 'Vitest',
  packageManager: 'npm',
  detectedStack: ['esbuild'],
  conventions: ['eslint', 'prettier'],
  generatedAt: new Date().toISOString(),
};

const SAMPLE_SIGNALS: RiskSignal[] = [
  { type: 'keyword', signal: 'auth', severity: 'high', impact: 'security gate' },
];

describe('PromptTemplates', () => {
  describe('getDefinePrompt()', () => {
    it('includes the objective', () => {
      const prompt = templates.getDefinePrompt('Add OAuth2 auth', SAMPLE_CONTEXT, [], 'standard');
      expect(prompt).toContain('Add OAuth2 auth');
    });

    it('includes project context', () => {
      const prompt = templates.getDefinePrompt('Add auth', SAMPLE_CONTEXT, [], 'standard');
      expect(prompt).toContain('React');
      expect(prompt).toContain('Express');
      expect(prompt).toContain('Vitest');
    });

    it('includes risk signals', () => {
      const prompt = templates.getDefinePrompt(
        'Add auth',
        SAMPLE_CONTEXT,
        SAMPLE_SIGNALS,
        'thorough',
      );
      expect(prompt).toContain('auth');
      expect(prompt).toContain('high');
    });

    it('instructs agent to use save_artifact tool (not create file directly)', () => {
      const prompt = templates.getDefinePrompt('Add auth', SAMPLE_CONTEXT, [], 'standard');
      expect(prompt).toContain('engineering_save_artifact');
      expect(prompt).toContain('Do NOT create the file directly');
    });

    it('includes spec sections instructions', () => {
      const prompt = templates.getDefinePrompt('Add auth', SAMPLE_CONTEXT, [], 'standard');
      expect(prompt).toContain('Objective');
      expect(prompt).toContain('Tech Stack');
      expect(prompt).toContain('Testing Strategy');
      expect(prompt).toContain('Boundaries');
    });

    it('instructs agent to scan workspace first', () => {
      const prompt = templates.getDefinePrompt('Add auth', SAMPLE_CONTEXT, [], 'standard');
      expect(prompt).toContain('Scan the workspace');
    });

    it('handles null context', () => {
      const prompt = templates.getDefinePrompt('Add auth', null, [], 'standard');
      expect(prompt).toContain('No project context available');
    });
  });

  describe('getPlanPrompt()', () => {
    it('includes the objective', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('Add auth');
    });

    it('references the spec path', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('specs/auth.md');
    });

    it('instructs agent to use save_artifact tool for plan', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('engineering_save_artifact');
      expect(prompt).toContain('type="plan"');
    });

    it('references planning-and-task-breakdown skill', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('planning-and-task-breakdown');
      expect(prompt).toContain('tasks');
    });

    it('adjusts detail level for light process', () => {
      const prompt = templates.getPlanPrompt('Fix typo', '', 'light');
      expect(prompt).toContain('light');
      expect(prompt).toContain('1-3 tasks');
    });

    it('handles empty specPath gracefully (#7)', () => {
      const prompt = templates.getPlanPrompt('Fix typo', '', 'standard');
      // Should NOT contain an empty backtick path like "Read the spec at: ``"
      expect(prompt).not.toContain('Read the spec at: ``');
      // Should contain a fallback message
      expect(prompt).toContain('No spec artifact exists yet');
    });

    it('includes spec path when provided', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('Read the spec at: `specs/auth.md`');
      expect(prompt).not.toContain('No spec artifact exists yet');
    });

    it('adjusts detail level for thorough process', () => {
      const prompt = templates.getPlanPrompt('Add payment', '', 'thorough');
      expect(prompt).toContain('thorough');
    });
  });

  describe('getBuildInstructions()', () => {
    it('includes task description', () => {
      const instructions = templates.getBuildInstructions('Add login form', 0, 5);
      expect(instructions).toContain('Add login form');
      expect(instructions).toContain('Task 1 of 5');
    });

    it('includes TDD cycle', () => {
      const instructions = templates.getBuildInstructions('Add login form', 0, 5);
      expect(instructions).toContain('RED');
      expect(instructions).toContain('GREEN');
      expect(instructions).toContain('REFACTOR');
    });
  });

  describe('getVerifyPrompt()', () => {
    it('references project context files for command discovery', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).toContain('stack.md');
      expect(prompt).toContain('conventions.md');
      expect(prompt).toContain('Discover the correct commands');
    });

    it('does not hardcode any specific build tool commands', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).not.toContain('`npm test`');
      expect(prompt).not.toContain('`npm run build`');
      expect(prompt).not.toContain('`npm run typecheck`');
      expect(prompt).not.toContain('`npm run lint`');
    });

    it('instructs agent to use save_artifact tool for report', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).toContain('engineering_save_artifact');
      expect(prompt).toContain('type="report"');
    });
  });

  describe('getReviewPrompt()', () => {
    it('includes objective', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('Add auth');
    });

    it('references code-review-and-quality skill', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('code-review-and-quality');
      expect(prompt).toContain('five axes');
    });

    it('includes severity categories', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('Critical');
      expect(prompt).toContain('FYI');
    });
  });

  describe('getShipPrompt()', () => {
    it('references shipping-and-launch skill', () => {
      const prompt = templates.getShipPrompt('Add auth');
      expect(prompt).toContain('shipping-and-launch');
      expect(prompt).toContain('checklist');
    });

    it('instructs agent to use save_artifact tool for ship report', () => {
      const prompt = templates.getShipPrompt('Add auth');
      expect(prompt).toContain('engineering_save_artifact');
      expect(prompt).toContain('type="report"');
    });
  });

  describe('getPromptForStage()', () => {
    const params = {
      objective: 'Add auth',
      context: SAMPLE_CONTEXT,
      signals: [] as RiskSignal[],
      processLevel: 'standard' as const,
    };

    it('returns prompt for build (agent implements the plan)', () => {
      const prompt = templates.getPromptForStage('build', params);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('incremental-implementation');
    });

    it('returns prompt for define', () => {
      const prompt = templates.getPromptForStage('define', params);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('specification');
    });

    it('returns prompt for plan', () => {
      const prompt = templates.getPromptForStage('plan', { ...params, specPath: 'specs/auth.md' });
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('plan');
    });

    it('returns prompt for verify', () => {
      const prompt = templates.getPromptForStage('verify', params);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('verification');
    });

    it('returns prompt for review', () => {
      const prompt = templates.getPromptForStage('review', params);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('review');
    });

    it('returns prompt for ship', () => {
      const prompt = templates.getPromptForStage('ship', params);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('checklist');
    });
  });
});
