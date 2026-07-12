/**
 * Phase 7: Presentation Layer Fixes (TDD — RED first)
 *
 * Fixes:
 * 1. handleStartWorkflow overwrites without archiving previous workflow
 * 2. handleExecuteStage doesn't archive on workflow completion
 * 3. handleGenerateArtifact is dead alias — remove
 * 4. handleUpdateSettings doesn't reply with confirmation
 * 5. cancelWorkflow handler missing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebviewMessage } from '../../views/message-handler';
import type { MessageHandlerDeps, ReplyFn } from '../../views/message-handler';
import type { MessageToWebview, WorkflowDefinition } from '../../core/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const COMPLETED_WORKFLOW: WorkflowDefinition = {
  id: 'wf-old',
  version: 5,
  objective: 'Previous task',
  processLevel: 'standard',
  detectedRisks: [],
  stages: [
    {
      id: 'define',
      name: 'Define',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      completedAt: '2026-07-11T10:00:00Z',
    },
    {
      id: 'plan',
      name: 'Plan',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      completedAt: '2026-07-11T11:00:00Z',
    },
  ],
  qualityGates: [],
  approvals: [],
  activeSkills: [],
  skillActivationReason: {},
  state: {
    currentStage: null,
    currentTask: null,
    tasksCompleted: 2,
    tasksTotal: 2,
    startedAt: '2026-07-11T09:00:00Z',
    lastActivityAt: '2026-07-11T11:00:00Z',
    status: 'completed',
  },
};

const ACTIVE_WORKFLOW: WorkflowDefinition = {
  id: 'wf-active',
  version: 3,
  objective: 'Current task',
  processLevel: 'light',
  detectedRisks: [],
  stages: [
    {
      id: 'plan',
      name: 'Plan',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      completedAt: '2026-07-11T10:00:00Z',
    },
    {
      id: 'build',
      name: 'Build',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      completedAt: '2026-07-11T11:00:00Z',
    },
    {
      id: 'verify',
      name: 'Verify',
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
    currentStage: 'verify',
    currentTask: null,
    tasksCompleted: 0,
    tasksTotal: 0,
    startedAt: '2026-07-11T09:00:00Z',
    lastActivityAt: '2026-07-11T11:00:00Z',
    status: 'active',
  },
};

const SAMPLE_ASSESSMENT = {
  workType: 'feature' as const,
  complexity: 'moderate' as const,
  riskLevel: 'medium' as const,
  processLevel: 'standard' as const,
  signals: [],
  contextSignals: [],
  source: 'llm' as const,
};

// ─── Mock deps ──────────────────────────────────────────────────────────────

function createMockDeps(currentWorkflow: WorkflowDefinition | null = null): MessageHandlerDeps {
  const MOCK_WF = currentWorkflow ?? ACTIVE_WORKFLOW;
  return {
    stateManager: {
      load: vi.fn().mockResolvedValue(MOCK_WF),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      update: vi
        .fn()
        .mockImplementation(async (fn: (wf: WorkflowDefinition) => WorkflowDefinition) => {
          const transformed = fn(MOCK_WF);
          return {
            ...transformed,
            version: MOCK_WF.version + 1,
            state: { ...transformed.state, lastActivityAt: new Date().toISOString() },
          };
        }),
    } as unknown as MessageHandlerDeps['stateManager'],
    workflowEngine: {
      start: vi
        .fn()
        .mockReturnValue({
          ...ACTIVE_WORKFLOW,
          state: { ...ACTIVE_WORKFLOW.state, status: 'active' },
        }),
      advanceStage: vi.fn().mockImplementation((wf: WorkflowDefinition) => {
        // Simulate advancing last stage → completed
        const allCompleted = wf.stages.every(
          (s) => s.status === 'completed' || s.status === 'active',
        );
        if (allCompleted) {
          return { ...wf, state: { ...wf.state, status: 'completed', currentStage: null } };
        }
        return { ...wf, state: { ...wf.state, currentStage: 'build' } };
      }),
      skipStage: vi.fn().mockReturnValue(ACTIVE_WORKFLOW),
    } as unknown as MessageHandlerDeps['workflowEngine'],
    workflowGenerator: {
      generate: vi.fn().mockReturnValue(ACTIVE_WORKFLOW),
    } as unknown as MessageHandlerDeps['workflowGenerator'],
    stageExecutor: {
      getStageAction: vi.fn().mockReturnValue(null),
      evaluateStageCompletion: vi
        .fn()
        .mockReturnValue({
          stage: 'verify',
          status: 'completed',
          artifacts: [],
          pendingGates: [],
          pendingApprovals: [],
          message: 'Ready',
        }),
      getStageInstructions: vi.fn().mockReturnValue(''),
    } as unknown as MessageHandlerDeps['stageExecutor'],
    notificationService: {
      showInfo: vi.fn(),
      showError: vi.fn(),
    } as unknown as MessageHandlerDeps['notificationService'],
    workspaceService: {
      getWorkspaceRoot: vi.fn().mockReturnValue('/project'),
      openFileInEditor: vi.fn(),
    } as unknown as MessageHandlerDeps['workspaceService'],
    fileSystem: {
      read: vi.fn().mockRejectedValue(new Error('not found')),
      write: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readDir: vi.fn().mockResolvedValue([]),
    } as unknown as MessageHandlerDeps['fileSystem'],
    artifactManager: {
      listAll: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      read: vi.fn(),
      saveObjective: vi.fn(),
      clearAll: vi.fn(),
    } as unknown as MessageHandlerDeps['artifactManager'],
    promptTemplates: {
      getPromptForStage: vi.fn().mockReturnValue('prompt'),
    } as unknown as MessageHandlerDeps['promptTemplates'],
    agentBridge: {
      sendToChat: vi.fn().mockResolvedValue(undefined),
      sendViaParticipant: vi.fn(),
      sendToAgentMode: vi.fn(),
    } as unknown as MessageHandlerDeps['agentBridge'],
    historyManager: {
      loadHistory: vi.fn().mockResolvedValue([]),
      loadMeta: vi.fn().mockResolvedValue({ years: [], totalWorkflows: 0 }),
      archiveWorkflow: vi
        .fn()
        .mockResolvedValue({
          id: 'hist-1',
          workflowId: 'wf-old',
          objective: 'Previous task',
          processLevel: 'standard',
          startedAt: '',
          completedAt: '',
          archivePath: 'archive/2026/07/wf-old',
        }),
      loadArchivedWorkflow: vi.fn().mockResolvedValue(null),
    } as unknown as MessageHandlerDeps['historyManager'],
    approvalMode: 'user' as const,
  };
}

describe('Phase 7: Presentation Layer Fixes', () => {
  // ─── Issue 2: Archive before starting new workflow ─────────────────

  describe('startWorkflow archives previous completed workflow', () => {
    it('calls historyManager.archiveWorkflow when a completed workflow exists', async () => {
      const deps = createMockDeps(COMPLETED_WORKFLOW);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: SAMPLE_ASSESSMENT,
      });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalledWith(COMPLETED_WORKFLOW);
    });

    it('does NOT archive when no previous workflow exists', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: SAMPLE_ASSESSMENT,
      });

      expect(deps.historyManager.archiveWorkflow).not.toHaveBeenCalled();
    });

    it('does NOT archive when previous workflow is still active', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: SAMPLE_ASSESSMENT,
      });

      // Active workflow should NOT be archived — only completed ones
      expect(deps.historyManager.archiveWorkflow).not.toHaveBeenCalled();
    });
  });

  // ─── Issue 3: Archive on workflow completion ──────────────────────

  describe('executeStage archives workflow on completion', () => {
    it('calls historyManager.archiveWorkflow when workflow completes', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      // Make update return a completed workflow after advance
      vi.mocked(deps.stateManager.update)
        .mockResolvedValueOnce(ACTIVE_WORKFLOW) // first update: approve gates
        .mockResolvedValueOnce({
          ...ACTIVE_WORKFLOW,
          state: { ...ACTIVE_WORKFLOW.state, status: 'completed', currentStage: null },
        }); // second update: advance → completed

      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalled();
    });

    it('does NOT archive when workflow is still active after advance', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      // Both updates return active workflow
      vi.mocked(deps.stateManager.update)
        .mockResolvedValueOnce(ACTIVE_WORKFLOW)
        .mockResolvedValueOnce({
          ...ACTIVE_WORKFLOW,
          state: { ...ACTIVE_WORKFLOW.state, currentStage: 'build' },
        });

      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      expect(deps.historyManager.archiveWorkflow).not.toHaveBeenCalled();
    });
  });

  // ─── Issue 5: cancelWorkflow handler ──────────────────────────────

  describe('cancelWorkflow', () => {
    it('archives the current workflow and clears state', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'cancelWorkflow' });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalledWith(ACTIVE_WORKFLOW);
      expect(replies.some((r) => r.type === 'state' && r.workflow === null)).toBe(true);
    });

    it('gracefully resets UI when no workflow exists (already archived)', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'cancelWorkflow' });

      // Should reset UI to empty state, not show an error
      expect(replies[0].type).toBe('state');
      expect((replies[0] as { workflow: null }).workflow).toBeNull();
    });
  });

  // ─── Issue 7: updateSettings replies with confirmation ────────────

  describe('updateSettings replies with confirmation', () => {
    it('replies with settingsUpdated after saving', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(true);
      vi.mocked(deps.fileSystem.read).mockResolvedValue(JSON.stringify({ version: 1 }));
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'updateSettings', settings: { approvalMode: 'agent' } });

      expect(deps.fileSystem.write).toHaveBeenCalled();
      // Should reply with confirmation
      expect(replies.length).toBeGreaterThan(0);
    });
  });

  // ─── Issue 8: executeStage clears state after archiving ───────────

  describe('executeStage clears state after archiving completed workflow', () => {
    it('calls stateManager.clear when workflow completes', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      vi.mocked(deps.stateManager.update)
        .mockResolvedValueOnce(ACTIVE_WORKFLOW) // approve gates
        .mockResolvedValueOnce({
          ...ACTIVE_WORKFLOW,
          state: { ...ACTIVE_WORKFLOW.state, status: 'completed', currentStage: null },
        }); // advance → completed

      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalled();
      expect(deps.stateManager.clear).toHaveBeenCalled();
    });

    it('does NOT clear state when workflow is still active', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      vi.mocked(deps.stateManager.update)
        .mockResolvedValueOnce(ACTIVE_WORKFLOW)
        .mockResolvedValueOnce({
          ...ACTIVE_WORKFLOW,
          state: { ...ACTIVE_WORKFLOW.state, currentStage: 'build' },
        });

      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      expect(deps.stateManager.clear).not.toHaveBeenCalled();
    });
  });

  // ─── Issue 9: cancelWorkflow skips archive when already gone ──────

  describe('cancelWorkflow handles already-archived workflows', () => {
    it('does not call archiveWorkflow when workflow is null', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'cancelWorkflow' });

      expect(deps.historyManager.archiveWorkflow).not.toHaveBeenCalled();
      expect(deps.stateManager.clear).not.toHaveBeenCalled();
      // Still resets UI
      expect(replies[0].type).toBe('state');
      expect((replies[0] as { workflow: null }).workflow).toBeNull();
    });

    it('archives and clears when workflow exists', async () => {
      const deps = createMockDeps(ACTIVE_WORKFLOW);
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'cancelWorkflow' });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalledWith(ACTIVE_WORKFLOW);
      expect(deps.stateManager.clear).toHaveBeenCalled();
      expect(replies[0].type).toBe('state');
      expect((replies[0] as { workflow: null }).workflow).toBeNull();
    });
  });

  // ─── Issue 10: requestSettings with corrupt config ────────────────

  describe('requestSettings edge cases', () => {
    it('returns defaults when config.json is corrupt JSON', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(true);
      vi.mocked(deps.fileSystem.read).mockResolvedValue('not valid json{{{');
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'requestSettings' });

      expect(replies[0].type).toBe('settingsLoaded');
      const msg = replies[0] as { settings: { processLevelDefault: string } };
      expect(msg.settings.processLevelDefault).toBe('auto');
    });

    it('returns defaults when config has missing fields', async () => {
      const deps = createMockDeps();
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(true);
      vi.mocked(deps.fileSystem.read).mockResolvedValue(JSON.stringify({ version: 1 }));
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'requestSettings' });

      expect(replies[0].type).toBe('settingsLoaded');
      const msg = replies[0] as {
        settings: { processLevelDefault: string; autoApproveLowRisk: boolean; reviewTimeoutMinutes: number };
      };
      expect(msg.settings.processLevelDefault).toBe('auto');
      expect(msg.settings.autoApproveLowRisk).toBe(false);
      expect(msg.settings.reviewTimeoutMinutes).toBe(30);
    });
  });
});
