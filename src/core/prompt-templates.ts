import type { LifecycleStage, ProcessLevel, ProjectContext, RiskSignal } from './types';
import {
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
  WORKFLOW_DIR,
} from '../constants';

/**
 * Prompt templates for each SDLC stage.
 *
 * These prompts are sent to the agent (via AgentBridge). Each prompt:
 * 1. References a bundled skill by name (agent loads it via chatSkills)
 * 2. Provides the objective + project context
 * 3. Specifies where to save the artifact in .codestudio/
 *
 * The skills themselves (from addyosmani/agent-skills) contain the
 * detailed instructions. We don't duplicate them — we just reference
 * them and add the save path.
 *
 * Pure TypeScript — no VS Code or LLM dependencies.
 *
 * @see ARCHITECTURE.md (Agent-Delegated Architecture)
 * @see package.json chatSkills (bundled skills)
 */
export class PromptTemplates {
  /**
   * DEFINE stage — generate a specification.
   * References: spec-driven-development skill
   */
  getDefinePrompt(
    objective: string,
    context: ProjectContext | null,
    signals: readonly RiskSignal[],
    processLevel: ProcessLevel,
  ): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_SPECS_DIR}/${slug}.md`;
    const contextBlock = context ? formatContext(context) : 'No project context available.';
    const signalBlock = signals.length > 0
      ? `Risk signals detected: ${signals.map((s) => `${s.signal} (${s.severity})`).join(', ')}`
      : 'No specific risk signals detected.';

    return `Follow the **spec-driven-development** skill to generate a specification.

## Objective
${objective}

## Project Context
${contextBlock}

## Risk Assessment
- Process level: **${processLevel}**
- ${signalBlock}

## Instructions
1. Scan the workspace first to understand the existing codebase, patterns, and conventions.
2. Follow the spec-driven-development skill workflow (Phase 1: Specify).
3. The spec must cover: Objective, Tech Stack, Commands, Project Structure, Code Style, Testing Strategy, Boundaries, Success Criteria.
4. Base the spec on the ACTUAL project — not generic templates.
5. **Save the spec to:** \`${savePath}\``;
  }

  /**
   * PLAN stage — generate a task breakdown from the spec.
   * References: planning-and-task-breakdown skill
   */
  getPlanPrompt(
    objective: string,
    specPath: string,
    processLevel: ProcessLevel,
  ): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_PLANS_DIR}/${slug}.md`;

    return `Follow the **planning-and-task-breakdown** skill to create an implementation plan.

## Objective
${objective}

## Specification
Read the spec at: \`${specPath}\`

## Instructions
1. Read the specification first.
2. Scan the workspace to understand the existing codebase.
3. Follow the planning-and-task-breakdown skill to break the spec into tasks.
4. Size each task (XS/S/M/L). Reject XL — break down further.
5. Order by dependencies, risk-first.
6. Process level is **${processLevel}** — ${processLevel === 'light' ? 'keep it minimal, 1-3 tasks' : processLevel === 'standard' ? 'standard detail, 3-8 tasks' : 'thorough detail, include security/performance tasks'}.
7. **Save the plan to:** \`${savePath}\``;
  }

  /**
   * BUILD stage — instructions shown in UI (not sent to agent).
   * References: incremental-implementation + test-driven-development skills
   */
  getBuildInstructions(
    taskDescription: string,
    taskIndex: number,
    totalTasks: number,
  ): string {
    return `## Task ${taskIndex + 1} of ${totalTasks}

${taskDescription}

Follow the **test-driven-development** and **incremental-implementation** skills:
1. **RED** — Write a failing test
2. **GREEN** — Write minimal code to pass
3. **REFACTOR** — Clean up without changing behavior
4. Run full test suite
5. Commit with descriptive message`;
  }

  /**
   * VERIFY stage — run verification checks.
   * References: test-driven-development skill
   */
  getVerifyPrompt(
    objective: string,
    testCommand: string | null,
    buildCommand: string | null,
  ): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_REPORTS_DIR}/${slug}-verify.md`;
    const testCmd = testCommand ?? 'npm test';
    const buildCmd = buildCommand ?? 'npm run build';

    return `Run verification checks for the completed implementation.

