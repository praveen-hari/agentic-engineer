import type { StateManager } from '../core/state-manager';
import type { WorkflowEngine } from '../core/workflow-engine';
import type { WorkflowGenerator } from '../core/workflow-generator';
import type { StageExecutor } from '../core/stage-executor';
import type { PromptTemplates } from '../core/prompt-templates';
import type { NotificationService } from '../services/notification.service';
import type { WorkspaceService } from '../services/workspace.service';
import type { ArtifactManager } from '../services/artifact-manager.service';
import type { AgentBridge } from '../services/agent-bridge.service';
import type { HistoryManager } from '../services/history-manager.service';
import type {
  Artifact,
  FileIO,
  LifecycleStage,
  MessageToHost,
  MessageToWebview,
  RiskAssessment,
  WorkflowDefinition,
} from '../core/types';
import { WORKFLOW_DIR } from '../constants';

/**
 * Callback to send a response message back to the webview.
 */
export type ReplyFn = (message: MessageToWebview) => void;

/**
 * Dependencies for the webview message handler.
 *
 * Simplified: no RiskEngine, no ProjectDetector, no ContextAnalyzer,
 * no ContextSignalDetector, no SkillEngine, no GateRunner, no
 * CapabilityRecommender. The agent handles all intelligence via tools.
 */
export interface MessageHandlerDeps {
  readonly stateManager: StateManager;
  readonly workflowEngine: WorkflowEngine;
  readonly workflowGenerator: WorkflowGenerator;
  readonly stageExecutor: StageExecutor;
  readonly notificationService: NotificationService;
  readonly workspaceService: WorkspaceService;
  readonly fileSystem: FileIO;
  readonly artifactManager: ArtifactManager;
  readonly promptTemplates: PromptTemplates;
  readonly agentBridge: AgentBridge;
  readonly historyManager: HistoryManager;
  readonly approvalMode: 'user' | 'agent';
}

/**
 * Handle messages from the webview and route them to the appropriate
 * core engine operations. Sends responses back via the `reply` callback.
 *
 * @param deps  — core engines and services
 * @param reply — callback to send a {@link MessageToWebview} back to the webview
 */
export function handleWebviewMessage(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): (message: unknown) => Promise<void> {
  return async (message: unknown) => {
    const msg = message as MessageToHost;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

    try {
      switch (msg.type) {
        case 'requestState':
          await handleRequestState(deps, reply);
          break;
        case 'requestContext':
          await handleRequestContext(deps, reply);
          break;
        case 'analyzeObjective':
          await handleAnalyzeObjective(deps, reply, msg.objective);
          break;
        case 'startWorkflow':
          await handleStartWorkflow(deps, reply, msg.objective, msg.assessment);
          break;
        case 'advanceStage':
          await handleAdvanceStage(deps, reply);
          break;
        case 'skipStage':
          await handleSkipStage(deps, reply, msg.stageId);
          break;
        case 'approve':
          await handleApprove(deps, reply, msg.approvalId, msg.comment);
          break;
        case 'reject':
          await handleReject(deps, reply, msg.approvalId, msg.comment);
          break;
        case 'navigate':
          // Navigation is handled in the webview — no host action needed
          break;
        case 'requestHistory':
          await handleRequestHistory(deps, reply, msg.page);
          break;
        case 'requestStageActions':
          await handleRequestStageActions(deps, reply);
          break;
        case 'executeStage':
          await handleExecuteStage(deps, reply);
          break;
        case 'requestArtifacts':
          await handleRequestArtifacts(deps, reply);
          break;
        case 'requestGateStatus':
          await handleRequestGateStatus(deps, reply);
          break;
        case 'generateArtifact':
          await handleSendToAgent(deps, reply, msg.stage);
          break;
        case 'setupExistingProject':
          await handleSetupExistingProject(deps, reply);
          break;
        case 'setupNewProject':
          await handleSetupNewProject(deps, reply, msg.projectName, msg.description);
          break;
        case 'requestOnboardingStatus':
          await handleRequestOnboardingStatus(deps, reply);
          break;
        case 'requestStageDetail':
          await handleRequestStageDetail(deps, reply);
          break;
        case 'requestArtifactContent':
          await handleRequestArtifactContent(deps, reply, msg.artifactId);
          break;
        case 'sendToAgent':
          await handleSendToAgent(deps, reply, msg.stage);
          break;
        case 'notifyArtifactDetected':
          await handleNotifyArtifactDetected(deps, reply, msg.artifact);
          break;
        case 'openArtifact':
          await handleOpenArtifact(deps, reply, msg.artifactId);
          break;
        case 'cancelWorkflow':
          await handleCancelWorkflow(deps, reply);
          break;
        case 'updateSettings':
          await handleUpdateSettings(deps, reply, msg.settings);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      reply({ type: 'error', message });
    }
  };
}

// ─── Handler Implementations ────────────────────────────────────────────────

async function handleRequestState(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const workflow = await deps.stateManager.load();
  reply({ type: 'state', workflow });
}

async function handleRequestContext(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'context', context: null });
    return;
  }

  // Read context from .codestudio/context.md if it exists (agent creates this)
  // We don't scan — the agent handles all context generation via tools.
  reply({
    type: 'context',
    context: {
      rootPath: root,
      languages: [],
      frameworks: [],
      testFramework: null,
      packageManager: null,
      detectedStack: [],
      conventions: [],
      generatedAt: new Date().toISOString(),
    },
  });
}

