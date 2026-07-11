import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleWebviewMessage,
  type MessageHandlerDeps,
  type ReplyFn,
} from '../../views/message-handler';
import type { MessageToWebview, WorkflowDefinition, RiskAssessment } from '../../core/types';
import sampleWorkflow from '../fixtures/sample-workflow.json';

// ─── Test Helpers ───────────────────────────────────────────────────────────

const SAMPLE_WORKFLOW = sampleWorkflow as unknown as WorkflowDefinition;

const SAMPLE_ASSESSMENT: RiskAssessment = {
  workType: 'feature',
  complexity: 'moderate',
  riskLevel: 'medium',
  processLevel: 'standard',
  signals: [{ type: 'keyword', signal: 'payment', severity: 'high', impact: 'security gate' }],
  contextSignals: [],
  source: 'deterministic',
};

function createMockDeps(): MessageHandlerDeps {
  return {
    stateManager: {
      load: vi.fn().mockResolvedValue(SAMPLE_WORKFLOW),
      save: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageHandlerDeps['stateManager'],

    workflowEngine: {
      start: vi.fn().mockResolvedValue({
        ...SAMPLE_WORKFLOW,
        state: { ...SAMPLE_WORKFLOW.state, status: 'active', currentStage: 'onboard' },
      }),
      advanceStage: vi.fn().mockResolvedValue({
        ...SAMPLE_WORKFLOW,
        state: { ...SAMPLE_WORKFLOW.state, status: 'active' },
      }),
      skipStage: vi.fn().mockResolvedValue({ ...SAMPLE_WORKFLOW }),
    } as unknown as MessageHandlerDeps['workflowEngine'],

    workflowGenerator: {
      generate: vi.fn().mockReturnValue(SAMPLE_WORKFLOW),
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
        stage: 'build',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'Ready',
      }),
      getStageInstructions: vi.fn().mockReturnValue('No active stage'),
    } as unknown as MessageHandlerDeps['stageExecutor'],

    artifactManager: {
      listAll: vi.fn().mockResolvedValue([]),
      listByStage: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue({
        id: 'test',
        type: 'spec',
        title: 'Test',
        path: 'specs/test.md',
        stage: 'define',
        createdAt: '',
        updatedAt: '',
        status: 'draft',
      }),
      read: vi.fn().mockResolvedValue(null),
      saveObjective: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageHandlerDeps['artifactManager'],

    promptTemplates: {
      getPromptForStage: vi.fn().mockReturnValue('Generate a spec for: test objective'),
      getDefinePrompt: vi.fn().mockReturnValue('Generate a spec...'),
      getPlanPrompt: vi.fn().mockReturnValue('Generate a plan...'),
      getReviewPrompt: vi.fn().mockReturnValue('Review the code...'),
    } as unknown as MessageHandlerDeps['promptTemplates'],

    agentBridge: {
      sendToChat: vi.fn().mockResolvedValue(undefined),
      sendViaParticipant: vi.fn().mockResolvedValue(undefined),
      sendToAgentMode: vi.fn().mockResolvedValue(undefined),
    } as unknown as MessageHandlerDeps['agentBridge'],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('handleWebviewMessage', () => {
  let deps: MessageHandlerDeps;
  let reply: ReplyFn;
  let replies: MessageToWebview[];
  let handler: (message: unknown) => Promise<void>;

  beforeEach(() => {
    deps = createMockDeps();
    replies = [];
    reply = (msg) => replies.push(msg);
    handler = handleWebviewMessage(deps, reply);
  });

  it('ignores null/undefined/non-object messages', async () => {
    await handler(null);
    await handler(undefined);
    await handler('string');
    await handler(42);
    expect(replies).toHaveLength(0);
  });

  it('ignores messages without a type field', async () => {
    await handler({ foo: 'bar' });
    expect(replies).toHaveLength(0);
  });

  // ─── requestState ──────────────────────────────────────────────

  describe('requestState', () => {
    it('replies with the current workflow', async () => {
      await handler({ type: 'requestState' });
      expect(deps.stateManager.load).toHaveBeenCalled();
      expect(replies).toHaveLength(1);
      expect(replies[0]).toEqual({ type: 'state', workflow: SAMPLE_WORKFLOW });
    });

    it('replies with null when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'requestState' });
      expect(replies[0]).toEqual({ type: 'state', workflow: null });
    });
  });

  // ─── requestContext ────────────────────────────────────────────

  describe('requestContext', () => {
    it('replies with project context', async () => {
      await handler({ type: 'requestContext' });
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('context');
      const ctx = (replies[0] as { type: 'context'; context: unknown }).context;
      expect(ctx).not.toBeNull();
    });

    it('replies with null context when no workspace root', async () => {
      vi.mocked(deps.workspaceService.getWorkspaceRoot).mockReturnValue(null);
      await handler({ type: 'requestContext' });
      expect(replies[0]).toEqual({ type: 'context', context: null });
    });
  });

  // ─── analyzeObjective ─────────────────────────────────────────

  describe('analyzeObjective', () => {
    it('sends prompt to agent (no reply — agent triggers state via tools)', async () => {
      await handler({ type: 'analyzeObjective', objective: 'Add payment processing' });
      expect(deps.agentBridge.sendToChat).toHaveBeenCalled();
      // No reply — the agent will call engineering_start_workflow
      // which sends the 'state' message to the webview
      expect(replies).toHaveLength(0);
    });
  });

  // ─── startWorkflow ────────────────────────────────────────────

  describe('startWorkflow', () => {
    it('generates, starts, saves workflow and objective', async () => {
      // workflowEngine.start returns the started workflow
      vi.mocked(deps.workflowEngine.start).mockResolvedValue({
        ...SAMPLE_WORKFLOW,
        state: { ...SAMPLE_WORKFLOW.state, status: 'active', currentStage: 'onboard' },
      });

      await handler({
        type: 'startWorkflow',
        objective: 'Add auth',
        assessment: SAMPLE_ASSESSMENT,
      });

      expect(deps.workflowGenerator.generate).toHaveBeenCalled();
      expect(deps.workflowEngine.start).toHaveBeenCalled();
      expect(deps.stateManager.save).toHaveBeenCalled();
      expect(deps.artifactManager.saveObjective).toHaveBeenCalledWith('Add auth');
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('state');
    });
  });

  // ─── advanceStage ─────────────────────────────────────────────

  describe('advanceStage', () => {
    it('advances the stage and replies with updated state', async () => {
      await handler({ type: 'advanceStage' });
      expect(deps.stateManager.load).toHaveBeenCalled();
      expect(deps.workflowEngine.advanceStage).toHaveBeenCalledWith(SAMPLE_WORKFLOW);
      expect(deps.stateManager.save).toHaveBeenCalled();
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('state');
    });

    it('replies with error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'advanceStage' });
      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });
  });

  // ─── skipStage ────────────────────────────────────────────────

  describe('skipStage', () => {
    it('skips the stage and replies with updated state', async () => {
      await handler({ type: 'skipStage', stageId: 'define' });
      expect(deps.workflowEngine.skipStage).toHaveBeenCalledWith(SAMPLE_WORKFLOW, 'define');
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('state');
    });

    it('replies with error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'skipStage', stageId: 'define' });
      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });
  });

  // ─── approve ──────────────────────────────────────────────────

  describe('approve', () => {
    it('approves and replies with updated state', async () => {
      await handler({ type: 'approve', approvalId: 'approval-spec' });
      expect(deps.stateManager.save).toHaveBeenCalled();
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('state');

      const wf = (replies[0] as { type: 'state'; workflow: WorkflowDefinition }).workflow;
      const approval = wf.approvals.find((a) => a.id === 'approval-spec');
      expect(approval?.status).toBe('approved');
      expect(approval?.approvedAt).toBeDefined();
    });

    it('replies with error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'approve', approvalId: 'approval-spec' });
      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });
  });

  // ─── reject ───────────────────────────────────────────────────

  describe('reject', () => {
    it('rejects and replies with updated state', async () => {
      await handler({ type: 'reject', approvalId: 'approval-spec', comment: 'Needs changes' });
      expect(deps.stateManager.save).toHaveBeenCalled();
      expect(replies).toHaveLength(1);

      const wf = (replies[0] as { type: 'state'; workflow: WorkflowDefinition }).workflow;
      const approval = wf.approvals.find((a) => a.id === 'approval-spec');
      expect(approval?.status).toBe('rejected');
      expect(approval?.comment).toBe('Needs changes');
    });

    it('replies with error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'reject', approvalId: 'approval-spec' });
      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });
  });

  // ─── requestHistory ───────────────────────────────────────────

  describe('requestHistory', () => {
    it('replies with empty history', async () => {
      await handler({ type: 'requestHistory' });
      expect(replies[0]).toEqual({ type: 'history', entries: [], hasMore: false });
    });
  });

  // ─── navigate ─────────────────────────────────────────────────

  describe('navigate', () => {
    it('does not reply (handled in webview)', async () => {
      await handler({ type: 'navigate', view: 'history' });
      expect(replies).toHaveLength(0);
    });
  });

  // ─── Error handling ───────────────────────────────────────────

  describe('error handling', () => {
    it('catches errors and replies with error message', async () => {
      vi.mocked(deps.stateManager.load).mockRejectedValue(new Error('Disk full'));
      await handler({ type: 'advanceStage' });
      expect(replies).toHaveLength(1);
      expect(replies[0]).toEqual({ type: 'error', message: 'Disk full' });
    });

    it('handles non-Error throws', async () => {
      vi.mocked(deps.stateManager.load).mockRejectedValue('string error');
      await handler({ type: 'advanceStage' });
      expect(replies[0]).toEqual({ type: 'error', message: 'An unexpected error occurred' });
    });
  });
});
