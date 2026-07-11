import type { StateManager } from '../core/state-manager';
import type { WorkflowEngine } from '../core/workflow-engine';
import type { RiskEngine } from '../core/risk-engine';
import type { WorkflowGenerator } from '../core/workflow-generator';
import type { SkillEngine } from '../core/skill-engine';
import type { StageExecutor } from '../core/stage-executor';
import type { GateRunner } from '../core/gate-runner';
import type { ProjectDetector } from '../core/project-detector';
import type { ContextAnalyzer } from '../core/context-analyzer';
import type { ContextSignalDetector } from '../core/context-signal-detector';
import type { CapabilityRecommender } from '../core/capability-recommender';
import type { PromptTemplates } from '../core/prompt-templates';
import type { NotificationService } from '../services/notification.service';
import type { WorkspaceService } from '../services/workspace.service';
import type { ArtifactManager } from '../services/artifact-manager.service';
import type { AgentBridge } from '../services/agent-bridge.service';
import { WorkspaceScanner } from '../services/workspace-scanner.service';
import type {
  FileIO,
  LifecycleStage,
  MessageToHost,
  MessageToWebview,
  ProjectContext,
  RiskAssessment,
  WorkflowDefinition,
} from '../core/types';

/**
 * Callback to send a response message back to the webview.
 */
export type ReplyFn = (message: MessageToWebview) => void;

/**
 * Dependencies for the webview message handler.
 */
export interface MessageHandlerDeps {
  readonly stateManager: StateManager;
  readonly workflowEngine: WorkflowEngine;
  readonly riskEngine: RiskEngine;
  readonly workflowGenerator: WorkflowGenerator;
  readonly skillEngine: SkillEngine;
  readonly stageExecutor: StageExecutor;
  readonly gateRunner: GateRunner;
  readonly projectDetector: ProjectDetector;
  readonly contextAnalyzer: ContextAnalyzer;
  readonly contextSignalDetector: ContextSignalDetector;
  readonly capabilityRecommender: CapabilityRecommender;
  readonly notificationService: NotificationService;
  readonly workspaceService: WorkspaceService;
  readonly fileSystem: FileIO;
  readonly artifactManager: ArtifactManager;
  readonly promptTemplates: PromptTemplates;
  readonly agentBridge: AgentBridge;
}

/**
 * Cached project context — populated on first requestContext,
 * reused by analyzeObjective for merged risk assessment.
 */
let cachedContext: ProjectContext | null = null;

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
          await handleGenerateArtifact(deps, reply, msg.stage);
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

  try {
    // Scan workspace files and detect project stack
    const scanner = new WorkspaceScanner(deps.fileSystem, root);
    const files = await scanner.scan();
    const detection = deps.projectDetector.detect(files);
    const context = deps.projectDetector.toContext(detection, root);

    // Cache for use by analyzeObjective
    cachedContext = context;

    reply({ type: 'context', context });
  } catch {
    // Fallback to minimal context on error
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
}

async function handleAnalyzeObjective(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  objective: string,
): Promise<void> {
  // Merge workspace context signals into risk assessment
  // This gives brownfield projects richer risk analysis
  const contextSignals = cachedContext
    ? deps.contextSignalDetector.detect(cachedContext, objective)
    : [];

  const baseAssessment = deps.riskEngine.assess(objective, cachedContext ?? undefined);

  // Merge context signals from workspace detection with keyword-based signals
  const mergedSignals = [...new Set([...baseAssessment.contextSignals, ...contextSignals])];

  const assessment: RiskAssessment = {
    ...baseAssessment,
    contextSignals: mergedSignals,
  };

  reply({ type: 'assessment', assessment });
}

async function handleStartWorkflow(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  objective: string,
  assessment: RiskAssessment,
): Promise<void> {
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
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }
  const updated = await deps.workflowEngine.advanceStage(wf);
  await deps.stateManager.save(updated);
  reply({ type: 'state', workflow: updated });
}

async function handleSkipStage(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  stageId: LifecycleStage,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }
  const updated = await deps.workflowEngine.skipStage(wf, stageId);
  await deps.stateManager.save(updated);
  reply({ type: 'state', workflow: updated });
}

