/**
 * Hardening tests for message-handler.ts fixes.
 *
 * Covers:
 * - Paused workflow blocks startWorkflow (P1)
 * - Resume sends full stage prompt, not bare "Continue" (P2)
 * - Settings key whitelist rejects unknown keys (P1)
 * - Scoped approval filtering in handleExecuteStage (P1)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleWebviewMessage,
  type MessageHandlerDeps,
  type ReplyFn,
} from '../../views/message-handler';
import type { MessageToWebview, WorkflowDefinition, RiskAssessment } from '../../core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createBaseDeps(overrides: Partial<MessageHandlerDeps> = {}): MessageHandlerDeps {
  return {
    stateManager: {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      update: vi
        .fn()
        .mockImplementation(async (fn: (wf: WorkflowDefinition) => WorkflowDefinition) => {
          throw new Error('update called but no workflow loaded');
        }),
    } as unknown as MessageHandlerDeps['stateManager'],
    workflowEngine: {
      start: vi.fn().mockImplementation((wf: WorkflowDefinition) => ({
        ...wf,
        state: { ...wf.state, status: 'active', currentStage: 'define' },
      })),
      advanceStage: vi.fn().mockImplementation((wf: WorkflowDefinition) => ({
        ...wf,
        state: { ...wf.state, currentStage: 'plan' },
      })),
      resume: vi.fn().mockImplementation((wf: WorkflowDefinition) => ({
        ...wf,
        state: { ...wf.state, status: 'active' },
      })),
      pause: vi.fn().mockImplementation((wf: WorkflowDefinition) => ({
        ...wf,
        state: { ...wf.state, status: 'paused' },
      })),
      skipStage: vi.fn(),
    } as unknown as MessageHandlerDeps['workflowEngine'],
    workflowGenerator: {
      generate: vi.fn().mockReturnValue({
        id: 'wf-test',
        version: 1,
        objective: 'Test',
        processLevel: 'standard',
        detectedRisks: [],
        stages: [],
        qualityGates: [],
        approvals: [],
        activeSkills: [],
        skillActivationReason: {},
        state: {
          currentStage: null,
          currentTask: null,
          tasksCompleted: 0,
          tasksTotal: 0,
          startedAt: '',
          lastActivityAt: '',
          status: 'idle',
        },
      }),
    } as unknown as MessageHandlerDeps['workflowGenerator'],
    notificationService: {
      showInfo: vi.fn(),
      showError: vi.fn(),
    } as unknown as MessageHandlerDeps['notificationService'],
    workspaceService: {
      getWorkspaceRoot: vi.fn().mockReturnValue('/project'),
    } as unknown as MessageHandlerDeps['workspaceService'],
    fileSystem: {
      read: vi.fn().mockRejectedValue(new Error('not found')),
      write: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readDir: vi.fn().mockResolvedValue([]),
    } as unknown as MessageHandlerDeps['fileSystem'],
    stageExecutor: {
      getStageAction: vi.fn().mockReturnValue(null),
      evaluateStageCompletion: vi.fn().mockReturnValue({
        stage: 'define',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'Ready',
      }),
      getStageInstructions: vi.fn().mockReturnValue(''),
    } as unknown as MessageHandlerDeps['stageExecutor'],
    artifactManager: {
      listAll: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      read: vi.fn().mockResolvedValue(null),
      saveObjective: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageHandlerDeps['artifactManager'],
    promptTemplates: {
      getPromptForStage: vi.fn().mockReturnValue('Full stage prompt for testing'),
    } as unknown as MessageHandlerDeps['promptTemplates'],
    agentBridge: {
      sendToChat: vi.fn().mockResolvedValue(undefined),
      sendViaParticipant: vi.fn(),
      sendToAgentMode: vi.fn(),
    } as unknown as MessageHandlerDeps['agentBridge'],
    historyManager: {
      loadHistory: vi.fn().mockResolvedValue([]),
      loadMeta: vi.fn().mockResolvedValue({ years: [], totalWorkflows: 0 }),
      archiveWorkflow: vi.fn().mockResolvedValue({}),
      loadArchivedWorkflow: vi.fn().mockResolvedValue(null),
      clearCurrent: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageHandlerDeps['historyManager'],
    readApprovalMode: async () => 'user' as const,
    ...overrides,
  };
}

// ─── Paused Workflow Guard ──────────────────────────────────────────────────

describe('startWorkflow blocks on paused workflow', () => {
  it('returns error when a paused workflow exists', async () => {
    const pausedWorkflow: WorkflowDefinition = {
      id: 'wf-paused',
      version: 1,
      objective: 'Paused task',
      processLevel: 'standard',
      detectedRisks: [],
      stages: [],
      qualityGates: [],
      approvals: [],
      activeSkills: [],
      skillActivationReason: {},
      state: {
        currentStage: 'build',
        currentTask: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        startedAt: '2026-07-11T10:00:00Z',
        lastActivityAt: '2026-07-11T10:00:00Z',
        status: 'paused',
      },
    };

    const deps = createBaseDeps({
      stateManager: {
        load: vi.fn().mockResolvedValue(pausedWorkflow),
        save: vi.fn(),
        clear: vi.fn(),
        update: vi.fn(),
      } as unknown as MessageHandlerDeps['stateManager'],
    });

    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    const assessment: RiskAssessment = {
      workType: 'feature',
      complexity: 'simple',
      riskLevel: 'low',
      processLevel: 'standard',
      signals: [],
      contextSignals: [],
      source: 'llm',
    };

    await handler({
      type: 'startWorkflow',
      objective: 'New task',
      assessment,
    });

    const errorMsg = replies.find((r) => r.type === 'error');
    expect(errorMsg).toBeDefined();
    expect((errorMsg as { message: string }).message).toMatch(/paused/i);
  });

  it('allows startWorkflow when existing workflow is completed', async () => {
    const completedWorkflow: WorkflowDefinition = {
      id: 'wf-done',
      version: 1,
      objective: 'Done task',
      processLevel: 'light',
      detectedRisks: [],
      stages: [],
      qualityGates: [],
      approvals: [],
      activeSkills: [],
      skillActivationReason: {},
      state: {
        currentStage: null,
        currentTask: null,
        tasksCompleted: 3,
        tasksTotal: 3,
        startedAt: '2026-07-11T10:00:00Z',
        lastActivityAt: '2026-07-11T12:00:00Z',
        status: 'completed',
      },
    };

    const deps = createBaseDeps({
      stateManager: {
        load: vi.fn().mockResolvedValue(completedWorkflow),
        save: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
      } as unknown as MessageHandlerDeps['stateManager'],
    });

    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    await handler({
      type: 'startWorkflow',
      objective: 'New task after completion',
      assessment: {
        workType: 'feature',
        complexity: 'simple',
        riskLevel: 'low',
        processLevel: 'light',
        signals: [],
        contextSignals: [],
        source: 'llm',
      },
    });

    // Should archive the old one and start a new one — no error
    const errorMsg = replies.find((r) => r.type === 'error');
    expect(errorMsg).toBeUndefined();
    expect(deps.historyManager.archiveWorkflow).toHaveBeenCalled();
  });
});

// ─── Resume Sends Full Prompt ───────────────────────────────────────────────

describe('resumeWorkflow sends full stage prompt', () => {
  it('sends the full stage prompt, not bare "Continue"', async () => {
    const pausedWorkflow: WorkflowDefinition = {
      id: 'wf-paused',
      version: 1,
      objective: 'Build auth',
      processLevel: 'standard',
      detectedRisks: [],
      stages: [
        {
          id: 'build',
          name: 'Build',
          status: 'active',
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
        currentStage: 'build',
        currentTask: null,
        tasksCompleted: 0,
        tasksTotal: 0,
        startedAt: '2026-07-11T10:00:00Z',
        lastActivityAt: '2026-07-11T10:00:00Z',
        status: 'paused',
      },
    };

    const resumedWorkflow = {
      ...pausedWorkflow,
      version: 2,
      state: {
        ...pausedWorkflow.state,
        status: 'active' as const,
        lastActivityAt: new Date().toISOString(),
      },
    };

    const deps = createBaseDeps({
      stateManager: {
        load: vi.fn().mockResolvedValue(pausedWorkflow),
        save: vi.fn(),
        clear: vi.fn(),
        update: vi.fn().mockResolvedValue(resumedWorkflow),
      } as unknown as MessageHandlerDeps['stateManager'],
    });

    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    await handler({ type: 'resumeWorkflow' });

    // Should call promptTemplates.getPromptForStage, not send bare "Continue"
    expect(deps.promptTemplates.getPromptForStage).toHaveBeenCalledWith(
      'build',
      expect.objectContaining({ objective: 'Build auth' }),
    );

    // Should send the full prompt to the agent
    expect(deps.agentBridge.sendToChat).toHaveBeenCalledWith('Full stage prompt for testing');

    // Should NOT send bare "Continue"
    expect(deps.agentBridge.sendToChat).not.toHaveBeenCalledWith('Continue');
  });
});

// ─── Settings Key Whitelist ─────────────────────────────────────────────────

describe('updateSettings key whitelist', () => {
  it('accepts known settings keys', async () => {
    const deps = createBaseDeps();
    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    await handler({
      type: 'updateSettings',
      settings: {
        processLevelDefault: 'thorough',
        autoApproveLowRisk: true,
      },
    });

    expect(replies.some((r) => r.type === 'settingsUpdated')).toBe(true);

    // Verify the written content includes the allowed keys
    const writeCall = vi.mocked(deps.fileSystem.write).mock.calls[0];
    const written = JSON.parse(writeCall[1]);
    expect(written.processLevelDefault).toBe('thorough');
    expect(written.autoApproveLowRisk).toBe(true);
  });

  it('rejects unknown/arbitrary keys', async () => {
    const deps = createBaseDeps();
    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    await handler({
      type: 'updateSettings',
      settings: {
        processLevelDefault: 'standard',
        maliciousKey: 'injected',
        __proto__: 'attack',
        adminOverride: true,
      },
    });

    expect(replies.some((r) => r.type === 'settingsUpdated')).toBe(true);

    // Verify the written content does NOT include unknown keys
    const writeCall = vi.mocked(deps.fileSystem.write).mock.calls[0];
    const written = JSON.parse(writeCall[1]);
    expect(written.processLevelDefault).toBe('standard');
    expect(written.maliciousKey).toBeUndefined();
    expect(written.adminOverride).toBeUndefined();
  });
});

// ─── Scoped Approval Filtering ──────────────────────────────────────────────

describe('handleExecuteStage scoped approvals', () => {
  it('only approves current-stage approvals, not future-stage ones', async () => {
    const workflowWithMultiStageApprovals: WorkflowDefinition = {
      id: 'wf-guarded',
      version: 1,
      objective: 'DB migration',
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
        {
          id: 'apr-spec',
          level: 'explicit',
          artifact: 'spec',
          status: 'pending',
          reason: 'Spec review',
        },
        {
          id: 'apr-review',
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
          reason: 'Deploy approval',
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

    // Chain updates: each update transforms the result of the previous one,
    // matching the real StateManager mutex behavior.
    let currentWorkflow: WorkflowDefinition = workflowWithMultiStageApprovals;

    const deps = createBaseDeps({
      stateManager: {
        load: vi.fn().mockResolvedValue(workflowWithMultiStageApprovals),
        save: vi.fn(),
        clear: vi.fn(),
        update: vi
          .fn()
          .mockImplementation(async (fn: (wf: WorkflowDefinition) => WorkflowDefinition) => {
            const transformed = fn(currentWorkflow);
            currentWorkflow = {
              ...transformed,
              version: currentWorkflow.version + 1,
              state: { ...transformed.state, lastActivityAt: new Date().toISOString() },
            };
            return currentWorkflow;
          }),
      } as unknown as MessageHandlerDeps['stateManager'],
    });

    const replies: MessageToWebview[] = [];
    const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

    await handler({ type: 'executeStage' });

    // The update function was called — check what it did to approvals
    expect(deps.stateManager.update).toHaveBeenCalled();

    // apr-spec (artifact: 'spec' → stage: 'define') should be approved
    const specApproval = currentWorkflow.approvals.find((a) => a.id === 'apr-spec');
    expect(specApproval!.status).toBe('approved');

    // apr-review (artifact: 'code-review' → stage: 'review') should still be pending
    const reviewApproval = currentWorkflow.approvals.find((a) => a.id === 'apr-review');
    expect(reviewApproval!.status).toBe('pending');

    // apr-deploy (artifact: 'deployment' → stage: 'ship') should still be pending
    const deployApproval = currentWorkflow.approvals.find((a) => a.id === 'apr-deploy');
    expect(deployApproval!.status).toBe('pending');
  });
});
