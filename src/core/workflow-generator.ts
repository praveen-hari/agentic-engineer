import type { SkillEngine } from './skill-engine';
import type {
  Approval,
  ApprovalLevel,
  ContextSignal,
  LifecycleStage,
  ProcessLevel,
  QualityGate,
  RiskAssessment,
  Stage,
  WorkflowDefinition,
  WorkflowStateStatus,
} from './types';
import type { PipelineConfig } from './pipeline-config';
import { DEFAULT_PIPELINE, meetsMinLevel } from './pipeline-config';
import { generateStagesForLevel } from './workflow-engine';

/**
 * Dynamic workflow builder (DD-014 Step 2).
 *
 * Given a {@link RiskAssessment} and the computed active skills,
 * generates a {@link WorkflowDefinition} with appropriate stages,
 * quality gates, and approval requirements.
 *
 * All gate/approval generation is data-driven from {@link PipelineConfig}.
 * No if/else chains for process levels — the config declares everything.
 */
export class WorkflowGenerator {
  private readonly pipeline: PipelineConfig;

  constructor(
    private readonly skillEngine: SkillEngine,
    pipeline?: PipelineConfig,
  ) {
    this.pipeline = pipeline ?? DEFAULT_PIPELINE;
  }

  /**
   * Generate a workflow definition from a risk assessment.
   */
  generate(id: string, objective: string, assessment: RiskAssessment): WorkflowDefinition {
    const { activeSkills, activationReasons } = this.skillEngine.computeActiveSkills(assessment);
    const stages = this.generateStages(assessment.processLevel);
    const qualityGates = this.generateGates(assessment);
    const approvals = this.generateApprovals(assessment);
    const now = new Date().toISOString();

    return {
      id,
      version: 1,
      objective,
      workType: assessment.workType,
      processLevel: assessment.processLevel,
      detectedRisks: assessment.signals,
      stages,
      qualityGates,
      approvals,
      activeSkills,
      skillActivationReason: activationReasons,
      state: {
        currentStage: null,
        currentTask: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        startedAt: now,
        lastActivityAt: now,
        status: 'idle' as WorkflowStateStatus,
      },
    };
  }

  // ─── Stage Generation (delegates to shared helper) ─────────────────────

  private generateStages(processLevel: ProcessLevel): Stage[] {
    return generateStagesForLevel(processLevel, this.pipeline);
  }

  // ─── Quality Gate Generation (data-driven from PipelineConfig) ─────────

  private generateGates(assessment: RiskAssessment): QualityGate[] {
    const gates: QualityGate[] = [];
    const level = assessment.processLevel;
    const activeStageIds = new Set(this.pipeline.processLevels[level]?.stages ?? []);

    // Iterate all stages in the pipeline config and collect gates
    // that meet the current process level AND belong to an active stage.
    for (const [stageId, stageDef] of Object.entries(this.pipeline.stages)) {
      if (!activeStageIds.has(stageId as LifecycleStage)) continue;

      for (const [gateId, gateDef] of Object.entries(stageDef.gates)) {
        if (meetsMinLevel(level, gateDef.minLevel)) {
          gates.push(this.makeGate(gateId, gateDef.name, gateDef.type, stageId, false));
        }
      }
    }

    // Conditional gates based on context signals
    this.addConditionalGates(gates, assessment.contextSignals);

    return gates;
  }

  private addConditionalGates(gates: QualityGate[], signals: readonly ContextSignal[]): void {
    for (const signal of signals) {
      const gateDef = this.pipeline.conditionalGates[signal];
      if (gateDef && !gates.find((g) => g.id === gateDef.id)) {
        gates.push(
          this.makeGate(gateDef.id, gateDef.name, 'review', gateDef.stage, true, gateDef.reason),
        );
      }
    }
  }

  private makeGate(
    id: string,
    name: string,
    type: 'automated' | 'review' | 'approval',
    stage: string,
    conditional: boolean,
    reason?: string,
  ): QualityGate {
    return {
      id,
      name,
      type,
      status: 'pending',
      stage: stage as QualityGate['stage'],
      blocking: true,
      conditional,
      reason,
    };
  }

  // ─── Approval Generation (data-driven from PipelineConfig) ─────────────

  private generateApprovals(assessment: RiskAssessment): Approval[] {
    const approvals: Approval[] = [];
    const level = assessment.processLevel;
    const minCount = this.pipeline.processLevels[level]?.minApprovals ?? 0;

    if (minCount === 0) return approvals;

    // Base approvals from the pipeline config
    for (const req of this.pipeline.approvals) {
      if (meetsMinLevel(level, req.minLevel)) {
        approvals.push(this.makeApproval(req.id, req.level, req.artifact, req.reason));
      }
    }

    // Conditional approvals based on context signals
    for (const signal of assessment.contextSignals) {
      const approvalDef = this.pipeline.conditionalApprovals[signal];
      if (approvalDef && !approvals.find((a) => a.id === approvalDef.id)) {
        approvals.push(
          this.makeApproval(
            approvalDef.id,
            approvalDef.level,
            approvalDef.artifact,
            approvalDef.reason,
          ),
        );
      }
    }

    return approvals;
  }

  private makeApproval(
    id: string,
    level: ApprovalLevel,
    artifact: string,
    reason: string,
  ): Approval {
    return {
      id,
      level,
      artifact,
      status: 'pending',
      reason,
    };
  }
}