async function handleAnalyzeObjective(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  objective: string,
): Promise<void> {
  // Send the objective to the agent — the agent will call
  // engineering_start_workflow with its own assessment.
  // For the webview, we send a prompt to the agent.
  const prompt = `The user wants to work on: "${objective}"

Call \`engineering_start_workflow\` tool with:
- objective: "${objective}"
- workType: your assessment (feature/bugfix/refactor/etc.)
- complexity: your assessment (trivial/simple/moderate/complex/critical)
- riskLevel: your assessment (low/medium/high)
- contextSignals: what the project touches

Determine the workType, complexity, and riskLevel yourself based on the objective and project context.`;

  await deps.agentBridge.sendToChat(prompt);

  // No reply needed — the agent will call engineering_start_workflow
  // which sends the 'state' message to the webview.
  // The webview shows the analyzing spinner until 'state' arrives.
}

async function handleStartWorkflow(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  objective: string,
  assessment: RiskAssessment,
): Promise<void> {
  // 0. Archive previous completed workflow if one exists
  const existing = await deps.stateManager.load();
  if (existing && existing.state.status === 'completed') {
    await deps.historyManager.archiveWorkflow(existing);
  }

  // 1. Generate workflow definition (stages, gates, skills, approvals)
  const wf = deps.workflowGenerator.generate(`wf-${Date.now()}`, objective, assessment as never);

  // 2. Start the workflow — transitions from idle → active, activates first stage
  const started = await deps.workflowEngine.start(wf);

  // 3. Save workflow state to .codestudio/workflows/current/workflow.json
  await deps.stateManager.save(started);

  // 4. Save objective to .codestudio/workflows/current/objective.md
  await deps.artifactManager.saveObjective(objective);

  reply({ type: 'state', workflow: started });
}

async function handleAdvanceStage(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.advanceStage(wf));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleSkipStage(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  stageId: LifecycleStage,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) =>
      deps.workflowEngine.skipStage(wf, stageId),
    );
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleApprove(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  approvalId: string,
  comment?: string,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => ({
      ...wf,
      approvals: wf.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, status: 'approved' as const, approvedAt: new Date().toISOString(), comment }
          : a,
      ),
    }));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleReject(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  approvalId: string,
  comment?: string,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => ({
      ...wf,
      approvals: wf.approvals.map((a) =>
        a.id === approvalId ? { ...a, status: 'rejected' as const, comment } : a,
      ),
    }));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleRequestHistory(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  _page?: number,
): Promise<void> {
  const entries = await deps.historyManager.loadHistory();
  reply({ type: 'history', entries, hasMore: false });
}

