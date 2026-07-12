/**
 * Tests for scoped approval auto-approval in AdvanceStageTool (P0 fix).
 *
 * Verifies that when the agent calls engineering_advance_stage, only
 * approvals belonging to the current stage are auto-approved — not
 * approvals for future stages (e.g., restricted deployment approvals).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvanceStageTool } from '../../ai/tools/advance-stage.tool';
import { WorkflowEngine } from '../../core/workflow-engine';
import { WorkflowGenerator } from '../../core/workflow-generator';
import { StateManager } from '../../core/state-manager';
import { StageExecutor } from '../../core/stage-executor';
import { SkillRegistry } from '../../core/skill-registry';
import { SkillEngine } from '../../core/skill-engine';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

// Mock vscode module
vi.mock('vscode', () => ({
  LanguageModelToolResult: class {
    constructor(public parts: unknown[]) {}
  },
  LanguageModelTextPart: class {
    constructor(public text: string) {}
  },
  MarkdownString: class {
    constructor(public value: string) {}
  },
}));

describe('AdvanceStageTool scoped approvals', () => {
  let fs: InMemoryFileIO;
  let stateManager: StateManager;
  let tool: AdvanceStageTool;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    const skillRegistry = new SkillRegistry();
    const skillEngine = new SkillEngine(skillRegistry);
    const workflowEngine = new WorkflowEngine();
    stateManager = new StateManager(fs, '/project/.codestudio/workflow.json');
    const stageExecutor = new StageExecutor(skillRegistry);
    const artifactManager = new ArtifactManager(fs, '/project');

    tool = new AdvanceStageTool(
      workflowEngine,
      stateManager,
      stageExecutor,
      artifactManager,
      vi.fn(),
      async () => 'agent', // agent mode so it auto-advances
    );
  });

  it('only auto-approves define-stage approvals when in define stage', async () => {
    // Workflow in define stage with approvals for define, review, and ship
    const wf: WorkflowDefinition = {
      id: 'wf-scoped',
      version: 1,
      objective: 'Test scoped approvals',
      processLevel: 'guarded',
      detectedRisks: [],
      stages: [
        {
          id: 'define',
          name: 'Define',
          status: 'active',
          skippable: false,
          entryConditions: [],
          exitConditions: [],
          artifacts: [],
        },
        {
          id: 'plan',
          name: 'Plan',
          status: 'pending',
          skippable: false,
          entryConditions: [],
          exitConditions: [],
          artifacts: [],
        },
        {
          id: 'review',
          name: 'Review',
          status: 'pending',
          skippable: false,
          entryConditions: [],
          exitConditions: [],
          artifacts: [],
        },
        {
          id: 'ship',
          name: 'Ship',
          status: 'pending',
          skippable: false,
          entryConditions: [],
          exitConditions: [],
          artifacts: [],
        },
      ],
      qualityGates: [
        {
          id: 'spec-approved',
          name: 'Spec',
          type: 'approval',
          status: 'pending',
          stage: 'define',
          blocking: true,
          conditional: false,
        },
        {
          id: 'code-review',
          name: 'Code Review',
          type: 'review',
          status: 'pending',
          stage: 'review',
          blocking: true,
          conditional: false,
        },
        {
          id: 'ship-checklist',
          name: 'Ship',
          type: 'approval',
          status: 'pending',
          stage: 'ship',
          blocking: true,
          conditional: false,
        },
      ],
      approvals: [
        { id: 'apr-spec', level: 'explicit', artifact: 'spec', status: 'pending', reason: 'Spec' },
        {
          id: 'apr-code',
          level: 'review',
          artifact: 'code-review',
          status: 'pending',
          reason: 'Code review',
        },
        {
          id: 'apr-deploy',
          level: 'restricted',
          artifact: 'deployment',
          status: 'pending',
          reason: 'Deploy',
        },
        {
          id: 'apr-schema',
          level: 'restricted',
          artifact: 'schema-migration',
          status: 'pending',
          reason: 'Schema',
        },
      ],
      activeSkills: [],
      skillActivationReason: {},
      state: {
        currentStage: 'define',
        currentTask: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        startedAt: '2026-07-11T10:00:00Z',
        lastActivityAt: '2026-07-11T10:00:00Z',
        status: 'active',
      },
    };

    await stateManager.save(wf);

    // Invoke the tool
    await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

    // Load the saved state
    const saved = await stateManager.load();
    expect(saved).not.toBeNull();

    // apr-spec (artifact: 'spec' → define stage) should be approved
    const specApproval = saved!.approvals.find((a) => a.id === 'apr-spec');
    expect(specApproval!.status).toBe('approved');

    // apr-code (artifact: 'code-review' → review stage) should still be pending
    const codeApproval = saved!.approvals.find((a) => a.id === 'apr-code');
    expect(codeApproval!.status).toBe('pending');

    // apr-deploy (artifact: 'deployment' → ship stage) should still be pending
    const deployApproval = saved!.approvals.find((a) => a.id === 'apr-deploy');
    expect(deployApproval!.status).toBe('pending');

    // apr-schema (artifact: 'schema-migration' → ship stage) should still be pending
    const schemaApproval = saved!.approvals.find((a) => a.id === 'apr-schema');
    expect(schemaApproval!.status).toBe('pending');

    // define-stage gate should be passed
    const defineGate = saved!.qualityGates.find((g) => g.id === 'spec-approved');
    expect(defineGate!.status).toBe('passed');

    // review-stage gate should still be pending
    const reviewGate = saved!.qualityGates.find((g) => g.id === 'code-review');
    expect(reviewGate!.status).toBe('pending');

    // ship-stage gate should still be pending
    const shipGate = saved!.qualityGates.find((g) => g.id === 'ship-checklist');
    expect(shipGate!.status).toBe('pending');
  });
});
