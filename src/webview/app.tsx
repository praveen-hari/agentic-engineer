import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import {
  activeView,
  workflowStore,
  assessmentStore,
  contextStore,
  historyStore,
  isAnalyzing,
  hasExistingFiles,
  isOnboarded,
  onboardingStatus,
  projectType,
  generatingStage,
  detectedArtifacts,
  error,
  stageDetailStore,
  agentStatus,
  agentStatusMessage,
  agentStatusStage,
  actions,
  knowledgeStore,
  knowledgeRefreshing,
  historyDetailEntry,
  historyDetailWorkflow,
  historyDetailArtifacts,
} from './store/workflow.store';
import { bridge } from './bridge';
import { OnboardingView } from './views/onboarding-view';
import { TasksView } from './views/tasks-view';
import { CapabilitiesView } from './views/capabilities-view';
import { KnowledgeView } from './views/knowledge-view';
import { HistoryView } from './views/history-view';
import { SettingsView } from './views/settings-view';
import { SideNav } from './components/side-nav';

/**
 * Root app component for the editor-panel webview.
 *
 * Shows onboarding flow first (welcome → setup → ready).
 * Once onboarded, shows the side nav + content layout.
 *
 * Navigation is driven by the SideNav component inside the webview.
 * The `activeView` signal controls which view is displayed.
 */
export const App: FunctionalComponent = () => {
  useEffect(() => {
    // Set initial view from the global injected by the panel HTML
    const initialView = (window as unknown as Record<string, unknown>).__initialView as
      string | undefined;
    if (initialView) {
      activeView.value = initialView;
    }

    // Check onboarding status first
    bridge.send({ type: 'requestOnboardingStatus' });
    bridge.send({ type: 'requestState' });

    // ─── Message Dispatcher ──────────────────────────────────────
    const unsub = bridge.onMessage((msg) => {
      switch (msg.type) {
        case 'navigateTo':
          activeView.value = msg.view;
          break;
        case 'state':
          if (msg.workflow === null) {
            // Workflow cancelled/cleared — reset all related state
            actions.resetWorkflowState();
          } else {
            workflowStore.value = msg.workflow;
          }
          isAnalyzing.value = false;
          // Auto-refresh stage detail when workflow state changes
          if (msg.workflow) {
            bridge.send({ type: 'requestStageDetail' });
          }
          break;
        case 'stageResult':
          // Stage is blocked — refresh stage detail to show what's missing
          bridge.send({ type: 'requestStageDetail' });
          // Show the blocking reason as an error so the user knows why
          if (msg.result && msg.result.status === 'blocked') {
            error.value = msg.result.message;
            // Auto-clear after 5 seconds
            setTimeout(() => {
              error.value = null;
            }, 5000);
          }
          break;
        case 'assessment':
          assessmentStore.value = msg.assessment;
          isAnalyzing.value = false;
          break;
        case 'context':
          contextStore.value = msg.context;
          break;
        case 'history':
          historyStore.value = msg.entries;
          break;
        case 'error':
          actions.setError(msg.message, 8000);
          isAnalyzing.value = false;
          break;
        case 'onboardingStatus':
          onboardingStatus.value = msg.status;
          projectType.value = msg.projectType;
          hasExistingFiles.value = msg.hasExistingFiles;
          if (msg.context) {
            contextStore.value = msg.context;
          }
          break;
        case 'generatingArtifact':
          generatingStage.value = msg.stage;
          break;
        case 'artifactDetected':
          generatingStage.value = null;
          detectedArtifacts.value = [...detectedArtifacts.value, msg.artifact];
          break;
        case 'stageDetail':
          stageDetailStore.value = {
            stage: msg.stage,
            action: msg.action,
            completion: msg.completion,
            instructions: msg.instructions,
            artifacts: msg.artifacts,
          };
          break;
        case 'agentStatus':
          agentStatus.value = msg.status;
          agentStatusMessage.value = msg.message ?? null;
          agentStatusStage.value = msg.stage ?? null;
          break;
        case 'artifactContent':
          if (msg.content !== null) {
            actions.cacheArtifactContent(msg.artifactId, msg.content);
          }
          break;
        case 'knowledgeFiles':
          knowledgeStore.value = msg.files;
          knowledgeRefreshing.value = false;
          break;
        case 'historyDetail':
          historyDetailEntry.value = msg.entry;
          historyDetailWorkflow.value = msg.workflow;
          historyDetailArtifacts.value = msg.artifacts;
          break;
      }
    });

    return unsub;
  }, []);

  // ─── Onboarding Gate ───────────────────────────────────────────
  // Show onboarding until the project is set up (no side nav)
  if (!isOnboarded.value) {
    const onboardingError = error.value;
    return (
      <div class="app-panel app-panel--onboarding">
        {onboardingError && (
          <div class="error-banner" role="alert" aria-live="assertive">
            <span class="error-banner-text">{onboardingError}</span>
            <button
              class="error-banner-dismiss"
              onClick={() => {
                error.value = null;
              }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        <main class="panel-content">
          <OnboardingView />
        </main>
      </div>
    );
  }

  // ─── Normal Views (with side navigation) ─────────────────────────
  const view = activeView.value;
  const currentError = error.value;

  return (
    <div class="app-panel">
      <SideNav />
      <div class="panel-main">
        {/* Global error banner — renders errors from host and timeouts */}
        {currentError && (
          <div class="error-banner" role="alert" aria-live="assertive">
            <span class="error-banner-text">{currentError}</span>
            <button
              class="error-banner-dismiss"
              onClick={() => {
                error.value = null;
              }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
        <main class="panel-content">
          {view === 'tasks' && <TasksView />}
          {view === 'capabilities' && <CapabilitiesView />}
          {view === 'knowledge' && <KnowledgeView />}
          {view === 'history' && <HistoryView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};
