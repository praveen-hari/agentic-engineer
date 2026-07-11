/**
 * Tests for buildCompletionItems — user-friendly completion checklist.
 *
 * Verifies that the checklist uses plain language (no jargon like
 * "artifact", "gate", "approval") and merges related steps.
 */
import { describe, it, expect } from 'vitest';
import { buildCompletionItems } from '../../webview/utils/build-completion-items';
import type { StageAction, StageExecutionResult, Artifact, Approval } from '../../core/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DEFINE_ACTION: StageAction = {
  stage: 'define',
  description: 'Define — Capture objective and produce specification',
  skills: ['spec-driven-development'],
  requiredArtifacts: ['spec'],
  requiredGates: ['spec-approved'],
  autoAdvance: false,
};

const PLAN_ACTION: StageAction = {
  stage: 'plan',
  description: 'Plan — Break specification into executable tasks',
  skills: ['planning-and-task-breakdown'],
  requiredArtifacts: ['plan'],
  requiredGates: ['plan-approved'],
  autoAdvance: false,
};

const BUILD_ACTION: StageAction = {
  stage: 'build',
  description: 'Build — Implement tasks with TDD',
  skills: ['test-driven-development'],
  requiredArtifacts: [],
  requiredGates: [],
  autoAdvance: false,
};

const VERIFY_ACTION: StageAction = {
  stage: 'verify',
  description: 'Verify — Run tests and checks',
  skills: [],
  requiredArtifacts: ['report'],
  requiredGates: ['tests-pass'],
  autoAdvance: false,
};

const REVIEW_ACTION: StageAction = {
  stage: 'review',
  description: 'Review — Multi-axis code review',
  skills: ['code-review-and-quality'],
  requiredArtifacts: ['review'],
  requiredGates: ['code-review'],
  autoAdvance: false,
};

