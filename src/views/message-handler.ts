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
} from '../core/types';
import {
  WORKFLOW_DIR,
  STACK_FILE,
  CONVENTIONS_FILE,
  ARCHITECTURE_FILE,
  BOUNDARIES_FILE,
  INSTRUCTIONS_FILE,
} from '../constants';

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
    if (!isValidMessage(message)) return;
    const msg = message as MessageToHost;

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
          await handleRequestHistory(deps, reply);
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
        case 'requestSettings':
          await handleRequestSettings(deps, reply);
          break;
        case 'updateSettings':
          await handleUpdateSettings(deps, reply, msg.settings);
          break;
        case 'requestKnowledge':
          await handleRequestKnowledge(deps, reply);
          break;
        case 'refreshKnowledge':
          await handleRefreshKnowledge(deps, reply);
          break;
        case 'openKnowledgeFile':
          await handleOpenKnowledgeFile(deps, msg.fileName);
          break;
        case 'requestHistoryDetail':
          await handleRequestHistoryDetail(deps, reply, msg.archivePath);
          break;
        case 'cancelAgent':
          await handleCancelAgent();
          break;
        case 'pauseWorkflow':
          await handlePauseWorkflow(deps, reply);
          break;
        case 'resumeWorkflow':
          await handleResumeWorkflow(deps, reply);
          break;
        case 'deleteWorkflow':
          await handleDeleteWorkflow(deps, reply);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      reply({ type: 'error', message });
    }
  };
}

// ─── Message Validation ─────────────────────────────────────────────────────

/** Known message types from the webview — used for runtime validation. */
const VALID_MESSAGE_TYPES = new Set<string>([
  'requestState',
  'requestContext',
  'analyzeObjective',
  'startWorkflow',
  'advanceStage',
  'skipStage',
  'approve',
  'reject',
  'navigate',
  'requestHistory',
  'requestStageActions',
  'executeStage',
  'requestArtifacts',
  'requestGateStatus',
  'generateArtifact',
  'setupExistingProject',
  'setupNewProject',
  'requestOnboardingStatus',
  'requestStageDetail',
  'requestArtifactContent',
  'sendToAgent',
  'notifyArtifactDetected',
  'openArtifact',
  'cancelWorkflow',
  'requestSettings',
  'updateSettings',
  'requestKnowledge',
  'refreshKnowledge',
  'openKnowledgeFile',
  'requestHistoryDetail',
  'cancelAgent',
  'pauseWorkflow',
  'resumeWorkflow',
  'deleteWorkflow',
]);

/**
 * Runtime validation for incoming messages.
 * Checks structure and that the type is a known message type.
 */
function isValidMessage(message: unknown): message is MessageToHost {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const msg = message as { type: unknown };
  return typeof msg.type === 'string' && VALID_MESSAGE_TYPES.has(msg.type);
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

  // Read context from .codestudio/knowledge/stack.md if it exists (agent creates this)
  const stackPath = `${root}/${WORKFLOW_DIR}/${STACK_FILE}`;
  let languages: string[] = [];
  let frameworks: string[] = [];
  let testFramework: string | null = null;
  let packageManager: string | null = null;
  let detectedStack: string[] = [];

  try {
    if (await deps.fileSystem.exists(stackPath)) {
      const content = await deps.fileSystem.read(stackPath);
      // Parse simple key-value patterns from the markdown
      const lines = content.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('language') && line.includes(':')) {
          languages = extractListValues(line);
        } else if (lower.includes('framework') && line.includes(':')) {
          frameworks = extractListValues(line);
        } else if (lower.includes('test') && line.includes(':')) {
          testFramework = extractSingleValue(line);
        } else if (lower.includes('package manager') && line.includes(':')) {
          packageManager = extractSingleValue(line);
        }
      }
      detectedStack = [...languages, ...frameworks].filter(Boolean);
    }
  } catch {
    // stack.md not yet created by agent — return defaults
  }

  // Read conventions from .codestudio/conventions.md if it exists
  let conventions: string[] = [];
  try {
    const convPath = `${root}/${WORKFLOW_DIR}/${CONVENTIONS_FILE}`;
    if (await deps.fileSystem.exists(convPath)) {
      const content = await deps.fileSystem.read(convPath);
      // Extract bullet points as conventions
      conventions = content
        .split('\n')
        .filter((l) => l.trim().startsWith('- '))
        .map((l) => l.trim().replace(/^- /, ''))
        .slice(0, 20); // Cap at 20 to avoid flooding the UI
    }
  } catch {
    // conventions.md not yet created
  }

  reply({
    type: 'context',
    context: {
      rootPath: root,
      languages,
      frameworks,
      testFramework,
      packageManager,
      detectedStack,
      conventions,
      generatedAt: new Date().toISOString(),
    },
  });
}

