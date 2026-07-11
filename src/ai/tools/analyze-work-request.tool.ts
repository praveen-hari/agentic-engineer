import type { RiskAssessment } from '../../core/types';
import type { AiRiskAnalyzer } from '../risk-analyzer';
import type { WorkflowGenerator } from '../../core/workflow-generator';

/**
 * Input for the analyze_work_request language model tool.
 */
export interface AnalyzeWorkRequestInput {
  readonly objective: string;
  readonly context?: {
    readonly touchesUi?: boolean;
    readonly touchesApi?: boolean;
    readonly touchesDatabase?: boolean;
  };
}

/**
 * Result from the analyze_work_request tool.
 */
export interface AnalyzeWorkRequestResult {
  readonly workType: RiskAssessment['workType'];
  readonly complexity: RiskAssessment['complexity'];
  readonly riskLevel: RiskAssessment['riskLevel'];
  readonly processLevel: RiskAssessment['processLevel'];
  readonly riskSignals: RiskAssessment['signals'];
  readonly recommendedStages: readonly string[];
  readonly qualityGates: readonly string[];
  readonly source: RiskAssessment['source'];
}

/**
 * Language Model Tool: analyze_work_request (SPEC §5.1).
 *
 * Analyzes a work request objective and returns a risk assessment
 * (work type, complexity, risk signals, recommended process level).
 * Uses the AI risk analyzer (LLM with deterministic fallback).
 *
 * This class is framework-agnostic — the VS Code LanguageModelTool
 * adapter wraps it in `src/ai/tools/`.
 */
export class AnalyzeWorkRequestTool {
  constructor(
    private readonly riskAnalyzer: AiRiskAnalyzer,
    private readonly workflowGenerator: WorkflowGenerator,
  ) {}

  /**
   * Prepare the invocation — returns confirmation message for the user.
   */
  prepareInvocation(input: AnalyzeWorkRequestInput): {
    invocationMessage: string;
    confirmationTitle: string;
    confirmationMessage: string;
  } {
    return {
      invocationMessage: `Analyzing: "${input.objective.slice(0, 60)}${input.objective.length > 60 ? '...' : ''}"`,
      confirmationTitle: 'Analyze Work Request',
      confirmationMessage: `Analyze the following work request?\n\n> ${input.objective}`,
    };
  }

  /**
   * Execute the tool — returns the analysis result.
   */
  async invoke(input: AnalyzeWorkRequestInput): Promise<AnalyzeWorkRequestResult> {
    const assessment = await this.riskAnalyzer.analyze(input.objective, input.context);
    const workflow = this.workflowGenerator.generate('preview', input.objective, assessment);

    return {
      workType: assessment.workType,
      complexity: assessment.complexity,
      riskLevel: assessment.riskLevel,
      processLevel: assessment.processLevel,
      riskSignals: assessment.signals,
      recommendedStages: workflow.stages.map((s: { name: string }) => s.name),
      qualityGates: workflow.qualityGates.map((g: { name: string }) => g.name),
      source: assessment.source,
    };
  }
}
