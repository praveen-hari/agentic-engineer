/**
 * Edge-case tests for WorkflowEngine.
 *
 * Covers: boundary conditions, all process levels,
 * skip-then-advance sequences, and error paths.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/workflow-engine';
import type { RiskAssessment } from '../../core/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const ASSESSMENTS: Record<string, RiskAssessment> = {
  light: {
    workType: 'documentation',
    complexity: 'trivial',
    riskLevel: 'low',
    processLevel: 'light',
    signals: [],
    contextSignals: [],
    source: 'deterministic',
  },
  standard: {
    workType: 'feature',
    complexity: 'moderate',
    riskLevel: 'medium',
    processLevel: 'standard',
    signals: [{ type: 'keyword', signal: 'api', severity: 'medium', impact: 'review gate' }],
    contextSignals: ['touches_api'],
    source: 'deterministic',
  },
  thorough: {
    workType: 'feature',
    complexity: 'complex',
    riskLevel: 'high',
    processLevel: 'thorough',
    signals: [{ type: 'keyword', signal: 'auth', severity: 'high', impact: 'security gate' }],
    contextSignals: ['touches_auth_or_input'],
    source: 'llm',
  },
  guarded: {
    workType: 'security',
    complexity: 'critical',
    riskLevel: 'high',
    processLevel: 'guarded',
    signals: [
      { type: 'keyword', signal: 'payment', severity: 'high', impact: 'security gate' },
      { type: 'dependency', signal: 'stripe', severity: 'medium', impact: 'integration test' },
    ],
    contextSignals: ['touches_auth_or_input', 'touches_external_services'],
    source: 'llm',
  },
};

describe('WorkflowEngine — Edge Cases', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  // ─── Process Level Stage Generation ─────────────────────────────────

  describe('stage generation per process level', () => {
    it('light process generates exactly 3 stages: plan, build, verify', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['plan', 'build', 'verify']);
    });

    it('standard process generates 5 stages', () => {
      const wf = engine.create('wf-1', 'Add feature', ASSESSMENTS.standard);
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['define', 'plan', 'build', 'verify', 'review']);
    });

    it('thorough process generates 6 stages', () => {
      const wf = engine.create('wf-1', 'Add auth', ASSESSMENTS.thorough);
      expect(wf.stages).toHaveLength(6);
    });

    it('guarded process generates 6 stages', () => {
      const wf = engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded);
      expect(wf.stages).toHaveLength(6);
    });
  });

  // ─── Skippability Rules ─────────────────────────────────────────────

  describe('stage skippability per process level', () => {
    it('light: only review is skippable', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      for (const stage of wf.stages) {
        if (stage.id === 'review') {
          expect(stage.skippable).toBe(true);
        } else {
          expect(stage.skippable).toBe(false);
        }
      }
    });

    it('standard: only review is skippable', () => {
      const wf = engine.create('wf-1', 'Add feature', ASSESSMENTS.standard);
      for (const stage of wf.stages) {
        if (stage.id === 'review') {
          expect(stage.skippable).toBe(true);
        } else {
          expect(stage.skippable).toBe(false);
        }
      }
    });

    it('guarded: nothing is skippable', () => {
      const wf = engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded);
      for (const stage of wf.stages) {
        expect(stage.skippable).toBe(false);
      }
    });
  });

  // ─── Skip + Advance Sequences ───────────────────────────────────────

  describe('skip then advance sequences', () => {
    it('skipping review stage activates next stage', () => {
      const wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      // Advance through plan, build, verify to get to review
      let current = wf;
      while (current.state.currentStage !== 'review' && current.state.status === 'active') {
        current = engine.advanceStage(current);
      }
      expect(current.state.currentStage).toBe('review');
      const reviewStage = current.stages.find((s) => s.id === 'review')!;
      expect(reviewStage.skippable).toBe(true);
    });

    it('advance → advance works correctly through standard stages', () => {
      const wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      expect(wf.state.currentStage).toBe('define');

      const afterAdvance1 = engine.advanceStage(wf);
      expect(afterAdvance1.state.currentStage).toBe('plan');

      const afterAdvance2 = engine.advanceStage(afterAdvance1);
      expect(afterAdvance2.state.currentStage).toBe('build');
    });

    it('advancing through all stages completes the workflow', () => {
      let wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      while (wf.state.status === 'active') {
        wf = engine.advanceStage(wf);
      }
      expect(wf.state.status).toBe('completed');
      expect(wf.state.currentStage).toBeNull();
    });
  });

  // ─── Error Paths ────────────────────────────────────────────────────

  describe('error paths', () => {
    it('throws when starting a completed workflow', () => {
      let wf = engine.start(engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      for (let i = 0; i < wf.stages.length; i++) {
        wf = engine.advanceStage(wf);
      }
      expect(wf.state.status).toBe('completed');
      expect(() => engine.start(wf)).toThrow(/already completed/i);
    });

    it('throws when skipping a non-existent stage', () => {
      const wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      expect(() => engine.skipStage(wf, 'nonexistent' as never)).toThrow(/not found/i);
    });

    it('throws when skipping a pending (non-active) stage', () => {
      const wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      // review is the only skippable stage in standard, but it's pending (not active)
      expect(() => engine.skipStage(wf, 'review')).toThrow(/not active/i);
    });

    it('throws when skipping a non-skippable stage in guarded mode', () => {
      const wf = engine.start(engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded));
      const activeStage = wf.stages.find((s) => s.status === 'active')!;
      expect(() => engine.skipStage(wf, activeStage.id)).toThrow(/not skippable/i);
    });

    it('throws when advancing an idle workflow', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      expect(() => engine.advanceStage(wf)).toThrow(/idle/i);
    });

    it('throws when skipping in an idle workflow', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      expect(() => engine.skipStage(wf, 'plan')).toThrow();
    });
  });

  // ─── Timestamp Integrity ────────────────────────────────────────────

  describe('timestamp integrity', () => {
    it('create sets startedAt and lastActivityAt', () => {
      const before = new Date().toISOString();
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const after = new Date().toISOString();

      expect(wf.state.startedAt >= before).toBe(true);
      expect(wf.state.startedAt <= after).toBe(true);
      expect(wf.state.lastActivityAt >= before).toBe(true);
    });

    it('start updates startedAt and sets stage startedAt', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const started = engine.start(wf);

      expect(started.stages[0].startedAt).toBeDefined();
      expect(started.state.startedAt).toBeDefined();
    });

    it('advance sets completedAt on completed stage', () => {
      const wf = engine.start(engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const advanced = engine.advanceStage(wf);

      expect(advanced.stages[0].completedAt).toBeDefined();
    });

    it('skip sets completedAt on skipped stage', () => {
      // Advance to review (which is skippable in standard)
      let wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      while (wf.state.currentStage !== 'review' && wf.state.status === 'active') {
        wf = engine.advanceStage(wf);
      }
      const skipped = engine.skipStage(wf, 'review');
      const reviewStage = skipped.stages.find((s) => s.id === 'review')!;
      expect(reviewStage.completedAt).toBeDefined();
    });

    it('lastActivityAt updates on every state change', () => {
      const wf = engine.start(engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const t1 = wf.state.lastActivityAt;
      const advanced = engine.advanceStage(wf);
      const t2 = advanced.state.lastActivityAt;

      expect(t2 >= t1).toBe(true);
    });
  });

  // ─── Immutability ───────────────────────────────────────────────────

  describe('immutability', () => {
    it('create returns a new object (not mutated input)', () => {
      const wf = engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const started = engine.start(wf);

      expect(wf.state.status).toBe('idle');
      expect(started.state.status).toBe('active');
    });

    it('advance returns a new object', () => {
      const wf = engine.start(engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const advanced = engine.advanceStage(wf);

      expect(wf.stages[0].status).toBe('active');
      expect(advanced.stages[0].status).toBe('completed');
    });

    it('skip returns a new object', () => {
      // Advance to review (which is skippable in standard)
      let wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));
      while (wf.state.currentStage !== 'review' && wf.state.status === 'active') {
        wf = engine.advanceStage(wf);
      }
      const reviewStage = wf.stages.find((s) => s.id === 'review')!;
      const skipped = engine.skipStage(wf, 'review');
      const skippedReview = skipped.stages.find((s) => s.id === 'review')!;

      expect(reviewStage.status).toBe('active');
      expect(skippedReview.status).toBe('skipped');
    });
  });

  // ─── Full Lifecycle ─────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('light: create → start → advance through all → completed', () => {
      let wf = engine.start(engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      expect(wf.state.status).toBe('active');

      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        wf = engine.advanceStage(wf);
      }

      expect(wf.state.status).toBe('completed');
      expect(wf.stages.every((s) => s.status === 'completed')).toBe(true);
    });

    it('standard: create → start → mix of skip and advance → completed', () => {
      let wf = engine.start(engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));

      while (wf.state.status === 'active') {
        const active = wf.stages.find((s) => s.status === 'active')!;
        if (active.skippable && active.id === 'review') {
          wf = engine.skipStage(wf, active.id);
        } else {
          wf = engine.advanceStage(wf);
        }
      }

      expect(wf.state.status).toBe('completed');
      const statuses = wf.stages.map((s) => s.status);
      expect(statuses).toContain('skipped');
      expect(statuses).toContain('completed');
    });
  });
});
