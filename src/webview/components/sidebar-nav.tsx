import { type FunctionalComponent } from 'preact';
import { activeView } from '../store/workflow.store';
import { bridge } from '../bridge';

const NAV_ITEMS = [
  { id: 'tasks', icon: '📋', label: 'Tasks' },
  { id: 'capabilities', icon: '🤖', label: 'Capabilities' },
  { id: 'knowledge', icon: '📚', label: 'Knowledge' },
  { id: 'history', icon: '🕐', label: 'History' },
];

export const SidebarNav: FunctionalComponent = () => {
  const navigate = (view: string) => {
    activeView.value = view;
    bridge.send({ type: 'navigate', view });
  };

  return (
    <nav class="sidebar">
      <div class="sidebar-header">
        Engineering Workspace
        <div class="sidebar-header-actions">
          <button class="btn-icon" title="New Work Request" onClick={() => navigate('tasks')}>
            +
          </button>
        </div>
      </div>

      <div class="nav-section">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            class={`nav-item ${activeView.value === item.id ? 'is-active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            <span class="nav-icon">{item.icon}</span>
            <span class="nav-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div style="margin-top: auto; padding: var(--space-sm) 0; border-top: 1px solid var(--color-border);">
        <button
          class={`nav-item ${activeView.value === 'settings' ? 'is-active' : ''}`}
          onClick={() => navigate('settings')}
        >
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">Settings</span>
        </button>
      </div>
    </nav>
  );
};
