/**
 * Pure function that computes completion checklist items from
 * stage action, execution result, artifacts, and approvals.
 *
 * Uses plain, user-friendly language — no developer jargon like
 * "artifact", "gate", or "approval". Each item tells the user
 * what happened or what they need to do next.
 *
 * Each item has:
 * - `id` — unique identifier for keying in the UI
 * - `label` — plain-language description of the step
 * - `met` — whether the step is done
 * - `hint` — optional action hint for unmet items
 */
import type { Approval, Artifact, StageAction, StageExecutionResult } from '../../core/types';

export interface CompletionItem {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
  readonly hint?: string;
}

/** Human-friendly names for artifact types. */
const ARTIFACT_LABELS: Record<string, string> = {
  spec: 'Specification',
  plan: 'Implementation plan',
  review: 'Code review',
  report: 'Verification report',
  adr: 'Architecture decision',
};

/** Human-friendly step labels for gates (merged with approval). */
const GATE_STEP_LABELS: Record<string, string> = {
  'spec-approved': 'Review & approve the specification',
  'plan-approved': 'Review & approve the plan',
  'code-review': 'Complete the code review',
  'tests-pass': 'All tests passing',
  'security-review': 'Complete security review',
  'performance-budget': 'Meet performance budget',
  'docs-complete': 'Documentation complete',
  'rollback-tested': 'Rollback strategy tested',
  'data-integrity': 'Data integrity verified',
};

/**
 * Build the checklist items for a stage's completion requirements.
 *
 * Produces a simple, user-friendly checklist:
 * - "Specification created" (artifact requirement)
 * - "Review & approve the specification" (gate + approval merged)
 * - "Ready to continue" (no requirements)
 *
 * Gates and approvals for the same concept are merged into one step
 * to avoid confusing duplication.
 */
export function buildCompletionItems(
  action: StageAction,
  completion: StageExecutionResult,
  artifacts: readonly Artifact[],
  approvals: readonly Approval[],
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const handledGates = new Set<string>();

  // ─── Required Artifacts ─────────────────────────────────────────
  for (const artifactType of action.requiredArtifacts) {
    const stageArtifacts = artifacts.filter(
      (a) => a.type === artifactType && a.stage === action.stage,
    );
    const hasValid = stageArtifacts.some((a) => a.status !== 'rejected');
    const friendlyName = ARTIFACT_LABELS[artifactType] ?? capitalize(artifactType);

    items.push({
      id: `artifact-${artifactType}`,
      label: `${friendlyName} created`,
      met: hasValid,
      hint: hasValid ? undefined : 'Click "Send to Agent" to generate',
    });

    // If there's a matching approval gate (e.g., spec → spec-approved),
    // merge it as the next step: "Review & approve the specification"
    const matchingGateId = `${artifactType}-approved`;
    if (action.requiredGates.includes(matchingGateId)) {
      const isPending = completion.pendingGates.includes(matchingGateId);
      const matchingApproval = approvals.find((a) => a.artifact === artifactType);
      const isApproved = matchingApproval?.status === 'approved';

      items.push({
        id: `gate-${matchingGateId}`,
        label:
          GATE_STEP_LABELS[matchingGateId] ?? `Review & approve the ${friendlyName.toLowerCase()}`,
        met: !isPending || isApproved,
        hint:
          isPending && !isApproved ? 'Click the document above to review, then approve' : undefined,
      });
      handledGates.add(matchingGateId);
    }
  }

  // ─── Remaining Gates (not already merged with artifacts) ────────
  for (const gateId of action.requiredGates) {
    if (handledGates.has(gateId)) continue;

    const isPending = completion.pendingGates.includes(gateId);
    const label = GATE_STEP_LABELS[gateId] ?? humanizeGateId(gateId);

    items.push({
      id: `gate-${gateId}`,
      label,
      met: !isPending,
      hint: isPending ? undefined : undefined,
    });
  }

  // ─── Pending Approvals (not already merged with gates) ──────────
  for (const approval of approvals) {
    // Skip if already handled as part of an artifact+gate merge
    const alreadyHandled = action.requiredArtifacts.some(
      (type) => approval.artifact === type && handledGates.has(`${type}-approved`),
    );
    if (alreadyHandled) continue;

    const isPending = completion.pendingApprovals.includes(approval.id);
    if (isPending) {
      items.push({
        id: `approval-${approval.id}`,
        label: `Review & approve ${approval.artifact}`,
        met: false,
        hint: 'Open the document to review',
      });
    } else if (approval.status === 'approved') {
      items.push({
        id: `approval-${approval.id}`,
        label: `Review & approve ${approval.artifact}`,
        met: true,
      });
    }
  }

  // ─── No Requirements ───────────────────────────────────────────
  if (items.length === 0) {
    items.push({
      id: 'no-requirements',
      label: 'Ready to continue',
      met: true,
    });
  }

  return items;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function humanizeGateId(gateId: string): string {
  return gateId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
