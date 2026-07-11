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
  error,
} from './store/workflow.store';
import { bridge } from './bridge';
import { TasksView } from './views/tasks-view';
import { CapabilitiesView } from './views/capabilities-view';
import { KnowledgeView } from './views/knowledge-view';
import { HistoryView } from './views/history-view';
import { SettingsView } from './views/settings-view';

/**
 * Root app component for the editor-panel webview.
 *
 * Navigation is driven by the native TreeView in the sidebar.
 * The extension host sends `{ type: 'navigateTo', view }` messages
 * when the user clicks a tree item.
 *
 * All other messages (state, assessment, context, history, error)
 * are dispatched to the signal stores so every view reacts automatically.
 */
export const App: FunctionalComponent = () => {
  useEffect(() => {
    // Set initial view from the global injected by the panel HTML
    const initialView = (window as unknown as Record<string, unknown>).__initialView as
      string | undefined;
    if (initialView) {
      activeView.value = initialView;
    }

    // Request initial state
    bridge.send({ type: 'requestState' });
    bridge.send({ type: 'requestContext' });

    // ─── Message Dispatcher ──────────────────────────────────────
    // Routes every MessageToWebview to the correct signal store.
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
      }
    });

    return unsub;
  }, []);

  const view = activeView.value;

  // Conditional rendering — only the active view is mounted.
  // Shared state lives in signal stores (workflow.store.ts) so it
  // survives view switches without keeping all 5 views in the DOM.
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
