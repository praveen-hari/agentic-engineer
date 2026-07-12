/**
 * Edge-case tests for PromptTemplates.
 *
 * Covers: special characters in objectives, empty context fields,
 * all process levels, slug generation for save paths, multiple
 * risk signals, and getPromptForStage with all parameter combinations.
 */
import { describe, it, expect } from 'vitest';
import { PromptTemplates } from '../../core/prompt-templates';
import type { ProjectContext, RiskSignal, ProcessLevel, LifecycleStage } from '../../core/types';

const templates = new PromptTemplates();

const FULL_CONTEXT: ProjectContext = {
  rootPath: '/workspace',
  languages: ['TypeScript', 'JavaScript'],
  frameworks: ['React', 'Express'],
  testFramework: 'Vitest',
  packageManager: 'npm',
  detectedStack: ['esbuild', 'tailwind'],
  conventions: ['eslint', 'prettier'],
  generatedAt: new Date().toISOString(),
};

const EMPTY_CONTEXT: ProjectContext = {
  rootPath: '/workspace',
  languages: [],
  frameworks: [],
  testFramework: null,
  packageManager: null,
  detectedStack: [],
  conventions: [],
  generatedAt: new Date().toISOString(),
};

const MULTIPLE_SIGNALS: RiskSignal[] = [
  { type: 'keyword', signal: 'auth', severity: 'high', impact: 'security gate' },
  { type: 'keyword', signal: 'payment', severity: 'high', impact: 'security gate' },
  { type: 'dependency', signal: 'stripe', severity: 'medium', impact: 'integration test' },
  { type: 'file-pattern', signal: 'migration', severity: 'medium', impact: 'data integrity' },
];

