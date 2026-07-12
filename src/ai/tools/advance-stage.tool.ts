import type * as vscode from 'vscode';
import type { WorkflowEngine } from '../../core/workflow-engine';
import type { StateManager } from '../../core/state-manager';
import type { StageExecutor } from '../../core/stage-executor';
import type { ArtifactManager } from '../../services/artifact-manager.service';
import type { ApprovalMode, WorkflowDefinition } from '../../core/types';

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
      throw new Error(
        'No active workflow. Start a workflow first using engineering_start_workflow.',
      );
    }

    if (wf.state.status !== 'active') {
      throw new Error(`Workflow is ${wf.state.status}, not active. Cannot advance.`);
    }

    // Step 1: Auto-approve all pending approvals and gates via update()
    const approved = await this.stateManager.update((current) => {
      const stage = current.state.currentStage;
      const hasPending =
        current.approvals.some((a) => a.status === 'pending') ||
        current.qualityGates.some((g) => g.status === 'pending' && g.stage === stage);

      if (!hasPending) return current;

      const now = new Date().toISOString();
      return {
        ...current,
        approvals: current.approvals.map((a) =>
          a.status === 'pending' ? { ...a, status: 'approved' as const, approvedAt: now } : a,
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
                ? ['The workflow is complete. Summarize what was accomplished.']
                : [getNextStepForStage(updated.state.currentStage)],
          },
          null,
          2,
        ),
      ),
    ]);
  }
}

// ─── Shared stage → next-step mapping ───────────────────────────────────────

const STAGE_NEXT_STEPS: Readonly<Record<string, string>> = {
  define:
    'Follow the spec-driven-development skill to generate a specification. Scan the workspace first. Then call engineering_save_artifact with type="spec".',
  plan: 'Follow the planning-and-task-breakdown skill to create a task plan from the spec. Then call engineering_save_artifact with type="plan".',
  build:
    'Follow the incremental-implementation and test-driven-development skills. Implement tasks one at a time with TDD. When all tasks are done, call engineering_advance_stage.',
  verify: 'Run tests, build, and lint. Then call engineering_save_artifact with type="report".',
  review:
    'Follow the code-review-and-quality skill for a 5-axis review. Then call engineering_save_artifact with type="review".',
  ship: 'Follow the shipping-and-launch skill. Complete the pre-launch checklist. Then call engineering_save_artifact with type="report".',
};

function getNextStepForStage(stage: string | null): string {
  if (!stage) return 'Workflow has no active stage.';
  return STAGE_NEXT_STEPS[stage] ?? `Complete the ${stage} stage.`;
}
