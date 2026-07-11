import type { GateEvaluationResult, GateStatus, QualityGate, WorkflowDefinition } from './types';

/**
 * Evaluates quality gates to determine if a stage can advance.
 *
 * Gates are the enforcement mechanism — they check whether required
 * conditions are met before allowing stage progression. Gate types:
 *
 * - **automated**: Checked programmatically (tests pass, build succeeds)
 * - **review**: Requires a review artifact to exist and be approved
 * - **approval**: Requires explicit user approval
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 *
 * @see DESIGN_DECISIONS.md DD-014 (Dynamic Workflow Generation)
 * @see AGENTIC_SDLC_EXTENSION_ANALYSIS.md §9.3 (Quality Gates)
 */
export class GateRunner {
  /**
   * Evaluate all gates for a specific stage.
   * Returns results for each gate — passed or failed with details.
   */
  evaluateStageGates(
    workflow: WorkflowDefinition,
    stageId: string,
  ): readonly GateEvaluationResult[] {
    const stageGates = workflow.qualityGates.filter((g) => g.stage === stageId);

    return stageGates.map((gate) => this.evaluateGate(gate, workflow));
  }

  /**
   * Check if all blocking gates for a stage are passing.
   */
  areBlockingGatesPassing(workflow: WorkflowDefinition, stageId: string): boolean {
    const results = this.evaluateStageGates(workflow, stageId);
    return results
      .filter((r) => {
        const gate = workflow.qualityGates.find((g) => g.id === r.gateId);
        return gate?.blocking ?? false;
      })
      .every((r) => r.passed);
  }

  /**
   * Get all pending (not yet evaluated) gates for a stage.
   */
  getPendingGates(workflow: WorkflowDefinition, stageId: string): readonly QualityGate[] {
    return workflow.qualityGates.filter((g) => g.stage === stageId && g.status === 'pending');
  }

  /**
   * Update a gate's status in the workflow.
   * Returns a new workflow with the gate updated.
   */
  updateGateStatus(
    workflow: WorkflowDefinition,
    gateId: string,
    status: GateStatus,
    details?: string,
  ): WorkflowDefinition {
    const now = new Date().toISOString();

    return {
      ...workflow,
      qualityGates: workflow.qualityGates.map((g) =>
        g.id === gateId
          ? {
              ...g,
              status,
              result: {
                ...(status === 'passed' ? { passedAt: now } : {}),
                ...(status === 'failed' ? { failedAt: now } : {}),
                ...(details ? { details } : {}),
              },
            }
          : g,
      ),
    };
  }

  /**
   * Pass a gate — marks it as passed with optional details.
   */
  passGate(workflow: WorkflowDefinition, gateId: string, details?: string): WorkflowDefinition {
    return this.updateGateStatus(workflow, gateId, 'passed', details);
  }

  /**
   * Fail a gate — marks it as failed with details.
   */
  failGate(workflow: WorkflowDefinition, gateId: string, details: string): WorkflowDefinition {
    return this.updateGateStatus(workflow, gateId, 'failed', details);
  }

  /**
   * Skip a gate — marks it as skipped (for non-blocking conditional gates).
   */
  skipGate(workflow: WorkflowDefinition, gateId: string, reason: string): WorkflowDefinition {
    return this.updateGateStatus(workflow, gateId, 'skipped', reason);
  }

  /**
   * Get a summary of gate status for the entire workflow.
   */
  getSummary(workflow: WorkflowDefinition): {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    skipped: number;
  } {
    const gates = workflow.qualityGates;
    return {
      total: gates.length,
      passed: gates.filter((g) => g.status === 'passed').length,
      failed: gates.filter((g) => g.status === 'failed').length,
      pending: gates.filter((g) => g.status === 'pending').length,
      skipped: gates.filter((g) => g.status === 'skipped').length,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private evaluateGate(gate: QualityGate, workflow: WorkflowDefinition): GateEvaluationResult {
    // Already evaluated — return current status
    if (gate.status === 'passed') {
      return {
        gateId: gate.id,
        passed: true,
        details: gate.result?.details ?? 'Gate passed',
      };
    }

    if (gate.status === 'failed') {
      return {
        gateId: gate.id,
        passed: false,
        details: gate.result?.details ?? 'Gate failed',
      };
    }

    if (gate.status === 'skipped') {
      return {
        gateId: gate.id,
        passed: true, // Skipped gates don't block
        details: gate.result?.details ?? 'Gate skipped',
      };
    }

    // Pending — evaluate based on gate type
    switch (gate.type) {
      case 'approval':
        return this.evaluateApprovalGate(gate, workflow);
      case 'review':
        return this.evaluateReviewGate(gate, workflow);
      case 'automated':
        return this.evaluateAutomatedGate(gate);
      default:
        return {
          gateId: gate.id,
          passed: false,
          details: `Unknown gate type: ${gate.type}`,
        };
    }
  }

  private evaluateApprovalGate(
    gate: QualityGate,
    workflow: WorkflowDefinition,
  ): GateEvaluationResult {
    // Check if there's a matching approval that's been granted
    const approval = workflow.approvals.find(
      (a) => a.artifact === gate.id.replace('-approved', '') && a.status === 'approved',
    );

    return {
      gateId: gate.id,
      passed: !!approval,
      details: approval
        ? `Approved by ${approval.approvedBy ?? 'user'} at ${approval.approvedAt ?? 'unknown'}`
        : `Waiting for approval: ${gate.name}`,
    };
  }

  private evaluateReviewGate(
    gate: QualityGate,
    workflow: WorkflowDefinition,
  ): GateEvaluationResult {
    // Review gates pass when the corresponding approval is granted
    // or when the gate has been explicitly passed
    const approval = workflow.approvals.find(
      (a) =>
        (a.artifact === gate.id || a.artifact === gate.id.replace('-review', '')) &&
        a.status === 'approved',
    );

    return {
      gateId: gate.id,
      passed: !!approval,
      details: approval ? `Review completed and approved` : `Waiting for review: ${gate.name}`,
    };
  }

  private evaluateAutomatedGate(gate: QualityGate): GateEvaluationResult {
    // Automated gates start as pending — they're passed/failed
    // by external processes (test runner, build, etc.)
    // If still pending, they haven't been evaluated yet
    return {
      gateId: gate.id,
      passed: false,
      details: `Automated gate "${gate.name}" has not been evaluated yet`,
    };
  }
}
