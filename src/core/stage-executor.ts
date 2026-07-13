import type { SkillRegistry } from './skill-registry';
import type {
  Artifact,
  LifecycleStage,
  ProcessLevel,
  SkillId,
  StageAction,
  StageExecutionResult,
  WorkflowDefinition,
} from './types';
import type { PipelineConfig } from './pipeline-config';
import { DEFAULT_PIPELINE, getRequiredArtifacts, getRequiredGates } from './pipeline-config';

/**
 * Determines what each workflow stage needs to do and tracks execution.
 *
 * The Stage Executor is the bridge between "we have a workflow definition"
 * and "the agent is actually doing engineering work." For each stage, it:
 *
 * 1. Computes the {@link StageAction} — what skills to load, what artifacts
 *    to produce, what gates must pass.
 * 2. Evaluates whether the stage can be completed — are all required
 *    artifacts present? Are all gates passing? Are all approvals granted?
 * 3. Returns a {@link StageExecutionResult} describing what happened or
 *    what's still needed.
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 * Reads all stage/gate/artifact requirements from {@link PipelineConfig}.
 *
 * @see DESIGN_DECISIONS.md DD-014 (Dynamic Workflow Generation)
 */
export class StageExecutor {
  private readonly pipeline: PipelineConfig;

  constructor(
    private readonly skillRegistry: SkillRegistry,
    pipeline?: PipelineConfig,
  ) {
    this.pipeline = pipeline ?? DEFAULT_PIPELINE;
  }

  /**
   * Get the action plan for the current active stage.
   * Returns null if no stage is active.
   */
  getStageAction(workflow: WorkflowDefinition): StageAction | null {
    const activeStage = workflow.stages.find((s) => s.status === 'active');
    if (!activeStage) return null;

    return this.buildStageAction(activeStage.id, workflow.processLevel, workflow.activeSkills);
  }

  /**
   * Evaluate whether the current stage can be completed.
   * Checks: required artifacts exist, required gates pass, required approvals granted.
   */
  evaluateStageCompletion(
    workflow: WorkflowDefinition,
    artifacts: readonly Artifact[],
  ): StageExecutionResult {
    const activeStage = workflow.stages.find((s) => s.status === 'active');
    if (!activeStage) {
      return {
        stage: workflow.state.currentStage ?? 'plan',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'No active stage',
      };
    }

    const action = this.buildStageAction(
      activeStage.id,
      workflow.processLevel,
      workflow.activeSkills,
    );

    // Check required artifacts
    const stageArtifacts = artifacts.filter((a) => a.stage === activeStage.id);
    const missingArtifacts = action.requiredArtifacts.filter(
      (type) => !stageArtifacts.some((a) => a.type === type && a.status !== 'rejected'),
    );

    // Check required gates
    const pendingGates = action.requiredGates.filter((gateId) => {
      const gate = workflow.qualityGates.find((g) => g.id === gateId);
      return !gate || gate.status === 'pending';
    });

    // Check required approvals
    const pendingApprovals = workflow.approvals
      .filter((a) => a.status === 'pending' && this.isApprovalForStage(a.artifact, activeStage.id))
      .map((a) => a.id);

    // Determine status
    const hasBlockers =
      missingArtifacts.length > 0 || pendingGates.length > 0 || pendingApprovals.length > 0;

    if (hasBlockers) {
      const parts: string[] = [];
      if (missingArtifacts.length > 0) {
        parts.push(`Missing artifacts: ${missingArtifacts.join(', ')}`);
      }
      if (pendingGates.length > 0) {
        parts.push(`Pending gates: ${pendingGates.join(', ')}`);
      }
      if (pendingApprovals.length > 0) {
        parts.push(`Pending approvals: ${pendingApprovals.length}`);
      }

      return {
        stage: activeStage.id,
        status: 'blocked',
        artifacts: stageArtifacts,
        pendingGates,
        pendingApprovals,
        message: parts.join('. '),
      };
    }

    return {
      stage: activeStage.id,
      status: 'completed',
      artifacts: stageArtifacts,
      pendingGates: [],
      pendingApprovals: [],
      message: `Stage "${activeStage.name}" is ready to advance`,
    };
  }

  /**
   * Get a human-readable description of what the agent should do
   * for the current stage. This is the "instruction" that gets
   * passed to the LLM or shown in the UI.
   */
  getStageInstructions(workflow: WorkflowDefinition): string {
    const action = this.getStageAction(workflow);
    if (!action) return 'No active stage. Start a workflow first.';

    const stageDef = this.pipeline.stages[action.stage];
    if (!stageDef) return `Execute stage: ${action.stage}`;

    const skillNames = action.skills
      .map((id) => this.skillRegistry.getById(id)?.label ?? id)
      .join(', ');

    const artifactNames = action.requiredArtifacts.join(', ');
    const gateNames = action.requiredGates.join(', ');

    let text = `## Stage: ${stageDef.description}\n\n`;

    if (stageDef.steps.length > 0) {
      text += `### Steps\n`;
      for (const step of stageDef.steps) {
        text += `- ${step}\n`;
      }
      text += '\n';
    }

    if (skillNames) {
      text += `### Active Skills\n${skillNames}\n\n`;
    }
    if (artifactNames) {
      text += `### Required Artifacts\n${artifactNames}\n\n`;
    }
    if (gateNames) {
      text += `### Quality Gates\n${gateNames}\n\n`;
    }

    return text;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private buildStageAction(
    stage: LifecycleStage,
    processLevel: ProcessLevel,
    activeSkills: readonly SkillId[],
  ): StageAction {
    const stageSkills = this.skillRegistry
      .getByStage(stage)
      .filter((s) => activeSkills.includes(s.id))
      .map((s) => s.id);

    const stageDef = this.pipeline.stages[stage];

    // Get required artifacts and gates from the pipeline config
    const requiredArtifacts = getRequiredArtifacts(this.pipeline, stage, processLevel);
    const requiredGates = getRequiredGates(this.pipeline, stage, processLevel);

    return {
      stage,
      description: stageDef?.description ?? stage,
      skills: stageSkills,
      requiredArtifacts,
      requiredGates,
      autoAdvance: stageDef?.autoAdvance ?? false,
    };
  }

  private isApprovalForStage(artifactName: string, stage: LifecycleStage): boolean {
    return this.pipeline.approvalStageMap[artifactName] === stage;
  }
}
