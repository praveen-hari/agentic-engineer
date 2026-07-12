/**
 * Plugin Registry Service — fetches, caches, and manages agent plugins.
 *
 * Reads the plugin catalog from a remote GitHub-hosted plugins.json,
 * detects installed plugins from ~/.sfcodestudio/agent-plugins/installed.json,
 * computes recommendations based on project context, and handles
 * install/uninstall via git clone.
 */

import * as vscode from 'vscode';
import { PLUGIN_REGISTRY_URL, PLUGIN_ICON_BASE_URL, PLUGIN_CACHE_TTL_MS } from '../constants';
import type { PluginInfo, PluginCategory, ProjectContext } from '../core/types';

interface RawPluginEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  icon: string;
  repository: string;
  keywords: string[];
  category: PluginCategory;
  featured: boolean;
  skillCount: number;
  installSource: {
    type: 'git' | 'npm' | 'url';
    repo: string;
  };
}

interface InstalledJson {
  version: number;
  installed: Array<{
    pluginUri: string;
    marketplace: string;
  }>;
}

interface RegistryCache {
  plugins: PluginInfo[];
  fetchedAt: number;
}

export class PluginRegistryService {
  private cache: RegistryCache | null = null;
  private readonly registryUrl: string;
  private readonly iconBaseUrl: string;

  constructor() {
    // Allow override via VS Code settings
    const config = vscode.workspace.getConfiguration('engineeringWorkspace');
    this.registryUrl = config.get<string>('pluginRegistryUrl') || PLUGIN_REGISTRY_URL;
    this.iconBaseUrl = config.get<string>('pluginIconBaseUrl') || PLUGIN_ICON_BASE_URL;
  }

