import { type FunctionalComponent } from 'preact';
import { effect } from '@preact/signals';
import { activeView } from './store/workflow.store';
import { bridge } from './bridge';
import { SidebarNav } from './components/sidebar-nav';
import { TasksView } from './views/tasks-view';
import { CapabilitiesView } from './views/capabilities-view';
import { KnowledgeView } from './views/knowledge-view';
import { HistoryView } from './views/history-view';
import { SettingsView } from './views/settings-view';

const VIEW_TITLES: Record<string, string> = {
  tasks: 'Tasks',
  capabilities: 'Capabilities',
  knowledge: 'Knowledge',
  history: 'History',
  settings: 'Settings',
};

export const App: FunctionalComponent = () => {
  // Request initial state on mount
  effect(() => {
    bridge.send({ type: 'requestState' });
    bridge.send({ type: 'requestContext' });
  });

  const view = activeView.value;
  const title = VIEW_TITLES[view] ?? 'Engineering Workspace';

  return (
    <div class="app-shell">
      <SidebarNav />
      <div class="content-area">
        <div class="tab-bar">
          <div class="tab-item is-active">
            <span>{title}</span>
          </div>
        </div>
        <main class="content">
          {view === 'tasks' && <TasksView />}
          {view === 'capabilities' && <CapabilitiesView />}
          {view === 'knowledge' && <KnowledgeView />}
          {view === 'history' && <HistoryView />}
          {view === 'settings' && <SettingsView />}
        </main>
        <div class="status-bar">
          <div class="status-bar-left">
            <span class="status-item">🏗️ Engineering Workspace</span>
          </div>
          <div class="status-bar-right">
            <span class="status-item">v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