describe('PromptTemplates — Edge Cases', () => {
  // ─── Special Characters in Objectives ─────────────────────────────

  describe('special characters in objectives', () => {
    it('handles objective with quotes', () => {
      const prompt = templates.getDefinePrompt(
        'Add "OAuth2" authentication',
        FULL_CONTEXT,
        [],
        'standard',
      );
      expect(prompt).toContain('"OAuth2"');
    });

    it('handles objective with backticks', () => {
      const prompt = templates.getDefinePrompt(
        'Fix `createUser` function',
        FULL_CONTEXT,
        [],
        'standard',
      );
      expect(prompt).toContain('`createUser`');
    });

    it('handles objective with markdown special chars', () => {
      const prompt = templates.getDefinePrompt(
        'Add # heading & *bold* support',
        FULL_CONTEXT,
        [],
        'standard',
      );
      expect(prompt).toContain('# heading');
    });

    it('handles objective with newlines', () => {
      const prompt = templates.getDefinePrompt(
        'Add auth\nwith session\nmanagement',
        FULL_CONTEXT,
        [],
        'standard',
      );
      expect(prompt).toContain('Add auth');
    });

    it('handles empty objective', () => {
      const prompt = templates.getDefinePrompt('', FULL_CONTEXT, [], 'standard');
      expect(prompt).toContain('spec-driven-development');
      // Should still produce a valid prompt
      expect(prompt.length).toBeGreaterThan(50);
    });
  });

  // ─── Context Variations ───────────────────────────────────────────

  describe('context variations', () => {
    it('handles context with empty arrays', () => {
      const prompt = templates.getDefinePrompt('Add auth', EMPTY_CONTEXT, [], 'standard');
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('handles context with many languages', () => {
      const ctx: ProjectContext = {
        ...FULL_CONTEXT,
        languages: ['TypeScript', 'Python', 'Go', 'Rust', 'Java'],
      };
      const prompt = templates.getDefinePrompt('Add auth', ctx, [], 'standard');
      expect(prompt).toContain('TypeScript');
      expect(prompt).toContain('Python');
    });

    it('handles context with null test framework', () => {
      const ctx: ProjectContext = { ...FULL_CONTEXT, testFramework: null };
      const prompt = templates.getDefinePrompt('Add auth', ctx, [], 'standard');
      expect(prompt).toBeDefined();
    });
  });

  // ─── Multiple Risk Signals ────────────────────────────────────────

  describe('multiple risk signals', () => {
    it('includes all risk signals in define prompt', () => {
      const prompt = templates.getDefinePrompt(
        'Add payment',
        FULL_CONTEXT,
        MULTIPLE_SIGNALS,
        'thorough',
      );
      expect(prompt).toContain('auth');
      expect(prompt).toContain('payment');
      expect(prompt).toContain('stripe');
    });

    it('includes signal severity', () => {
      const prompt = templates.getDefinePrompt(
        'Add payment',
        FULL_CONTEXT,
        MULTIPLE_SIGNALS,
        'thorough',
      );
      expect(prompt).toContain('high');
    });

    it('handles empty signals array', () => {
      const prompt = templates.getDefinePrompt('Add auth', FULL_CONTEXT, [], 'standard');
      expect(prompt).toContain('No specific risk signals');
    });
  });

  // ─── Process Level Variations ─────────────────────────────────────

  describe('process level variations in plan prompt', () => {
    const levels: ProcessLevel[] = ['light', 'standard', 'thorough', 'guarded'];

    for (const level of levels) {
      it(`includes process level "${level}" in plan prompt`, () => {
        const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', level);
        expect(prompt).toContain(level);
      });
    }

    it('light process suggests 1-3 tasks', () => {
      const prompt = templates.getPlanPrompt('Fix typo', '', 'light');
      expect(prompt).toContain('1-3 tasks');
    });

    it('standard process suggests 3-8 tasks', () => {
      const prompt = templates.getPlanPrompt('Add feature', '', 'standard');
      expect(prompt).toContain('3-8 tasks');
    });
  });

  // ─── Save Path Generation ────────────────────────────────────────

  describe('tool usage instructions', () => {
    it('define prompt tells agent to use engineering_save_artifact', () => {
      const prompt = templates.getDefinePrompt('Add auth', FULL_CONTEXT, [], 'standard');
      expect(prompt).toContain('engineering_save_artifact');
      expect(prompt).toContain('Do NOT create the file directly');
    });

    it('plan prompt tells agent to use engineering_save_artifact', () => {
      const prompt = templates.getPlanPrompt('Add auth', 'specs/auth.md', 'standard');
      expect(prompt).toContain('engineering_save_artifact');
    });

    it('verify prompt tells agent to use engineering_save_artifact', () => {
      const prompt = templates.getVerifyPrompt('Add auth', null, null);
      expect(prompt).toContain('engineering_save_artifact');
    });

    it('review prompt tells agent to use engineering_save_artifact', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('engineering_save_artifact');
    });

    it('ship prompt tells agent to use engineering_save_artifact', () => {
      const prompt = templates.getShipPrompt('Add auth');
      expect(prompt).toContain('engineering_save_artifact');
    });
  });

  // ─── Build Instructions ───────────────────────────────────────────

  describe('build instructions edge cases', () => {
    it('handles first task (index 0)', () => {
      const instructions = templates.getBuildInstructions('Setup project', 0, 10);
      expect(instructions).toContain('Task 1 of 10');
    });

    it('handles last task', () => {
      const instructions = templates.getBuildInstructions('Final cleanup', 9, 10);
      expect(instructions).toContain('Task 10 of 10');
    });

    it('handles single task', () => {
      const instructions = templates.getBuildInstructions('Quick fix', 0, 1);
      expect(instructions).toContain('Task 1 of 1');
    });

    it('includes TDD references', () => {
      const instructions = templates.getBuildInstructions('Add login', 0, 5);
      expect(instructions).toContain('test-driven-development');
      expect(instructions).toContain('incremental-implementation');
    });
  });

  // ─── Verify Prompt Edge Cases ─────────────────────────────────────

  describe('verify prompt edge cases', () => {
    it('references project context files for command discovery', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).toContain('stack.md');
      expect(prompt).toContain('conventions.md');
    });

    it('lists multiple build config file types for discovery', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).toContain('package.json');
      expect(prompt).toContain('Cargo.toml');
      expect(prompt).toContain('.csproj');
      expect(prompt).toContain('pyproject.toml');
    });

    it('instructs agent to run tests, build, typecheck, and lint', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).toContain('test suite');
      expect(prompt).toContain('build');
      expect(prompt).toContain('type checker');
      expect(prompt).toContain('linter');
    });

    it('does not hardcode any specific package manager commands', () => {
      const prompt = templates.getVerifyPrompt('Add auth');
      expect(prompt).not.toContain('`npm ');
      expect(prompt).not.toContain('`yarn ');
      expect(prompt).not.toContain('`pnpm ');
    });
  });

  // ─── Review Prompt Edge Cases ─────────────────────────────────────

  describe('review prompt edge cases', () => {
    it('includes five review axes', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('correctness');
      expect(prompt).toContain('readability');
      expect(prompt).toContain('architecture');
      expect(prompt).toContain('security');
      expect(prompt).toContain('performance');
    });

    it('includes finding categories', () => {
      const prompt = templates.getReviewPrompt('Add auth');
      expect(prompt).toContain('Critical');
      expect(prompt).toContain('Required');
      expect(prompt).toContain('Optional');
      expect(prompt).toContain('Nit');
      expect(prompt).toContain('FYI');
    });
  });

  // ─── getPromptForStage Comprehensive ──────────────────────────────

  describe('getPromptForStage comprehensive', () => {
    const baseParams = {
      objective: 'Add auth',
      context: FULL_CONTEXT,
      signals: [] as RiskSignal[],
      processLevel: 'standard' as ProcessLevel,
    };

    it('returns prompt for build', () => {
      const prompt = templates.getPromptForStage('build', baseParams);
      expect(prompt).not.toBeNull();
      expect(prompt).toContain('test-driven-development');
    });

    it('returns string for define', () => {
      const prompt = templates.getPromptForStage('define', baseParams);
      expect(typeof prompt).toBe('string');
      expect(prompt!.length).toBeGreaterThan(0);
    });

    it('returns string for plan with specPath', () => {
      const prompt = templates.getPromptForStage('plan', {
        ...baseParams,
        specPath: 'specs/auth.md',
      });
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('specs/auth.md');
    });

    it('returns string for verify', () => {
      const prompt = templates.getPromptForStage('verify', baseParams);
      expect(typeof prompt).toBe('string');
    });

    it('returns string for review', () => {
      const prompt = templates.getPromptForStage('review', baseParams);
      expect(typeof prompt).toBe('string');
    });

    it('returns string for ship', () => {
      const prompt = templates.getPromptForStage('ship', baseParams);
      expect(typeof prompt).toBe('string');
    });

    it('verify prompt references project context files instead of hardcoded commands', () => {
      const prompt = templates.getPromptForStage('verify', baseParams);
      expect(prompt).toContain('stack.md');
      expect(prompt).toContain('Discover the correct commands');
      // Should NOT contain hardcoded npm commands
      expect(prompt).not.toContain('`npm test`');
      expect(prompt).not.toContain('`npm run build`');
    });

    it('all returned prompts reference a skill', () => {
      const stagesWithPrompts: LifecycleStage[] = ['define', 'plan', 'verify', 'review', 'ship'];
      for (const stage of stagesWithPrompts) {
        const prompt = templates.getPromptForStage(stage, {
          ...baseParams,
          specPath: 'specs/test.md',
        });
        expect(prompt).not.toBeNull();
        // Each prompt should reference at least one skill
        const hasSkillRef =
          prompt!.includes('spec-driven-development') ||
          prompt!.includes('planning-and-task-breakdown') ||
          prompt!.includes('code-review-and-quality') ||
          prompt!.includes('shipping-and-launch') ||
          prompt!.includes('verification') ||
          prompt!.includes('test suite');
        expect(hasSkillRef).toBe(true);
      }
    });
  });
});
