/**
 * Edge-case tests for the webview message handler.
 *
 * Covers: stage execution flow, artifact generation, onboarding
 * handlers, approval with comments, concurrent operations, and
 * error propagation from all handler paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleWebviewMessage,
  type MessageHandlerDeps,
  type ReplyFn,
} from '../../views/message-handler';
import type { MessageToWebview, WorkflowDefinition } from '../../core/types';
import sampleWorkflow from '../fixtures/sample-workflow.json';

const SAMPLE_WORKFLOW = sampleWorkflow as unknown as WorkflowDefinition;

function createMockDeps(): MessageHandlerDeps {
  return {
    stateManager: {
      load: vi.fn().mockResolvedValue(SAMPLE_WORKFLOW),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      update: vi
        .fn()
        .mockImplementation(async (fn: (wf: typeof SAMPLE_WORKFLOW) => typeof SAMPLE_WORKFLOW) => {
          const current = SAMPLE_WORKFLOW;
          const transformed = fn(current);
          return {
            ...transformed,
            version: current.version + 1,
            state: { ...transformed.state, lastActivityAt: new Date().toISOString() },
          };
        }),
    } as unknown as MessageHandlerDeps['stateManager'],

    workflowEngine: {
      start: vi.fn().mockResolvedValue({
        ...SAMPLE_WORKFLOW,
        state: { ...SAMPLE_WORKFLOW.state, status: 'active', currentStage: 'define' },
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

    historyManager: {
      loadHistory: vi.fn().mockResolvedValue([]),
      loadMeta: vi.fn().mockResolvedValue({ years: [], totalWorkflows: 0 }),
      archiveWorkflow: vi.fn().mockResolvedValue({}),
      loadArchivedWorkflow: vi.fn().mockResolvedValue(null),
    } as unknown as MessageHandlerDeps['historyManager'],

    approvalMode: 'user' as const,
  };
}

describe('handleWebviewMessage — Edge Cases', () => {
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

  // ─── Stage Execution Flow ─────────────────────────────────────────

  describe('executeStage', () => {
    it('auto-advances when stage is completed', async () => {
      vi.mocked(deps.stageExecutor.evaluateStageCompletion).mockReturnValue({
        stage: 'define',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'Ready to advance',
      });

      await handler({ type: 'executeStage' });

      // update() is called twice: once for approve, once for advance
      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies.some((r) => r.type === 'state')).toBe(true);
    });

    it('returns stageResult when stage is blocked', async () => {
      vi.mocked(deps.stageExecutor.evaluateStageCompletion).mockReturnValue({
        stage: 'define',
        status: 'blocked',
        artifacts: [],
        pendingGates: ['spec-approved'],
        pendingApprovals: ['a1'],
        message: 'Missing artifacts: spec. Pending gates: spec-approved',
      });

      await handler({ type: 'executeStage' });

      expect(replies.some((r) => r.type === 'stageResult')).toBe(true);
      const stageResult = replies.find((r) => r.type === 'stageResult') as {
        type: 'stageResult';
        result: { status: string; message: string };
      };
      expect(stageResult.result.status).toBe('blocked');
      expect(stageResult.result.message).toContain('Missing artifacts');
    });

    it('returns error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.update).mockRejectedValue(
        new Error('Cannot update: no workflow state exists'),
      );
      await handler({ type: 'executeStage' });
      expect(replies[0].type).toBe('error');
    });
  });

  // ─── requestStageActions ──────────────────────────────────────────

  describe('requestStageActions', () => {
    it('returns stage action when workflow exists', async () => {
      vi.mocked(deps.stageExecutor.getStageAction).mockReturnValue({
        stage: 'define',
        description: 'Define — Capture objective',
        skills: ['spec-driven-development'],
        requiredArtifacts: ['spec'],
        requiredGates: ['spec-approved'],
        autoAdvance: false,
      });

      await handler({ type: 'requestStageActions' });

      expect(replies[0].type).toBe('stageActions');
      const actions = (replies[0] as { type: 'stageActions'; actions: unknown }).actions;
      expect(actions).not.toBeNull();
    });

    it('returns null actions when no workflow', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'requestStageActions' });
      expect(replies[0]).toEqual({ type: 'stageActions', actions: null });
    });
  });

  // ─── requestArtifacts ─────────────────────────────────────────────

  describe('requestArtifacts', () => {
    it('returns artifacts list', async () => {
      vi.mocked(deps.artifactManager.listAll).mockResolvedValue([
        {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '',
          updatedAt: '',
          status: 'draft',
        },
      ]);

      await handler({ type: 'requestArtifacts' });

      expect(replies[0].type).toBe('artifacts');
      const artifacts = (replies[0] as { type: 'artifacts'; artifacts: unknown[] }).artifacts;
      expect(artifacts).toHaveLength(1);
    });

    it('returns empty array when no artifacts', async () => {
      await handler({ type: 'requestArtifacts' });
      const artifacts = (replies[0] as { type: 'artifacts'; artifacts: unknown[] }).artifacts;
      expect(artifacts).toEqual([]);
    });
  });

  // ─── requestGateStatus ────────────────────────────────────────────

  describe('requestGateStatus', () => {
    it('returns gates from workflow', async () => {
      await handler({ type: 'requestGateStatus' });
      expect(replies[0].type).toBe('gateStatus');
    });

    it('returns empty gates when no workflow', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'requestGateStatus' });
      expect(replies[0]).toEqual({ type: 'gateStatus', gates: [] });
    });
  });

  // ─── generateArtifact ─────────────────────────────────────────────

  describe('generateArtifact', () => {
    it('sends prompt to agent for define stage (delegates to sendToAgent)', async () => {
      await handler({ type: 'generateArtifact', stage: 'define' });

      expect(deps.agentBridge.sendToChat).toHaveBeenCalled();
      // Now delegates to handleSendToAgent which sends agentStatus
      expect(replies[0].type).toBe('agentStatus');
    });

    it('returns error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({ type: 'generateArtifact', stage: 'define' });
      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });

    it('returns error when stage has no prompt', async () => {
      vi.mocked(deps.promptTemplates.getPromptForStage).mockReturnValue(null);
      await handler({ type: 'generateArtifact', stage: 'build' });
      expect(replies[0].type).toBe('error');
    });

    it('looks up spec path for plan stage', async () => {
      vi.mocked(deps.artifactManager.listAll).mockResolvedValue([
        {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '',
          updatedAt: '',
          status: 'draft',
        },
      ]);

      await handler({ type: 'generateArtifact', stage: 'plan' });

      expect(deps.promptTemplates.getPromptForStage).toHaveBeenCalledWith(
        'plan',
        expect.objectContaining({ specPath: 'specs/auth.md' }),
      );
    });
  });

  // ─── Approval with Comments ───────────────────────────────────────

  describe('approval with comments', () => {
    it('approve calls stateManager.update', async () => {
      await handler({ type: 'approve', approvalId: 'approval-spec' });
      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies[0].type).toBe('state');
    });

    it('approve with comment calls update', async () => {
      await handler({
        type: 'approve',
        approvalId: 'approval-spec',
        comment: 'Looks good!',
      });
      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies[0].type).toBe('state');
    });

    it('reject calls stateManager.update', async () => {
      await handler({ type: 'reject', approvalId: 'approval-spec' });
      expect(deps.stateManager.update).toHaveBeenCalled();
      expect(replies[0].type).toBe('state');
    });

    it('approving non-existent approval does not crash', async () => {
      await handler({ type: 'approve', approvalId: 'nonexistent' });
      expect(replies[0].type).toBe('state');
    });
  });

  // ─── Onboarding Handlers ─────────────────────────────────────────

  describe('onboarding handlers', () => {
    it('setupExistingProject sends prompt to agent', async () => {
      await handler({ type: 'setupExistingProject' });
      expect(deps.agentBridge.sendToChat).toHaveBeenCalledWith(
        expect.stringContaining('engineering_setup_project'),
      );
    });

    it('setupNewProject sends prompt with project name', async () => {
      await handler({
        type: 'setupNewProject',
        projectName: 'MyApp',
        description: 'A todo app',
      });
      expect(deps.agentBridge.sendToChat).toHaveBeenCalledWith(expect.stringContaining('MyApp'));
    });

    it('setupNewProject uses project name as fallback objective', async () => {
      await handler({
        type: 'setupNewProject',
        projectName: 'MyApp',
        description: '',
      });
      expect(deps.agentBridge.sendToChat).toHaveBeenCalledWith(
        expect.stringContaining('Build MyApp'),
      );
    });

    it('requestOnboardingStatus checks for config.json', async () => {
      await handler({ type: 'requestOnboardingStatus' });
      expect(replies[0].type).toBe('onboardingStatus');
    });
  });

  // ─── Bug Fix: Active Workflow Guard (#20) ──────────────────────────

  describe('active workflow guard', () => {
    it('blocks startWorkflow when an active workflow exists', async () => {
      // stateManager.load returns an active workflow by default
      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: {
          workType: 'feature',
          complexity: 'moderate',
          riskLevel: 'medium',
          processLevel: 'standard',
          signals: [],
          contextSignals: [],
          source: 'llm',
        },
      });

      expect(replies[0].type).toBe('error');
      expect((replies[0] as { message: string }).message).toContain('already active');
      // Should NOT have called generate
      expect(deps.workflowGenerator.generate).not.toHaveBeenCalled();
    });

    it('allows startWorkflow when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: {
          workType: 'feature',
          complexity: 'moderate',
          riskLevel: 'medium',
          processLevel: 'standard',
          signals: [],
          contextSignals: [],
          source: 'llm',
        },
      });

      expect(deps.workflowGenerator.generate).toHaveBeenCalled();
      expect(replies[0].type).toBe('state');
    });

    it('archives completed workflow before starting new one', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue({
        ...SAMPLE_WORKFLOW,
        state: { ...SAMPLE_WORKFLOW.state, status: 'completed' },
      } as WorkflowDefinition);

      await handler({
        type: 'startWorkflow',
        objective: 'New task',
        assessment: {
          workType: 'feature',
          complexity: 'moderate',
          riskLevel: 'medium',
          processLevel: 'standard',
          signals: [],
          contextSignals: [],
          source: 'llm',
        },
      });

      expect(deps.historyManager.archiveWorkflow).toHaveBeenCalled();
      expect(deps.stateManager.clear).toHaveBeenCalled();
      expect(deps.workflowGenerator.generate).toHaveBeenCalled();
    });
  });

  // ─── Bug Fix: Settings Loading (#24) ──────────────────────────────

  describe('requestSettings', () => {
    it('returns saved settings from config.json', async () => {
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(true);
      vi.mocked(deps.fileSystem.read).mockResolvedValue(
        JSON.stringify({
          processLevelDefault: 'thorough',
          autoApproveLowRisk: true,
          reviewTimeoutMinutes: 15,
        }),
      );

      await handler({ type: 'requestSettings' });

      expect(replies[0].type).toBe('settingsLoaded');
      const msg = replies[0] as { type: string; settings: Record<string, unknown> };
      expect(msg.settings.processLevelDefault).toBe('thorough');
      expect(msg.settings.autoApproveLowRisk).toBe(true);
      expect(msg.settings.reviewTimeoutMinutes).toBe(15);
    });

    it('returns defaults when config.json does not exist', async () => {
      vi.mocked(deps.fileSystem.exists).mockResolvedValue(false);

      await handler({ type: 'requestSettings' });

      expect(replies[0].type).toBe('settingsLoaded');
      const msg = replies[0] as { type: string; settings: Record<string, unknown> };
      expect(msg.settings.processLevelDefault).toBe('auto');
    });
  });

  // ─── Error Propagation ────────────────────────────────────────────

  describe('error propagation from all paths', () => {
    it('catches advanceStage errors via update()', async () => {
      vi.mocked(deps.stateManager.update).mockRejectedValue(
        new Error('Cannot advance: no active stage'),
      );
      await handler({ type: 'advanceStage' });
      expect(replies[0].type).toBe('error');
    });

    it('catches skipStage errors via update()', async () => {
      vi.mocked(deps.stateManager.update).mockRejectedValue(new Error('Stage not skippable'));
      await handler({ type: 'skipStage', stageId: 'build' });
      expect(replies[0].type).toBe('error');
    });

    it('catches stateManager.save errors', async () => {
      // No existing workflow so the active-workflow guard doesn't block
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);
      vi.mocked(deps.stateManager.save).mockRejectedValue(new Error('Disk full'));
      await handler({
        type: 'startWorkflow',
        objective: 'Test',
        assessment: {
          workType: 'feature',
          complexity: 'moderate',
          riskLevel: 'medium',
          processLevel: 'standard',
          signals: [],
          contextSignals: [],
          source: 'llm',
        },
      });
      expect(replies[0]).toEqual({ type: 'error', message: 'Disk full' });
    });

    it('catches agentBridge.sendToChat errors in generateArtifact', async () => {
      vi.mocked(deps.agentBridge.sendToChat).mockRejectedValue(new Error('Chat not available'));
      await handler({ type: 'generateArtifact', stage: 'define' });
      expect(replies).toHaveLength(2); // generatingArtifact + error
      expect(replies[1]).toEqual({ type: 'error', message: 'Chat not available' });
    });

    it('handles non-Error throws gracefully', async () => {
      vi.mocked(deps.stateManager.load).mockRejectedValue(42);
      await handler({ type: 'requestState' });
      expect(replies[0]).toEqual({
        type: 'error',
        message: 'An unexpected error occurred',
      });
    });
  });

  // ─── Message Validation ───────────────────────────────────────────

  describe('message validation', () => {
    it('ignores array messages', async () => {
      await handler([1, 2, 3]);
      expect(replies).toHaveLength(0);
    });

    it('ignores boolean messages', async () => {
      await handler(true);
      expect(replies).toHaveLength(0);
    });

    it('ignores messages with unknown type', async () => {
      await handler({ type: 'unknownMessageType' });
      expect(replies).toHaveLength(0);
    });

    it('handles rapid sequential messages', async () => {
      await Promise.all([
        handler({ type: 'requestState' }),
        handler({ type: 'requestContext' }),
        handler({ type: 'requestHistory' }),
      ]);
      expect(replies).toHaveLength(3);
    });
  });
});
