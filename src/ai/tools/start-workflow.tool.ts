import type * as vscode from 'vscode';
import type { WorkflowGenerator } from '../../core/workflow-generator';
import type { WorkflowEngine } from '../../core/workflow-engine';
import type { StateManager } from '../../core/state-manager';
import type { StageExecutor } from '../../core/stage-executor';
import type {
  Complexity,
  ContextSignal,
  ProcessLevel,
  RiskLevel,
  WorkflowDefinition,
  WorkType,
} from '../../core/types';
import type { ArtifactManager } from '../../services/artifact-manager.service';
import { DEFAULT_PIPELINE, getNextStepForStage } from '../../core/pipeline-config';

/**
 * Reads the processLevelDefault from .codestudio/config.json.
 * Returns 'auto' if not set or file doesn't exist.
 */
export type ConfigReader = () => Promise<ProcessLevel | 'auto'>;

/**
 * Input for the engineering_start_workflow tool.
 *
 * The AGENT provides all assessment fields including processLevel.
 * The agent has full context from the interview and workspace scan
 * and is best positioned to choose the right process level.
 */
export interface StartWorkflowInput {
  readonly objective: string;
  readonly workType: WorkType;
  readonly complexity: Complexity;
  readonly riskLevel: RiskLevel;
  readonly processLevel: ProcessLevel;
  readonly contextSignals?: readonly string[];
}

/**
 * Language Model Tool: engineering_start_workflow
 *
 * Creates a structured SDLC workflow from the agent's assessment.
 * The agent determines workType, complexity, riskLevel — NOT the
 * extension's keyword-based risk engine.
 */
export class StartWorkflowTool implements vscode.LanguageModelTool<StartWorkflowInput> {
  constructor(
    private readonly workflowGenerator: WorkflowGenerator,
    private readonly workflowEngine: WorkflowEngine,
    private readonly stateManager: StateManager,
    private readonly stageExecutor: StageExecutor,
    private readonly artifactManager: ArtifactManager,
    private readonly onWorkflowStarted: (wf: WorkflowDefinition) => void,
    private readonly readConfigLevel: ConfigReader = async () => 'auto',
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<StartWorkflowInput>,
    _token: vscode.CancellationToken,
  ) {
    const { objective, workType, riskLevel } = options.input;
    return {
      invocationMessage: `Starting ${workType} workflow (${riskLevel} risk): "${objective.slice(0, 50)}..."`,
      confirmationMessages: {
        title: 'Start Engineering Workflow',
        message: new (await import('vscode')).MarkdownString(
          `Start an engineering workflow?\n\n` +
            `> **Objective:** ${objective}\n\n` +
            `| Field | Value |\n|---|---|\n` +
            `| Work Type | ${workType} |\n` +
            `| Complexity | ${options.input.complexity} |\n` +
            `| Risk Level | ${riskLevel} |\n` +
            `| Process Level | ${options.input.processLevel ?? 'auto'} |`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<StartWorkflowInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');
    const { objective, workType, complexity, riskLevel, contextSignals } = options.input;

    // Determine process level:
    // 1. If user set an explicit level in settings (not 'auto'), use that
    // 2. Otherwise trust the agent's choice (agent always provides processLevel)
    // 3. Fallback: infer from riskLevel + complexity (safety net)
    const configLevel = await this.readConfigLevel();
    const processLevel: ProcessLevel =
      configLevel !== 'auto'
        ? configLevel
        : (options.input.processLevel ?? this.inferProcessLevel(riskLevel, complexity));

    // Build assessment from agent's input (NOT from keyword matching)
    const assessment = {
      workType,
      complexity,
      riskLevel,
      processLevel,
      signals: [],
      contextSignals: (contextSignals ?? []) as ContextSignal[],
      source: 'llm' as const,
    };

    // Generate workflow
    const wf = this.workflowGenerator.generate(`wf-${Date.now()}`, objective, assessment as never);

    // Start workflow (activates first stage)
    const started = await this.workflowEngine.start(wf);

    // Save state
    await this.stateManager.save(started);
    await this.artifactManager.saveObjective(objective);

    // Get stage instructions
    const stageAction = this.stageExecutor.getStageAction(started);
    const instructions = this.stageExecutor.getStageInstructions(started);

    // Notify extension
    this.onWorkflowStarted(started);

    return new vscodeModule.LanguageModelToolResult([
      new vscodeModule.LanguageModelTextPart(
        JSON.stringify(
          {
            workflowId: started.id,
            objective,
            workType,
            complexity,
            riskLevel,
            processLevel: started.processLevel,
            activeSkills: started.activeSkills,
            currentStage: started.state.currentStage,
            totalStages: started.stages.length,
            stages: started.stages.map((s) => `${s.name} (${s.status})`),
            stageAction: stageAction
              ? {
                  stage: stageAction.stage,
                  description: stageAction.description,
                  requiredArtifacts: stageAction.requiredArtifacts,
                  requiredGates: stageAction.requiredGates,
                  skills: stageAction.skills,
                }
              : null,
            instructions,
            nextSteps: this.getNextSteps(started),
          },
          null,
          2,
        ),
      ),
    ]);
  }

  /**
   * Safety-net fallback — only runs if the agent somehow doesn't provide
   * processLevel AND the user hasn't set an explicit default in settings.
   * In normal operation, the agent always provides processLevel.
   */
  private inferProcessLevel(riskLevel: RiskLevel, complexity: Complexity): ProcessLevel {
    if (riskLevel === 'high' || complexity === 'critical') return 'guarded';
    if (riskLevel === 'medium' || complexity === 'complex') return 'thorough';
    if (complexity === 'moderate') return 'standard';
    if (complexity === 'trivial') return 'light';
    return 'standard';
  }

  private getNextSteps(wf: WorkflowDefinition): string[] {
    const stage = wf.state.currentStage;
    if (!stage) return ['Workflow has no active stage.'];
    return [getNextStepForStage(DEFAULT_PIPELINE, stage)];
  }
}
