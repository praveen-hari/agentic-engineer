import type * as vscode from 'vscode';
import type { RiskEngine } from '../../core/risk-engine';
import type { WorkflowGenerator } from '../../core/workflow-generator';
import type { WorkflowEngine } from '../../core/workflow-engine';
import type { StateManager } from '../../core/state-manager';
import type { StageExecutor } from '../../core/stage-executor';
import type { ContextSignalDetector } from '../../core/context-signal-detector';
import type { ProjectContext, WorkflowDefinition } from '../../core/types';
import type { ArtifactManager } from '../../services/artifact-manager.service';

/**
 * Input for the engineering_start_workflow tool.
 */
export interface StartWorkflowInput {
  readonly objective: string;
}

/**
 * Language Model Tool: engineering_start_workflow
 *
 * Analyzes the objective → creates workflow → starts first stage.
 * Returns the workflow state and instructions for the current stage.
 *
 * The agent should call this when the user describes what they want
 * to build. After this tool returns, the agent should follow the
 * stage instructions (e.g., generate a spec for the DEFINE stage).
 */
export class StartWorkflowTool implements vscode.LanguageModelTool<StartWorkflowInput> {
  constructor(
    private readonly riskEngine: RiskEngine,
    private readonly workflowGenerator: WorkflowGenerator,
    private readonly workflowEngine: WorkflowEngine,
    private readonly stateManager: StateManager,
    private readonly stageExecutor: StageExecutor,
    private readonly contextSignalDetector: ContextSignalDetector,
    private readonly artifactManager: ArtifactManager,
    private readonly getContext: () => ProjectContext | null,
    private readonly onWorkflowStarted: (wf: WorkflowDefinition) => void,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<StartWorkflowInput>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Starting workflow: "${options.input.objective.slice(0, 60)}..."`,
      confirmationMessages: {
        title: 'Start Engineering Workflow',
        message: new (await import('vscode')).MarkdownString(
          `Start an engineering workflow for:\n\n> ${options.input.objective}\n\nThis will analyze the request, determine the process level, and create a staged workflow.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<StartWorkflowInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');
    const { objective } = options.input;

    // 1. Assess risk with project context
    const context = this.getContext();
    const contextSignals = context
      ? this.contextSignalDetector.detect(context, objective)
      : [];
    const assessment = this.riskEngine.assess(objective, context ?? undefined);
    const mergedAssessment = {
      ...assessment,
      contextSignals: [...new Set([...assessment.contextSignals, ...contextSignals])],
    };

    // 2. Generate workflow
    const wf = this.workflowGenerator.generate(
      `wf-${Date.now()}`,
      objective,
      mergedAssessment as never,
    );

    // 3. Start workflow (activates first stage)
    const started = await this.workflowEngine.start(wf);

    // 4. Save state
    await this.stateManager.save(started);
    await this.artifactManager.saveObjective(objective);

    // 5. Get stage instructions
    const stageAction = this.stageExecutor.getStageAction(started);
    const instructions = this.stageExecutor.getStageInstructions(started);

    // 6. Notify extension (triggers UI update)
    this.onWorkflowStarted(started);

    return new vscodeModule.LanguageModelToolResult([
      new vscodeModule.LanguageModelTextPart(JSON.stringify({
        workflowId: started.id,
        objective,
        processLevel: started.processLevel,
        riskLevel: mergedAssessment.riskLevel,
        workType: mergedAssessment.workType,
        activeSkills: started.activeSkills,
        currentStage: started.state.currentStage,
        totalStages: started.stages.length,
        stages: started.stages.map((s) => `${s.name} (${s.status})`),
        stageAction: stageAction ? {
          stage: stageAction.stage,
          description: stageAction.description,
          requiredArtifacts: stageAction.requiredArtifacts,
          requiredGates: stageAction.requiredGates,
        } : null,
        instructions,
        message: `Workflow started. Process level: ${started.processLevel}. Current stage: ${started.state.currentStage}.`,
        nextSteps: [
          `Follow the skill instructions for the ${started.state.currentStage} stage.`,
          started.state.currentStage === 'onboard'
            ? 'This stage auto-advances. Call engineering_advance_stage to proceed.'
            : started.state.currentStage === 'define'
              ? 'Follow the spec-driven-development skill to generate a specification. Then call engineering_save_artifact with type "spec" to save it.'
              : `Complete the ${started.state.currentStage} stage work, then call engineering_save_artifact to save the output.`,
        ],
      }, null, 2)),
    ]);
  }
}