/** Extract comma-separated values after the colon in a line. */
function extractListValues(line: string): string[] {
  const after = line.split(':').slice(1).join(':').trim();
  return after
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^[*_`]+|[*_`]+$/g, ''))
    .filter(Boolean);
}

/** Extract a single value after the colon in a line. */
function extractSingleValue(line: string): string | null {
  const after = line
    .split(':')
    .slice(1)
    .join(':')
    .trim()
    .replace(/^[*_`]+|[*_`]+$/g, '');
  return after || null;
}

async function handleAnalyzeObjective(
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
  objective: string,
): Promise<void> {
  // Send the objective to the agent — the agent will call
  // engineering_start_workflow with its own assessment.
  // For the webview, we send a prompt to the agent.
  const prompt = `The user wants to work on: "${objective}"

Call \`engineering_update_status\` to report progress as you work.

## Step 1: Evaluate clarity

First, assess whether the objective is clear enough to start work:
- Is it specific enough to understand what needs to be built or changed?
- Does it make sense in the context of this project?
- Are there obvious ambiguities that would lead to wrong implementation?

**If the objective is vague, unclear, or nonsensical:**
Ask the user 1-3 clarifying questions to understand what they actually want. Use the **interview-me** skill approach — ask one question at a time. Do NOT start the workflow until you understand the requirement.

**If the objective is clear enough to proceed:**
Go to Step 2.

## Step 2: Start the workflow

Call \`engineering_start_workflow\` tool with:
- objective: the clarified objective (use the user's original if it was already clear)
- workType: your assessment (feature/bugfix/refactor/infrastructure/documentation/security)
- complexity: your assessment (trivial/simple/moderate/complex/critical)
- riskLevel: your assessment (low/medium/high)
- processLevel: your assessment — choose based on the task:
  • **light** (3 stages: plan→build→verify) — typo fixes, docs, config changes, simple bug fixes
  • **standard** (5 stages: define→plan→build→verify→review) — normal features, bugs, refactors with spec + review
  • **thorough** (6 stages: define→plan→build→verify→review→ship) — complex features, architecture, security
  • **guarded** (6 stages + extra gates) — DB migrations, auth/payment, breaking changes
- contextSignals: what the project touches

Determine ALL fields yourself based on the objective and project context. Be realistic — don't over-assess simple tasks.`;

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
  // 0. Handle existing workflow
  const existing = await deps.stateManager.load();
  if (existing) {
    if (existing.state.status === 'active') {
      // Block: don't silently overwrite an active workflow
      reply({
        type: 'error',
        message: 'A workflow is already active. Cancel or complete it before starting a new one.',
      });
      return;
    }
    // Archive completed/failed workflows
    if (existing.state.status === 'completed' || existing.state.status === 'failed') {
      await deps.historyManager.archiveWorkflow(existing);
      await deps.stateManager.clear();
    }
  }

  // 1. Generate workflow definition (stages, gates, skills, approvals)
  const wf = deps.workflowGenerator.generate(`wf-${Date.now()}`, objective, assessment as never);

  // 2. Start the workflow — transitions from idle → active, activates first stage
  const started = await deps.workflowEngine.start(wf);

  // 3. Save workflow state atomically
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

async function handleRequestHistory(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const entries = await deps.historyManager.loadHistory();
  reply({ type: 'history', entries });
}

// ─── Settings Handler ───────────────────────────────────────────────────────

async function handleRequestSettings(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({
      type: 'settingsLoaded',
      settings: {
        processLevelDefault: 'auto',
        autoApproveLowRisk: false,
        reviewTimeoutMinutes: 30,
      },
    });
    return;
  }

  const configPath = `${root}/${WORKFLOW_DIR}/config.json`;
  try {
    if (await deps.fileSystem.exists(configPath)) {
      const content = await deps.fileSystem.read(configPath);
      const config = JSON.parse(content) as Record<string, unknown>;
      reply({
        type: 'settingsLoaded',
        settings: {
          processLevelDefault: (config.processLevelDefault as string) ?? 'auto',
          autoApproveLowRisk: (config.autoApproveLowRisk as boolean) ?? false,
          reviewTimeoutMinutes: (config.reviewTimeoutMinutes as number) ?? 30,
        },
      });
      return;
    }
  } catch {
    // Corrupt config — return defaults
  }
  reply({
    type: 'settingsLoaded',
    settings: { processLevelDefault: 'auto', autoApproveLowRisk: false, reviewTimeoutMinutes: 30 },
  });
}

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

  reply({ type: 'settingsUpdated' });
}

