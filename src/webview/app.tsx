import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import {
  activeView,
  workflowStore,
  assessmentStore,
  contextStore,
  historyStore,
  historyHasMore,
  isAnalyzing,
  isOnboarded,
  onboardingStatus,
  projectType,
  generatingStage,
  detectedArtifacts,
  error,
} from './store/workflow.store';
import { bridge } from './bridge';
import { OnboardingView } from './views/onboarding-view';
import { TasksView } from './views/tasks-view';
import { CapabilitiesView } from './views/capabilities-view';
import { KnowledgeView } from './views/knowledge-view';
import { HistoryView } from './views/history-view';
import { SettingsView } from './views/settings-view';

/**
 * Root app component for the editor-panel webview.
 *
 * Shows onboarding flow first (welcome → setup → ready).
 * Once onboarded, shows the normal 5-view navigation.
 *
 * Navigation is driven by the native TreeView in the sidebar.
 * The extension host sends `{ type: 'navigateTo', view }` messages
 * when the user clicks a tree item.
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
          workflowStore.value = msg.workflow;
          isAnalyzing.value = false;
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
          historyHasMore.value = msg.hasMore;
          break;
        case 'error':
          error.value = msg.message;
          isAnalyzing.value = false;
          break;
        case 'onboardingStatus':
          onboardingStatus.value = msg.status;
          projectType.value = msg.projectType;
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
      }
    });

    return unsub;
  }, []);

  // ─── Onboarding Gate ───────────────────────────────────────────
  // Show onboarding until the project is set up
  if (!isOnboarded.value) {
    return (
      <div class="app-panel">
        <main class="panel-content">
          <OnboardingView />
        </main>
      </div>
    );
  }

  // ─── Normal Views ──────────────────────────────────────────────
  const view = activeView.value;

  return (
    <div class="app-panel">
      <main class="panel-content">
        {view === 'tasks' && <TasksView />}
        {view === 'capabilities' && <CapabilitiesView />}
        {view === 'knowledge' && <KnowledgeView />}
        {view === 'history' && <HistoryView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};
