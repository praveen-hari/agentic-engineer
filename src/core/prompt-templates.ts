import type { LifecycleStage, ProcessLevel, ProjectContext, RiskSignal } from './types';
import { DEFAULT_PIPELINE, getPrimarySkillForStage } from './pipeline-config';

/**
 * Prompt templates for each SDLC stage.
 *
 * These prompts are sent to the agent (via AgentBridge). Each prompt:
 * 1. References a bundled skill by name (agent loads it via chatSkills)
 * 2. Provides the objective + project context
 * 3. Tells the agent to call `engineering_save_artifact` tool to save
 *
 * IMPORTANT: Prompts must NOT tell the agent to create files directly.
 * All artifacts must go through the `engineering_save_artifact` tool
 * so the ArtifactWatcher can detect them and update the UI.
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
    const contextBlock = context ? formatContext(context) : 'No project context available.';
    const signalBlock =
      signals.length > 0
        ? `Risk signals detected: ${signals.map((s) => `${s.signal} (${s.severity})`).join(', ')}`
        : 'No specific risk signals detected.';

    return `Follow the **spec-driven-development** skill to generate a specification.

## Objective
${fenceUserInput(objective)}

## Project Context
${contextBlock}

## Risk Assessment
- Process level: **${processLevel}**
- ${signalBlock}

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Scanning workspace...", "Drafting spec: Tech Stack section...", "Spec complete — saving artifact...").

1. Scan the workspace first to understand the existing codebase, patterns, and conventions.
2. Follow the spec-driven-development skill workflow (Phase 1: Specify).
3. The spec must cover: Objective, Tech Stack, Commands, Project Structure, Code Style, Testing Strategy, Boundaries, Success Criteria.
4. Base the spec on the ACTUAL project — not generic templates.
5. **Do NOT create the file directly.** Call the \`engineering_save_artifact\` tool with type="spec" and the full content.`;
  }

  /**
   * PLAN stage — generate a task breakdown from the spec.
   * References: planning-and-task-breakdown skill
   */
  getPlanPrompt(objective: string, specPath: string, processLevel: ProcessLevel): string {
    const specSection = specPath
      ? `## Specification\nRead the spec at: \`${specPath}\``
      : `## Specification\nNo spec artifact exists yet. Scan the workspace and the objective to understand what needs to be built.`;

    return `Follow the **planning-and-task-breakdown** skill to create an implementation plan.

## Objective
${fenceUserInput(objective)}

${specSection}

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Reading spec...", "Identifying dependencies...", "Breaking into tasks...", "Plan complete — saving artifact...").

1. Read the specification first.
2. Scan the workspace to understand the existing codebase.
3. Follow the planning-and-task-breakdown skill to break the spec into tasks.
4. Size each task (XS/S/M/L). Reject XL — break down further.
5. Order by dependencies, risk-first.
6. Process level is **${processLevel}** — ${processLevel === 'light' ? 'keep it minimal, 1-3 tasks' : processLevel === 'standard' ? 'standard detail, 3-8 tasks' : 'thorough detail, include security/performance tasks'}.
7. **Do NOT create the file directly.** Call the \`engineering_save_artifact\` tool with type="plan" and the full content.`;
  }

  /**
   * BUILD stage — sent to agent to implement the plan.
   * References: incremental-implementation + test-driven-development skills
   */
  getBuildPrompt(objective: string, planPath: string): string {
    return `Implement the plan for:
${fenceUserInput(objective)}

## Plan
Read the implementation plan at: \`${planPath}\`

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Task 1/5: Writing failing test...", "Task 1/5: Implementing...", "Task 1/5: Tests passing, committing...", "Task 2/5: Starting...").

1. Read the plan file first to understand all tasks.
2. Follow the **incremental-implementation** skill — implement one task at a time.
3. For each task, follow the **test-driven-development** skill:
   - **RED** — Write a failing test
   - **GREEN** — Write minimal code to pass
   - **REFACTOR** — Clean up without changing behavior
4. Run the full test suite after each task.
5. Commit with a descriptive message after each task.
6. Move to the next task until all are done.
7. When all tasks are complete, call \`engineering_advance_stage\` to move to the Verify stage.`;
  }

  /**
   * BUILD stage — instructions shown in UI.
   * References: incremental-implementation + test-driven-development skills
   */
  getBuildInstructions(taskDescription: string, taskIndex: number, totalTasks: number): string {
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
  getVerifyPrompt(objective: string): string {
    return `Run verification checks for the completed implementation.

## Objective
${fenceUserInput(objective)}

## Project Context
Read the project details from \`.codestudio/knowledge/stack.md\` and \`.codestudio/knowledge/conventions.md\` to understand the tech stack, build tools, test framework, and commands used in this project.

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Running test suite...", "Tests passed ✓", "Running build...", "Build succeeded ✓", "Running linter...", "Compiling report...").

1. **Discover the correct commands** — read \`package.json\`, \`Makefile\`, \`Cargo.toml\`, \`*.csproj\`, \`pyproject.toml\`, or whatever build config exists in this project.
2. **Run the test suite** using the project's actual test command.
3. **Run the build** using the project's actual build command.
4. **Run the type checker** if the project has one configured.
5. **Run the linter** if the project has one configured.
6. Compile a verification report with results for each check.
7. **Do NOT create the file directly.** Call the \`engineering_save_artifact\` tool with type="report" and the full content.

Report results honestly — if tests fail, document which ones and why.`;
  }

  /**
   * REVIEW stage — code review.
   * References: code-review-and-quality skill
   */
  getReviewPrompt(objective: string): string {
    return `Follow the **code-review-and-quality** skill to review the implementation.

## Objective
${fenceUserInput(objective)}

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Reviewing correctness...", "Reviewing architecture...", "Reviewing security...", "Compiling review findings...").

1. Review all changes made during this workflow.
2. Follow the code-review-and-quality skill — evaluate across five axes: correctness, readability, architecture, security, performance.
3. Categorize findings: Critical / Required / Optional / Nit / FYI.
4. **Do NOT create the file directly.** Call the \`engineering_save_artifact\` tool with type="review" and the full content.`;
  }

  /**
   * SHIP stage — pre-launch checklist.
   * References: shipping-and-launch skill
   */
  getShipPrompt(objective: string): string {
    return `Follow the **shipping-and-launch** skill to complete the pre-launch checklist.

## Objective
${fenceUserInput(objective)}

## Instructions
Call \`engineering_update_status\` frequently to report progress (e.g., "Checking pre-launch checklist...", "Verifying tests pass...", "Checking for secrets...", "Ship checklist complete — saving report...").

1. Follow the shipping-and-launch skill pre-launch checklist.
2. Verify: tests pass, build succeeds, no type errors, no lint warnings, code review approved, documentation updated, no secrets in code, error handling appropriate.
3. **Do NOT create the file directly.** Call the \`engineering_save_artifact\` tool with type="report" and the full content.`;
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
      planPath?: string;
    },
  ): string | null {
    switch (stage) {
      case 'define':
        return this.getDefinePrompt(
          params.objective,
          params.context,
          params.signals,
          params.processLevel,
        );
      case 'plan':
        return this.getPlanPrompt(params.objective, params.specPath ?? '', params.processLevel);
      case 'build':
        return this.getBuildPrompt(params.objective, params.planPath ?? params.specPath ?? '');
      case 'verify':
        return this.getVerifyPrompt(params.objective);
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
    return getPrimarySkillForStage(DEFAULT_PIPELINE, stage);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fence user-provided input to prevent prompt injection.
 * Wraps the input in a clearly delimited block so the LLM treats it
 * as data, not as instructions. Strips any existing fence markers.
 */
function fenceUserInput(input: string): string {
  // Remove any existing triple-backtick fences that could break out
  const sanitized = input.replace(/```/g, '` ` `');
  return `\`\`\`user-input\n${sanitized}\n\`\`\``;
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
