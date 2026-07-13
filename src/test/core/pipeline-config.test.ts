import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PIPELINE,
  meetsMinLevel,
  getStagesForLevel,
  isStageSkippable,
  getRequiredArtifacts,
  getRequiredGates,
  PROCESS_LEVEL_ORDER,
} from '../../core/pipeline-config';
import type { PipelineConfig, StageDefinition } from '../../core/pipeline-config';
import type { LifecycleStage, ProcessLevel } from '../../core/types';
import { StageExecutor } from '../../core/stage-executor';
import { WorkflowEngine, generateStagesForLevel } from '../../core/workflow-engine';
import { WorkflowGenerator } from '../../core/workflow-generator';
import { SkillEngine } from '../../core/skill-engine';
import { SkillRegistry } from '../../core/skill-registry';

// ─── Helper: create a custom pipeline config for testing ────────────────────

function makeCustomPipeline(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return { ...DEFAULT_PIPELINE, ...overrides };
}

function makeCustomStage(overrides: Partial<StageDefinition> = {}): StageDefinition {
  return {
    name: 'Custom',
    description: 'Custom stage for testing',
    artifacts: {},
    gates: {},
    skills: [],
    steps: ['Do something'],
    skippableAt: [],
    autoAdvance: false,
    ...overrides,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

describe('Pipeline Config — Helper Functions', () => {
  describe('meetsMinLevel', () => {
    it('light meets light', () => {
      expect(meetsMinLevel('light', 'light')).toBe(true);
    });

    it('light does NOT meet standard', () => {
      expect(meetsMinLevel('light', 'standard')).toBe(false);
    });

    it('guarded meets all levels', () => {
      expect(meetsMinLevel('guarded', 'light')).toBe(true);
      expect(meetsMinLevel('guarded', 'standard')).toBe(true);
      expect(meetsMinLevel('guarded', 'thorough')).toBe(true);
      expect(meetsMinLevel('guarded', 'guarded')).toBe(true);
    });

    it('standard meets standard but not thorough', () => {
      expect(meetsMinLevel('standard', 'standard')).toBe(true);
      expect(meetsMinLevel('standard', 'thorough')).toBe(false);
    });
  });

  describe('getStagesForLevel', () => {
    it('returns 3 stages for light', () => {
      const stages = getStagesForLevel(DEFAULT_PIPELINE, 'light');
      expect(stages).toEqual(['plan', 'build', 'verify']);
    });

    it('returns 5 stages for standard', () => {
      const stages = getStagesForLevel(DEFAULT_PIPELINE, 'standard');
      expect(stages).toEqual(['define', 'plan', 'build', 'verify', 'review']);
    });

    it('returns 6 stages for thorough', () => {
      const stages = getStagesForLevel(DEFAULT_PIPELINE, 'thorough');
      expect(stages).toEqual(['define', 'plan', 'build', 'verify', 'review', 'ship']);
    });

    it('returns 6 stages for guarded', () => {
      const stages = getStagesForLevel(DEFAULT_PIPELINE, 'guarded');
      expect(stages).toEqual(['define', 'plan', 'build', 'verify', 'review', 'ship']);
    });
  });

  describe('isStageSkippable', () => {
    it('review is skippable at light, standard, thorough', () => {
      expect(isStageSkippable(DEFAULT_PIPELINE, 'review', 'light')).toBe(true);
      expect(isStageSkippable(DEFAULT_PIPELINE, 'review', 'standard')).toBe(true);
      expect(isStageSkippable(DEFAULT_PIPELINE, 'review', 'thorough')).toBe(true);
    });

    it('nothing is skippable at guarded (safety override)', () => {
      expect(isStageSkippable(DEFAULT_PIPELINE, 'review', 'guarded')).toBe(false);
      expect(isStageSkippable(DEFAULT_PIPELINE, 'define', 'guarded')).toBe(false);
      expect(isStageSkippable(DEFAULT_PIPELINE, 'ship', 'guarded')).toBe(false);
    });

    it('build is never skippable', () => {
      expect(isStageSkippable(DEFAULT_PIPELINE, 'build', 'light')).toBe(false);
      expect(isStageSkippable(DEFAULT_PIPELINE, 'build', 'standard')).toBe(false);
    });
  });

  describe('getRequiredArtifacts', () => {
    it('define stage requires spec at standard+', () => {
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'define', 'standard')).toContain('spec');
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'define', 'thorough')).toContain('spec');
    });

    it('define stage does NOT require spec at light', () => {
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'define', 'light')).not.toContain('spec');
    });

    it('build stage has no required artifacts', () => {
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'build', 'standard')).toEqual([]);
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'build', 'guarded')).toEqual([]);
    });

    it('verify stage requires report at all levels', () => {
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'verify', 'light')).toContain('report');
      expect(getRequiredArtifacts(DEFAULT_PIPELINE, 'verify', 'guarded')).toContain('report');
    });
  });

  describe('getRequiredGates', () => {
    it('build stage requires build-complete at all levels', () => {
      expect(getRequiredGates(DEFAULT_PIPELINE, 'build', 'light')).toContain('build-complete');
      expect(getRequiredGates(DEFAULT_PIPELINE, 'build', 'guarded')).toContain('build-complete');
    });

    it('verify stage requires tests-pass at standard+ only', () => {
      expect(getRequiredGates(DEFAULT_PIPELINE, 'verify', 'light')).not.toContain('tests-pass');
      expect(getRequiredGates(DEFAULT_PIPELINE, 'verify', 'standard')).toContain('tests-pass');
    });

    it('ship stage requires rollback-tested only at guarded', () => {
      expect(getRequiredGates(DEFAULT_PIPELINE, 'ship', 'thorough')).not.toContain(
        'rollback-tested',
      );
      expect(getRequiredGates(DEFAULT_PIPELINE, 'ship', 'guarded')).toContain('rollback-tested');
    });

    it('review stage requires security-review at thorough+', () => {
      expect(getRequiredGates(DEFAULT_PIPELINE, 'review', 'standard')).not.toContain(
        'security-review',
      );
      expect(getRequiredGates(DEFAULT_PIPELINE, 'review', 'thorough')).toContain('security-review');
    });
  });
});

