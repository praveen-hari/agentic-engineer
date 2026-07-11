/**
 * Phase 6: Settings-Driven Gate Approval Tests
 *
 * Two modes:
 * - 'user' (default): Agent cannot auto-approve. User must click
 *   "Approve & Continue" in the UI. Agent gets "blocked" response.
 * - 'agent': Agent auto-approves all gates/approvals when advancing.
 *   Fully autonomous workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebviewMessage } from '../../views/message-handler';
import type { MessageHandlerDeps, ReplyFn } from '../../views/message-handler';
import type { MessageToWebview, WorkflowDefinition } from '../../core/types';

// ─── Sample workflow with pending gates and approvals ───────────────────────

const WORKFLOW_WITH_GATES: WorkflowDefinition = {
  id: 'wf-001',
  version: 1,
  objective: 'Add auth',
  processLevel: 'standard',
  detectedRisks: [],
  stages: [
    { id: 'define', name: 'Define', status: 'active', skippable: false, entryConditions: [], exitConditions: [], artifacts: [] },
    { id: 'plan', name: 'Plan', status: 'pending', skippable: false, entryConditions: [], exitConditions: [], artifacts: [] },
  ],
  qualityGates: [
    { id: 'spec-approved', name: 'Spec Approved', type: 'approval', status: 'pending', stage: 'define', blocking: true, conditional: false },
  ],
  approvals: [
    { id: 'apr-1', level: 'explicit', artifact: 'spec', status: 'pending', reason: 'Spec review' },
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

// ─── Mock deps factory ──────────────────────────────────────────────────────

function createMockDeps(approvalMode: 'user' | 'agent' = 'user'): MessageHandlerDeps {
  return {
    stateManager: {
      load: vi.fn().mockResolvedValue(WORKFLOW_WITH_GATES),
      save: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockImplementation(async (fn: (wf: WorkflowDefinition) => WorkflowDefinition) => {
        const transformed = fn(WORKFLOW_WITH_GATES);
        return { ...transformed, version: WORKFLOW_WITH_GATES.version + 1, state: { ...transformed.state, lastActivityAt: new Date().toISOString() } };
      }),
    } as unknown as MessageHandlerDeps['stateManager'],
    workflowEngine: {
      start: vi.fn().mockReturnValue({ ...WORKFLOW_WITH_GATES, state: { ...WORKFLOW_WITH_GATES.state, status: 'active' } }),
      advanceStage: vi.fn().mockReturnValue({ ...WORKFLOW_WITH_GATES, state: { ...WORKFLOW_WITH_GATES.state, currentStage: 'plan' } }),
      skipStage: vi.fn().mockReturnValue(WORKFLOW_WITH_GATES),
    } as unknown as MessageHandlerDeps['workflowEngine'],
    workflowGenerator: { generate: vi.fn().mockReturnValue(WORKFLOW_WITH_GATES) } as unknown as MessageHandlerDeps['workflowGenerator'],
    stageExecutor: {
      getStageAction: vi.fn().mockReturnValue(null),
      evaluateStageCompletion: vi.fn().mockReturnValue({ stage: 'define', status: 'completed', artifacts: [], pendingGates: [], pendingApprovals: [], message: 'Ready' }),
      getStageInstructions: vi.fn().mockReturnValue(''),
    } as unknown as MessageHandlerDeps['stageExecutor'],
    notificationService: { showInfo: vi.fn(), showError: vi.fn() } as unknown as MessageHandlerDeps['notificationService'],
    workspaceService: { getWorkspaceRoot: vi.fn().mockReturnValue('/project') } as unknown as MessageHandlerDeps['workspaceService'],
    fileSystem: { read: vi.fn().mockRejectedValue(new Error('not found')), write: vi.fn().mockResolvedValue(undefined), append: vi.fn().mockResolvedValue(undefined), exists: vi.fn().mockResolvedValue(false), mkdir: vi.fn().mockResolvedValue(undefined), readDir: vi.fn().mockResolvedValue([]) } as unknown as MessageHandlerDeps['fileSystem'],
    artifactManager: { listAll: vi.fn().mockResolvedValue([]), save: vi.fn(), read: vi.fn(), saveObjective: vi.fn() } as unknown as MessageHandlerDeps['artifactManager'],
    promptTemplates: { getPromptForStage: vi.fn().mockReturnValue('prompt') } as unknown as MessageHandlerDeps['promptTemplates'],
    agentBridge: { sendToChat: vi.fn().mockResolvedValue(undefined), sendViaParticipant: vi.fn(), sendToAgentMode: vi.fn() } as unknown as MessageHandlerDeps['agentBridge'],
    historyManager: { loadHistory: vi.fn().mockResolvedValue([]), loadMeta: vi.fn().mockResolvedValue({ years: [], totalWorkflows: 0 }), archiveWorkflow: vi.fn(), loadArchivedWorkflow: vi.fn() } as unknown as MessageHandlerDeps['historyManager'],
    approvalMode: approvalMode,
  } as MessageHandlerDeps;
}

describe('Phase 6: Approval Mode', () => {
  // ─── User mode (default) ──────────────────────────────────────────

  describe('user mode (default)', () => {
    it('executeStage (user clicks Approve & Continue) always approves gates', async () => {
      const deps = createMockDeps('user');
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      // User explicitly clicked — should approve and advance
      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies.some((r) => r.type === 'state')).toBe(true);
    });
  });

  // ─── Agent mode ───────────────────────────────────────────────────

  describe('agent mode', () => {
    it('executeStage still works (user clicking is always allowed)', async () => {
      const deps = createMockDeps('agent');
      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'executeStage' });

      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies.some((r) => r.type === 'state')).toBe(true);
    });
  });

  // ─── Settings persistence ─────────────────────────────────────────

  describe('settings persistence', () => {
    it('updateSettings message persists approvalMode to config', async () => {
      const deps = createMockDeps('user');
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(true);
      vi.mocked(deps.fileSystem.read).mockResolvedValue(JSON.stringify({ version: 1, approvalMode: 'user' }));

      const replies: MessageToWebview[] = [];
      const handler = handleWebviewMessage(deps, (msg) => replies.push(msg));

      await handler({ type: 'updateSettings', settings: { approvalMode: 'agent' } });

      expect(deps.fileSystem.write).toHaveBeenCalled();
      const writeCall = vi.mocked(deps.fileSystem.write).mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.approvalMode).toBe('agent');
    });
  });
});
