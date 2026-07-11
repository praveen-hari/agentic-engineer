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
import type { LifecycleStage, MessageToHost, RiskAssessment, WorkflowDefinition } from '../core/types';

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
}

/**
 * Handle messages from the webview and route them to the appropriate
 * core engine operations. Returns responses via the webview.
 *
 * This is a factory function that returns a message handler suitable
 * for passing to the WebviewViewProvider.
 */
export function handleWebviewMessage(deps: MessageHandlerDeps): (message: unknown) => Promise<void> {
  return async (message: unknown) => {
    const msg = message as MessageToHost;
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return;

    // The webview is accessed via the view provider — this handler
    // processes the message and would send a response back via
    // webviewView.webview.postMessage(). The actual webview reference
    // is managed by the view provider.
    switch (msg.type) {
      case 'requestState':
        await handleRequestState(deps);
        break;
      case 'requestContext':
        await handleRequestContext(deps);
        break;
      case 'analyzeObjective':
        await handleAnalyzeObjective(deps, msg.objective);
        break;
      case 'startWorkflow':
        await handleStartWorkflow(deps, msg.objective, msg.assessment);
        break;
      case 'advanceStage':
        await handleAdvanceStage(deps);
        break;
      case 'skipStage':
        await handleSkipStage(deps, msg.stageId);
        break;
      case 'approve':
        await handleApprove(deps, msg.approvalId, msg.comment);
        break;
      case 'reject':
        await handleReject(deps, msg.approvalId, msg.comment);
        break;
      case 'navigate':
        // Navigation is handled in the webview — no host action needed
        break;
      case 'requestHistory':
        await handleRequestHistory(deps, msg.page);
        break;
    }
  };
}

async function handleRequestState(deps: MessageHandlerDeps): Promise<void> {
  const workflow = await deps.stateManager.load();
  // Response would be sent back via webview.postMessage
  void workflow;
}

async function handleRequestContext(deps: MessageHandlerDeps): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) return;
  // In production, scan workspace files and generate context
  void deps.projectDetector;
  void deps.contextAnalyzer;
}

async function handleAnalyzeObjective(deps: MessageHandlerDeps, objective: string): Promise<void> {
  const assessment = deps.riskEngine.assess(objective);
  deps.notificationService.showInfo(
    `Analyzed: ${assessment.workType} / ${assessment.processLevel}`,
  );
}

async function handleStartWorkflow(
  deps: MessageHandlerDeps,
  objective: string,
  assessment: RiskAssessment,
): Promise<void> {
  // Generate workflow from assessment and save
  const wf = deps.workflowGenerator.generate(
    `wf-${Date.now()}`,
    objective,
    assessment as never,
  );
  await deps.stateManager.save(wf);
  deps.notificationService.showInfo('Workflow started');
}

async function handleAdvanceStage(deps: MessageHandlerDeps): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) return;
  const updated = await deps.workflowEngine.advanceStage(wf);
  await deps.stateManager.save(updated);
}

async function handleSkipStage(
  deps: MessageHandlerDeps,
  stageId: LifecycleStage,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) return;
  const updated = await deps.workflowEngine.skipStage(wf, stageId);
  await deps.stateManager.save(updated);
}

async function handleApprove(
  deps: MessageHandlerDeps,
  approvalId: string,
  comment?: string,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) return;
  const updated: WorkflowDefinition = {
    ...wf,
    approvals: wf.approvals.map((a) =>
      a.id === approvalId
        ? { ...a, status: 'approved', approvedAt: new Date().toISOString(), comment }
        : a,
    ),
  };
  await deps.stateManager.save(updated);
  deps.notificationService.showInfo('Approved');
}

async function handleReject(
  deps: MessageHandlerDeps,
  approvalId: string,
  comment?: string,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) return;
  const updated: WorkflowDefinition = {
    ...wf,
    approvals: wf.approvals.map((a) =>
      a.id === approvalId
        ? { ...a, status: 'rejected', comment }
        : a,
    ),
  };
  await deps.stateManager.save(updated);
  deps.notificationService.showError('Rejected');
}

async function handleRequestHistory(deps: MessageHandlerDeps, _page?: number): Promise<void> {
  // History loading would go here — for now, placeholder
  void deps;
}
