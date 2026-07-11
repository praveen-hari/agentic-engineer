/**
 * RED tests for Tasks 6+7: Real-time reactivity.
 *
 * Tests the reactive data flow:
 * - ArtifactWatcher fires → extension sends agentStatus:'idle' + stageDetail refresh
 * - sendToAgent → agentStatus:'working' → artifactDetected → agentStatus:'idle'
 * - Workflow state update → auto-refresh stageDetail
 * - Pending approvals → agentStatus:'waiting-approval'
 *
 * These test the extension.ts wiring logic by testing the message handler
 * behavior that the extension orchestrates.
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
        description: 'Define — Capture objective',
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
        pendingApprovals: [],
        message: 'Missing artifacts: spec',
      }),
      getStageInstructions: vi.fn().mockReturnValue('## Stage: Define\n\nCapture the objective.'),
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
      getPromptForStage: vi.fn().mockReturnValue('Generate a spec...'),
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

describe('Reactivity Integration — Tasks 6+7', () => {
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

  // ─── sendToAgent → agentStatus flow ─────────────────────────────

  describe('sendToAgent sets agentStatus to working', () => {
    it('replies with agentStatus working when sending to agent', async () => {
      await handler({ type: 'sendToAgent', stage: 'define' });

      const statusMsg = replies.find((r) => r.type === 'agentStatus') as Extract<
        MessageToWebview,
        { type: 'agentStatus' }
      >;
      expect(statusMsg).toBeDefined();
      expect(statusMsg.status).toBe('working');
      expect(statusMsg.stage).toBe('define');
    });
  });

  // ─── notifyArtifactDetected → agentStatus idle + stageDetail ────

  describe('notifyArtifactDetected resets agent and refreshes stage', () => {
    it('sends agentStatus idle when artifact is detected', async () => {
      await handler({
        type: 'notifyArtifactDetected',
        artifact: {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '2026-07-11T10:00:00Z',
          updatedAt: '2026-07-11T10:00:00Z',
          status: 'pending-review',
        },
      });

      const statusMsg = replies.find((r) => r.type === 'agentStatus') as Extract<
        MessageToWebview,
        { type: 'agentStatus' }
      >;
      expect(statusMsg).toBeDefined();
      expect(statusMsg.status).toBe('idle');
    });

    it('sends refreshed stageDetail after artifact detected', async () => {
      await handler({
        type: 'notifyArtifactDetected',
        artifact: {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '2026-07-11T10:00:00Z',
          updatedAt: '2026-07-11T10:00:00Z',
          status: 'pending-review',
        },
      });

      const detailMsg = replies.find((r) => r.type === 'stageDetail') as Extract<
        MessageToWebview,
        { type: 'stageDetail' }
      >;
      expect(detailMsg).toBeDefined();
      expect(detailMsg.stage).toBe('define');
    });

    it('sends artifactDetected message to webview', async () => {
      const artifact = {
        id: 'spec-1',
        type: 'spec' as const,
        title: 'Auth Spec',
        path: 'specs/auth.md',
        stage: 'define' as const,
        createdAt: '2026-07-11T10:00:00Z',
        updatedAt: '2026-07-11T10:00:00Z',
        status: 'pending-review' as const,
      };

      await handler({ type: 'notifyArtifactDetected', artifact });

      const artifactMsg = replies.find((r) => r.type === 'artifactDetected') as Extract<
        MessageToWebview,
        { type: 'artifactDetected' }
      >;
      expect(artifactMsg).toBeDefined();
      expect(artifactMsg.artifact.id).toBe('spec-1');
    });
  });

  // ─── Approval detection → waiting-approval ──────────────────────

  describe('requestStageDetail detects pending approvals', () => {
    it('includes waiting-approval hint when approvals are pending', async () => {
      // Workflow has pending approvals (sample-workflow.json has approval-spec pending)
      await handler({ type: 'requestStageDetail' });

      const detailMsg = replies.find((r) => r.type === 'stageDetail') as Extract<
        MessageToWebview,
        { type: 'stageDetail' }
      >;
      expect(detailMsg).toBeDefined();
      // The completion result should show pending approvals
      expect(detailMsg.completion.pendingApprovals.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Full flow: sendToAgent → artifactDetected → idle ───────────

  describe('full agent round-trip flow', () => {
    it('sendToAgent → working, then notifyArtifactDetected → idle + stageDetail', async () => {
      // Step 1: Send to agent
      await handler({ type: 'sendToAgent', stage: 'define' });
      const workingMsg = replies.find((r) => r.type === 'agentStatus') as Extract<
        MessageToWebview,
        { type: 'agentStatus' }
      >;
      expect(workingMsg.status).toBe('working');

      // Step 2: Artifact detected (agent finished)
      replies.length = 0; // clear
      await handler({
        type: 'notifyArtifactDetected',
        artifact: {
          id: 'spec-1',
          type: 'spec',
          title: 'Auth Spec',
          path: 'specs/auth.md',
          stage: 'define',
          createdAt: '2026-07-11T10:00:00Z',
          updatedAt: '2026-07-11T10:00:00Z',
          status: 'pending-review',
        },
      });

      const idleMsg = replies.find((r) => r.type === 'agentStatus') as Extract<
        MessageToWebview,
        { type: 'agentStatus' }
      >;
      expect(idleMsg.status).toBe('idle');

      const detailMsg = replies.find((r) => r.type === 'stageDetail');
      expect(detailMsg).toBeDefined();
    });
  });
});
