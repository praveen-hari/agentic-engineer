/**
 * Project onboarding handlers.
 *
 * Handles: setupExistingProject, setupNewProject, requestOnboardingStatus.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';

export const onboardingHandlers: HandlerRegistration = {
  setupExistingProject: handleSetupExistingProject,
  setupNewProject: handleSetupNewProject,
  requestOnboardingStatus: handleRequestOnboardingStatus,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleSetupExistingProject(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  const prompt = `Set up the Engineering Workspace for this existing project.

**Important:** Call \`engineering_update_status\` frequently to report your progress (e.g., "Reading package.json...", "Creating stack.md..."). The user sees these messages in real-time.

## Steps — use these tools and follow in order:

### Step 1: Call \`engineering_setup_project\` tool
This creates the .codestudio/ directory structure and config.json.

### Step 2: Scan the workspace and create project context files
Read the codebase thoroughly — package.json, source files, config files, tests, README, etc.
Then create these files in .codestudio/ based on what you ACTUALLY find:

- \`knowledge/architecture.md\` — Architecture: module boundaries, patterns, data flow, key abstractions
- \`knowledge/conventions.md\` — Coding conventions: naming, formatting, file organization, patterns used
- \`knowledge/stack.md\` — Tech stack: languages, frameworks, dependencies with versions, build tools
- \`knowledge/boundaries.md\` — Rules: Always do / Ask first / Never do (based on existing patterns)
- \`codestudio-instructions.md\` — Agent instructions file with:
  1. References to the knowledge files above (file paths so the agent can read them)
  2. Project-specific rules that don't fit in the knowledge files
  3. Any custom instructions for this project

**Important:** Base everything on the ACTUAL codebase. Read real files. Don't guess or use generic templates.
**Important:** codestudio-instructions.md should NOT duplicate content from knowledge files — just reference them by path.

### Step 3: Ask the user what they want to build
Tell the user: "Your project is set up! What would you like to build or change?"

When they respond, call \`engineering_start_workflow\` tool with:
- \`objective\`: what the user described
- \`workType\`: your assessment — "feature", "bugfix", "refactor", "infrastructure", "documentation", or "security"
- \`complexity\`: your assessment — "trivial", "simple", "moderate", "complex", or "critical"
- \`riskLevel\`: your assessment — "low", "medium", or "high"
- \`processLevel\`: your assessment — choose the right level for the task:
  • "light" (3 stages) — typo fixes, docs, config changes, simple bug fixes
  • "standard" (5 stages) — normal features, bugs, refactors with spec + review
  • "thorough" (6 stages) — complex features, architecture, security
  • "guarded" (6 stages + extra gates) — DB migrations, auth/payment, breaking changes
- \`contextSignals\`: what the project touches — e.g. ["touches_ui", "touches_api", "touches_auth_or_input"]

Then follow the SDLC stages using the skills and tools as instructed by the start_workflow response.`;

  await deps.agentBridge.sendToChat(prompt);
}

async function handleSetupNewProject(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  const { projectName, description } = msg as Extract<MessageToHost, { type: 'setupNewProject' }>;
  const objective = description || `Build ${projectName}`;
  const fencedName = projectName.replace(/```/g, '` ` `');
  const fencedObjective = objective.replace(/```/g, '` ` `');

  const prompt = `Start the engineering workflow for the following project:

\`\`\`user-input
${fencedName}
\`\`\`

**Important:** Call \`engineering_update_status\` frequently to report your progress (e.g., "Interviewing user...", "Creating architecture.md..."). The user sees these messages in real-time.

## Objective
\`\`\`user-input
${fencedObjective}
\`\`\`

## Steps — follow these in order:

### Step 1: Call \`engineering_setup_project\` tool
Creates .codestudio/ directory structure and config.json.

### Step 2: Use the **interview-me** skill
Ask the user clarifying questions to understand:
- What exactly they want to build
- Target users and use cases
- Technical preferences (if any)
- Constraints and requirements

### Step 3: Create project context files in .codestudio/
Based on the interview and workspace scan, create these files in .codestudio/:
- \`knowledge/architecture.md\` — Architecture decisions, module boundaries, data flow
- \`knowledge/conventions.md\` — Coding conventions, naming, formatting, patterns
- \`knowledge/stack.md\` — Tech stack details: languages, frameworks, deps, versions
- \`knowledge/boundaries.md\` — Always do / Ask first / Never do rules
- \`codestudio-instructions.md\` — Agent instructions: references to knowledge files + project-specific rules (do NOT duplicate knowledge content)

### Step 4: Call \`engineering_start_workflow\` tool
YOU determine and provide these arguments based on the interview:
- \`objective\`: the refined objective from the interview
- \`workType\`: "feature", "bugfix", "refactor", "infrastructure", "documentation", or "security"
- \`complexity\`: "trivial", "simple", "moderate", "complex", "critical"
- \`riskLevel\`: "low", "medium", "high"
- \`processLevel\`: choose the right level for the task:
  • "light" (3 stages) — typo fixes, docs, config changes, simple bug fixes
  • "standard" (5 stages) — normal features, bugs, refactors with spec + review
  • "thorough" (6 stages) — complex features, architecture, security
  • "guarded" (6 stages + extra gates) — DB migrations, auth/payment, breaking changes
- \`contextSignals\`: what the project touches (e.g., ["touches_ui", "touches_api"])

### Step 5: Follow the SDLC stages
The start_workflow tool returns which stage is active and which skill to use.
Follow each skill, save artifacts with \`engineering_save_artifact\`, and advance
with \`engineering_advance_stage\`.`;

  await deps.agentBridge.sendToChat(prompt);
}

async function handleRequestOnboardingStatus(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({
      type: 'onboardingStatus',
      status: 'welcome',
      projectType: null,
      context: null,
      hasExistingFiles: false,
    });
    return;
  }

  const instructionsExist = await deps.fileSystem.exists(
    `${root}/.codestudio/codestudio-instructions.md`,
  );

  if (instructionsExist) {
    reply({
      type: 'onboardingStatus',
      status: 'ready',
      projectType: 'brownfield',
      context: null,
      hasExistingFiles: true,
    });
  } else {
    let hasFiles = false;
    try {
      const entries = await deps.fileSystem.readDir(root);
      hasFiles = entries.some((e) => !e.startsWith('.'));
    } catch {
      // If readDir fails, assume no files
    }
    reply({
      type: 'onboardingStatus',
      status: 'welcome',
      projectType: null,
      context: null,
      hasExistingFiles: hasFiles,
    });
  }
}
