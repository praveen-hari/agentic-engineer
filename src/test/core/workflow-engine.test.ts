import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/workflow-engine';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import { EventStream } from '../../core/event-stream';
import type { RiskAssessment } from '../../core/types';

describe('WorkflowEngine', () => {
  let fs: InMemoryFileIO;
  let eventStream: EventStream;
  let engine: WorkflowEngine;

  const lightAssessment: RiskAssessment = {
    workType: 'documentation',
    complexity: 'trivial',
    riskLevel: 'low',
    processLevel: 'light',
    signals: [],
    contextSignals: [],
    source: 'deterministic',
  };

  const standardAssessment: RiskAssessment = {
    workType: 'feature',
    complexity: 'moderate',
    riskLevel: 'medium',
    processLevel: 'standard',
    signals: [
      { type: 'keyword', signal: 'external service', severity: 'medium', impact: 'review gate' },
    ],
    contextSignals: ['touches_api'],
    source: 'deterministic',
  };

  beforeEach(() => {
    fs = new InMemoryFileIO();
    eventStream = new EventStream(fs, '/project/.codestudio/events.jsonl');
    engine = new WorkflowEngine(eventStream);
  });

  describe('create', () => {
    it('creates a workflow from a risk assessment', async () => {
      const wf = await engine.create('wf-001', 'Fix typo in README', lightAssessment);

      expect(wf.id).toBe('wf-001');
      expect(wf.objective).toBe('Fix typo in README');
      expect(wf.processLevel).toBe('light');
      expect(wf.version).toBe(1);
      expect(wf.state.status).toBe('idle');
      expect(wf.state.currentStage).toBeNull();
    });

    it('generates stages based on process level', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(wf.stages.length).toBeGreaterThan(0);
      expect(wf.stages[0].status).toBe('pending');
    });

    it('includes detected risks in the workflow', async () => {
      const wf = await engine.create('wf-001', 'Add API', standardAssessment);

      expect(wf.detectedRisks).toEqual(standardAssessment.signals);
    });

    it('all stages start as pending', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(wf.stages.every((s) => s.status === 'pending')).toBe(true);
    });
  });

  describe('start', () => {
    it('transitions workflow from idle to active', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = await engine.start(wf);

      expect(started.state.status).toBe('active');
      expect(started.state.currentStage).toBe(started.stages[0].id);
      expect(started.stages[0].status).toBe('active');
    });

    it('sets startedAt timestamp', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = await engine.start(wf);

      expect(started.state.startedAt).toBeDefined();
    });

    it('throws if workflow is already active', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = await engine.start(wf);

      await expect(engine.start(started)).rejects.toThrow(/already active|invalid.*transition/i);
    });
  });

  describe('advanceStage', () => {
    it('completes current stage and activates next', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));
      const advanced = await engine.advanceStage(wf);

      expect(advanced.stages[0].status).toBe('completed');
      expect(advanced.stages[0].completedAt).toBeDefined();
      if (advanced.stages.length > 1) {
        expect(advanced.stages[1].status).toBe('active');
        expect(advanced.state.currentStage).toBe(advanced.stages[1].id);
      }
    });

    it('throws when workflow is not active (not started)', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);

      await expect(engine.advanceStage(wf)).rejects.toThrow(/idle|no active|invalid/i);
    });

    it('completes the workflow when last stage is advanced', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));

      // Advance through all stages
      let current = wf;
      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        current = await engine.advanceStage(current);
      }

      expect(current.state.status).toBe('completed');
      expect(current.state.currentStage).toBeNull();
      expect(current.stages.every((s) => s.status === 'completed')).toBe(true);
    });
  });

  describe('skipStage', () => {
    it('skips the current stage if skippable', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));

      // Find first skippable stage
      const currentStage = wf.stages.find((s) => s.status === 'active')!;
      if (!currentStage.skippable) {
        // Light process stages may not be skippable — use standard
        const stdWf = await engine.start(
          await engine.create('wf-002', 'Add feature', standardAssessment),
        );
        const stdStage = stdWf.stages.find((s) => s.status === 'active')!;
        if (stdStage.skippable) {
          const skipped = await engine.skipStage(stdWf, stdStage.id);
          expect(skipped.stages.find((s) => s.id === stdStage.id)!.status).toBe('skipped');
          return;
        }
      }

      // If we have a skippable stage, test it
      if (currentStage.skippable) {
        const skipped = await engine.skipStage(wf, currentStage.id);
        expect(skipped.stages.find((s) => s.id === currentStage.id)!.status).toBe('skipped');
      }
    });

    it('throws when trying to skip a non-skippable stage', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));
      const currentStage = wf.stages.find((s) => s.status === 'active')!;

      if (!currentStage.skippable) {
        await expect(engine.skipStage(wf, currentStage.id)).rejects.toThrow(/skippable|cannot/i);
      }
    });
  });

  describe('invalid transitions', () => {
    it('rejects pending → completed (must go through active)', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);

      // Can't advance a workflow that hasn't started
      await expect(engine.advanceStage(wf)).rejects.toThrow();
    });

    it('rejects advancing a completed workflow', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));
      let current = wf;
      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        current = await engine.advanceStage(current);
      }

      await expect(engine.advanceStage(current)).rejects.toThrow(/completed|invalid/i);
    });
  });

  describe('event emission', () => {
    it('emits workflow.created event on create', async () => {
      await engine.create('wf-001', 'Fix typo', lightAssessment);

      const events = await eventStream.read();
      expect(events.some((e) => e.type === 'workflow.created')).toBe(true);
    });

    it('emits workflow.started event on start', async () => {
      const wf = await engine.create('wf-001', 'Fix typo', lightAssessment);
      await engine.start(wf);

      const events = await eventStream.read();
      expect(events.some((e) => e.type === 'workflow.started')).toBe(true);
    });

    it('emits stage.entered and stage.completed events on advance', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));
      await engine.advanceStage(wf);

      const events = await eventStream.read();
      expect(events.some((e) => e.type === 'stage.completed')).toBe(true);
      expect(events.some((e) => e.type === 'stage.entered')).toBe(true);
    });

    it('emits workflow.completed when last stage advances', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));
      let current = wf;
      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        current = await engine.advanceStage(current);
      }

      const events = await eventStream.read();
      expect(events.some((e) => e.type === 'workflow.completed')).toBe(true);
    });

    it('includes workflowId in emitted events', async () => {
      await engine.create('wf-001', 'Fix typo', lightAssessment);

      const events = await eventStream.read();
      expect(events.every((e) => e.workflowId === 'wf-001')).toBe(true);
    });
  });

  describe('stage ordering enforcement', () => {
    it('stages are processed in order (no skipping ahead)', async () => {
      const wf = await engine.start(await engine.create('wf-001', 'Fix typo', lightAssessment));

      expect(wf.stages[0].status).toBe('active');
      expect(wf.stages[1].status).toBe('pending');

      const advanced = await engine.advanceStage(wf);
      expect(advanced.stages[0].status).toBe('completed');
      if (advanced.stages.length > 1) {
        expect(advanced.stages[1].status).toBe('active');
        expect(advanced.stages[2]?.status).toBe('pending');
      }
    });
  });
});
