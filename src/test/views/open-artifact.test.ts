/**
 * RED tests for: Click artifact → open file in editor.
 *
 * Tests the new `openArtifact` message handler which opens the
 * artifact's .md file in the VS Code editor for review.
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
    } as unknown as MessageHandlerDeps['stateManager'],
    workflowEngine: {
      start: vi.fn(),
      advanceStage: vi.fn(),
      skipStage: vi.fn(),
    } as unknown as MessageHandlerDeps['workflowEngine'],
    workflowGenerator: {
      generate: vi.fn(),
    } as unknown as MessageHandlerDeps['workflowGenerator'],
    notificationService: {
      showInfo: vi.fn(),
      showError: vi.fn(),
    } as unknown as MessageHandlerDeps['notificationService'],
    workspaceService: {
      getWorkspaceRoot: vi.fn().mockReturnValue('/project'),
      openFileInEditor: vi.fn().mockResolvedValue(undefined),
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
      listAll: vi.fn().mockResolvedValue([
        {
          id: 'spec-auth',
          type: 'spec',
          title: 'Auth Spec',
          path: 'workflows/current/artifacts/specs/auth-spec.md',
          stage: 'define',
          createdAt: '2026-07-11T10:00:00Z',
          updatedAt: '2026-07-11T10:00:00Z',
          status: 'draft',
        },
      ]),
      listByStage: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      read: vi.fn().mockResolvedValue('# Spec Content'),
      saveObjective: vi.fn(),
    } as unknown as MessageHandlerDeps['artifactManager'],
    promptTemplates: {
      getPromptForStage: vi.fn().mockReturnValue(null),
    } as unknown as MessageHandlerDeps['promptTemplates'],
    agentBridge: {
      sendToChat: vi.fn().mockResolvedValue(undefined),
      sendViaParticipant: vi.fn(),
      sendToAgentMode: vi.fn(),
    } as unknown as MessageHandlerDeps['agentBridge'],
  };
}

describe('handleWebviewMessage — openArtifact', () => {
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

  describe('openArtifact', () => {
    it('calls openFileInEditor with the full artifact path', async () => {
      await handler({ type: 'openArtifact', artifactId: 'spec-auth' });

      expect(deps.workspaceService.openFileInEditor).toHaveBeenCalledWith(
        '/project/.codestudio/workflows/current/artifacts/specs/auth-spec.md',
      );
    });

    it('replies with error when artifact not found', async () => {
      vi.mocked(deps.artifactManager.listAll).mockResolvedValue([]);

      await handler({ type: 'openArtifact', artifactId: 'nonexistent' });

      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('error');
      expect((replies[0] as { type: 'error'; message: string }).message).toContain('not found');
    });

    it('replies with error when no workspace root', async () => {
      vi.mocked(deps.workspaceService.getWorkspaceRoot).mockReturnValue(null);

      await handler({ type: 'openArtifact', artifactId: 'spec-auth' });

      expect(replies).toHaveLength(1);
      expect(replies[0].type).toBe('error');
    });

    it('does not reply on success (file just opens)', async () => {
      await handler({ type: 'openArtifact', artifactId: 'spec-auth' });

      // No reply needed — the file opens in the editor silently
      expect(replies).toHaveLength(0);
    });
  });
});
