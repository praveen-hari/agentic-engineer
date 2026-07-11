import type { EventStream } from './event-stream';
import type {
  LifecycleStage,
  ProcessLevel,
  RiskAssessment,
  Stage,
  StageStatus,
  WorkflowDefinition,
  WorkflowStateStatus,
} from './types';
import { BASE_STAGES, STAGE_NAMES } from '../constants';

/**
 * State machine for workflow lifecycle (DD-014, DD-015).
 *
 * Manages stage transitions (pending → active → completed/skipped),
 * enforces ordering, validates transitions, and emits events for each
 * state change via the injected {@link EventStream}.
 */
export class WorkflowEngine {
  constructor(private readonly eventStream: EventStream) {}

  /**
   * Create a new workflow from a risk assessment.
   * Workflow starts in 'idle' state — call {@link start} to activate it.
   */
  async create(
    id: string,
    objective: string,
    assessment: RiskAssessment,
  ): Promise<WorkflowDefinition> {
    const stages = this.generateStages(assessment.processLevel);
    const now = new Date().toISOString();

    const workflow: WorkflowDefinition = {
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

    await this.emit('workflow.created', id, { objective, processLevel: assessment.processLevel });

    return workflow;
  }

  /**
   * Start a workflow — transitions from idle to active.
   * Activates the first stage.
   * @throws Error if workflow is not in 'idle' state
   */
  async start(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
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

    const updated: WorkflowDefinition = {
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

    await this.emit('workflow.started', workflow.id, { firstStage: firstStage.id });
    await this.emit('stage.entered', workflow.id, { stage: firstStage.id });

    return updated;
  }

  /**
   * Advance to the next stage — completes the current stage and
   * activates the next one. If this is the last stage, completes the workflow.
   * @throws Error if no active stage or workflow is not active
   */
  async advanceStage(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
    if (workflow.state.status !== 'active') {
      throw new Error(`Cannot advance: workflow is ${workflow.state.status}`);
    }

    const activeIndex = workflow.stages.findIndex((s) => s.status === 'active');
    if (activeIndex === -1) {
      throw new Error('Cannot advance: no active stage');
    }

    const now = new Date().toISOString();
    const activeStage = workflow.stages[activeIndex];

    // Complete the current stage
    const updatedStages = workflow.stages.map((s, i) => {
      if (i === activeIndex) {
        return { ...s, status: 'completed' as StageStatus, completedAt: now };
      }
      return s;
    });

    await this.emit('stage.completed', workflow.id, { stage: activeStage.id });

    // Check if there's a next stage
    const nextIndex = activeIndex + 1;
    if (nextIndex >= workflow.stages.length) {
      // Last stage — complete the workflow
      const completed: WorkflowDefinition = {
        ...workflow,
        stages: updatedStages,
        state: {
          ...workflow.state,
          status: 'completed' as WorkflowStateStatus,
          currentStage: null,
          lastActivityAt: now,
        },
      };

      await this.emit('workflow.completed', workflow.id, {});
      return completed;
    }

    // Activate the next stage
    const nextStage = updatedStages[nextIndex];
    const finalStages = updatedStages.map((s, i) =>
      i === nextIndex ? { ...s, status: 'active' as StageStatus, startedAt: now } : s,
    );

    await this.emit('stage.entered', workflow.id, { stage: nextStage.id });

    return {
      ...workflow,
      stages: finalStages,
      state: {
        ...workflow.state,
        currentStage: nextStage.id,
        lastActivityAt: now,
      },
    };
  }

  /**
   * Skip the current stage if it's skippable.
   * @throws Error if stage is not skippable or not active
   */
  async skipStage(
    workflow: WorkflowDefinition,
    stageId: LifecycleStage,
  ): Promise<WorkflowDefinition> {
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

    await this.emit('stage.skipped', workflow.id, { stage: stageId });

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

    const nextStage = updatedStages[nextIndex];
    const finalStages = updatedStages.map((s, i) =>
      i === nextIndex ? { ...s, status: 'active' as StageStatus, startedAt: now } : s,
    );

    await this.emit('stage.entered', workflow.id, { stage: nextStage.id });

    return {
      ...workflow,
      stages: finalStages,
      state: {
        ...workflow.state,
        currentStage: nextStage.id,
        lastActivityAt: now,
      },
    };
  }

  // ─── Stage Generation ──────────────────────────────────────────────────

  private generateStages(processLevel: ProcessLevel): Stage[] {
    const stageIds = BASE_STAGES[processLevel] ?? BASE_STAGES.standard;

    return stageIds.map((id) => ({
      id,
      name: STAGE_NAMES[id] ?? id,
      status: 'pending' as StageStatus,
      skippable: this.isStageSkippable(id, processLevel),
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
    }));
  }

  private isStageSkippable(stage: LifecycleStage, processLevel: ProcessLevel): boolean {
    // Guarded: nothing is skippable
    if (processLevel === 'guarded') return false;

    // Light: review is optional
    if (processLevel === 'light') {
      return stage === 'review';
    }

    // Standard/Thorough: onboard and review are skippable
    return stage === 'onboard' || stage === 'review';
  }

  // ─── Event Emission ────────────────────────────────────────────────────

  private async emit(
    type: WorkflowEvent['type'],
    workflowId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: WorkflowEvent = {
      id: `${workflowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      workflowId,
      payload,
    };
    await this.eventStream.append(event);
  }
}

// Import the WorkflowEvent type for the emit method
import type { WorkflowEvent } from './types';
