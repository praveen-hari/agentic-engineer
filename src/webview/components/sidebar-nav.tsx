import { type FunctionalComponent } from 'preact';
import { activeView } from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon, type IconName } from './icon';

const NAV_ITEMS: readonly {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
}[] = [
  { id: 'tasks', icon: 'tasklist', label: 'Tasks' },
  { id: 'capabilities', icon: 'lightbulb', label: 'Capabilities' },
  { id: 'knowledge', icon: 'book', label: 'Knowledge' },
  { id: 'history', icon: 'history', label: 'History' },
];

export const SidebarNav: FunctionalComponent = () => {
  const navigate = (view: string) => {
    activeView.value = view;
    bridge.send({ type: 'navigate', view });
  };

  return (
    <nav class="sidebar">
      <div class="sidebar-header">
        <span>Engineering Workspace</span>
        <div class="sidebar-header-actions">
          <button class="btn-icon" title="New Work Request" onClick={() => navigate('tasks')}>
            <Icon name="add" size={14} />
          </button>
        </div>
      </div>

      <div class="nav-section">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            class={`nav-item${activeView.value === item.id ? ' is-active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            <span class="nav-icon">
              <Icon name={item.icon} size={14} />
            </span>
            <span class="nav-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div class="nav-footer">
        <button
          class={`nav-item${activeView.value === 'settings' ? ' is-active' : ''}`}
          onClick={() => navigate('settings')}
        >
          <span class="nav-icon">
            <Icon name="gear" size={14} />
          </span>
          <span class="nav-label">Settings</span>
        </button>
      </div>
    </nav>
  );
};
