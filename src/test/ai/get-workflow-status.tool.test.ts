import { describe, it, expect, beforeEach } from 'vitest';
import { GetWorkflowStatusTool } from '../../ai/tools/get-workflow-status.tool';
import { StateManager } from '../../core/state-manager';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

describe('GetWorkflowStatusTool', () => {
  let fs: InMemoryFileIO;
  let stateManager: StateManager;
  let tool: GetWorkflowStatusTool;

  const filePath = '/project/.codestudio/workflow.json';

  const sampleWorkflow: WorkflowDefinition = {
    id: 'wf-001',
    version: 1,
    objective: 'Add user profile',
    processLevel: 'standard',
    detectedRisks: [],
    stages: [
      {
        id: 'onboard',
        name: 'Onboard',
        status: 'completed',
        skippable: true,
        entryConditions: [],
        exitConditions: [],
        artifacts: [],
      },
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
    ],
    qualityGates: [
      {
        id: 'tests-pass',
        name: 'Tests Pass',
        type: 'automated',
        status: 'pending',
        stage: 'verify',
        blocking: true,
        conditional: false,
      },
    ],
    approvals: [{ id: 'approval-spec', level: 'explicit', artifact: 'spec', status: 'pending' }],
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

  beforeEach(() => {
    fs = new InMemoryFileIO();
    stateManager = new StateManager(fs, filePath);
    tool = new GetWorkflowStatusTool(stateManager);
  });

  describe('prepareInvocation', () => {
    it('returns confirmation message', () => {
      const result = tool.prepareInvocation({});
      expect(result.confirmationTitle).toBe('Get Workflow Status');
    });
  });

  describe('invoke', () => {
    it('returns no active workflow when state file is missing', async () => {
      const result = await tool.invoke({});
      expect(result.hasActiveWorkflow).toBe(false);
      expect(result.status).toBeNull();
      expect(result.objective).toBeNull();
    });

    it('returns active workflow status', async () => {
      await stateManager.save(sampleWorkflow);
      const result = await tool.invoke({});

      expect(result.hasActiveWorkflow).toBe(true);
      expect(result.status).toBe('active');
      expect(result.currentStage).toBe('define');
      expect(result.objective).toBe('Add user profile');
    });

    it('counts completed stages', async () => {
      await stateManager.save(sampleWorkflow);
      const result = await tool.invoke({});

      expect(result.stagesCompleted).toBe(1);
      expect(result.stagesTotal).toBe(3);
    });

    it('counts pending approvals and gates', async () => {
      await stateManager.save(sampleWorkflow);
      const result = await tool.invoke({});

      expect(result.pendingApprovals).toBe(1);
      expect(result.pendingGates).toBe(1);
    });
  });
});
