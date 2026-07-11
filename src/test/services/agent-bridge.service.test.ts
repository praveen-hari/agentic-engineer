import { describe, it, expect, vi } from 'vitest';
import { AgentBridge } from '../../services/agent-bridge.service';

function createMockVscode() {
  return {
    commands: {
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      openTextDocument: vi.fn().mockResolvedValue({ uri: 'test' }),
    },
    window: {
      showTextDocument: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof import('vscode');
}

describe('AgentBridge', () => {
  describe('sendToChat()', () => {
    it('opens chat with the prompt', async () => {
      const vscodeApi = createMockVscode();
      const bridge = new AgentBridge(vscodeApi);

      await bridge.sendToChat('Generate a spec for auth');

      expect(vscodeApi.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.chat.open',
        { query: 'Generate a spec for auth' },
      );
    });

    it('falls back to editor when chat command fails', async () => {
      const vscodeApi = createMockVscode();
      vi.mocked(vscodeApi.commands.executeCommand).mockRejectedValue(new Error('not available'));
      const bridge = new AgentBridge(vscodeApi);

      await bridge.sendToChat('Generate a spec');

      expect(vscodeApi.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscodeApi.window.showTextDocument).toHaveBeenCalled();
    });
  });

  describe('sendViaParticipant()', () => {
    it('prefixes prompt with @engineering', async () => {
      const vscodeApi = createMockVscode();
      const bridge = new AgentBridge(vscodeApi);

      await bridge.sendViaParticipant('generate spec');

      expect(vscodeApi.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.chat.open',
        { query: '@engineering generate spec' },
      );
    });
  });

  describe('sendToAgentMode()', () => {
    it('tries agent mode command first', async () => {
      const vscodeApi = createMockVscode();
      const bridge = new AgentBridge(vscodeApi);

      await bridge.sendToAgentMode('implement task 1');

      expect(vscodeApi.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.chat.openInSidebar',
        expect.objectContaining({ query: 'implement task 1' }),
      );
    });

    it('falls back to regular chat when agent mode unavailable', async () => {
      const vscodeApi = createMockVscode();
      vi.mocked(vscodeApi.commands.executeCommand)
        .mockRejectedValueOnce(new Error('not available'))
        .mockResolvedValueOnce(undefined);
      const bridge = new AgentBridge(vscodeApi);

      await bridge.sendToAgentMode('implement task 1');

      // Second call should be regular chat
      expect(vscodeApi.commands.executeCommand).toHaveBeenCalledTimes(2);
      expect(vscodeApi.commands.executeCommand).toHaveBeenLastCalledWith(
        'workbench.action.chat.open',
        { query: 'implement task 1' },
      );
    });
  });
});