// ─── Custom Pipeline Injection ──────────────────────────────────────────────

describe('Pipeline Config — Custom Config Injection', () => {
  describe('StageExecutor accepts custom pipeline', () => {
    it('uses custom gate requirements', () => {
      const customPipeline = makeCustomPipeline({
        stages: {
          ...DEFAULT_PIPELINE.stages,
          build: {
            ...DEFAULT_PIPELINE.stages.build,
            gates: {
              'build-complete': { name: 'Build Complete', type: 'approval', minLevel: 'light' },
              'custom-lint': { name: 'Custom Lint', type: 'automated', minLevel: 'light' },
            },
          },
        },
      });

      const registry = new SkillRegistry();
      const executor = new StageExecutor(registry, customPipeline);

      const wf = {
        id: 'test',
        version: 1,
        objective: 'Test',
        processLevel: 'light' as ProcessLevel,
        detectedRisks: [],
        stages: [
          {
            id: 'build' as LifecycleStage,
            name: 'Build',
            status: 'active' as const,
            skippable: false,
            entryConditions: [],
            exitConditions: [],
            artifacts: [],
          },
        ],
        qualityGates: [],
        approvals: [],
        activeSkills: [],
        skillActivationReason: {},
        state: {
          currentStage: 'build' as LifecycleStage,
          currentTask: null,
          tasksCompleted: 0,
          tasksTotal: 0,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          status: 'active' as const,
        },
      };

      const action = executor.getStageAction(wf);
      expect(action).not.toBeNull();
      expect(action!.requiredGates).toContain('build-complete');
      expect(action!.requiredGates).toContain('custom-lint');
    });
  });

  describe('WorkflowEngine accepts custom pipeline', () => {
    it('generates stages from custom process level config', () => {
      const customPipeline = makeCustomPipeline({
        processLevels: {
          ...DEFAULT_PIPELINE.processLevels,
          light: {
            stages: ['build', 'verify'],
            minApprovals: 0,
            skills: [],
          },
        },
      });

      const stages = generateStagesForLevel('light', customPipeline);
      expect(stages).toHaveLength(2);
      expect(stages[0].id).toBe('build');
      expect(stages[1].id).toBe('verify');
    });

    it('uses custom stage names', () => {
      const customPipeline = makeCustomPipeline({
        stages: {
          ...DEFAULT_PIPELINE.stages,
          build: {
            ...DEFAULT_PIPELINE.stages.build,
            name: 'Implementation',
          },
        },
      });

      const stages = generateStagesForLevel('standard', customPipeline);
      const buildStage = stages.find((s) => s.id === 'build');
      expect(buildStage?.name).toBe('Implementation');
    });
  });

  describe('WorkflowGenerator accepts custom pipeline', () => {
    it('generates gates from custom pipeline config', () => {
      const customPipeline = makeCustomPipeline({
        stages: {
          ...DEFAULT_PIPELINE.stages,
          verify: {
            ...DEFAULT_PIPELINE.stages.verify,
            gates: {
              'tests-pass': { name: 'Tests Pass', type: 'automated', minLevel: 'light' },
              'custom-e2e': { name: 'E2E Tests', type: 'automated', minLevel: 'light' },
            },
          },
        },
      });

      const registry = new SkillRegistry();
      const skillEngine = new SkillEngine(registry, customPipeline);
      const generator = new WorkflowGenerator(skillEngine, customPipeline);

      const wf = generator.generate('wf-test', 'Test', {
        workType: 'feature',
        complexity: 'simple',
        riskLevel: 'low',
        processLevel: 'light',
        signals: [],
        contextSignals: [],
        source: 'deterministic',
      });

      const gateIds = wf.qualityGates.map((g) => g.id);
      expect(gateIds).toContain('tests-pass');
      expect(gateIds).toContain('custom-e2e');
    });

    it('generates approvals from custom pipeline config', () => {
      const customPipeline = makeCustomPipeline({
        approvals: [
          ...DEFAULT_PIPELINE.approvals,
          {
            id: 'approval-custom',
            level: 'review',
            artifact: 'custom-check',
            reason: 'Custom approval for testing',
            minLevel: 'standard',
          },
        ],
      });

      const registry = new SkillRegistry();
      const skillEngine = new SkillEngine(registry, customPipeline);
      const generator = new WorkflowGenerator(skillEngine, customPipeline);

      const wf = generator.generate('wf-test', 'Test', {
        workType: 'feature',
        complexity: 'moderate',
        riskLevel: 'medium',
        processLevel: 'standard',
        signals: [],
        contextSignals: [],
        source: 'deterministic',
      });

      const approvalIds = wf.approvals.map((a) => a.id);
      expect(approvalIds).toContain('approval-custom');
    });
  });

  describe('SkillEngine accepts custom pipeline', () => {
    it('activates process-level skills from custom config', () => {
      const customPipeline = makeCustomPipeline({
        processLevels: {
          ...DEFAULT_PIPELINE.processLevels,
          standard: {
            ...DEFAULT_PIPELINE.processLevels.standard,
            skills: ['code-review-and-quality', 'security-and-hardening'],
          },
        },
      });

      const registry = new SkillRegistry();
      const engine = new SkillEngine(registry, customPipeline);

      const { activeSkills } = engine.computeActiveSkills({
        workType: 'feature',
        complexity: 'moderate',
        riskLevel: 'medium',
        processLevel: 'standard',
        signals: [],
        contextSignals: [],
        source: 'deterministic',
      });

      expect(activeSkills).toContain('code-review-and-quality');
      expect(activeSkills).toContain('security-and-hardening');
    });
  });
});

