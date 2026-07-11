import type { LifecycleStage, ProcessLevel, ProjectContext, RiskSignal } from './types';
import {
  ARTIFACTS_SPECS_DIR,
  ARTIFACTS_PLANS_DIR,
  ARTIFACTS_REVIEWS_DIR,
  ARTIFACTS_REPORTS_DIR,
  WORKFLOW_DIR,
} from '../constants';

/**
 * Pre-built prompt templates for each SDLC stage.
 *
 * These prompts are sent to the agent (via AgentBridge) to instruct it
 * what to generate and where to save the output. The agent scans the
 * workspace itself — we just provide the objective, context summary,
 * and file path conventions.
 *
 * Pure TypeScript — no VS Code or LLM dependencies.
 *
 * @see ARCHITECTURE.md (Agent-Delegated Architecture)
 */
export class PromptTemplates {
  /**
   * DEFINE stage — generate a specification.
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

    return `Generate a specification for the following work request.

## Objective
${objective}

## Project Context
${contextBlock}

## Risk Assessment
- Process level: ${processLevel}
- ${signalBlock}

## Instructions
1. **Scan the workspace first** to understand the existing codebase, file structure, patterns, and conventions.
2. Write a specification covering these sections:
   - **Objective** — What we're building and why. Success criteria.
   - **Tech Stack** — Framework, language, key dependencies (match what's already in the project).
   - **Commands** — Build, test, lint, dev — full executable commands.
   - **Project Structure** — Where source code lives, where tests go, where new files should be added.
   - **Code Style** — Match existing patterns. Include a real code snippet showing the project's style.
   - **Testing Strategy** — Framework, test locations, coverage expectations.
   - **Boundaries** — Always do / Ask first / Never do.
   - **Success Criteria** — Specific, testable conditions for "done".
3. **Save the spec to:** \`${savePath}\`

Important: Base the spec on the ACTUAL project structure and patterns you find in the workspace, not generic templates.`;
  }

  /**
   * PLAN stage — generate a task breakdown from the spec.
   */
  getPlanPrompt(
    objective: string,
    specPath: string,
    processLevel: ProcessLevel,
  ): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_PLANS_DIR}/${slug}.md`;

    return `Generate an implementation plan for the following work request.

## Objective
${objective}

## Specification
Read the spec at: \`${specPath}\`

## Instructions
1. **Read the specification** first to understand what needs to be built.
2. **Scan the workspace** to understand the existing codebase structure.
3. Break the spec into discrete, implementable tasks:
   - Each task should be completable in a single focused session
   - Each task has explicit acceptance criteria
   - Each task includes a verification step (test, build, manual check)
   - Tasks are ordered by dependency, not by perceived importance
   - No task should require changing more than ~5 files
   - Slice vertically — each task delivers testable functionality
4. Size each task: XS (< 30min), S (30min-1h), M (1-2h), L (2-4h). Reject XL — break down further.
5. Group tasks into phases with checkpoints between them.
6. **Save the plan to:** \`${savePath}\`

## Task Format
\`\`\`markdown
### Phase 1: [Name]

- [ ] **Task 1:** [Description]
  - Size: S
  - Acceptance: [What must be true when done]
  - Verify: [How to confirm — test command, build, manual check]
  - Files: [Which files will be touched]

- [ ] **Task 2:** [Description]
  ...

--- Checkpoint: [What should be true after this phase] ---

### Phase 2: [Name]
...
\`\`\`

Process level is **${processLevel}** — ${processLevel === 'light' ? 'keep it minimal, 1-3 tasks' : processLevel === 'standard' ? 'standard detail, 3-8 tasks' : 'thorough detail, include security/performance considerations'}.`;
  }

  /**
   * BUILD stage — instructions shown in UI (not sent to agent).
   * The user/agent implements tasks in the editor.
   */
  getBuildInstructions(
    taskDescription: string,
    taskIndex: number,
    totalTasks: number,
  ): string {
    return `## Task ${taskIndex + 1} of ${totalTasks}

${taskDescription}

### TDD Cycle
1. **RED** — Write a failing test for this task
2. **GREEN** — Write minimal code to make the test pass
3. **REFACTOR** — Clean up without changing behavior
4. Run full test suite
5. Commit with descriptive message

### Guidelines
- Follow existing code patterns in the project
- Keep changes focused — only touch files needed for this task
- Run tests after every change`;
  }

  /**
   * VERIFY stage — run verification checks.
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
3. Run the type checker (if applicable): \`npm run typecheck\`
4. Run the linter (if applicable): \`npm run lint\`
5. Compile a verification report with:
   - Test results (pass/fail count, coverage if available)
   - Build status (success/failure)
   - Type check status
   - Lint status
   - Any warnings or issues found
6. **Save the report to:** \`${savePath}\`

Report the results honestly — if tests fail, document which ones and why.`;
  }

  /**
   * REVIEW stage — code review.
   */
  getReviewPrompt(objective: string): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_REVIEWS_DIR}/${slug}-review.md`;

    return `Perform a code review for the completed implementation.

## Objective
${objective}

## Instructions
1. **Review all changes** made during this workflow.
2. Evaluate across five dimensions:
   - **Correctness** — Does the code do what the spec says? Edge cases handled?
   - **Readability** — Is the code clear? Good naming? Appropriate comments?
   - **Architecture** — Does it fit the existing patterns? Proper separation of concerns?
   - **Security** — Input validation? Auth checks? No secrets exposed?
   - **Performance** — Efficient algorithms? No N+1 queries? Reasonable bundle impact?
3. Categorize each finding:
   - 🔴 **Critical** — Must fix before merge
   - 🟡 **Required** — Should fix before merge
   - 🔵 **Optional** — Nice to have
   - ⚪ **Nit** — Style preference
   - ℹ️ **FYI** — Informational, no action needed
4. **Save the review to:** \`${savePath}\`

Be thorough but fair. Focus on issues that matter, not style nitpicks.`;
  }

  /**
   * SHIP stage — pre-launch checklist.
   */
  getShipPrompt(objective: string): string {
    const slug = slugify(objective);
    const savePath = `${WORKFLOW_DIR}/${ARTIFACTS_REPORTS_DIR}/${slug}-ship.md`;

    return `Complete the pre-launch checklist for this work request.

## Objective
${objective}

## Pre-Launch Checklist
Verify each item and document the status:

- [ ] All tests pass
- [ ] Build succeeds
- [ ] No type errors
- [ ] No lint warnings
- [ ] Code review approved
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG updated (if applicable)
- [ ] No secrets or credentials in code
- [ ] Error handling is appropriate
- [ ] Rollback strategy documented (for risky changes)

**Save the checklist to:** \`${savePath}\``;
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
