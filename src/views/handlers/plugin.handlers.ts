/**
 * Plugin marketplace handlers.
 *
 * Handles: requestPlugins, installPlugin, uninstallPlugin, refreshPlugins.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost, ProjectContext } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { extractListFromLine } from '../helpers/context-parser';

export const pluginHandlers: HandlerRegistration = {
  requestPlugins: handleRequestPlugins,
  installPlugin: handleInstallPlugin,
  uninstallPlugin: handleUninstallPlugin,
  refreshPlugins: handleRefreshPlugins,
};

// ─── Encapsulated State ─────────────────────────────────────────────────────

/** Cached project context for recommendations. */
let lastProjectContext: ProjectContext | null = null;

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestPlugins(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  if (!deps.pluginRegistry) {
    reply({ type: 'pluginsData', plugins: [], installed: [], recommended: [], featured: [] });
    return;
  }

  try {
    const allPlugins = await deps.pluginRegistry.getPluginsWithStatus();
    const installed = await deps.pluginRegistry.getInstalledPlugins(allPlugins);
    const featured = deps.pluginRegistry.getFeaturedPlugins(allPlugins);

    // Get project context for recommendations
    if (!lastProjectContext) {
      const root = deps.workspaceService.getWorkspaceRoot();
      if (root) {
        try {
          const stackPath = `${root}/.codestudio/knowledge/stack.md`;
          if (await deps.fileSystem.exists(stackPath)) {
            const content = await deps.fileSystem.read(stackPath);
            const lines = content.split('\n');
            const languages: string[] = [];
            const frameworks: string[] = [];
            for (const line of lines) {
              const lower = line.toLowerCase();
              if (lower.includes('language') && line.includes(':')) {
                languages.push(...extractListFromLine(line));
              } else if (lower.includes('framework') && line.includes(':')) {
                frameworks.push(...extractListFromLine(line));
              }
            }
            lastProjectContext = {
              rootPath: root,
              languages,
              frameworks,
              detectedStack: [...languages, ...frameworks],
              packageManager: null,
              testFramework: null,
              conventions: [],
              generatedAt: new Date().toISOString(),
            };
          }
        } catch {
          // No context available
        }
      }
    }

    const recommended = deps.pluginRegistry.computeRecommendations(allPlugins, lastProjectContext);

    reply({
      type: 'pluginsData',
      plugins: allPlugins,
      installed,
      recommended,
      featured,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch plugins';
    reply({ type: 'error', message });
  }
}

async function handleInstallPlugin(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { pluginId } = msg as Extract<MessageToHost, { type: 'installPlugin' }>;
  if (!deps.pluginRegistry) return;

  try {
    const allPlugins = await deps.pluginRegistry.fetchCatalog();
    const plugin = allPlugins.find((p) => p.id === pluginId);
    if (!plugin) {
      reply({ type: 'pluginInstallResult', pluginId, success: false, error: 'Plugin not found' });
      return;
    }

    reply({ type: 'pluginInstalling', pluginId });
    await deps.pluginRegistry.installPlugin(plugin);
    reply({ type: 'pluginInstallResult', pluginId, success: true });

    // Refresh the full list so UI updates
    await handleRequestPlugins(msg, deps, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Install failed';
    reply({ type: 'pluginInstallResult', pluginId, success: false, error: message });
  }
}

async function handleUninstallPlugin(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { pluginId } = msg as Extract<MessageToHost, { type: 'uninstallPlugin' }>;
  if (!deps.pluginRegistry) return;

  try {
    const allPlugins = await deps.pluginRegistry.fetchCatalog();
    const plugin = allPlugins.find((p) => p.id === pluginId);
    if (!plugin) {
      reply({ type: 'pluginInstallResult', pluginId, success: false, error: 'Plugin not found' });
      return;
    }

    await deps.pluginRegistry.uninstallPlugin(plugin);
    reply({ type: 'pluginInstallResult', pluginId, success: true });

    // Refresh the full list so UI updates
    await handleRequestPlugins(msg, deps, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Uninstall failed';
    reply({ type: 'pluginInstallResult', pluginId, success: false, error: message });
  }
}

async function handleRefreshPlugins(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  if (!deps.pluginRegistry) return;
  lastProjectContext = null; // Force re-read of project context
  try {
    const allPlugins = await deps.pluginRegistry.getPluginsWithStatus(true);
    const installed = await deps.pluginRegistry.getInstalledPlugins(allPlugins);
    const featured = deps.pluginRegistry.getFeaturedPlugins(allPlugins);
    const recommended = deps.pluginRegistry.computeRecommendations(allPlugins, null);
    reply({ type: 'pluginsData', plugins: allPlugins, installed, recommended, featured });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh plugins';
    reply({ type: 'error', message });
  }
}