// ─── Settings Handler ───────────────────────────────────────────────────────

async function handleUpdateSettings(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  settings: Record<string, unknown>,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'error', message: 'No workspace open' });
    return;
  }

  const configPath = `${root}/${WORKFLOW_DIR}/config.json`;

  // Load existing config or start fresh
  let existing: Record<string, unknown> = {};
  try {
    if (await deps.fileSystem.exists(configPath)) {
      const content = await deps.fileSystem.read(configPath);
      existing = JSON.parse(content) as Record<string, unknown>;
    }
  } catch {
    // Corrupt config — start fresh
  }

  // Merge new settings
  const updated = { ...existing, ...settings };
  await deps.fileSystem.write(configPath, JSON.stringify(updated, null, 2));

  reply({ type: 'settingsUpdated' as MessageToWebview['type'] });
}

// ─── Cancel Workflow Handler ────────────────────────────────────────────────

async function handleCancelWorkflow(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow to cancel' });
    return;
  }

  // Archive the workflow (even if incomplete — preserves history)
  await deps.historyManager.archiveWorkflow(wf);

  // Reply with null workflow — webview shows empty state
  reply({ type: 'state', workflow: null });
}

// ─── Stage Execution Handlers ───────────────────────────────────────────────

async function handleRequestStageActions(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'stageActions', actions: null });
    return;
  }
  const action = deps.stageExecutor.getStageAction(wf);
  reply({ type: 'stageActions', actions: action });
}

async function handleExecuteStage(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  try {
    // Step 1: Auto-approve all pending approvals and gates for current stage
    const approved = await deps.stateManager.update((wf) => {
      const currentStage = wf.state.currentStage;
      const hasPendingWork =
        wf.approvals.some((a) => a.status === 'pending') ||
        wf.qualityGates.some((g) => g.status === 'pending' && g.stage === currentStage);

      if (!hasPendingWork) return wf;

      const now = new Date().toISOString();
      return {
        ...wf,
        approvals: wf.approvals.map((a) =>
          a.status === 'pending' ? { ...a, status: 'approved' as const, approvedAt: now } : a,
        ),
        qualityGates: wf.qualityGates.map((g) => {
          if (g.status !== 'pending' || g.stage !== currentStage) return g;
          return {
            ...g,
            status: 'passed' as const,
            result: { passedAt: now, details: 'Approved by user' },
          };
        }),
      };
    });

    // Step 2: Check if stage can advance
    const artifacts = await deps.artifactManager.listAll();
    const result = deps.stageExecutor.evaluateStageCompletion(approved, artifacts);

    if (result.status === 'completed') {
      // Step 3: Advance to next stage (separate update for version safety)
      const advanced = await deps.stateManager.update((wf) => deps.workflowEngine.advanceStage(wf));

      // Step 4: Archive if workflow is now completed (last stage advanced)
      if (advanced.state.status === 'completed') {
        await deps.historyManager.archiveWorkflow(advanced);
      }

      reply({ type: 'state', workflow: advanced });
    } else {
      reply({ type: 'stageResult', result });
    }
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleRequestArtifacts(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const artifacts = await deps.artifactManager.listAll();
  reply({ type: 'artifacts', artifacts });
}

async function handleRequestGateStatus(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'gateStatus', gates: [] });
    return;
  }
  reply({ type: 'gateStatus', gates: wf.qualityGates });
}

// ─── Onboarding Handlers ────────────────────────────────────────────────────