// ─── Knowledge Handlers ─────────────────────────────────────────────────────

/** All knowledge files with their display info. */
const KNOWLEDGE_FILES = [
  { name: 'architecture.md', path: ARCHITECTURE_FILE, icon: '🏗️' },
  { name: 'conventions.md', path: CONVENTIONS_FILE, icon: '📐' },
  { name: 'stack.md', path: STACK_FILE, icon: '🔧' },
  { name: 'boundaries.md', path: BOUNDARIES_FILE, icon: '🚧' },
  { name: 'codestudio-instructions.md', path: INSTRUCTIONS_FILE, icon: '📋' },
] as const;

async function handleRequestKnowledge(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'knowledgeFiles', files: [] });
    return;
  }

  const base = `${root}/${WORKFLOW_DIR}`;
  const files = await Promise.all(
    KNOWLEDGE_FILES.map(async (kf) => {
      const fullPath = `${base}/${kf.path}`;
      let exists = false;
      let preview = '';
      let updatedAt: string | null = null;

      try {
        if (await deps.fileSystem.exists(fullPath)) {
          exists = true;
          const content = await deps.fileSystem.read(fullPath);
          // First non-empty, non-heading line as preview
          const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
          preview = (lines[0] ?? '').trim().slice(0, 120);
          // Use current time as approximation (no stat API in FileIO)
          updatedAt = new Date().toISOString();
        }
      } catch {
        // File read error — treat as not existing
      }

      return {
        name: kf.name,
        path: kf.path,
        exists,
        preview,
        updatedAt,
      };
    }),
  );

  reply({ type: 'knowledgeFiles', files });
}

async function handleRefreshKnowledge(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const prompt = `Refresh the project knowledge files in .codestudio/knowledge/.

## Instructions
1. Scan the workspace thoroughly — read package.json, source files, config files, tests, README, etc.
2. Compare what you find with the existing knowledge files in .codestudio/knowledge/.
3. Update ONLY the files that have drifted from reality. Do NOT overwrite user-added notes.
4. For each file, read the existing content first, then update only what changed:
   - \`knowledge/architecture.md\` — Architecture, module boundaries, patterns, data flow
   - \`knowledge/conventions.md\` — Coding conventions, naming, formatting, patterns
   - \`knowledge/stack.md\` — Tech stack: languages, frameworks, deps with versions
   - \`knowledge/boundaries.md\` — Always do / Ask first / Never do rules
   - \`codestudio-instructions.md\` — Update knowledge file references if paths changed; add any new project-specific rules

**Important:** Base everything on the ACTUAL codebase. Read real files. Don't guess.
**Important:** codestudio-instructions.md should reference knowledge files by path, NOT duplicate their content.
After updating, summarize what changed.`;

  await deps.agentBridge.sendToChat(prompt);

  // Tell the webview the agent is working on it
  reply({
    type: 'agentStatus',
    status: 'working',
    message: 'Refreshing project knowledge...',
  });
}

async function handleOpenKnowledgeFile(deps: MessageHandlerDeps, fileName: string): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) return;

  const filePath = `${root}/${WORKFLOW_DIR}/${fileName}`;
  try {
    const vscodeModule = await import('vscode');
    const uri = vscodeModule.Uri.file(filePath);
    await vscodeModule.window.showTextDocument(uri);
  } catch {
    // File doesn't exist or can't be opened
  }
}

// ─── History Detail Handler ─────────────────────────────────────────────────

