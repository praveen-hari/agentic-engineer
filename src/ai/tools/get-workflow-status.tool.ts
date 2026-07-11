import type { StateManager } from '../../core/state-manager';
import type { WorkflowDefinition } from '../../core/types';

/**
 * Input for the get_workflow_status language model tool.
 */
export interface GetWorkflowStatusInput {
  readonly includeHistory?: boolean;
}

/**
 * Result from the get_workflow_status tool.
 */
export interface GetWorkflowStatusResult {
  readonly hasActiveWorkflow: boolean;
  readonly status: string | null;
  readonly currentStage: string | null;
  readonly objective: string | null;
  readonly processLevel: string | null;
  readonly stagesCompleted: number;
  readonly stagesTotal: number;
  readonly pendingApprovals: number;
  readonly pendingGates: number;
}

/**
 * Language Model Tool: get_workflow_status (SPEC §5.1).
 *
 * Returns the current workflow state — active stage, completed stages,
 * pending stages, and any pending approvals.
 */
export class GetWorkflowStatusTool {
  constructor(private readonly stateManager: StateManager) {}

  /**
   * Prepare the invocation.
   */
  prepareInvocation(_input: GetWorkflowStatusInput): {
    invocationMessage: string;
    confirmationTitle: string;
    confirmationMessage: string;
  } {
    return {
      invocationMessage: 'Fetching workflow status...',
      confirmationTitle: 'Get Workflow Status',
      confirmationMessage: 'Retrieve the current engineering workflow status?',
    };
  }

  /**
   * Execute the tool — returns the current workflow status.
   */
  async invoke(_input: GetWorkflowStatusInput): Promise<GetWorkflowStatusResult> {
    const workflow = await this.stateManager.load();

    if (!workflow) {
      return {
        hasActiveWorkflow: false,
        status: null,
        currentStage: null,
        objective: null,
        processLevel: null,
        stagesCompleted: 0,
        stagesTotal: 0,
        pendingApprovals: 0,
        pendingGates: 0,
      };
    }

    return this.buildResult(workflow);
  }

  private buildResult(wf: WorkflowDefinition): GetWorkflowStatusResult {
    const stagesCompleted = wf.stages.filter((s: { status: string }) => s.status === 'completed').length;
    const pendingApprovals = wf.approvals.filter((a: { status: string }) => a.status === 'pending').length;
    const pendingGates = wf.qualityGates.filter((g: { status: string }) => g.status === 'pending').length;

    return {
      hasActiveWorkflow: wf.state.status === 'active',
      status: wf.state.status,
      currentStage: wf.state.currentStage,
      objective: wf.objective,
      processLevel: wf.processLevel,
      stagesCompleted,
      stagesTotal: wf.stages.length,
      pendingApprovals,
      pendingGates,
    };
  }
}
