import type { SkillEngine } from './skill-engine';
import type {
  Approval,
  ApprovalLevel,
  ContextSignal,
  ProcessLevel,
  QualityGate,
  RiskAssessment,
  Stage,
  WorkflowDefinition,
  WorkflowStateStatus,
} from './types';
import { MIN_APPROVALS } from '../constants';
import { generateStagesForLevel } from './workflow-engine';

/**
 * Dynamic workflow builder (DD-014 Step 2).
 *
 * Given a {@link RiskAssessment} and the computed active skills,
 * generates a {@link WorkflowDefinition} with appropriate stages,
 * quality gates, and approval requirements.
 *
 * The active skills determine which conditional gates are inserted
 * (e.g., security gate only if `security-and-hardening` is active).
 */
export class WorkflowGenerator {
  constructor(private readonly skillEngine: SkillEngine) {}

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
    return generateStagesForLevel(processLevel);
  }

  // ─── Quality Gate Generation ───────────────────────────────────────────

  private generateGates(assessment: RiskAssessment): QualityGate[] {
    const gates: QualityGate[] = [];

    // Base gates for all process levels
    gates.push(this.makeGate('build-complete', 'Build Complete', 'approval', 'build', false));

    // Standard+ gates
    if (assessment.processLevel !== 'light') {
      gates.push(this.makeGate('tests-pass', 'Tests Pass', 'automated', 'verify', false));
      gates.push(this.makeGate('spec-approved', 'Spec Approved', 'approval', 'define', false));
      gates.push(this.makeGate('plan-approved', 'Plan Approved', 'approval', 'plan', false));
      gates.push(this.makeGate('code-review', 'Code Review', 'review', 'review', false));
    }

    // Thorough+ gates (ship stage only exists at thorough/guarded)
    if (assessment.processLevel === 'thorough' || assessment.processLevel === 'guarded') {
      gates.push(this.makeGate('ship-checklist', 'Ship Checklist', 'approval', 'ship', false));
      gates.push(this.makeGate('security-review', 'Security Review', 'review', 'review', false));
      gates.push(
        this.makeGate('performance-budget', 'Performance Budget', 'automated', 'verify', false),
      );
      gates.push(this.makeGate('docs-complete', 'Documentation Complete', 'review', 'ship', false));
    }

    // Guarded-only gates
    if (assessment.processLevel === 'guarded') {
      gates.push(this.makeGate('rollback-tested', 'Rollback Tested', 'automated', 'ship', false));
      gates.push(
        this.makeGate('data-integrity', 'Data Integrity Check', 'automated', 'verify', false),
      );
    }

    // Conditional gates based on context signals
    this.addConditionalGates(gates, assessment.contextSignals);

    return gates;
  }

  private addConditionalGates(gates: QualityGate[], signals: readonly ContextSignal[]): void {
    const signalGateMap: Readonly<
      Record<ContextSignal, { id: string; name: string; reason: string }>
    > = {
      touches_auth_or_input: {
        id: 'security-review',
        name: 'Security Review',
        reason: 'Task touches authentication or user input — security review required',
      },
      touches_ui: {
        id: 'accessibility-check',
        name: 'Accessibility Check',
        reason: 'Task touches UI — accessibility verification required',
      },
      touches_api: {
        id: 'api-contract-review',
        name: 'API Contract Review',
        reason: 'Task touches API — contract review required',
      },
      touches_external_services: {
        id: 'integration-test',
        name: 'Integration Test',
        reason: 'Task touches external services — integration test required',
      },
      performance_sensitive: {
        id: 'performance-budget',
        name: 'Performance Budget',
        reason: 'Task is performance-sensitive — performance budget check required',
      },
      high_risk_decision: {
        id: 'architecture-review',
        name: 'Architecture Review',
        reason: 'Task involves high-risk decision — architecture review required',
      },
    };

    for (const signal of signals) {
      const gateDef = signalGateMap[signal];
      if (gateDef && !gates.find((g) => g.id === gateDef.id)) {
        gates.push(
          this.makeGate(gateDef.id, gateDef.name, 'review', 'review', true, gateDef.reason),
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

  // ─── Approval Generation ───────────────────────────────────────────────

  private generateApprovals(assessment: RiskAssessment): Approval[] {
    const approvals: Approval[] = [];
    const minCount = MIN_APPROVALS[assessment.processLevel] ?? 0;

    if (minCount === 0) return approvals;

    // Standard: spec + code review
    approvals.push(
      this.makeApproval('approval-spec', 'explicit', 'spec', 'Spec requires explicit approval'),
    );
    approvals.push(
      this.makeApproval(
        'approval-review',
        'review',
        'code-review',
        'Code review required before merge',
      ),
    );

    // Thorough: + architecture
    if (assessment.processLevel === 'thorough' || assessment.processLevel === 'guarded') {
      approvals.push(
        this.makeApproval(
          'approval-architecture',
          'review',
          'architecture',
          'Architecture review required for thorough process',
        ),
      );
    }

    // Guarded: + restricted approvals
    if (assessment.processLevel === 'guarded') {
      approvals.push(
        this.makeApproval(
          'approval-restricted-1',
          'restricted',
          'schema-migration',
          'Restricted approval: schema migration',
        ),
      );
      approvals.push(
        this.makeApproval(
          'approval-restricted-2',
          'restricted',
          'deployment',
          'Restricted approval: production deployment',
        ),
      );
    }

    // Conditional approvals based on context signals
    if (assessment.contextSignals.includes('touches_auth_or_input')) {
      approvals.push(
        this.makeApproval(
          'approval-security',
          'explicit',
          'security-review',
          'Security review required for auth/input changes',
        ),
      );
    }
    if (assessment.contextSignals.includes('touches_external_services')) {
      approvals.push(
        this.makeApproval(
          'approval-integration',
          'review',
          'integration',
          'Integration review required for external service changes',
        ),
      );
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