async function handleSetupExistingProject(
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  // For existing projects, the agent does everything via tools.
  // The extension just sends the prompt — no scanning, no file creation.
  // The ArtifactWatcher detects .codestudio/config.json and auto-transitions UI.

  const prompt = `Set up the Engineering Workspace for this existing project.

## Steps — use these tools and follow in order:

### Step 1: Call \`engineering_setup_project\` tool
This creates the .codestudio/ directory structure and config.json.

### Step 2: Scan the workspace and create project context files
Read the codebase thoroughly — package.json, source files, config files, tests, README, etc.
Then create these files in .codestudio/ based on what you ACTUALLY find:

- \`context.md\` — Project overview: what this project is, its purpose, target users
- \`architecture.md\` — Architecture: module boundaries, patterns, data flow, key abstractions
- \`conventions.md\` — Coding conventions: naming, formatting, file organization, patterns used
- \`stack.md\` — Tech stack: languages, frameworks, dependencies with versions, build tools
- \`boundaries.md\` — Rules: Always do / Ask first / Never do (based on existing patterns)
- \`codestudio-instructions.md\` — Combined agent instructions summarizing all the above

**Important:** Base everything on the ACTUAL codebase. Read real files. Don't guess or use generic templates.

### Step 3: Ask the user what they want to build
Tell the user: "Your project is set up! What would you like to build or change?"

When they respond, call \`engineering_start_workflow\` tool with:
- \`objective\`: what the user described
- \`workType\`: your assessment — "feature", "bugfix", "refactor", "infrastructure", "documentation", or "security"
- \`complexity\`: your assessment — "trivial", "simple", "moderate", "complex", or "critical"
- \`riskLevel\`: your assessment — "low", "medium", or "high"
- \`contextSignals\`: what the project touches — e.g. ["touches_ui", "touches_api", "touches_auth_or_input"]

Then follow the SDLC stages using the skills and tools as instructed by the start_workflow response.`;

  await deps.agentBridge.sendToChat(prompt);
}

async function handleSetupNewProject(
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
  projectName: string,
  description: string,
): Promise<void> {
  const objective = description || `Build ${projectName}`;

  const prompt = `Start the engineering workflow for: **${projectName}**

## Objective
${objective}

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
Based on the interview and workspace scan, create these files:
- \`context.md\` — Project overview, purpose, target users
- \`architecture.md\` — Architecture decisions, module boundaries, data flow
- \`conventions.md\` — Coding conventions, naming, formatting, patterns
- \`stack.md\` — Tech stack details: languages, frameworks, deps, versions
- \`boundaries.md\` — Always do / Ask first / Never do rules
- \`codestudio-instructions.md\` — Combined agent instructions

### Step 4: Call \`engineering_start_workflow\` tool
YOU determine and provide these arguments based on the interview:
- \`objective\`: the refined objective from the interview
- \`workType\`: "feature", "bugfix", "refactor", etc.
- \`complexity\`: "trivial", "simple", "moderate", "complex", "critical"
- \`riskLevel\`: "low", "medium", "high"
- \`contextSignals\`: what the project touches (e.g., ["touches_ui", "touches_api"])

### Step 5: Follow the SDLC stages
The start_workflow tool returns which stage is active and which skill to use.
Follow each skill, save artifacts with \`engineering_save_artifact\`, and advance
with \`engineering_advance_stage\`.`;

  await deps.agentBridge.sendToChat(prompt);
}