function makeCompletion(overrides: Partial<StageExecutionResult> = {}): StageExecutionResult {
  return {
    stage: 'define',
    status: 'blocked',
    artifacts: [],
    pendingGates: ['spec-approved'],
    pendingApprovals: ['approval-spec'],
    message: 'Missing artifacts: spec. Pending gates: spec-approved',
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'spec-1',
    type: 'spec',
    title: 'Auth Spec',
    path: 'specs/auth.md',
    stage: 'define',
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:00:00Z',
    status: 'draft',
    ...overrides,
  };
}

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: 'approval-spec',
    level: 'explicit',
    artifact: 'spec',
    status: 'pending',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildCompletionItems', () => {
  // ─── User-Friendly Labels ───────────────────────────────────────

  describe('user-friendly labels', () => {
    it('uses "Specification created" not "Spec artifact saved"', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      const specItem = items.find((i) => i.id === 'artifact-spec');
      expect(specItem!.label).toBe('Specification created');
      expect(specItem!.label).not.toContain('artifact');
    });

    it('uses "Implementation plan created" for plan', () => {
      const completion = makeCompletion({ stage: 'plan', pendingGates: ['plan-approved'] });
      const items = buildCompletionItems(PLAN_ACTION, completion, [], []);
      const planItem = items.find((i) => i.id === 'artifact-plan');
      expect(planItem!.label).toBe('Implementation plan created');
    });

    it('uses "Verification report created" for report', () => {
      const completion = makeCompletion({ stage: 'verify', pendingGates: ['tests-pass'] });
      const items = buildCompletionItems(VERIFY_ACTION, completion, [], []);
      const reportItem = items.find((i) => i.id === 'artifact-report');
      expect(reportItem!.label).toBe('Verification report created');
    });

    it('gate label uses plain language, not raw ID', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      const gateItem = items.find((i) => i.id === 'gate-spec-approved');
      expect(gateItem!.label).toContain('Review');
      expect(gateItem!.label).toContain('approve');
      expect(gateItem!.label).not.toContain('gate');
    });

    it('"Ready to continue" when no requirements', () => {
      const completion = makeCompletion({
        stage: 'build',
        status: 'completed',
        pendingGates: [],
        pendingApprovals: [],
        message: 'Ready',
      });
      const items = buildCompletionItems(BUILD_ACTION, completion, [], []);
      expect(items).toHaveLength(1);
      expect(items[0].label).toContain('Ready to continue');
    });
  });

  // ─── Artifact + Gate Merging ────────────────────────────────────

  describe('artifact + gate merging', () => {
    it('spec + spec-approved produces exactly 2 items (create + review)', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      expect(
        items.filter((i) => i.id.startsWith('artifact-') || i.id.startsWith('gate-')),
      ).toHaveLength(2);
    });

    it('first item is "created", second is "review & approve"', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      expect(items[0].id).toBe('artifact-spec');
      expect(items[0].label).toContain('created');
      expect(items[1].id).toBe('gate-spec-approved');
      expect(items[1].label).toContain('Review');
    });

    it('does not duplicate approval when gate already covers it', () => {
      const approvals = [makeApproval({ artifact: 'spec', status: 'pending' })];
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], approvals);
      // Should NOT have a separate approval-* item since gate-spec-approved covers it
      const approvalItems = items.filter((i) => i.id.startsWith('approval-'));
      expect(approvalItems).toHaveLength(0);
    });
  });

  // ─── Artifact Status ──────────────────────────────────────────

  describe('artifact status', () => {
    it('unmet when no artifacts exist', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      expect(items.find((i) => i.id === 'artifact-spec')!.met).toBe(false);
    });

    it('met when draft artifact exists', () => {
      const artifacts = [makeArtifact({ status: 'draft' })];
      const completion = makeCompletion({
        pendingGates: ['spec-approved'],
        message: 'Pending gates',
      });
      const items = buildCompletionItems(DEFINE_ACTION, completion, artifacts, []);
      expect(items.find((i) => i.id === 'artifact-spec')!.met).toBe(true);
    });

    it('met when approved artifact exists', () => {
      const artifacts = [makeArtifact({ status: 'approved' })];
      const completion = makeCompletion({
        pendingGates: [],
        pendingApprovals: [],
        status: 'completed',
        message: 'Ready',
      });
      const items = buildCompletionItems(DEFINE_ACTION, completion, artifacts, []);
      expect(items.find((i) => i.id === 'artifact-spec')!.met).toBe(true);
    });

    it('unmet when artifact is rejected', () => {
      const artifacts = [makeArtifact({ status: 'rejected' })];
      const completion = makeCompletion({ message: 'Missing artifacts: spec' });
      const items = buildCompletionItems(DEFINE_ACTION, completion, artifacts, []);
      expect(items.find((i) => i.id === 'artifact-spec')!.met).toBe(false);
    });
  });

  // ─── Gate Status ──────────────────────────────────────────────

  describe('gate status', () => {
    it('unmet when gate is pending', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      expect(items.find((i) => i.id === 'gate-spec-approved')!.met).toBe(false);
    });

    it('met when gate is not in pendingGates', () => {
      const completion = makeCompletion({
        pendingGates: [],
        pendingApprovals: [],
        status: 'completed',
        message: 'Ready',
      });
      const items = buildCompletionItems(DEFINE_ACTION, completion, [makeArtifact()], []);
      expect(items.find((i) => i.id === 'gate-spec-approved')!.met).toBe(true);
    });

    it('standalone gate (tests-pass) not merged with artifact', () => {
      const completion = makeCompletion({
        stage: 'verify',
        pendingGates: ['tests-pass'],
        message: 'Pending',
      });
      const items = buildCompletionItems(VERIFY_ACTION, completion, [], []);
      const testsItem = items.find((i) => i.id === 'gate-tests-pass');
      expect(testsItem).toBeDefined();
      expect(testsItem!.label).toBe('All tests passing');
    });

    it('code-review gate uses friendly label', () => {
      const completion = makeCompletion({
        stage: 'review',
        pendingGates: ['code-review'],
        message: 'Pending',
      });
      const items = buildCompletionItems(REVIEW_ACTION, completion, [], []);
      const reviewGate = items.find((i) => i.id === 'gate-code-review');
      expect(reviewGate!.label).toBe('Complete the code review');
    });
  });

  // ─── Action Hints ─────────────────────────────────────────────

  describe('action hints', () => {
    it('unmet artifact hints to send to agent', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      const specItem = items.find((i) => i.id === 'artifact-spec');
      expect(specItem!.hint).toContain('Send to Agent');
    });

    it('unmet gate hints to review the document', () => {
      const artifacts = [makeArtifact()];
      const completion = makeCompletion({ pendingGates: ['spec-approved'], message: 'Pending' });
      const items = buildCompletionItems(DEFINE_ACTION, completion, artifacts, []);
      const gateItem = items.find((i) => i.id === 'gate-spec-approved');
      expect(gateItem!.hint).toContain('review');
    });

    it('met items have no hint', () => {
      const completion = makeCompletion({
        pendingGates: [],
        pendingApprovals: [],
        status: 'completed',
        message: 'Ready',
      });
      const items = buildCompletionItems(DEFINE_ACTION, completion, [makeArtifact()], []);
      for (const item of items.filter((i) => i.met)) {
        expect(item.hint).toBeUndefined();
      }
    });
  });

  // ─── Return Type ──────────────────────────────────────────────

  describe('return type', () => {
    it('every item has id, label, met fields', () => {
      const items = buildCompletionItems(DEFINE_ACTION, makeCompletion(), [], []);
      for (const item of items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(typeof item.met).toBe('boolean');
      }
    });
  });
});