async function handleApprove(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  approvalId: string,
  comment?: string,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }
  const updated: WorkflowDefinition = {
    ...wf,
    approvals: wf.approvals.map((a) =>
      a.id === approvalId
        ? { ...a, status: 'approved', approvedAt: new Date().toISOString(), comment }
        : a,
    ),
  };
  await deps.stateManager.save(updated);
  reply({ type: 'state', workflow: updated });
}

async function handleReject(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  approvalId: string,
  comment?: string,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }
  const updated: WorkflowDefinition = {
    ...wf,
    approvals: wf.approvals.map((a) =>
      a.id === approvalId ? { ...a, status: 'rejected', comment } : a,
    ),
  };
  await deps.stateManager.save(updated);
  reply({ type: 'state', workflow: updated });
}

async function handleRequestHistory(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  _page?: number,
): Promise<void> {
  // TODO: load history from archive index
  void deps;
  reply({ type: 'history', entries: [], hasMore: false });
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
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }

  // Get artifacts for the current stage
  const artifacts = await deps.artifactManager.listAll();

  // Evaluate stage completion
  const result = deps.stageExecutor.evaluateStageCompletion(wf, artifacts);

  if (result.status === 'completed') {
    // Auto-advance to next stage
    const updated = await deps.workflowEngine.advanceStage(wf);
    await deps.stateManager.save(updated);
    reply({ type: 'state', workflow: updated });
  } else {
    // Stage is blocked — tell the webview what's needed
    reply({ type: 'stageResult', result });
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

// ─── Artifact Generation (Agent-Delegated) ──────────────────────────────────

async function handleGenerateArtifact(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  stage: LifecycleStage,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }

  // Find the spec path for PLAN stage (needs to reference the spec)
  let specPath: string | undefined;
  if (stage === 'plan') {
    const artifacts = await deps.artifactManager.listAll();
    const spec = artifacts.find((a) => a.type === 'spec');
    specPath = spec?.path;
  }

  // Build the prompt for this stage
  const prompt = deps.promptTemplates.getPromptForStage(stage, {
    objective: wf.objective,
    context: cachedContext,
    signals: wf.detectedRisks,
    processLevel: wf.processLevel,
    specPath,
    testCommand: cachedContext?.testFramework ? `npm test` : null,
    buildCommand: 'npm run build',
  });

  if (!prompt) {
    reply({
      type: 'error',
      message: `Stage "${stage}" does not need agent-generated artifacts`,
    });
    return;
  }

  // Tell the webview we're generating
  reply({
    type: 'generatingArtifact',
    stage,
    message: `Sending prompt to agent for ${stage} stage...`,
  });

  // Send the prompt to the agent — the agent will scan the workspace,
  // generate the artifact, and save it to .codestudio/artifacts/.
  // The ArtifactWatcher will detect the new file and notify the webview.
  await deps.agentBridge.sendToChat(prompt);
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

  // Check if .codestudio/ exists — if so, project is already set up
  const codestudioExists = await deps.fileSystem.exists(`${root}/.codestudio/config.json`);

  if (codestudioExists) {
    // Already onboarded — load context and go to ready state
    try {
      const scanner = new WorkspaceScanner(deps.fileSystem, root);
      const files = await scanner.scan();
      const detection = deps.projectDetector.detect(files);
      const context = deps.projectDetector.toContext(detection, root);
      cachedContext = context;

      const pType = WorkspaceScanner.isGreenfield(files) ? 'greenfield' : 'brownfield';
      reply({
        type: 'onboardingStatus',
        status: 'ready',
        projectType: pType,
        context,
        hasExistingFiles: true,
      });
      reply({ type: 'context', context });
    } catch {
      reply({
        type: 'onboardingStatus',
        status: 'ready',
        projectType: 'brownfield',
        context: null,
        hasExistingFiles: true,
      });
    }
  } else {
    // Not onboarded yet — check if workspace has existing files
    let hasFiles = false;
    try {
      const scanner = new WorkspaceScanner(deps.fileSystem, root);
      const files = await scanner.scan();
      hasFiles = !WorkspaceScanner.isGreenfield(files);
    } catch {
      // If scan fails, assume no files
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

// No helpers needed — agent handles all context generation via tools.
