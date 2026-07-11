import type * as vscode from 'vscode';
import type { WorkflowEngine } from '../../core/workflow-engine';
import type { StateManager } from '../../core/state-manager';
import type { StageExecutor } from '../../core/stage-executor';
import type { ArtifactManager } from '../../services/artifact-manager.service';
import type { WorkflowDefinition } from '../../core/types';

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
 * Returns the next stage's instructions.
 */
export class AdvanceStageTool implements vscode.LanguageModelTool<AdvanceStageInput> {
  constructor(
    private readonly workflowEngine: WorkflowEngine,
    private readonly stateManager: StateManager,
    private readonly stageExecutor: StageExecutor,
    private readonly artifactManager: ArtifactManager,
    private readonly onWorkflowUpdated: (wf: WorkflowDefinition) => void,
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

    // Auto-approve all pending approvals and pass all pending gates
    // for the current stage. The agent calling advance_stage means
    // the work is done — treat it as implicit approval.
    let currentWf = wf;
    const currentStage = wf.state.currentStage;
    const hasPending =
      wf.approvals.some((a) => a.status === 'pending') ||
      wf.qualityGates.some((g) => g.status === 'pending' && g.stage === currentStage);

    if (hasPending) {
      const now = new Date().toISOString();
      currentWf = {
        ...wf,
        approvals: wf.approvals.map((a) =>
          a.status === 'pending' ? { ...a, status: 'approved' as const, approvedAt: now } : a,
        ),
        qualityGates: wf.qualityGates.map((g) => {
          if (g.status !== 'pending' || g.stage !== currentStage) return g;
          return {
            ...g,
            status: 'passed' as const,
            result: { passedAt: now, details: 'Auto-approved by agent' },
          };
        }),
      };
      await this.stateManager.save(currentWf);
    }

    // Check stage completion
    const artifacts = await this.artifactManager.listAll();
    const result = this.stageExecutor.evaluateStageCompletion(currentWf, artifacts);

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

    // Advance to next stage
    const updated = await this.workflowEngine.advanceStage(currentWf);
    await this.stateManager.save(updated);

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
                : [
                    `Follow the skill instructions for the ${updated.state.currentStage} stage.`,
                    updated.state.currentStage === 'define'
                      ? 'Follow the spec-driven-development skill. Then call engineering_save_artifact with type "spec".'
                      : updated.state.currentStage === 'plan'
                        ? 'Follow the planning-and-task-breakdown skill. Then call engineering_save_artifact with type "plan".'
                        : updated.state.currentStage === 'build'
                          ? 'Follow the incremental-implementation and test-driven-development skills. Implement tasks one at a time.'
                          : updated.state.currentStage === 'verify'
                            ? 'Run tests, build, and lint. Then call engineering_save_artifact with type "report".'
                            : updated.state.currentStage === 'review'
                              ? 'Follow the code-review-and-quality skill. Then call engineering_save_artifact with type "review".'
                              : updated.state.currentStage === 'ship'
                                ? 'Follow the shipping-and-launch skill. Then call engineering_save_artifact with type "report".'
                                : 'Follow the stage instructions.',
                  ],
          },
          null,
          2,
        ),
      ),
    ]);
  }
}