## Objective
${objective}

## Instructions
1. Run the test suite: \`${testCmd}\`
2. Run the build: \`${buildCmd}\`
3. Run the type checker if applicable: \`npm run typecheck\`
4. Run the linter if applicable: \`npm run lint\`
5. Compile a verification report with results for each check.
6. **Save the report to:** \`${savePath}\`

Report results honestly — if tests fail, document which ones and why.`;
  }

  /**
   * REVIEW stage — code review.
   * References: code-review-and-quality skill
   */
  getReviewPrompt(objective: string): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_REVIEWS_DIR}/${slug}-review.md`;

    return `Follow the **code-review-and-quality** skill to review the implementation.

## Objective
${objective}

## Instructions
1. Review all changes made during this workflow.
2. Follow the code-review-and-quality skill — evaluate across five axes: correctness, readability, architecture, security, performance.
3. Categorize findings: Critical / Required / Optional / Nit / FYI.
4. **Save the review to:** \`${savePath}\``;
  }

  /**
   * SHIP stage — pre-launch checklist.
   * References: shipping-and-launch skill
   */
  getShipPrompt(objective: string): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_REPORTS_DIR}/${slug}-ship.md`;

    return `Follow the **shipping-and-launch** skill to complete the pre-launch checklist.

## Objective
${objective}

## Instructions
1. Follow the shipping-and-launch skill pre-launch checklist.
2. Verify: tests pass, build succeeds, no type errors, no lint warnings, code review approved, documentation updated, no secrets in code, error handling appropriate.
3. **Save the checklist to:** \`${savePath}\``;
  }

  /**
   * Get the prompt for a given stage.
   * Returns null for stages that don't need agent-generated artifacts
   * (ONBOARD auto-advances, BUILD is user-driven).
   */
  getPromptForStage(
    stage: LifecycleStage,
    params: {
      objective: string;
      context: ProjectContext | null;
      signals: readonly RiskSignal[];
      processLevel: ProcessLevel;
      specPath?: string;
      testCommand?: string | null;
      buildCommand?: string | null;
    },
  ): string | null {
    switch (stage) {
      case 'onboard':
        return null; // Auto-advance
      case 'define':
        return this.getDefinePrompt(
          params.objective,
          params.context,
          params.signals,
          params.processLevel,
        );
      case 'plan':
        return this.getPlanPrompt(
          params.objective,
          params.specPath ?? '',
          params.processLevel,
        );
      case 'build':
        return null; // User-driven, not agent-generated
      case 'verify':
        return this.getVerifyPrompt(
          params.objective,
          params.testCommand ?? null,
          params.buildCommand ?? null,
        );
      case 'review':
        return this.getReviewPrompt(params.objective);
      case 'ship':
        return this.getShipPrompt(params.objective);
      default:
        return null;
    }
  }

  /**
   * Get the skill name that powers a given stage.
   * Used by the UI to show which skill is active.
   */
  getSkillForStage(stage: LifecycleStage): string | null {
    const mapping: Record<LifecycleStage, string | null> = {
      onboard: 'context-engineering',
      define: 'spec-driven-development',
      plan: 'planning-and-task-breakdown',
      build: 'incremental-implementation',
      verify: 'test-driven-development',
      review: 'code-review-and-quality',
      ship: 'shipping-and-launch',
    };
    return mapping[stage] ?? null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function formatContext(context: ProjectContext): string {
  const parts: string[] = [];

  if (context.languages.length > 0) {
    parts.push(`Languages: ${context.languages.join(', ')}`);
  }
  if (context.frameworks.length > 0) {
    parts.push(`Frameworks: ${context.frameworks.join(', ')}`);
  }
  if (context.testFramework) {
    parts.push(`Test framework: ${context.testFramework}`);
  }
  if (context.packageManager) {
    parts.push(`Package manager: ${context.packageManager}`);
  }
  if (context.conventions.length > 0) {
    parts.push(`Conventions: ${context.conventions.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No project context detected.';
}
