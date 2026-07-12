import * as vscode from 'vscode';
import { FileSystemService } from './services/file-system.service';
import { GitService } from './services/git.service';
import { WorkspaceService } from './services/workspace.service';
import { NotificationService } from './services/notification.service';
import { StateManager } from './core/state-manager';
import { WorkflowEngine } from './core/workflow-engine';
import { SkillRegistry } from './core/skill-registry';
import { SkillEngine } from './core/skill-engine';
import { WorkflowGenerator } from './core/workflow-generator';
import { StageExecutor } from './core/stage-executor';
import { ArtifactManager } from './services/artifact-manager.service';
import { AgentBridge } from './services/agent-bridge.service';
import { HistoryManager } from './services/history-manager.service';
import { ArtifactWatcher } from './services/artifact-watcher.service';
import { BranchWatcher } from './services/branch-watcher.service';
import { PromptTemplates } from './core/prompt-templates';
import { SetupProjectTool } from './ai/tools/setup-project.tool';
import { StartWorkflowTool } from './ai/tools/start-workflow.tool';
import type { ProcessLevel } from './core/types';
import { SaveArtifactTool } from './ai/tools/save-artifact.tool';
import { AdvanceStageTool } from './ai/tools/advance-stage.tool';
import { UpdateStatusTool } from './ai/tools/update-status.tool';
import { ChatParticipantHandler } from './chat/chat-participant';
// NavigationTreeProvider removed — navigation is now in-webview
import { EngineeringWorkspacePanelProvider } from './views/panel-provider';
import { handleWebviewMessage } from './views/message-handler';
import { WORKFLOW_DIR, CURRENT_WORKFLOW_DIR, WORKFLOW_FILE } from './constants';

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

  const stateManager = new StateManager(fsService, workflowPath);
  const workflowEngine = new WorkflowEngine();
  const skillRegistry = new SkillRegistry();
  const skillEngine = new SkillEngine(skillRegistry);
  const workflowGenerator = new WorkflowGenerator(skillEngine);
  const stageExecutor = new StageExecutor(skillRegistry);
  const artifactManager = new ArtifactManager(fsService, workspaceRoot ?? '/');
  const historyManager = new HistoryManager(fsService, workspaceRoot ?? '/');
  const promptTemplates = new PromptTemplates();
  const agentBridge = new AgentBridge(vscodeApi);

  // ─── Language Model Tools (registered with vscode.lm) ────────────
  // These tools are invoked by the agent in agent mode automatically.
  // Each tool is registered with the name matching package.json.
  // The agent provides all intelligence (risk assessment, context
  // detection, skill selection) — the extension only orchestrates.
  const setupProjectTool = new SetupProjectTool(fsService, workspaceRoot ?? '/', () => {
    // .codestudio/ directory created — but DON'T transition to ready yet.
    // The agent still needs to create knowledge files (architecture.md,
    // stack.md, conventions.md, boundaries.md, codestudio-instructions.md).
    // The ArtifactWatcher will transition to ready when instructions.md
    // is detected (the last file the agent creates).
    //
    // Just update the status message so the user knows progress is happening.
    panelProvider.postMessage({
      type: 'agentStatus',
      status: 'working',
      message: 'Project structure created. Scanning workspace...',
    });
  });

  // Config reader: reads processLevelDefault from .codestudio/config.json
  const configPath = workspaceRoot
    ? `${workspaceRoot}/${WORKFLOW_DIR}/config.json`
    : `/${WORKFLOW_DIR}/config.json`;
  const readConfigLevel = async (): Promise<ProcessLevel | 'auto'> => {
    try {
      if (await fsService.exists(configPath)) {
        const raw = await fsService.read(configPath);
        const config = JSON.parse(raw) as Record<string, unknown>;
        const level = config.processLevelDefault ?? config.processLevel;
        if (
          level === 'light' ||
          level === 'standard' ||
          level === 'thorough' ||
          level === 'guarded'
        ) {
          return level;
        }
      }
    } catch {
      // Corrupt or missing config — fall through to 'auto'
    }
    return 'auto';
  };

  const startWorkflowTool = new StartWorkflowTool(
    workflowGenerator,
    workflowEngine,
    stateManager,
    stageExecutor,
    artifactManager,
    (wf) => {
      panelProvider.postMessage({ type: 'state', workflow: wf });
      // Agent is already working in chat — tell the UI so it shows
      // "Agent is working..." instead of "Send to Agent"
      panelProvider.postMessage({
        type: 'agentStatus',
        status: 'working',
        message: `Working on ${wf.state.currentStage} stage...`,
      });
    },
    readConfigLevel,
  );

  const saveArtifactTool = new SaveArtifactTool(artifactManager, (_artifact) => {
    // Don't send artifactDetected here — the ArtifactWatcher will
    // detect the file and route through notifyArtifactDetected,
    // which also resets agentStatus and refreshes stageDetail.
    // Sending here would cause a double notification.
  });

  // Approval mode reader: reads approvalMode from .codestudio/config.json
  const readApprovalMode = async (): Promise<'user' | 'agent'> => {
    try {
      if (await fsService.exists(configPath)) {
        const raw = await fsService.read(configPath);
        const config = JSON.parse(raw) as Record<string, unknown>;
        if (config.approvalMode === 'agent') return 'agent';
      }
    } catch {
      // Corrupt config — default to user
    }
    return 'user';
  };

  const advanceStageTool = new AdvanceStageTool(
    workflowEngine,
    stateManager,
    stageExecutor,
    artifactManager,
    (wf) => {
      panelProvider.postMessage({ type: 'state', workflow: wf });
    },
    readApprovalMode,
  );

  const updateStatusTool = new UpdateStatusTool((message, _phase) => {
    panelProvider.postMessage({
      type: 'agentStatus',
      status: 'working',
      message,
    });
  });

  // Register all tools with vscode.lm
  context.subscriptions.push(
    vscode.lm.registerTool('engineering_setup_project', setupProjectTool),
    vscode.lm.registerTool('engineering_start_workflow', startWorkflowTool),
    vscode.lm.registerTool('engineering_save_artifact', saveArtifactTool),
    vscode.lm.registerTool('engineering_advance_stage', advanceStageTool),
    vscode.lm.registerTool('engineering_update_status', updateStatusTool),
  );

  // ─── Editor Panel (Webview) ──────────────────────────────────────
  // PanelProvider is created first so the reply callback can reference it.
  // The message handler is wired after, using a closure over panelProvider.
  let panelProvider: EngineeringWorkspacePanelProvider;

  const messageHandler = handleWebviewMessage(
    {
      stateManager,
      workflowEngine,
      workflowGenerator,
      stageExecutor,
      notificationService,
      workspaceService,
      fileSystem: fsService,
      artifactManager,
      promptTemplates,
      agentBridge,
      historyManager,
      approvalMode: 'user',
    },
    // Reply callback — sends MessageToWebview back to the webview
    (message) => panelProvider.postMessage(message),
  );

  panelProvider = new EngineeringWorkspacePanelProvider(context, messageHandler);

  // ─── File Watchers ─────────────────────────────────────────────────
  if (workspaceRoot) {
    const artifactWatcher = new ArtifactWatcher(vscodeApi, workspaceRoot);
    const watcherDisposable = artifactWatcher.start();
    context.subscriptions.push(watcherDisposable);

    // When an artifact is detected, route through the message handler
    // so it can reset agentStatus and refresh stageDetail in one shot.
    artifactWatcher.onArtifactDetected((artifact) => {
      void messageHandler({ type: 'notifyArtifactDetected', artifact });
    });

    // When a setup file is detected, only transition to "ready" when
    // codestudio-instructions.md is created — that's the LAST file the
    // agent creates (after all knowledge files). config.json is created
    // first but the agent is still working on knowledge files at that point.
    artifactWatcher.onSetupFileDetected(async (fileName) => {
      if (!fileName.includes('instructions')) {
        // config.json or other early files — agent is still working, don't transition yet
        return;
      }
      // codestudio-instructions.md created — all knowledge files are done
      panelProvider.postMessage({
        type: 'onboardingStatus',
        status: 'ready',
        projectType: 'brownfield',
        context: null,
        hasExistingFiles: true,
      });
      notificationService.showInfo('Project setup complete! Ready to start working.');
    });

    // When a knowledge file changes, auto-refresh the Knowledge view
    artifactWatcher.onKnowledgeFileChanged(() => {
      // Trigger a knowledge refresh by sending requestKnowledge through the handler
      void messageHandler({ type: 'requestKnowledge' });
    });

    // ─── Branch-Change Watcher (Phase 5) ──────────────────────────
    // Detects git branch switches and reloads workflow state so the
    // webview always shows the correct branch's workflow.
    const branchWatcher = new BranchWatcher(vscodeApi, workspaceRoot);
    const branchDisposable = branchWatcher.start();
    context.subscriptions.push(branchDisposable);

    branchWatcher.onBranchChange(() => {
      void stateManager.load().then((wf) => {
        panelProvider.postMessage({ type: 'state', workflow: wf });
      });
    });
  }

  // ─── Chat Participant ────────────────────────────────────────────
  const chatHandler = new ChatParticipantHandler(stateManager);
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
    vscode.commands.registerCommand('engineeringWorkspace.analyzeWorkRequest', () => {
      panelProvider.open();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('engineeringWorkspace.showHistory', () => {
      panelProvider.open();
    }),
  );

  // ─── Status Bar ───────────────────────────────────────────────────
  notificationService.updateStatusBar('🏗️ Engineering Workspace', 'Engineering Workspace');

  // ─── Onboarding Check (NO auto-initialization) ────────────────────
  // We do NOT auto-create .codestudio/ here. The directory and config
  // are created only when the user goes through the onboarding flow
  // (Setup Existing or Start New Project). This ensures the Welcome
  // screen is shown to first-time users.
  //
  // If .codestudio/ already exists (returning user), we just update
  // the status bar with the detected project type.
  if (workspaceRoot) {
    void fsService.exists(`${workspaceRoot}/.codestudio/config.json`).then((exists) => {
      if (exists) {
        notificationService.updateStatusBar(
          '🏗️ Project Ready',
          'Engineering Workspace — project configured',
        );
      }
      // If not exists → onboarding will show in webview. No auto-init.
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