async function handleRequestHistoryDetail(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  archivePath: string,
): Promise<void> {
  const archive = await deps.historyManager.loadArchivedWorkflow(archivePath);
  if (!archive) {
    reply({ type: 'error', message: 'Archived workflow not found' });
    return;
  }

  // Find the matching history entry
  const entries = await deps.historyManager.loadHistory();
  const entry = entries.find((e) => e.archivePath === archivePath);
  if (!entry) {
    reply({ type: 'error', message: 'History entry not found' });
    return;
  }

  reply({
    type: 'historyDetail',
    entry,
    workflow: archive.workflow,
    artifacts: archive.artifacts,
  });
}

// ─── Cancel Agent Handler ───────────────────────────────────────────────────

async function handleCancelAgent(): Promise<void> {
  try {
    const vscodeModule = await import('vscode');
    // Try to cancel the current chat request
    try {
      await vscodeModule.commands.executeCommand('workbench.action.chat.cancel');
    } catch {
      // Command may not exist — try alternative
      try {
        await vscodeModule.commands.executeCommand('workbench.action.chat.stop');
      } catch {
        // No cancel API available — agent will continue in background
        // but the UI has already been reset by the caller
      }
    }
  } catch {
    // vscode import failed — running in test environment
  }
}

// ─── Pause / Resume / Delete Handlers ───────────────────────────────────────

async function handlePauseWorkflow(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.pause(wf));
    await handleCancelAgent(); // Stop the agent
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'Cannot pause workflow' });
  }
}

async function handleResumeWorkflow(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.resume(wf));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({
      type: 'error',
      message: err instanceof Error ? err.message : 'Cannot resume workflow',
    });
  }
}

async function handleDeleteWorkflow(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  await handleCancelAgent(); // Stop the agent

  // Clear state and artifacts WITHOUT archiving
  await deps.stateManager.clear();
  await deps.historyManager.clearCurrent();

  // Reset UI
  reply({ type: 'state', workflow: null });
}

// ─── Cancel Workflow Handler (archive + clear) ──────────────────────────────

async function handleCancelWorkflow(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();

  if (wf) {
    // Archive the workflow (even if incomplete — preserves history)
    await deps.historyManager.archiveWorkflow(wf);
    // Clear the on-disk state so requestState doesn't reload the old workflow
    await deps.stateManager.clear();
  }

  // Always reset the UI — even if workflow was already archived/cleared
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
        approvals: wf.approvals.map((a) => {
          // Only auto-approve approvals for the current stage
          const isCurrentStage = wf.qualityGates.some(
            (g) => g.stage === currentStage && a.artifact === g.id.replace('-approved', ''),
          );
          if (a.status === 'pending' && isCurrentStage) {
            return { ...a, status: 'approved' as const, approvedAt: now };
          }
          return a;
        }),
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

      // Step 4: Archive and clear if workflow is now completed (last stage advanced)
      if (advanced.state.status === 'completed') {
        await deps.historyManager.archiveWorkflow(advanced);
        await deps.stateManager.clear();

        // Step 5: Prompt agent to check if knowledge needs updating
        // In user mode: agent asks user before updating
        // In agent mode: agent updates directly
        const knowledgePrompt =
          deps.approvalMode === 'agent'
            ? 'The workflow is complete. Check if this workflow changed the architecture, tech stack, conventions, or boundaries. If so, update the relevant knowledge files in .codestudio/knowledge/ directly.'
            : 'The workflow is complete. Check if this workflow changed the architecture, tech stack, conventions, or boundaries. If so, tell the user which knowledge files may need updating and ask if they want you to refresh them.';
        void deps.agentBridge.sendToChat(knowledgePrompt);
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
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
  projectName: string,
  description: string,
): Promise<void> {
  const objective = description || `Build ${projectName}`;

  const prompt = `Start the engineering workflow for: **${projectName}**

**Important:** Call \`engineering_update_status\` frequently to report your progress (e.g., "Interviewing user...", "Creating architecture.md..."). The user sees these messages in real-time.

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

  // Check if setup is fully complete — codestudio-instructions.md is the last
  // file created during setup, so its existence means all knowledge files are done.
  const instructionsExist = await deps.fileSystem.exists(
    `${root}/.codestudio/codestudio-instructions.md`,
  );

  if (instructionsExist) {
    // Fully onboarded — all knowledge files exist
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
        stage: 'plan',
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
