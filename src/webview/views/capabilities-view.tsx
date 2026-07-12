import { type FunctionalComponent } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { pluginStore, filteredPlugins, type PluginInfoView } from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';

/**
 * Plugin Marketplace view — the "Capabilities" tab.
 *
 * Fetches plugins from the remote registry, shows installed plugins,
 * recommendations based on project context, featured plugins, and
 * a searchable/filterable full catalog.
 */
export const CapabilitiesView: FunctionalComponent = () => {
  // Fetch plugins on mount
  useEffect(() => {
    pluginStore.value = { ...pluginStore.value, loading: true };
    bridge.send({ type: 'requestPlugins' });
  }, []);

  const store = pluginStore.value;
  const filtered = filteredPlugins.value;

  const handleSearch = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    pluginStore.value = { ...pluginStore.value, searchQuery: value };
  }, []);

  const handleTabChange = useCallback((tab: 'all' | 'syncfusion' | 'community') => {
    pluginStore.value = { ...pluginStore.value, activeTab: tab };
  }, []);

  const handleInstall = useCallback((pluginId: string) => {
    bridge.send({ type: 'installPlugin', pluginId });
  }, []);

  const handleUninstall = useCallback((pluginId: string) => {
    bridge.send({ type: 'uninstallPlugin', pluginId });
  }, []);

  const handleRefresh = useCallback(() => {
    pluginStore.value = { ...pluginStore.value, loading: true };
    bridge.send({ type: 'refreshPlugins' });
  }, []);

  // Loading state
  if (store.loading && store.plugins.length === 0) {
    return (
      <div class="mp-loading">
        <Icon name="loading" size={24} />
        <p>Loading plugins...</p>
      </div>
    );
  }

  return (
    <div class="mp-container">
      {/* Header */}
      <div class="mp-header">
        <div>
          <h2 class="mp-title">Plugins</h2>
          <p class="mp-subtitle">Equip your agent with the right tools for your project</p>
        </div>
        <button class="mp-refresh-btn" onClick={handleRefresh} title="Refresh plugins">
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {/* Search Bar */}
      <div class="mp-search">
        <Icon name="search" size={14} />
        <input
          type="text"
          class="mp-search-input"
          placeholder="Search plugins and skills..."
          value={store.searchQuery}
          onInput={handleSearch}
        />
        {store.searchQuery && (
          <button
            class="mp-search-clear"
            onClick={() => {
              pluginStore.value = { ...pluginStore.value, searchQuery: '' };
            }}
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      {/* Error Banner */}
      {store.error && (
        <div class="mp-error" role="alert">
          <span>{store.error}</span>
          <button
            onClick={() => {
              pluginStore.value = { ...pluginStore.value, error: null };
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Installed Section */}
      {store.installed.length > 0 && !store.searchQuery && (
        <div class="mp-section">
          <div class="mp-section-header">
            <span class="mp-section-title">Added</span>
            <span class="mp-section-count">{store.installed.length}</span>
          </div>
          <div class="mp-installed-grid">
            {store.installed.map((plugin) => (
              <InstalledIcon key={plugin.id} plugin={plugin} onUninstall={handleUninstall} />
            ))}
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div class="mp-tabs">
        {(['all', 'syncfusion', 'community'] as const).map((tab) => (
          <button
            key={tab}
            class={`mp-tab${store.activeTab === tab ? ' mp-tab--active' : ''}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab === 'all' ? 'All' : tab === 'syncfusion' ? 'Syncfusion' : 'Community'}
          </button>
        ))}
      </div>

      {/* Recommended Section */}
      {store.recommended.length > 0 && !store.searchQuery && store.activeTab === 'all' && (
        <div class="mp-section">
          <h3 class="mp-section-title">Recommended</h3>
          <div class="mp-plugin-list">
            {store.recommended.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                installing={store.installingIds.includes(plugin.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        </div>
      )}

      {/* Featured Section */}
      {store.featured.length > 0 && !store.searchQuery && store.activeTab === 'all' && (
        <div class="mp-section">
          <h3 class="mp-section-title">Featured</h3>
          <div class="mp-featured-grid">
            {store.featured.map((plugin) => (
              <FeaturedCard
                key={plugin.id}
                plugin={plugin}
                installing={store.installingIds.includes(plugin.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Plugins (filtered) */}
      <div class="mp-section">
        {(store.searchQuery || store.activeTab !== 'all') && (
          <h3 class="mp-section-title">
            {store.searchQuery
              ? `Results (${filtered.length})`
              : store.activeTab === 'syncfusion'
                ? 'Syncfusion Plugins'
                : 'Community Plugins'}
          </h3>
        )}
        {!store.searchQuery && store.activeTab === 'all' && (
          <h3 class="mp-section-title">All Plugins</h3>
        )}
        {filtered.length === 0 ? (
          <div class="mp-empty">
            <Icon name="search" size={24} />
            <p>No plugins found{store.searchQuery ? ` for "${store.searchQuery}"` : ''}</p>
          </div>
        ) : (
          <div class="mp-plugin-list">
            {filtered.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                installing={store.installingIds.includes(plugin.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: PluginInfoView;
  installing: boolean;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

const PluginCard: FunctionalComponent<PluginCardProps> = ({
  plugin,
  installing,
  onInstall,
  onUninstall,
}) => {
  const isInstalled = plugin.installStatus === 'installed';

  return (
    <div class="mp-plugin-card">
      <img
        class="mp-plugin-icon"
        src={plugin.icon}
        alt={plugin.name}
        width={36}
        height={36}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div class="mp-plugin-info">
        <div class="mp-plugin-name">{plugin.name}</div>
        <div class="mp-plugin-desc">{plugin.description}</div>
        <div class="mp-plugin-meta">
          <span class="mp-plugin-author">{plugin.author}</span>
          {plugin.skillCount > 0 && (
            <span class="mp-plugin-skills">{plugin.skillCount} skills</span>
          )}
        </div>
      </div>
      <div class="mp-plugin-action">
        {installing ? (
          <button class="mp-btn mp-btn--installing" disabled>
            <Icon name="loading" size={14} />
          </button>
        ) : isInstalled ? (
          <button
            class="mp-btn mp-btn--installed"
            onClick={() => onUninstall(plugin.id)}
            title="Uninstall"
          >
            Installed
          </button>
        ) : (
          <button class="mp-btn mp-btn--add" onClick={() => onInstall(plugin.id)}>
            Add
          </button>
        )}
      </div>
    </div>
  );
};

interface InstalledIconProps {
  plugin: PluginInfoView;
  onUninstall: (id: string) => void;
}

const InstalledIcon: FunctionalComponent<InstalledIconProps> = ({ plugin, onUninstall }) => (
  <div class="mp-installed-item" title={`${plugin.name} — Click to remove`}>
    <img
      class="mp-installed-icon"
      src={plugin.icon}
      alt={plugin.name}
      width={32}
      height={32}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
    <button class="mp-installed-remove" onClick={() => onUninstall(plugin.id)} title="Remove">
      <Icon name="close" size={10} />
    </button>
  </div>
);

interface FeaturedCardProps {
  plugin: PluginInfoView;
  installing: boolean;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

const FeaturedCard: FunctionalComponent<FeaturedCardProps> = ({
  plugin,
  installing,
  onInstall,
  onUninstall,
}) => {
  const isInstalled = plugin.installStatus === 'installed';

  return (
    <div class="mp-featured-card">
      <img
        class="mp-featured-icon"
        src={plugin.icon}
        alt={plugin.name}
        width={40}
        height={40}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div class="mp-featured-name">{plugin.name}</div>
      <div class="mp-featured-desc">{plugin.description}</div>
      <div class="mp-featured-footer">
        <span class="mp-featured-skills">{plugin.skillCount} skills</span>
        {installing ? (
          <button class="mp-btn mp-btn--installing mp-btn--sm" disabled>
            <Icon name="loading" size={12} />
          </button>
        ) : isInstalled ? (
          <button
            class="mp-btn mp-btn--installed mp-btn--sm"
            onClick={() => onUninstall(plugin.id)}
          >
            ✓
          </button>
        ) : (
          <button class="mp-btn mp-btn--add mp-btn--sm" onClick={() => onInstall(plugin.id)}>
            Add
          </button>
        )}
      </div>
    </div>
  );
};
