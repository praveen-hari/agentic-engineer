import type {
  LifecycleStage,
  ProcessLevel,
  RiskAssessment,
  Stage,
  StageStatus,
  WorkflowDefinition,
  WorkflowStateStatus,
} from './types';
import type { PipelineConfig } from './pipeline-config';
import { DEFAULT_PIPELINE, getStagesForLevel, isStageSkippable } from './pipeline-config';

/**
 * Pure state machine for workflow lifecycle (DD-014, DD-015).
 *
 * Manages stage transitions (pending → active → completed/skipped),
 * enforces ordering, and validates transitions.
 *
 * No side effects — returns new state objects. Persistence is the
 * caller's responsibility (via StateManager).
 *
 * Reads stage definitions from {@link PipelineConfig}.
 */
export class WorkflowEngine {
  private readonly pipeline: PipelineConfig;

  constructor(pipeline?: PipelineConfig) {
    this.pipeline = pipeline ?? DEFAULT_PIPELINE;
  }

  /**
   * Create a new workflow from a risk assessment.
   * Workflow starts in 'idle' state — call {@link start} to activate it.
   */
  create(id: string, objective: string, assessment: RiskAssessment): WorkflowDefinition {
    const stages = this.generateStages(assessment.processLevel);
    const now = new Date().toISOString();

    return {
      id,
      version: 1,
      objective,
      processLevel: assessment.processLevel,
      detectedRisks: assessment.signals,
      stages,
      qualityGates: [],
      approvals: [],
      activeSkills: [],
      skillActivationReason: {},
      state: {
        currentStage: null,
        currentTask: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        startedAt: now,
        lastActivityAt: now,
        status: 'idle',
      },
    };
  }

  /**
   * Start a workflow — transitions from idle to active.
   * Activates the first stage.
   * @throws Error if workflow is not in 'idle' state
   */
  start(workflow: WorkflowDefinition): WorkflowDefinition {
    if (workflow.state.status !== 'idle') {
      throw new Error(`Cannot start: workflow is already ${workflow.state.status}`);
    }

    const firstStage = workflow.stages[0];
    if (!firstStage) {
      throw new Error('Cannot start: workflow has no stages');
    }

    const now = new Date().toISOString();
    const updatedStages = workflow.stages.map((s, i) =>
      i === 0 ? { ...s, status: 'active' as StageStatus, startedAt: now } : s,
    );

    return {
      ...workflow,
      stages: updatedStages,
      state: {
        ...workflow.state,
        status: 'active' as WorkflowStateStatus,
        currentStage: firstStage.id,
        startedAt: now,
        lastActivityAt: now,
      },
    };
  }

  /**
   * Advance to the next stage — completes the current stage and
   * activates the next one. If this is the last stage, completes the workflow.
   * @throws Error if no active stage or workflow is not active
   */
  advanceStage(workflow: WorkflowDefinition): WorkflowDefinition {
    if (workflow.state.status !== 'active') {
      throw new Error(`Cannot advance: workflow is ${workflow.state.status}`);
    }

    const activeIndex = workflow.stages.findIndex((s) => s.status === 'active');
    if (activeIndex === -1) {
      throw new Error('Cannot advance: no active stage');
    }

    const now = new Date().toISOString();

    // Complete the current stage
    const updatedStages = workflow.stages.map((s, i) => {
      if (i === activeIndex) {
        return { ...s, status: 'completed' as StageStatus, completedAt: now };
      }
      return s;
    });

    // Check if there's a next stage
    const nextIndex = activeIndex + 1;
    if (nextIndex >= workflow.stages.length) {
      // Last stage — complete the workflow
      return {
        ...workflow,
        stages: updatedStages,
        state: {
          ...workflow.state,
          status: 'completed' as WorkflowStateStatus,
          currentStage: null,
          lastActivityAt: now,
        },
      };
    }

    // Activate the next stage
    const finalStages = updatedStages.map((s, i) =>
      i === nextIndex ? { ...s, status: 'active' as StageStatus, startedAt: now } : s,
    );

    return {
      ...workflow,
      stages: finalStages,
      state: {
        ...workflow.state,
        currentStage: finalStages[nextIndex].id,
        lastActivityAt: now,
      },
    };
  }