  /**
   * Fetch the full plugin catalog from the remote registry.
   * Uses in-memory cache with configurable TTL.
   */
  async fetchCatalog(forceRefresh = false): Promise<PluginInfo[]> {
    // Return cached if still valid
    if (!forceRefresh && this.cache && Date.now() - this.cache.fetchedAt < PLUGIN_CACHE_TTL_MS) {
      return this.cache.plugins;
    }

    try {
      const response = await fetch(this.registryUrl);
      if (!response.ok) {
        throw new Error(`Registry fetch failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { version: number; plugins: RawPluginEntry[] };
      const plugins: PluginInfo[] = data.plugins.map((p) => ({
        ...p,
        icon: p.icon.startsWith('http') ? p.icon : `${this.iconBaseUrl}${p.icon}`,
        keywords: [...p.keywords],
        installStatus: 'not-installed' as const,
      }));

      this.cache = { plugins, fetchedAt: Date.now() };
      return plugins;
    } catch (err) {
      // If we have stale cache, return it rather than failing
      if (this.cache) {
        return this.cache.plugins;
      }
      throw err;
    }
  }

  /**
   * Read the list of installed plugin repo identifiers from
   * ~/.sfcodestudio/agent-plugins/installed.json
   */
  async getInstalledRepos(): Promise<string[]> {
    try {
      const homedir = process.env.HOME || process.env.USERPROFILE || '';
      const installedPath = vscode.Uri.file(
        `${homedir}/.sfcodestudio/agent-plugins/installed.json`,
      );
      const content = await vscode.workspace.fs.readFile(installedPath);
      const data = JSON.parse(Buffer.from(content).toString('utf-8')) as InstalledJson;

      // Extract repo identifiers from pluginUri paths
      // e.g. "file:///.../.sfcodestudio/agent-plugins/github.com/addyosmani/agent-skills"
      // → "addyosmani/agent-skills"
      return data.installed.map((entry) => {
        const uri = entry.pluginUri;
        const match = uri.match(/github\.com\/(.+?)(?:\/plugins\/.*)?$/);
        if (match) return match[1];
        // Fallback: use marketplace field
        return entry.marketplace;
      });
    } catch {
      return [];
    }
  }

  /**
   * Merge catalog with installed status.
   * Returns plugins with installStatus set to 'installed' where applicable.
   */
  async getPluginsWithStatus(forceRefresh = false): Promise<PluginInfo[]> {
    const [catalog, installedRepos] = await Promise.all([
      this.fetchCatalog(forceRefresh),
      this.getInstalledRepos(),
    ]);

    return catalog.map((plugin) => {
      const isInstalled = installedRepos.some(
        (repo) =>
          repo === plugin.installSource.repo ||
          repo.includes(plugin.installSource.repo) ||
          plugin.installSource.repo.includes(repo),
      );
      return {
        ...plugin,
        installStatus: isInstalled ? ('installed' as const) : ('not-installed' as const),
      };
    });
  }

  /**
   * Get installed plugins only.
   */
  async getInstalledPlugins(allPlugins: readonly PluginInfo[]): Promise<PluginInfo[]> {
    return allPlugins.filter((p) => p.installStatus === 'installed');
  }

  /**
   * Compute recommended plugins based on project context.
   * Matches project languages/frameworks against plugin keywords.
   */
  computeRecommendations(
    plugins: readonly PluginInfo[],
    context: ProjectContext | null,
  ): PluginInfo[] {
    if (!context) return [];

    const projectTerms = [
      ...context.languages.map((l) => l.toLowerCase()),
      ...context.frameworks.map((f) => f.toLowerCase()),
      ...context.detectedStack.map((s) => s.toLowerCase()),
    ];

    if (projectTerms.length === 0) return [];

    return plugins
      .filter((plugin) => {
        // Don't recommend already-installed plugins
        if (plugin.installStatus === 'installed') return false;
        // Check if any plugin keyword matches project terms
        return plugin.keywords.some((kw) =>
          projectTerms.some(
            (term) => term.includes(kw.toLowerCase()) || kw.toLowerCase().includes(term),
          ),
        );
      })
      .slice(0, 5); // Cap at 5 recommendations
  }

  /**
   * Get featured plugins.
   */
  getFeaturedPlugins(plugins: readonly PluginInfo[]): PluginInfo[] {
    return plugins.filter((p) => p.featured);
  }

  /**
   * Install a plugin by cloning its git repo into the agent-plugins directory.
   */
  async installPlugin(plugin: PluginInfo): Promise<void> {
    const repo = plugin.installSource.repo;
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const targetDir = `${homedir}/.sfcodestudio/agent-plugins/github.com/${repo}`;

    // Clone the repo
    const terminal = vscode.window.createTerminal({
      name: `Install: ${plugin.name}`,
      hideFromUser: true,
    });

    try {
      // Use git clone
      const cloneUrl = `https://github.com/${repo}.git`;

      // Execute git clone via child_process for reliability
      const { exec } = await import('child_process');
      await new Promise<void>((resolve, reject) => {
        exec(`git clone --depth 1 "${cloneUrl}" "${targetDir}"`, { timeout: 60_000 }, (error) => {
          if (error) {
            // If directory already exists, try git pull instead
            if (error.message.includes('already exists')) {
              exec(`cd "${targetDir}" && git pull`, { timeout: 30_000 }, (pullError) => {
                if (pullError) reject(pullError);
                else resolve();
              });
            } else {
              reject(error);
            }
          } else {
            resolve();
          }
        });
      });

      // Update installed.json
      await this.addToInstalledJson(repo, targetDir);
    } finally {
      terminal.dispose();
    }
  }

  /**
   * Uninstall a plugin by removing its directory and updating installed.json.
   */
  async uninstallPlugin(plugin: PluginInfo): Promise<void> {
    const repo = plugin.installSource.repo;
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const targetDir = `${homedir}/.sfcodestudio/agent-plugins/github.com/${repo}`;

    // Remove directory
    try {
      const uri = vscode.Uri.file(targetDir);
      await vscode.workspace.fs.delete(uri, { recursive: true });
    } catch {
      // Directory might not exist — that's fine
    }

    // Update installed.json
    await this.removeFromInstalledJson(repo);
  }

  /**
   * Add a plugin entry to installed.json.
   */
  private async addToInstalledJson(repo: string, targetDir: string): Promise<void> {
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const installedPath = `${homedir}/.sfcodestudio/agent-plugins/installed.json`;

    try {
      let data: InstalledJson;
      try {
        const uri = vscode.Uri.file(installedPath);
        const content = await vscode.workspace.fs.readFile(uri);
        data = JSON.parse(Buffer.from(content).toString('utf-8')) as InstalledJson;
      } catch {
        data = { version: 1, installed: [] };
      }

      // Check if already in the list
      const pluginUri = `file://${targetDir}`;
      if (!data.installed.some((e) => e.pluginUri === pluginUri)) {
        data.installed.push({
          pluginUri,
          marketplace: repo,
        });
      }

      const uri = vscode.Uri.file(installedPath);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(data, null, '\t'), 'utf-8'),
      );
    } catch {
      // Non-critical — plugin is cloned even if installed.json update fails
    }
  }

  /**
   * Remove a plugin entry from installed.json.
   */
  private async removeFromInstalledJson(repo: string): Promise<void> {
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const installedPath = `${homedir}/.sfcodestudio/agent-plugins/installed.json`;

    try {
      const uri = vscode.Uri.file(installedPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const data = JSON.parse(Buffer.from(content).toString('utf-8')) as InstalledJson;

      data.installed = data.installed.filter(
        (e) => !e.marketplace.includes(repo) && !e.pluginUri.includes(repo),
      );

      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(JSON.stringify(data, null, '\t'), 'utf-8'),
      );
    } catch {
      // Non-critical
    }
  }
}
