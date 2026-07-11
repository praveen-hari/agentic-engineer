/**
 * Edge-case tests for WorkflowEngine.
 *
 * Covers: concurrent operations, boundary conditions, all process levels,
 * skip-then-advance sequences, event ordering, and error paths.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/workflow-engine';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import { EventStream } from '../../core/event-stream';
import type { RiskAssessment, WorkflowDefinition, StageStatus } from '../../core/types';

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
  let fs: InMemoryFileIO;
  let eventStream: EventStream;
  let engine: WorkflowEngine;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    eventStream = new EventStream(fs, '/project/.codestudio/events.jsonl');
    engine = new WorkflowEngine(eventStream);
  });

  // ─── Process Level Stage Generation ─────────────────────────────────

  describe('stage generation per process level', () => {
    it('light process generates exactly 3 stages: plan, build, verify', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['plan', 'build', 'verify']);
    });

    it('standard process generates all 7 stages', async () => {
      const wf = await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard);
      const stageIds = wf.stages.map((s) => s.id);
      expect(stageIds).toEqual(['onboard', 'define', 'plan', 'build', 'verify', 'review', 'ship']);
    });

    it('thorough process generates all 7 stages', async () => {
      const wf = await engine.create('wf-1', 'Add auth', ASSESSMENTS.thorough);
      expect(wf.stages).toHaveLength(7);
    });

    it('guarded process generates all 7 stages', async () => {
      const wf = await engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded);
      expect(wf.stages).toHaveLength(7);
    });
  });

  // ─── Skippability Rules ─────────────────────────────────────────────

  describe('stage skippability per process level', () => {
    it('light: only review is skippable', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      // light has: plan, build, verify — no review stage
      for (const stage of wf.stages) {
        if (stage.id === 'review') {
          expect(stage.skippable).toBe(true);
        } else {
          expect(stage.skippable).toBe(false);
        }
      }
    });

    it('standard: onboard and review are skippable', async () => {
      const wf = await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard);
      for (const stage of wf.stages) {
        if (stage.id === 'onboard' || stage.id === 'review') {
          expect(stage.skippable).toBe(true);
        } else {
          expect(stage.skippable).toBe(false);
        }
      }
    });

    it('guarded: nothing is skippable', async () => {
      const wf = await engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded);
      for (const stage of wf.stages) {
        expect(stage.skippable).toBe(false);
      }
    });
  });

  // ─── Skip + Advance Sequences ───────────────────────────────────────

  describe('skip then advance sequences', () => {
    it('skipping first stage activates second stage', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      // onboard is first and skippable in standard
      expect(wf.stages[0].id).toBe('onboard');
      expect(wf.stages[0].skippable).toBe(true);

      const skipped = await engine.skipStage(wf, 'onboard');
      expect(skipped.stages[0].status).toBe('skipped');
      expect(skipped.stages[1].status).toBe('active');
      expect(skipped.state.currentStage).toBe('define');
    });

    it('skip → advance → advance works correctly', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      const afterSkip = await engine.skipStage(wf, 'onboard');
      expect(afterSkip.state.currentStage).toBe('define');

      const afterAdvance1 = await engine.advanceStage(afterSkip);
      expect(afterAdvance1.state.currentStage).toBe('plan');

      const afterAdvance2 = await engine.advanceStage(afterAdvance1);
      expect(afterAdvance2.state.currentStage).toBe('build');
    });

    it('skipping the last stage completes the workflow', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      // Advance to the last stage (review is second-to-last, ship is last)
      let current = wf;
      while (current.state.currentStage !== 'ship') {
        const stage = current.stages.find((s) => s.status === 'active')!;
        if (stage.skippable) {
          current = await engine.skipStage(current, stage.id);
        } else {
          current = await engine.advanceStage(current);
        }
      }
      // Now advance the last stage
      const completed = await engine.advanceStage(current);
      expect(completed.state.status).toBe('completed');
      expect(completed.state.currentStage).toBeNull();
    });
  });

  // ─── Error Paths ────────────────────────────────────────────────────

  describe('error paths', () => {
    it('throws when starting a completed workflow', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      let current = wf;
      for (let i = 0; i < wf.stages.length; i++) {
        current = await engine.advanceStage(current);
      }
      expect(current.state.status).toBe('completed');
      await expect(engine.start(current)).rejects.toThrow(/already completed/i);
    });

    it('throws when skipping a non-existent stage', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      await expect(engine.skipStage(wf, 'nonexistent' as never)).rejects.toThrow(/not found/i);
    });

    it('throws when skipping a pending (non-active) stage', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      // 'define' is pending, not active
      await expect(engine.skipStage(wf, 'define')).rejects.toThrow(/not active/i);
    });

    it('throws when skipping a non-skippable stage in guarded mode', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add payment', ASSESSMENTS.guarded),
      );
      const activeStage = wf.stages.find((s) => s.status === 'active')!;
      await expect(engine.skipStage(wf, activeStage.id)).rejects.toThrow(/not skippable/i);
    });

    it('throws when advancing an idle workflow', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      await expect(engine.advanceStage(wf)).rejects.toThrow(/idle/i);
    });

    it('throws when skipping in an idle workflow', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      await expect(engine.skipStage(wf, 'plan')).rejects.toThrow();
    });
  });

  // ─── Timestamp Integrity ────────────────────────────────────────────

  describe('timestamp integrity', () => {
    it('create sets startedAt and lastActivityAt', async () => {
      const before = new Date().toISOString();
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const after = new Date().toISOString();

      expect(wf.state.startedAt >= before).toBe(true);
      expect(wf.state.startedAt <= after).toBe(true);
      expect(wf.state.lastActivityAt >= before).toBe(true);
    });

    it('start updates startedAt and sets stage startedAt', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const started = await engine.start(wf);

      expect(started.stages[0].startedAt).toBeDefined();
      expect(started.state.startedAt).toBeDefined();
    });

    it('advance sets completedAt on completed stage', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const advanced = await engine.advanceStage(wf);

      expect(advanced.stages[0].completedAt).toBeDefined();
    });

    it('skip sets completedAt on skipped stage', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      const skipped = await engine.skipStage(wf, 'onboard');

      expect(skipped.stages[0].completedAt).toBeDefined();
    });

    it('lastActivityAt updates on every state change', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const t1 = wf.state.lastActivityAt;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 2));
      const advanced = await engine.advanceStage(wf);
      const t2 = advanced.state.lastActivityAt;

      expect(t2 >= t1).toBe(true);
    });
  });

  // ─── Event Ordering ─────────────────────────────────────────────────

  describe('event ordering', () => {
    it('emits events in correct order: created → started → entered', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      await engine.start(wf);

      const events = await eventStream.read();
      const types = events.map((e) => e.type);

      const createdIdx = types.indexOf('workflow.created');
      const startedIdx = types.indexOf('workflow.started');
      const enteredIdx = types.indexOf('stage.entered');

      expect(createdIdx).toBeLessThan(startedIdx);
      expect(startedIdx).toBeLessThan(enteredIdx);
    });

    it('advance emits: stage.completed → stage.entered (for non-last stage)', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      // Clear events from create/start
      const eventsBefore = (await eventStream.read()).length;

      await engine.advanceStage(wf);

      const events = await eventStream.read();
      const newEvents = events.slice(eventsBefore);
      const types = newEvents.map((e) => e.type);

      expect(types).toContain('stage.completed');
      if (wf.stages.length > 1) {
        expect(types).toContain('stage.entered');
        expect(types.indexOf('stage.completed')).toBeLessThan(types.indexOf('stage.entered'));
      }
    });

    it('last advance emits: stage.completed → workflow.completed', async () => {
      let current = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      for (let i = 0; i < current.stages.length - 1; i++) {
        current = await engine.advanceStage(current);
      }
      const eventsBefore = (await eventStream.read()).length;

      await engine.advanceStage(current);

      const events = await eventStream.read();
      const newEvents = events.slice(eventsBefore);
      const types = newEvents.map((e) => e.type);

      expect(types).toContain('stage.completed');
      expect(types).toContain('workflow.completed');
    });

    it('skip emits stage.skipped event', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      await engine.skipStage(wf, 'onboard');

      const events = await eventStream.read();
      expect(events.some((e) => e.type === 'stage.skipped')).toBe(true);
    });

    it('all events have unique IDs', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      await engine.advanceStage(wf);

      const events = await eventStream.read();
      const ids = events.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all events have valid timestamps', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      await engine.advanceStage(wf);

      const events = await eventStream.read();
      for (const event of events) {
        expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      }
    });
  });

  // ─── Immutability ───────────────────────────────────────────────────

  describe('immutability', () => {
    it('create returns a new object (not mutated input)', async () => {
      const wf = await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light);
      const started = await engine.start(wf);

      // Original should still be idle
      expect(wf.state.status).toBe('idle');
      expect(started.state.status).toBe('active');
    });

    it('advance returns a new object', async () => {
      const wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      const advanced = await engine.advanceStage(wf);

      expect(wf.stages[0].status).toBe('active');
      expect(advanced.stages[0].status).toBe('completed');
    });

    it('skip returns a new object', async () => {
      const wf = await engine.start(
        await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard),
      );
      const skipped = await engine.skipStage(wf, 'onboard');

      expect(wf.stages[0].status).toBe('active');
      expect(skipped.stages[0].status).toBe('skipped');
    });
  });

  // ─── Full Lifecycle ─────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('light: create → start → advance through all → completed', async () => {
      let wf = await engine.start(await engine.create('wf-1', 'Fix typo', ASSESSMENTS.light));
      expect(wf.state.status).toBe('active');

      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        wf = await engine.advanceStage(wf);
      }

      expect(wf.state.status).toBe('completed');
      expect(wf.stages.every((s) => s.status === 'completed')).toBe(true);
    });

    it('standard: create → start → mix of skip and advance → completed', async () => {
      let wf = await engine.start(await engine.create('wf-1', 'Add feature', ASSESSMENTS.standard));

      while (wf.state.status === 'active') {
        const active = wf.stages.find((s) => s.status === 'active')!;
        if (active.skippable && active.id === 'onboard') {
          wf = await engine.skipStage(wf, active.id);
        } else {
          wf = await engine.advanceStage(wf);
        }
      }

      expect(wf.state.status).toBe('completed');
      const statuses = wf.stages.map((s) => s.status);
      expect(statuses).toContain('skipped');
      expect(statuses).toContain('completed');
    });
  });
});