async function handleRequestOnboardingStatus(
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

  // Check if .codestudio/config.json exists — if so, project is already set up
  const codestudioExists = await deps.fileSystem.exists(`${root}/.codestudio/config.json`);

  if (codestudioExists) {
    // Already onboarded — go to ready state
    reply({
      type: 'onboardingStatus',
      status: 'ready',
      projectType: 'brownfield',
      context: null,
      hasExistingFiles: true,
    });
  } else {
    // Not onboarded — check if workspace has any files (simple readDir, no scanning)
    let hasFiles = false;
    try {
      const entries = await deps.fileSystem.readDir(root);
      // Has files if there's more than just hidden dirs
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

// ─── Stage Detail Handlers (Task 1: Tasks View) ────────────────────────────

/**
 * Return combined stage detail — action, completion status, instructions,
 * and artifacts — in a single message so the webview can render the
 * stage accordion without multiple round-trips.
 */
async function handleRequestStageDetail(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({
      type: 'stageDetail',
      stage: null,
      action: null,
      completion: {
        stage: 'onboard',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'No active workflow',
      },
      instructions: 'No active workflow. Start a workflow first.',
      artifacts: [],
    });
    return;
  }

  const action = deps.stageExecutor.getStageAction(wf);
  const artifacts = await deps.artifactManager.listAll();
  const completion = deps.stageExecutor.evaluateStageCompletion(wf, artifacts);
  const instructions = deps.stageExecutor.getStageInstructions(wf);

  reply({
    type: 'stageDetail',
    stage: wf.state.currentStage,
    action,
    completion,
    instructions,
    artifacts,
  });
}

/**
 * Read an artifact's content from disk and return it to the webview.
 * Used for inline artifact preview in the stage accordion.
 */
async function handleRequestArtifactContent(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  artifactId: string,
): Promise<void> {
  const artifacts = await deps.artifactManager.listAll();
  const artifact = artifacts.find((a) => a.id === artifactId);

  if (!artifact) {
    reply({ type: 'artifactContent', artifactId, content: null });
    return;
  }

  const content = await deps.artifactManager.read(artifact);
  reply({ type: 'artifactContent', artifactId, content });
}

/**
 * Send the stage prompt to the agent and notify the webview that
 * the agent is working. The ArtifactWatcher will detect the result.
 */
async function handleSendToAgent(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  stage: LifecycleStage,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }

  // Find artifact paths needed by downstream stages
  let specPath: string | undefined;
  if (stage === 'plan' || stage === 'build') {
    const artifacts = await deps.artifactManager.listAll();
    if (stage === 'plan') {
      specPath = artifacts.find((a) => a.type === 'spec')?.path;
    } else {
      // Build stage needs the plan path
      specPath = artifacts.find((a) => a.type === 'plan')?.path;
    }
  }

  // Build the prompt for this stage
  const prompt = deps.promptTemplates.getPromptForStage(stage, {
    objective: wf.objective,
    context: null,
    signals: wf.detectedRisks,
    processLevel: wf.processLevel,
    specPath,
    testCommand: null,
    buildCommand: 'npm run build',
  });

  if (!prompt) {
    reply({
      type: 'error',
      message: `Stage "${stage}" does not need agent-generated artifacts`,
    });
    return;
  }

  // Tell the webview the agent is working
  reply({
    type: 'agentStatus',
    status: 'working',
    stage,
    message: `Generating artifacts for ${stage} stage...`,
  });

  // Send the prompt to the agent
  await deps.agentBridge.sendToChat(prompt);
}

/**
 * Called when the ArtifactWatcher detects a new or changed artifact.
 * Resets agent status to idle, forwards the artifact to the webview,
 * and sends a refreshed stageDetail so the UI updates immediately.
 *
 * This is the key reactivity handler — it closes the loop:
 * sendToAgent → agent works → artifact saved → watcher fires →
 * notifyArtifactDetected → agentStatus:idle + stageDetail refresh.
 */
async function handleNotifyArtifactDetected(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  artifact: Artifact,
): Promise<void> {
  // 1. Forward the artifact to the webview
  reply({ type: 'artifactDetected', artifact });

  // 2. Reset agent status to idle
  reply({ type: 'agentStatus', status: 'idle' });

  // 3. Refresh stage detail so the UI shows the new artifact
  await handleRequestStageDetail(deps, reply);
}

/**
 * Open an artifact file in the VS Code editor for review.
 * Resolves the artifact's relative path to an absolute path
 * and opens it via WorkspaceService.
 */
async function handleOpenArtifact(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  artifactId: string,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'error', message: 'No workspace open' });
    return;
  }

  const artifacts = await deps.artifactManager.listAll();
  const artifact = artifacts.find((a) => a.id === artifactId);

  if (!artifact) {
    reply({ type: 'error', message: `Artifact "${artifactId}" not found` });
    return;
  }

  const fullPath = `${root}/${WORKFLOW_DIR}/${artifact.path}`;
  await deps.workspaceService.openFileInEditor(fullPath);
}
