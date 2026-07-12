import * as vscode from 'vscode';
import type { StateManager } from '../core/state-manager';
import type { ChatCommand } from '../core/types';

/**
 * Chat participant handler for `@engineering`.
 *
 * Registers the chat participant with `/status` and `/history`
 * slash commands. Provides read-only workflow information.
 *
 * All intelligence (risk assessment, analysis) is handled by the
 * agent via registered language model tools. The participant only
 * reports current state.
 */
export class ChatParticipantHandler {
  constructor(private readonly stateManager: StateManager) {}

  /**
   * Register the chat participant and its slash commands.
   */
  register(context: vscode.ExtensionContext): void {
    const handler: vscode.ChatRequestHandler = async (
      request: vscode.ChatRequest,
      _chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      _token: vscode.CancellationToken,
    ): Promise<void> => {
      const command = request.command as ChatCommand | undefined;

      if (command) {
        await this.handleCommand(command, request.prompt, stream);
        return;
      }

      // No slash command — try to interpret the natural language query
      await this.handleNaturalLanguage(request.prompt, stream);
    };

    const participant = vscode.chat.createChatParticipant(
      'engineering-workspace.participant',
      handler,
    );
    participant.iconPath = new vscode.ThemeIcon('tools');

    context.subscriptions.push(participant);
  }

  /**
   * Handle a slash command.
   */
  private async handleCommand(
    command: ChatCommand,
    _prompt: string,
    stream: vscode.ChatResponseStream,
  ): Promise<void> {
    switch (command) {
      case 'status':
        await this.handleStatus(stream);
        break;
      case 'analyze':
        stream.markdown(
          '💡 **Analysis is now handled by the agent.**\n\n' +
            'Enter your objective in the Tasks view or use agent mode. ' +
            'The agent will assess complexity, risk, and create a workflow automatically.',
        );
        break;
      case 'history':
        await this.handleHistory(stream);
        break;
      default:
        stream.markdown(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle `/status` — show current workflow status.
   */
  private async handleStatus(stream: vscode.ChatResponseStream): Promise<void> {
    const workflow = await this.stateManager.load();

    if (!workflow) {
      stream.markdown(
        '📋 **No active workflow**\n\nNo engineering workflow is currently running. ' +
          'Enter your objective in the Tasks view or use agent mode to start a workflow.',
      );
      return;
    }

    const completed = workflow.stages.filter((s) => s.status === 'completed').length;
    const total = workflow.stages.length;
    const progress = Math.round((completed / total) * 100);
    const pendingApprovals = workflow.approvals.filter((a) => a.status === 'pending');

    const lines: string[] = [
      `📋 **Workflow Status**`,
      '',
      `**Objective:** ${workflow.objective}`,
      `**Process Level:** ${workflow.processLevel}`,
      `**Status:** ${workflow.state.status}`,
      `**Progress:** ${progress}% (${completed}/${total} stages)`,
      `**Current Stage:** ${workflow.state.currentStage ?? '—'}`,
      `**Pending Approvals:** ${pendingApprovals.length}`,
    ];

    if (pendingApprovals.length > 0) {
      lines.push('', '**Pending Approvals:**');
      for (const a of pendingApprovals) {
        lines.push(`  - ${a.artifact} (${a.level})${a.reason ? ` — ${a.reason}` : ''}`);
      }
    }

    stream.markdown(lines.join('\n'));
  }

  /**
   * Handle `/history` — show recent workflow history.
   */
  private async handleHistory(stream: vscode.ChatResponseStream): Promise<void> {
    stream.markdown(
      '🕐 **Workflow History**\n\n' +
        'Recent completed workflows will be listed here. ' +
        'View the History tab in the Engineering Workspace sidebar for full details.',
    );
  }

  /**
   * Handle natural language queries (no slash command).
   */
  private async handleNaturalLanguage(
    prompt: string,
    stream: vscode.ChatResponseStream,
  ): Promise<void> {
    const lower = prompt.toLowerCase();

    if (lower.includes('status') || lower.includes('progress') || lower.includes('stage')) {
      await this.handleStatus(stream);
      return;
    }
    if (lower.includes('history') || lower.includes('past') || lower.includes('completed')) {
      await this.handleHistory(stream);
      return;
    }

    stream.markdown(
      'I can help with engineering workflow management. Try:\n' +
        '- `/status` — Show current workflow status\n' +
        '- `/history` — Show recent workflow history\n\n' +
        'To start a new workflow, enter your objective in the Tasks view ' +
        'or use agent mode — the agent handles all analysis automatically.',
    );
  }
}
