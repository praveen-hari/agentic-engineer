import * as vscode from 'vscode';
import type { StateManager } from '../core/state-manager';
import type { RiskEngine } from '../core/risk-engine';
import type { WorkflowGenerator } from '../core/workflow-generator';
import type { SkillEngine } from '../core/skill-engine';
import type { ChatCommand } from '../core/types';

/**
 * Chat participant handler for `@engineering` (SPEC §5.2).
 *
 * Registers the chat participant with `/status`, `/analyze`, and
 * `/history` slash commands. Handles natural language queries about
 * workflow state and delegates to core engines for analysis.
 *
 * The participant runs in "ask" mode — it provides information, not
 * code edits.
 */
export class ChatParticipantHandler {
  constructor(
    private readonly stateManager: StateManager,
    private readonly riskEngine: RiskEngine,
    private readonly workflowGenerator: WorkflowGenerator,
    private readonly skillEngine: SkillEngine,
  ) {}

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
    prompt: string,
    stream: vscode.ChatResponseStream,
  ): Promise<void> {
    switch (command) {
      case 'status':
        await this.handleStatus(stream);
        break;
      case 'analyze':
        await this.handleAnalyze(prompt, stream);
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
          'Use `/analyze <objective>` to analyze a work request and start a workflow.',
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
   * Handle `/analyze <objective>` — analyze a work request.
   */
  private async handleAnalyze(prompt: string, stream: vscode.ChatResponseStream): Promise<void> {
    const objective = prompt.trim();
    if (!objective) {
      stream.markdown(
        '⚠️ **Usage:** `/analyze <objective>`\n\n' +
          'Example: `/analyze Add OAuth login with SAML SSO`',
      );
      return;
    }

    const assessment = this.riskEngine.assess(objective);
    const { activeSkills } = this.skillEngine.computeActiveSkills(assessment);
    const workflow = this.workflowGenerator.generate('preview', objective, assessment);

    const lines: string[] = [
      `🔍 **Work Request Analysis**`,
      '',
      `**Objective:** ${objective}`,
      '',
      `| Dimension | Result |`,
      `|-----------|--------|`,
      `| Work Type | ${assessment.workType} |`,
      `| Complexity | ${assessment.complexity} |`,
      `| Risk Level | ${assessment.riskLevel} |`,
      `| Process Level | ${assessment.processLevel} |`,
      `| Active Skills | ${activeSkills.length} |`,
      '',
      `**Recommended Stages:** ${workflow.stages.map((s) => s.name).join(' → ')}`,
      `**Quality Gates:** ${workflow.qualityGates.length}`,
      `**Approvals Required:** ${workflow.approvals.length}`,
    ];

    if (assessment.signals.length > 0) {
      lines.push('', '**Risk Signals:**');
      for (const s of assessment.signals) {
        lines.push(`  - ⚠️ ${s.signal} (${s.severity}) — ${s.impact}`);
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
    if (lower.includes('analyze') || lower.includes('risk') || lower.includes('assess')) {
      await this.handleAnalyze(prompt, stream);
      return;
    }
    if (lower.includes('history') || lower.includes('past') || lower.includes('completed')) {
      await this.handleHistory(stream);
      return;
    }

    stream.markdown(
      'I can help with engineering workflow management. Try:\n' +
        '- `/status` — Show current workflow status\n' +
        '- `/analyze <objective>` — Analyze a work request\n' +
        '- `/history` — Show recent workflow history',
    );
  }
}
