import * as vscode from 'vscode';
import { FileSystemService } from './services/file-system.service';
import { GitService } from './services/git.service';
import { WorkspaceService } from './services/workspace.service';
import { NotificationService } from './services/notification.service';
import { EventStream } from './core/event-stream';
import { StateManager } from './core/state-manager';
import { RiskEngine } from './core/risk-engine';
import { WorkflowEngine } from './core/workflow-engine';
import { SkillRegistry } from './core/skill-registry';
import { SkillEngine } from './core/skill-engine';
import { WorkflowGenerator } from './core/workflow-generator';
import { ProjectDetector } from './core/project-detector';
import { ContextAnalyzer } from './core/context-analyzer';
import { ContextSignalDetector } from './core/context-signal-detector';
import { CapabilityRecommender } from './core/capability-recommender';
import { AiRiskAnalyzer } from './ai/risk-analyzer';
import { AnalyzeWorkRequestTool } from './ai/tools/analyze-work-request.tool';
import { GetWorkflowStatusTool } from './ai/tools/get-workflow-status.tool';
import { GetProjectContextTool } from './ai/tools/get-project-context.tool';
import { ChatParticipantHandler } from './chat/chat-participant';
import { EngineeringWorkspaceViewProvider } from './views/sidebar-provider';
import { handleWebviewMessage } from './views/message-handler';
import { WORKFLOW_DIR, WORKFLOW_FILE, EVENTS_FILE, WEBVIEW_VIEW_ID } from './constants';

/**
 * Extension entry point — Engineering Workspace.
 *
 * Activates on startup finished. Wires together all services, core
 * engines, AI layer, webview, chat participant, and language model tools.
 */
export function activate(context: vscode.ExtensionContext): void {
  const vscodeApi = vscode;

  // ─── Services ────────────────────────────────────────────────────
  const fsService = new FileSystemService(vscodeApi);
  const gitService = new GitService(vscodeApi);
  const workspaceService = new WorkspaceService(vscodeApi);
  const notificationService = new NotificationService(vscodeApi);

  // ─── Core Engine ──────────────────────────────────────────────────
  const workspaceRoot = workspaceService.getWorkspaceRoot();
  const codestudioDir = workspaceRoot
    ? `${workspaceRoot}/${WORKFLOW_DIR}`
    : `/${WORKFLOW_DIR}`;
  const workflowPath = `${codestudioDir}/${WORKFLOW_FILE}`;
  const eventsPath = `${codestudioDir}/${EVENTS_FILE}`;

  const eventStream = new EventStream(fsService, eventsPath);
  const stateManager = new StateManager(fsService, workflowPath);
  const riskEngine = new RiskEngine();
  const workflowEngine = new WorkflowEngine(eventStream);
  const skillRegistry = new SkillRegistry();
  const skillEngine = new SkillEngine(skillRegistry);
  const workflowGenerator = new WorkflowGenerator(skillEngine);
  const projectDetector = new ProjectDetector();
  const contextAnalyzer = new ContextAnalyzer();
  const contextSignalDetector = new ContextSignalDetector();
  const capabilityRecommender = new CapabilityRecommender();

  // ─── AI Layer ─────────────────────────────────────────────────────
  const aiRiskAnalyzer = new AiRiskAnalyzer(riskEngine, {
    async getModel() {
      try {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        const model = models[0];
        if (!model) return null;
        return {
          id: model.id,
          name: model.name,
          vendor: model.vendor,
          family: model.family,
          version: model.version,
          maxInputTokens: model.maxInputTokens,
        };
      } catch {
        return null;
      }
    },
    async sendRequest(model, messages, token) {
      const vscodeModel = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        id: model.id,
      });
      const lm = vscodeModel[0];
      if (!lm) throw new Error('Model not found');

      const chatMessages = messages.map((m) =>
        m.role === 'assistant'
          ? vscode.LanguageModelChatMessage.Assistant(m.text)
          : vscode.LanguageModelChatMessage.User(m.text),
      );

      const response = await lm.sendRequest(chatMessages, undefined, token as vscode.CancellationToken | undefined);
      let text = '';
      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          text += part.value;
        }
      }
      return text;
    },
  });

  // Tools are registered via package.json languageModelTools contribution point.
  // The tool implementations are available for the extension host to use.
  void new AnalyzeWorkRequestTool(aiRiskAnalyzer, workflowGenerator);
  void new GetWorkflowStatusTool(stateManager);
  void new GetProjectContextTool(projectDetector, contextAnalyzer);

  // ─── Webview ──────────────────────────────────────────────────────
  const messageHandler = handleWebviewMessage({
    stateManager,
    workflowEngine,
    riskEngine,
    workflowGenerator,
    skillEngine,
    projectDetector,
    contextAnalyzer,
    contextSignalDetector,
    capabilityRecommender,
    notificationService,
    workspaceService,
  });

  const viewProvider = new EngineeringWorkspaceViewProvider(context, messageHandler);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WEBVIEW_VIEW_ID, viewProvider),
  );

  // ─── Chat Participant ────────────────────────────────────────────
  const chatHandler = new ChatParticipantHandler(
    stateManager,
    riskEngine,
    workflowGenerator,
    skillEngine,
  );
  chatHandler.register(context);

  // ─── Commands ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.openView', () => {
      vscode.commands.executeCommand(`${WEBVIEW_VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.analyzeWorkRequest', async () => {
      const objective = await vscode.window.showInputBox({
        prompt: 'Enter the work request objective to analyze',
        placeHolder: 'e.g., Add user authentication with OAuth',
      });
      if (!objective) return;

      const assessment = await aiRiskAnalyzer.analyze(objective);
      notificationService.showInfo(
        `Analyzed: ${assessment.workType} / ${assessment.processLevel} / ${assessment.riskLevel} risk`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.showHistory', () => {
      // Navigate to history view via webview
      notificationService.showInfo('History view — see the Engineering Workspace sidebar');
    }),
  );

  // ─── Status Bar ───────────────────────────────────────────────────
  notificationService.updateStatusBar('🏗️ Engineering Workspace', 'Engineering Workspace');

  // ─── Initialize .codestudio directory ────────────────────────────
  void fsService.ensureDirectory(codestudioDir).then(() => {
    // Auto-generate project context on first activation
    void maybeGenerateContext(fsService, projectDetector, contextAnalyzer, workspaceRoot, codestudioDir);
  });

  void gitService.getCurrentBranch().then((branch) => {
    if (branch) {
      notificationService.updateStatusBar(`🏗️ ${branch}`, `Branch: ${branch}`);
    }
  });
}

/**
 * Generate project context if it doesn't exist yet.
 */
async function maybeGenerateContext(
  fs: FileSystemService,
  _detector: ProjectDetector,
  _analyzer: ContextAnalyzer,
  workspaceRoot: string | null,
  codestudioDir: string,
): Promise<void> {
  if (!workspaceRoot) return;

  const contextPath = `${codestudioDir}/context.md`;
  if (await fs.exists(contextPath)) return; // Already exists

  // In a real implementation, we'd scan the workspace files here.
  // For now, this is a placeholder — the full file scanning happens
  // when the get_project_context tool is invoked.
}

export function deactivate(): void {
  // Cleanup handled by extension subscriptions
}
