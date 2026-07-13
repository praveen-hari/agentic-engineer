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

### Step 3: Setup complete — guide the user to the Tasks view
Once all knowledge files and codestudio-instructions.md are created, tell the user:

"✅ **Project setup complete!** I've analyzed your codebase and created the following knowledge files:
- architecture.md — [brief summary of what was found]
- stack.md — [languages, frameworks detected]
- conventions.md — [key patterns found]
- boundaries.md — [rules established]

📋 **Next step:** Open the **Tasks view** in the Engineering Workspace panel and describe what you want to build or change. You can also select plugins to use before starting.

Here's a suggested objective based on what I see in the project:

> [Write a specific, actionable objective based on the codebase — e.g., 'Add unit tests for the auth module' or 'Refactor the API layer to use async/await']

Copy this into the Tasks view, modify it, or write your own!"

**IMPORTANT:** Do NOT call \`engineering_start_workflow\`. Setup is done. The user will start a task from the Tasks view when ready.`;

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

  const prompt = `Set up the Engineering Workspace for a new project.

\`\`\`user-input
Project: ${fencedName}
Description: ${fencedObjective}
\`\`\`

**Important:** Call \`engineering_update_status\` frequently to report your progress (e.g., "Interviewing user...", "Creating architecture.md..."). The user sees these messages in real-time.

## Steps — follow these in order:

### Step 1: Call \`engineering_setup_project\` tool
Creates .codestudio/ directory structure and config.json.

### Step 2: Use the **interview-me** skill
The workspace may be empty or minimal. Ask the user 3-5 clarifying questions (one at a time) to understand:
- What exactly they want to build (features, pages, components)
- Target users and use cases
- Technical preferences (languages, frameworks, libraries)
- Constraints and requirements (performance, accessibility, etc.)

Use the project name and description above as starting context — don't re-ask what they already told you.

### Step 3: Create project context files in .codestudio/
Based on the interview answers and any existing files in the workspace, create:
- \`knowledge/architecture.md\` — Planned architecture, module boundaries, data flow
- \`knowledge/conventions.md\` — Coding conventions, naming, formatting, patterns to follow
- \`knowledge/stack.md\` — Tech stack: languages, frameworks, deps with versions
- \`knowledge/boundaries.md\` — Always do / Ask first / Never do rules
- \`codestudio-instructions.md\` — Agent instructions: references to knowledge files + project-specific rules (do NOT duplicate knowledge content)

**Important:** codestudio-instructions.md should reference knowledge files by path, NOT duplicate their content.

### Step 4: Setup complete — suggest an objective and guide the user
Once all files are created, tell the user:

"✅ **Project setup complete!** Based on our conversation, I've created the project knowledge files.

📋 **Next step:** Open the **Tasks view** in the Engineering Workspace panel to start building. You can also select plugins to use before starting.

Here's a suggested objective to get started:

> [Write a specific, actionable first objective based on the interview — e.g., 'Build the landing page with hero section, feature cards, and responsive navigation' or 'Set up the Express API with user authentication endpoints']

Copy this into the Tasks view, modify it, or write your own!"

**IMPORTANT:** Do NOT call \`engineering_start_workflow\`. Setup is done. The user will start a task from the Tasks view when ready.`;

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
