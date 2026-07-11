import type { StateManager } from '../core/state-manager';
import type { WorkflowEngine } from '../core/workflow-engine';
import type { RiskEngine } from '../core/risk-engine';
import type { WorkflowGenerator } from '../core/workflow-generator';
import type { SkillEngine } from '../core/skill-engine';
import type { ProjectDetector } from '../core/project-detector';
import type { ContextAnalyzer } from '../core/context-analyzer';
import type { ContextSignalDetector } from '../core/context-signal-detector';
import type { CapabilityRecommender } from '../core/capability-recommender';
import type { NotificationService } from '../services/notification.service';
import type { WorkspaceService } from '../services/workspace.service';
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
  readonly projectDetector: ProjectDetector;
  readonly contextAnalyzer: ContextAnalyzer;
  readonly contextSignalDetector: ContextSignalDetector;
  readonly capabilityRecommender: CapabilityRecommender;
  readonly notificationService: NotificationService;
  readonly workspaceService: WorkspaceService;
  readonly fileSystem: FileIO;
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
  const wf = deps.workflowGenerator.generate(`wf-${Date.now()}`, objective, assessment as never);
  await deps.stateManager.save(wf);
  reply({ type: 'state', workflow: wf });
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
  // TODO: load history from state manager
  void deps;
  reply({ type: 'history', entries: [], hasMore: false });
}
