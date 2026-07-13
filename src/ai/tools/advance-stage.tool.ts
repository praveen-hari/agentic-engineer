import type * as vscode from 'vscode';
import type { WorkflowEngine } from '../../core/workflow-engine';
import type { StateManager } from '../../core/state-manager';
import type { StageExecutor } from '../../core/stage-executor';
import type { ArtifactManager } from '../../services/artifact-manager.service';
import type { ApprovalMode, LifecycleStage, WorkflowDefinition } from '../../core/types';
import { DEFAULT_PIPELINE, getNextStepForStage, isApprovalForStage } from '../../core/pipeline-config';
import { noActiveWorkflowError, workflowNotActiveError } from './tool-errors';

/** Reads the approvalMode from config. Returns 'user' by default. */
export type ApprovalModeReader = () => Promise<ApprovalMode>;

/**
 * Input for the engineering_advance_stage tool.
 */
export interface AdvanceStageInput {
  readonly force?: boolean;
}

/**
 * Language Model Tool: engineering_advance_stage
 *
 * Checks if the current stage requirements are met (artifacts,
 * gates, approvals) and advances to the next stage if ready.
 *
 * Behavior depends on approvalMode:
 * - 'agent': auto-approves gates AND advances the stage
 * - 'user': auto-approves gates but does NOT advance — user must
 *   click "Approve & Continue" in the UI
 */
export class AdvanceStageTool implements vscode.LanguageModelTool<AdvanceStageInput> {
  constructor(
    private readonly workflowEngine: WorkflowEngine,
    private readonly stateManager: StateManager,
    private readonly stageExecutor: StageExecutor,
    private readonly artifactManager: ArtifactManager,
    private readonly onWorkflowUpdated: (wf: WorkflowDefinition) => void,
    private readonly readApprovalMode: ApprovalModeReader = async () => 'user',
  ) {}

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<AdvanceStageInput>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: 'Checking stage completion and advancing...',
      confirmationMessages: {
        title: 'Advance Workflow Stage',
        message: new (await import('vscode')).MarkdownString(
          'Check if the current stage requirements are met and advance to the next stage?',
        ),
      },
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<AdvanceStageInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');

    const wf = await this.stateManager.load();
    if (!wf) {
      return noActiveWorkflowError(vscodeModule);
    }

    if (wf.state.status !== 'active') {
      return workflowNotActiveError(vscodeModule, wf.state.status);
    }

    // Step 1: Auto-approve ONLY current-stage approvals and gates via update().
    // Previous versions auto-approved ALL pending approvals across every stage,
    // which silently granted restricted approvals for future stages (e.g.,
    // schema-migration, deployment). Now scoped to the active stage only.
    const approved = await this.stateManager.update((current) => {
      const stage = current.state.currentStage;
      const stageApprovals = current.approvals.filter(
        (a) => a.status === 'pending' && isApprovalForCurrentStage(a.artifact, stage),
      );
      const stageGates = current.qualityGates.filter(
        (g) => g.status === 'pending' && g.stage === stage,
      );
      const hasPending = stageApprovals.length > 0 || stageGates.length > 0;

      if (!hasPending) return current;

      const approvalIds = new Set(stageApprovals.map((a) => a.id));
      const now = new Date().toISOString();
      return {
        ...current,
        approvals: current.approvals.map((a) =>
          approvalIds.has(a.id) ? { ...a, status: 'approved' as const, approvedAt: now } : a,
        ),
        qualityGates: current.qualityGates.map((g) => {
          if (g.status !== 'pending' || g.stage !== stage) return g;
          return {
            ...g,
            status: 'passed' as const,
            result: { passedAt: now, details: 'Auto-approved by agent' },
          };
        }),
      };
    });

    // Step 2: Check stage completion
    const artifacts = await this.artifactManager.listAll();
    const result = this.stageExecutor.evaluateStageCompletion(approved, artifacts);

    if (result.status === 'blocked') {
      return new vscodeModule.LanguageModelToolResult([
        new vscodeModule.LanguageModelTextPart(
          JSON.stringify(
            {
              advanced: false,
              currentStage: result.stage,
              reason: result.message,
              pendingGates: result.pendingGates,
              pendingApprovals: result.pendingApprovals,
              message: `Cannot advance: ${result.message}. Complete the requirements first.`,
            },
            null,
            2,
          ),
        ),
      ]);
    }

    // Step 3: Check approval mode
    const approvalMode = await this.readApprovalMode();

    if (approvalMode === 'user') {
      // User mode: gates are approved, but DON'T advance the stage.
      // The user must click "Approve & Continue" in the UI.
      this.onWorkflowUpdated(approved);

      return new vscodeModule.LanguageModelToolResult([
        new vscodeModule.LanguageModelTextPart(
          JSON.stringify(
            {
              advanced: false,
              currentStage: result.stage,
              gatesApproved: true,
              approvalMode: 'user',
              message: `Stage "${result.stage}" requirements are met. Gates have been approved. Waiting for the user to click "Approve & Continue" in the UI to advance.`,
              nextSteps: [
                'Wait for the user to review and click "Approve & Continue" in the Engineering Workspace panel.',
              ],
            },
            null,
            2,
          ),
        ),
      ]);
    }

    // Agent mode: auto-advance to next stage
    const updated = await this.stateManager.update((current) =>
      this.workflowEngine.advanceStage(current),
    );

    // Get next stage instructions
    const nextAction = this.stageExecutor.getStageAction(updated);
    const instructions = this.stageExecutor.getStageInstructions(updated);

    // Notify extension
    this.onWorkflowUpdated(updated);

    return new vscodeModule.LanguageModelToolResult([
      new vscodeModule.LanguageModelTextPart(
        JSON.stringify(
          {
            advanced: true,
            previousStage: result.stage,
            currentStage: updated.state.currentStage,
            workflowStatus: updated.state.status,
            approvalMode: 'agent',
            stageAction: nextAction
              ? {
                  stage: nextAction.stage,
                  description: nextAction.description,
                  requiredArtifacts: nextAction.requiredArtifacts,
                  requiredGates: nextAction.requiredGates,
                }
              : null,
            instructions,
            message:
              updated.state.status === 'completed'
                ? 'Workflow completed! All stages done.'
                : `Advanced to ${updated.state.currentStage}.`,
            nextSteps:
              updated.state.status === 'completed'
                ? [
                    'The workflow is complete. Summarize what was accomplished.',
                    'Check if this workflow changed the architecture, tech stack, conventions, or boundaries. If so, update the relevant knowledge files in .codestudio/knowledge/. Since approvalMode is "agent", you can update them directly.',
                  ]
                : [getNextStep(updated.state.currentStage)],
          },
          null,
          2,
        ),
      ),
    ]);
  }
}

// ─── Helpers (delegated to PipelineConfig) ──────────────────────────────────

function getNextStep(stage: string | null): string {
  return getNextStepForStage(DEFAULT_PIPELINE, stage);
}

function isApprovalForCurrentStage(artifactName: string, stage: LifecycleStage | null): boolean {
  return isApprovalForStage(DEFAULT_PIPELINE, artifactName, stage);
}
