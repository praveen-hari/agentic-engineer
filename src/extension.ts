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
import { StageExecutor } from './core/stage-executor';
import { GateRunner } from './core/gate-runner';
import { ArtifactManager } from './services/artifact-manager.service';
import { AgentBridge } from './services/agent-bridge.service';
import { ArtifactWatcher } from './services/artifact-watcher.service';
import { PromptTemplates } from './core/prompt-templates';
import { AiRiskAnalyzer } from './ai/risk-analyzer';
import { AnalyzeWorkRequestTool } from './ai/tools/analyze-work-request.tool';
import { GetWorkflowStatusTool } from './ai/tools/get-workflow-status.tool';
import { GetProjectContextTool } from './ai/tools/get-project-context.tool';
import { ChatParticipantHandler } from './chat/chat-participant';
import { NavigationTreeProvider } from './views/navigation-tree';
import { EngineeringWorkspacePanelProvider } from './views/panel-provider';
import { handleWebviewMessage } from './views/message-handler';
import { OnboardingService } from './services/onboarding.service';
import { WORKFLOW_DIR, CURRENT_WORKFLOW_DIR, WORKFLOW_FILE, EVENTS_FILE } from './constants';

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
  const workflowBase = workspaceRoot
    ? `${workspaceRoot}/${WORKFLOW_DIR}/${CURRENT_WORKFLOW_DIR}`
    : `/${WORKFLOW_DIR}/${CURRENT_WORKFLOW_DIR}`;
  const workflowPath = `${workflowBase}/${WORKFLOW_FILE}`;
  const eventsPath = `${workflowBase}/${EVENTS_FILE}`;

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
  const stageExecutor = new StageExecutor(skillRegistry);
  const gateRunner = new GateRunner();
  const artifactManager = new ArtifactManager(fsService, workspaceRoot ?? '/');
  const promptTemplates = new PromptTemplates();
  const agentBridge = new AgentBridge(vscodeApi);

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

      const response = await lm.sendRequest(
        chatMessages,
        undefined,
        token as vscode.CancellationToken | undefined,
      );
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

  // ─── Sidebar TreeView ──────────────────────────────────────────────
  const navigationTree = new NavigationTreeProvider();
  const treeView = vscode.window.createTreeView('engineeringWorkspace.navigation', {
    treeDataProvider: navigationTree,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // ─── Editor Panel (Webview) ──────────────────────────────────────
  // PanelProvider is created first so the reply callback can reference it.
  // The message handler is wired after, using a closure over panelProvider.
  let panelProvider: EngineeringWorkspacePanelProvider;

  const messageHandler = handleWebviewMessage(
    {
      stateManager,
      workflowEngine,
      riskEngine,
      workflowGenerator,
      skillEngine,
      stageExecutor,
      gateRunner,
      projectDetector,
      contextAnalyzer,
      contextSignalDetector,
      capabilityRecommender,
      notificationService,
      workspaceService,
      fileSystem: fsService,
      artifactManager,
      promptTemplates,
      agentBridge,
    },
    // Reply callback — sends MessageToWebview back to the webview
    (message) => panelProvider.postMessage(message),
  );

  panelProvider = new EngineeringWorkspacePanelProvider(context, messageHandler);

  // Auto-open Tasks view when the sidebar becomes visible
  treeView.onDidChangeVisibility((e) => {
    if (e.visible && !panelProvider.isVisible) {
      const tasksItem = navigationTree.getChildren()[0];
      void treeView.reveal(tasksItem, { select: true, focus: false });
      panelProvider.open('tasks');
    }
  });

  // ─── Artifact Watcher ─────────────────────────────────────────────
  if (workspaceRoot) {
    const artifactWatcher = new ArtifactWatcher(vscodeApi, workspaceRoot);
    const watcherDisposable = artifactWatcher.start();
    context.subscriptions.push(watcherDisposable);

    // When an artifact is detected, notify the webview
    artifactWatcher.onArtifactDetected((artifact) => {
      panelProvider.postMessage({ type: 'artifactDetected', artifact });
    });
  }

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
      panelProvider.open();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.navigateTo', (viewId: string) => {
      panelProvider.navigateTo(viewId);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.newWorkRequest', () => {
      panelProvider.navigateTo('tasks');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.refresh', () => {
      navigationTree.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.openSettings', () => {
      panelProvider.navigateTo('settings');
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

  // ─── Onboarding: Initialize .codestudio/ & detect project ────────
  if (workspaceRoot) {
    const onboardingService = new OnboardingService(
      fsService,
      workspaceRoot,
      projectDetector,
      contextAnalyzer,
      contextSignalDetector,
    );

    void onboardingService.initialize().then((result) => {
      const icon = result.projectType === 'greenfield' ? '🌱' : '🏗️';
      const label = result.isFirstRun
        ? `${icon} ${result.projectType} — initialized`
        : `${icon} ${result.projectType}`;
      notificationService.updateStatusBar(label, `Project: ${result.projectType}`);

      // Send context to webview if it's already open
      panelProvider.postMessage({
        type: 'context',
        context: result.context,
      });
    });
  }

  void gitService.getCurrentBranch().then((branch) => {
    if (branch) {
      notificationService.updateStatusBar(`🏗️ ${branch}`, `Branch: ${branch}`);
    }
  });
}

export function deactivate(): void {
  // Cleanup handled by extension subscriptions
}
