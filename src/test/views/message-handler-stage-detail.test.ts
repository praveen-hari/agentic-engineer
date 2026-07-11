/**
 * RED tests for Task 1: New message types for the Tasks View.
 *
 * Tests the new message handlers:
 * - requestStageDetail → stageDetail (combined stage info)
 * - requestArtifactContent → artifactContent (file content)
 * - sendToAgent → agentStatus (trigger agent for stage)
 *
 * TDD: These tests are written FIRST. They will FAIL until
 * the message types and handlers are implemented.
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
    } as unknown as MessageHandlerDeps['stateManager'],

    workflowEngine: {
      start: vi.fn().mockResolvedValue(SAMPLE_WORKFLOW),
      advanceStage: vi.fn().mockResolvedValue(SAMPLE_WORKFLOW),
      skipStage: vi.fn().mockResolvedValue(SAMPLE_WORKFLOW),
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
      getStageAction: vi.fn().mockReturnValue({
        stage: 'define',
        description: 'Define — Capture objective and produce specification',
        skills: ['spec-driven-development'],
        requiredArtifacts: ['spec'],
        requiredGates: ['spec-approved'],
        autoAdvance: false,
      }),
      evaluateStageCompletion: vi.fn().mockReturnValue({
        stage: 'define',
        status: 'blocked',
        artifacts: [],
        pendingGates: ['spec-approved'],
        pendingApprovals: ['approval-spec'],
        message: 'Missing artifacts: spec',
      }),
      getStageInstructions: vi
        .fn()
        .mockReturnValue('## Stage: Define\n\nCapture the objective and produce a specification.'),
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
      read: vi.fn().mockResolvedValue('# Spec Content\n\nDetailed specification...'),
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('handleWebviewMessage — Stage Detail Messages', () => {
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

  // ─── requestStageDetail ─────────────────────────────────────────

  describe('requestStageDetail', () => {
    it('replies with combined stage detail for active stage', async () => {
      await handler({ type: 'requestStageDetail' });

      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('stageDetail');

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.stage).toBe('define');
      expect(detail.action).toBeDefined();
      expect(detail.action!.stage).toBe('define');
      expect(detail.completion).toBeDefined();
      expect(detail.instructions).toBeDefined();
      expect(detail.instructions.length).toBeGreaterThan(0);
      expect(detail.artifacts).toBeDefined();
    });

    it('includes stage action with skills and required artifacts', async () => {
      await handler({ type: 'requestStageDetail' });

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.action!.skills).toContain('spec-driven-development');
      expect(detail.action!.requiredArtifacts).toContain('spec');
      expect(detail.action!.requiredGates).toContain('spec-approved');
    });

    it('includes completion status with blockers', async () => {
      await handler({ type: 'requestStageDetail' });

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.completion.status).toBe('blocked');
      expect(detail.completion.pendingGates).toContain('spec-approved');
    });

    it('includes artifacts for the current stage', async () => {
      vi.mocked(deps.artifactManager.listAll).mockResolvedValue([
        {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '2026-07-11T10:00:00Z',
          updatedAt: '2026-07-11T10:00:00Z',
          status: 'draft',
        },
      ]);

      await handler({ type: 'requestStageDetail' });

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.artifacts).toHaveLength(1);
      expect(detail.artifacts[0].type).toBe('spec');
    });

    it('returns null action when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);

      await handler({ type: 'requestStageDetail' });

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.stage).toBeNull();
      expect(detail.action).toBeNull();
    });

    it('returns null action when no active stage', async () => {
      vi.mocked(deps.stageExecutor.getStageAction).mockReturnValue(null);
      vi.mocked(deps.stageExecutor.getStageInstructions).mockReturnValue(
        'No active stage. Start a workflow first.',
      );

      await handler({ type: 'requestStageDetail' });

      const detail = replies[0] as Extract<MessageToWebview, { type: 'stageDetail' }>;
      expect(detail.action).toBeNull();
    });
  });

  // ─── requestArtifactContent ─────────────────────────────────────

  describe('requestArtifactContent', () => {
    it('replies with artifact content from disk', async () => {
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

      await handler({ type: 'requestArtifactContent', artifactId: 'spec-1' });

      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('artifactContent');

      const content = replies[0] as Extract<MessageToWebview, { type: 'artifactContent' }>;
      expect(content.artifactId).toBe('spec-1');
      expect(content.content).toContain('# Spec Content');
    });

    it('returns null content when artifact not found', async () => {
      vi.mocked(deps.artifactManager.listAll).mockResolvedValue([]);

      await handler({ type: 'requestArtifactContent', artifactId: 'nonexistent' });

      const content = replies[0] as Extract<MessageToWebview, { type: 'artifactContent' }>;
      expect(content.artifactId).toBe('nonexistent');
      expect(content.content).toBeNull();
    });

    it('returns null content when read fails', async () => {
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
      vi.mocked(deps.artifactManager.read).mockResolvedValue(null);

      await handler({ type: 'requestArtifactContent', artifactId: 'spec-1' });

      const content = replies[0] as Extract<MessageToWebview, { type: 'artifactContent' }>;
      expect(content.content).toBeNull();
    });
  });

  // ─── sendToAgent ────────────────────────────────────────────────

  describe('sendToAgent', () => {
    it('sends prompt to agent and replies with agentStatus working', async () => {
      await handler({ type: 'sendToAgent', stage: 'define' });

      expect(deps.agentBridge.sendToChat).toHaveBeenCalled();
      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('agentStatus');

      const status = replies[0] as Extract<MessageToWebview, { type: 'agentStatus' }>;
      expect(status.status).toBe('working');
      expect(status.stage).toBe('define');
    });

    it('returns error when no workflow exists', async () => {
      vi.mocked(deps.stateManager.load).mockResolvedValue(null);

      await handler({ type: 'sendToAgent', stage: 'define' });

      expect(replies[0]).toEqual({ type: 'error', message: 'No active workflow' });
    });

    it('returns error when stage has no prompt template', async () => {
      vi.mocked(deps.promptTemplates.getPromptForStage).mockReturnValue(null);

      await handler({ type: 'sendToAgent', stage: 'onboard' });

      expect(replies[0].type).toBe('error');
    });

    it('includes stage name in agent status message', async () => {
      await handler({ type: 'sendToAgent', stage: 'define' });

      const status = replies[0] as Extract<MessageToWebview, { type: 'agentStatus' }>;
      expect(status.message).toBeDefined();
      expect(status.message!.length).toBeGreaterThan(0);
    });
  });
});
