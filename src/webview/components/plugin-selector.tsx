/**
 * Plugin Selector — searchable dropdown for selecting installed plugins.
 *
 * Used in the Tasks View empty state so users can explicitly choose
 * which plugins the agent should use for the current task.
 *
 * Features:
 * - Search/filter installed plugins by name or keywords
 * - Selected plugins shown as removable chips
 * - Dropdown with [+] add buttons
 * - Scales from 0 to 500+ plugins
 */

import { type FunctionalComponent } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { Icon } from './icon';
import { bridge } from '../bridge';
import { pluginStore, type PluginInfoView } from '../store/workflow.store';

export interface PluginSelectorProps {
  /** Currently selected plugin IDs. */
  readonly selected: readonly string[];
  /** Called when selection changes. */
  readonly onSelectionChange: (pluginIds: string[]) => void;
}

export const PluginSelector: FunctionalComponent<PluginSelectorProps> = ({
  selected,
  onSelectionChange,
}) => {
  const isOpen = useSignal(false);
  const searchQuery = useSignal('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const installed = pluginStore.value.installed;

  // Fetch plugins on first render if not loaded
  useEffect(() => {
    if (installed.length === 0 && pluginStore.value.plugins.length === 0) {
      bridge.send({ type: 'requestPlugins' });
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen.value) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        isOpen.value = false;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen.value]);

  // Filter installed plugins by search query
  const filtered = searchQuery.value.trim()
    ? installed.filter((p) => {
        const q = searchQuery.value.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.keywords.some((k) => k.toLowerCase().includes(q))
        );
      })
    : installed;

  // Separate selected and unselected for display
  const selectedPlugins = installed.filter((p) => selected.includes(p.id));
  const unselectedFiltered = filtered.filter((p) => !selected.includes(p.id));

  const addPlugin = (id: string) => {
    if (!selected.includes(id)) {
      onSelectionChange([...selected, id]);
    }
  };

  const removePlugin = (id: string) => {
    onSelectionChange(selected.filter((s) => s !== id));
  };

  // Don't render if no plugins are installed
  if (installed.length === 0) return null;

  return (
    <div class="plugin-selector" ref={dropdownRef}>
      {/* Selected chips + Add button */}
      <div class="plugin-selector-bar">
        <div class="plugin-selector-label">
          <Icon name="package" size={13} />
          <span>Plugins</span>
        </div>
        <div class="plugin-selector-chips">
          {selectedPlugins.map((p) => (
            <span class="plugin-chip" key={p.id}>
              <span class="plugin-chip-name">{p.name}</span>
              <button
                class="plugin-chip-remove"
                title={`Remove ${p.name}`}
                onClick={() => removePlugin(p.id)}
              >
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
          <button
            class="plugin-add-btn"
            title="Add a plugin"
            onClick={() => {
              isOpen.value = !isOpen.value;
              searchQuery.value = '';
            }}
          >
            <Icon name="add" size={12} /> Add
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen.value && (
        <div class="plugin-dropdown">
          {/* Search input */}
          <div class="plugin-dropdown-search">
            <Icon name="search" size={13} />
            <input
              type="text"
              class="plugin-dropdown-input"
              placeholder="Search installed plugins..."
              value={searchQuery.value}
              onInput={(e: Event) => {
                searchQuery.value = (e.target as HTMLInputElement).value;
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          {/* Plugin list */}
          <div class="plugin-dropdown-list">
            {unselectedFiltered.length === 0 && (
              <div class="plugin-dropdown-empty">
                {searchQuery.value.trim()
                  ? 'No plugins match your search'
                  : 'All installed plugins are selected'}
              </div>
            )}
            {unselectedFiltered.map((p) => (
              <button
                class="plugin-dropdown-item"
                key={p.id}
                onClick={() => {
                  addPlugin(p.id);
                  searchQuery.value = '';
                }}
                title={p.description}
              >
                <div class="plugin-dropdown-item-info">
                  <span class="plugin-dropdown-item-name">{p.name}</span>
                  <span class="plugin-dropdown-item-skills">
                    {p.skillCount} skill{p.skillCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <Icon name="add" size={14} />
              </button>
            ))}
          </div>

          {/* Footer */}
          {installed.length > 8 && (
            <div class="plugin-dropdown-footer">
              {filtered.length} of {installed.length} plugins
            </div>
          )}
        </div>
      )}
    </div>
  );
};