// ─── DEFAULT_PIPELINE Integrity ─────────────────────────────────────────────

describe('Pipeline Config — DEFAULT_PIPELINE Integrity', () => {
  it('all process levels reference only defined stages', () => {
    const definedStages = new Set(Object.keys(DEFAULT_PIPELINE.stages));
    for (const [level, def] of Object.entries(DEFAULT_PIPELINE.processLevels)) {
      for (const stageId of def.stages) {
        expect(definedStages.has(stageId)).toBe(true);
      }
    }
  });

  it('all conditional gates reference defined stages', () => {
    const definedStages = new Set(Object.keys(DEFAULT_PIPELINE.stages));
    for (const [signal, gateDef] of Object.entries(DEFAULT_PIPELINE.conditionalGates)) {
      expect(definedStages.has(gateDef.stage)).toBe(true);
    }
  });

  it('all approval stage mappings reference defined stages', () => {
    const definedStages = new Set(Object.keys(DEFAULT_PIPELINE.stages));
    for (const [artifact, stage] of Object.entries(DEFAULT_PIPELINE.approvalStageMap)) {
      expect(definedStages.has(stage)).toBe(true);
    }
  });

  it('process level order covers all defined levels', () => {
    for (const level of Object.keys(DEFAULT_PIPELINE.processLevels)) {
      expect(PROCESS_LEVEL_ORDER).toHaveProperty(level);
    }
  });

  it('every stage has at least a name and description', () => {
    for (const [id, def] of Object.entries(DEFAULT_PIPELINE.stages)) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it('gate minLevels are valid process levels', () => {
    const validLevels = new Set(Object.keys(DEFAULT_PIPELINE.processLevels));
    for (const [, stageDef] of Object.entries(DEFAULT_PIPELINE.stages)) {
      for (const [, gateDef] of Object.entries(stageDef.gates)) {
        expect(validLevels.has(gateDef.minLevel)).toBe(true);
      }
    }
  });

  it('approval minLevels are valid process levels', () => {
    const validLevels = new Set(Object.keys(DEFAULT_PIPELINE.processLevels));
    for (const approval of DEFAULT_PIPELINE.approvals) {
      expect(validLevels.has(approval.minLevel)).toBe(true);
    }
  });
});
