/**
 * Side navigation rail for the webview panel.
 *
 * Renders a vertical nav bar with icon + label for each view.
 * Drives the `activeView` signal directly — no host round-trip needed.
 */
import { type FunctionalComponent } from 'preact';
import { activeView } from '../store/workflow.store';
import { Icon, type IconName } from './icon';

interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'tasks', label: 'Tasks', icon: 'tasklist' },
  { id: 'capabilities', label: 'Capabilities', icon: 'lightbulb' },
  { id: 'knowledge', label: 'Knowledge', icon: 'book' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

export const SideNav: FunctionalComponent = () => {
  const current = activeView.value;

  return (
    <nav class="side-nav" role="navigation" aria-label="Main navigation">
      <div class="side-nav-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            class={`side-nav-item${current === item.id ? ' side-nav-item--active' : ''}`}
            onClick={() => {
              activeView.value = item.id;
            }}
            aria-current={current === item.id ? 'page' : undefined}
            title={item.label}
          >
            <Icon name={item.icon} size={18} />
            <span class="side-nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