  /**
   * Skip the current stage if it's skippable.
   * @throws Error if stage is not skippable or not active
   */
  skipStage(workflow: WorkflowDefinition, stageId: LifecycleStage): WorkflowDefinition {
    if (workflow.state.status !== 'active') {
      throw new Error(`Cannot skip: workflow is ${workflow.state.status}`);
    }

    const stageIndex = workflow.stages.findIndex((s) => s.id === stageId);
    if (stageIndex === -1) {
      throw new Error(`Cannot skip: stage ${stageId} not found`);
    }

    const stage = workflow.stages[stageIndex];
    if (stage.status !== 'active') {
      throw new Error(`Cannot skip: stage ${stageId} is not active (status: ${stage.status})`);
    }
    if (!stage.skippable) {
      throw new Error(`Cannot skip: stage ${stageId} is not skippable`);
    }

    const now = new Date().toISOString();
    const updatedStages = workflow.stages.map((s, i) =>
      i === stageIndex ? { ...s, status: 'skipped' as StageStatus, completedAt: now } : s,
    );

    // Activate next stage or complete workflow
    const nextIndex = stageIndex + 1;
    if (nextIndex >= workflow.stages.length) {
      return {
        ...workflow,
        stages: updatedStages,
        state: {
          ...workflow.state,
          status: 'completed' as WorkflowStateStatus,
          currentStage: null,
          lastActivityAt: now,
        },
      };
    }

    const finalStages = updatedStages.map((s, i) =>
      i === nextIndex ? { ...s, status: 'active' as StageStatus, startedAt: now } : s,
    );

    return {
      ...workflow,
      stages: finalStages,
      state: {
        ...workflow.state,
        currentStage: finalStages[nextIndex].id,
        lastActivityAt: now,
      },
    };
  }

  /**
   * Pause an active workflow.
   * @throws Error if workflow is not active
   */
  pause(workflow: WorkflowDefinition): WorkflowDefinition {
    if (workflow.state.status !== 'active') {
      throw new Error(`Cannot pause: workflow is ${workflow.state.status}`);
    }
    return {
      ...workflow,
      state: {
        ...workflow.state,
        status: 'paused' as WorkflowStateStatus,
        lastActivityAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Resume a paused workflow.
   * @throws Error if workflow is not paused
   */
  resume(workflow: WorkflowDefinition): WorkflowDefinition {
    if (workflow.state.status !== 'paused') {
      throw new Error(`Cannot resume: workflow is ${workflow.state.status}`);
    }
    return {
      ...workflow,
      state: {
        ...workflow.state,
        status: 'active' as WorkflowStateStatus,
        lastActivityAt: new Date().toISOString(),
      },
    };
  }

  // ─── Stage Generation ───────────────────────────────────────────────

  private generateStages(processLevel: ProcessLevel): Stage[] {
    return generateStagesForLevel(processLevel, this.pipeline);
  }
}

// ─── Shared Stage Generation Helpers ────────────────────────────────────────
// Exported so WorkflowGenerator can reuse the same logic without duplication.

export function generateStagesForLevel(
  processLevel: ProcessLevel,
  pipeline: PipelineConfig = DEFAULT_PIPELINE,
): Stage[] {
  const stageIds = getStagesForLevel(pipeline, processLevel);

  return stageIds.map((id) => ({
    id,
    name: pipeline.stages[id]?.name ?? id,
    status: 'pending' as StageStatus,
    skippable: isStageSkippable(pipeline, id, processLevel),
    entryConditions: [],
    exitConditions: [],
    artifacts: [],
  }));
}

/**
 * @deprecated Use `isStageSkippable` from pipeline-config.ts instead.
 * Kept for backward compatibility with tests that import it directly.
 */
export function isStageSkippableAtLevel(
  stage: LifecycleStage,
  processLevel: ProcessLevel,
): boolean {
  return isStageSkippable(DEFAULT_PIPELINE, stage, processLevel);
}
