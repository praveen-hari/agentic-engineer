import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../core/workflow-engine';
import type { RiskAssessment } from '../../core/types';

describe('WorkflowEngine', () => {
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
    engine = new WorkflowEngine();
  });

  describe('create', () => {
    it('creates a workflow from a risk assessment', () => {
      const wf = engine.create('wf-001', 'Fix typo in README', lightAssessment);

      expect(wf.id).toBe('wf-001');
      expect(wf.objective).toBe('Fix typo in README');
      expect(wf.processLevel).toBe('light');
      expect(wf.version).toBe(1);
      expect(wf.state.status).toBe('idle');
      expect(wf.state.currentStage).toBeNull();
    });

    it('generates stages based on process level', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(wf.stages.length).toBeGreaterThan(0);
      expect(wf.stages[0].status).toBe('pending');
    });

    it('includes detected risks in the workflow', () => {
      const wf = engine.create('wf-001', 'Add API', standardAssessment);

      expect(wf.detectedRisks).toEqual(standardAssessment.signals);
    });

    it('all stages start as pending', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(wf.stages.every((s) => s.status === 'pending')).toBe(true);
    });
  });

  describe('start', () => {
    it('transitions workflow from idle to active', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = engine.start(wf);

      expect(started.state.status).toBe('active');
      expect(started.state.currentStage).toBe(started.stages[0].id);
      expect(started.stages[0].status).toBe('active');
    });

    it('sets startedAt timestamp', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = engine.start(wf);

      expect(started.state.startedAt).toBeDefined();
    });

    it('throws if workflow is already active', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);
      const started = engine.start(wf);

      expect(() => engine.start(started)).toThrow(/already active|invalid.*transition/i);
    });
  });

  describe('advanceStage', () => {
    it('completes current stage and activates next', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));
      const advanced = engine.advanceStage(wf);

      expect(advanced.stages[0].status).toBe('completed');
      expect(advanced.stages[0].completedAt).toBeDefined();
      if (advanced.stages.length > 1) {
        expect(advanced.stages[1].status).toBe('active');
        expect(advanced.state.currentStage).toBe(advanced.stages[1].id);
      }
    });

    it('throws when workflow is not active (not started)', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(() => engine.advanceStage(wf)).toThrow(/idle|no active|invalid/i);
    });

    it('completes the workflow when last stage is advanced', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));

      let current = wf;
      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        current = engine.advanceStage(current);
      }

      expect(current.state.status).toBe('completed');
      expect(current.state.currentStage).toBeNull();
      expect(current.stages.every((s) => s.status === 'completed')).toBe(true);
    });
  });

  describe('skipStage', () => {
    it('skips the current stage if skippable', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));

      const currentStage = wf.stages.find((s) => s.status === 'active')!;
      if (!currentStage.skippable) {
        const stdWf = engine.start(engine.create('wf-002', 'Add feature', standardAssessment));
        const stdStage = stdWf.stages.find((s) => s.status === 'active')!;
        if (stdStage.skippable) {
          const skipped = engine.skipStage(stdWf, stdStage.id);
          expect(skipped.stages.find((s) => s.id === stdStage.id)!.status).toBe('skipped');
          return;
        }
      }

      if (currentStage.skippable) {
        const skipped = engine.skipStage(wf, currentStage.id);
        expect(skipped.stages.find((s) => s.id === currentStage.id)!.status).toBe('skipped');
      }
    });

    it('throws when trying to skip a non-skippable stage', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));
      const currentStage = wf.stages.find((s) => s.status === 'active')!;

      if (!currentStage.skippable) {
        expect(() => engine.skipStage(wf, currentStage.id)).toThrow(/skippable|cannot/i);
      }
    });
  });

  describe('invalid transitions', () => {
    it('rejects pending → completed (must go through active)', () => {
      const wf = engine.create('wf-001', 'Fix typo', lightAssessment);

      expect(() => engine.advanceStage(wf)).toThrow();
    });

    it('rejects advancing a completed workflow', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));
      let current = wf;
      const stageCount = wf.stages.length;
      for (let i = 0; i < stageCount; i++) {
        current = engine.advanceStage(current);
      }

      expect(() => engine.advanceStage(current)).toThrow(/completed|invalid/i);
    });
  });

  describe('stage ordering enforcement', () => {
    it('stages are processed in order (no skipping ahead)', () => {
      const wf = engine.start(engine.create('wf-001', 'Fix typo', lightAssessment));

      expect(wf.stages[0].status).toBe('active');
      expect(wf.stages[1].status).toBe('pending');

      const advanced = engine.advanceStage(wf);
      expect(advanced.stages[0].status).toBe('completed');
      if (advanced.stages.length > 1) {
        expect(advanced.stages[1].status).toBe('active');
        expect(advanced.stages[2]?.status).toBe('pending');
      }
    });
  });
});
