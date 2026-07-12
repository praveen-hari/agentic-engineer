/**
 * Plugin Registry Service — fetches, caches, and manages agent plugins.
 *
 * Reads the plugin catalog from a remote GitHub-hosted plugins.json,
 * detects installed plugins via Code Studio's native plugin system
 * (installed.json + chat.pluginLocations setting), and handles
 * install/uninstall using Code Studio's built-in commands.
 *
 * @see https://code.visualstudio.com/docs/agent-customization/agent-plugins
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
  private marketplaceRegistered = false;

  constructor() {
    // Allow override via VS Code settings
    const config = vscode.workspace.getConfiguration('engineeringWorkspace');
    this.registryUrl = config.get<string>('pluginRegistryUrl') || PLUGIN_REGISTRY_URL;
    this.iconBaseUrl = config.get<string>('pluginIconBaseUrl') || PLUGIN_ICON_BASE_URL;
  }

  /**
   * Ensure our marketplace repo is registered in chat.plugins.marketplaces.
   * This lets Code Studio's built-in plugin system discover our plugins.
   */
  async ensureMarketplaceRegistered(): Promise<void> {
    if (this.marketplaceRegistered) return;

    try {
      const config = vscode.workspace.getConfiguration('chat.plugins');
      const marketplaces = config.get<string[]>('marketplaces') || [];

      // Extract the owner/repo from our registry URL
      // e.g. "https://raw.githubusercontent.com/praveen-hari/agent-plugin-marketplace/main/plugins.json"
      // → "praveen-hari/agent-plugin-marketplace"
      const match = this.registryUrl.match(/github(?:usercontent)?\.com\/([^/]+\/[^/]+)/);
      const marketplaceRepo = match ? match[1] : null;

      if (marketplaceRepo && !marketplaces.includes(marketplaceRepo)) {
        const updated = [...marketplaces, marketplaceRepo];
        await config.update('marketplaces', updated, vscode.ConfigurationTarget.Global);
      }

      this.marketplaceRegistered = true;
    } catch {
      // Non-critical — marketplace still works via our custom fetch
    }
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
   * Read the list of installed plugin repo identifiers from multiple sources:
   * 1. ~/.sfcodestudio/agent-plugins/installed.json (native plugin registry)
   * 2. chat.pluginLocations setting (locally registered plugins)
   * 3. Scan ~/.sfcodestudio/agent-plugins/github.com/ directory
   */
  async getInstalledRepos(): Promise<string[]> {
    const repos = new Set<string>();

    // Source 1: installed.json
    try {
      const homedir = process.env.HOME || process.env.USERPROFILE || '';
      const installedPath = vscode.Uri.file(
        `${homedir}/.sfcodestudio/agent-plugins/installed.json`,
      );
      const content = await vscode.workspace.fs.readFile(installedPath);
      const data = JSON.parse(Buffer.from(content).toString('utf-8')) as InstalledJson;

      for (const entry of data.installed) {
        const uri = entry.pluginUri;
        const match = uri.match(/github\.com\/(.+?)(?:\/plugins\/.*)?$/);
        if (match) {
          repos.add(match[1]);
        } else {
          repos.add(entry.marketplace);
        }
      }
    } catch {
      // installed.json not found or corrupt
    }

    // Source 2: chat.pluginLocations setting
    try {
      const pluginLocations =
        vscode.workspace.getConfiguration('chat').get<Record<string, boolean>>('pluginLocations') ||
        {};
      for (const path of Object.keys(pluginLocations)) {
        const match = path.match(/github\.com\/(.+?)(?:\/plugins\/.*)?$/);
        if (match) {
          repos.add(match[1]);
        }
      }
    } catch {
      // Setting not available
    }

    // Source 3: Scan the agent-plugins directory for cloned repos
    try {
      const homedir = process.env.HOME || process.env.USERPROFILE || '';
      const baseDir = vscode.Uri.file(`${homedir}/.sfcodestudio/agent-plugins/github.com`);
      const orgs = await vscode.workspace.fs.readDirectory(baseDir);
      for (const [orgName, orgType] of orgs) {
        if (orgType !== vscode.FileType.Directory) continue;
        const orgDir = vscode.Uri.joinPath(baseDir, orgName);
        const repoEntries = await vscode.workspace.fs.readDirectory(orgDir);
        for (const [repoName, repoType] of repoEntries) {
          if (repoType !== vscode.FileType.Directory) continue;
          repos.add(`${orgName}/${repoName}`);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return [...repos];
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
   * Install a plugin using Code Studio's native install mechanism.
   *
   * Strategy (in order of preference):
   * 1. Try Code Studio's built-in command `chat.installPluginFromSource`
   * 2. Fallback: git clone + register via `chat.pluginLocations` setting
   *
   * Both approaches make the plugin visible in the Agent Customization panel.
   */
  async installPlugin(plugin: PluginInfo): Promise<void> {
    const repo = plugin.installSource.repo;
    const repoUrl = `https://github.com/${repo}`;

    // Ensure our marketplace is registered
    await this.ensureMarketplaceRegistered();

    // Strategy 1: Use Code Studio's native install command
    try {
      await vscode.commands.executeCommand('chat.installPluginFromSource', repoUrl);
      // If the command succeeds, Code Studio handles everything:
      // cloning, installed.json, plugin discovery, etc.
      return;
    } catch {
      // Command not available or failed — fall back to manual install
    }

    // Strategy 2: Manual git clone + register via chat.pluginLocations
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const targetDir = `${homedir}/.sfcodestudio/agent-plugins/github.com/${repo}`;

    try {
      const cloneUrl = `${repoUrl}.git`;
      const { exec } = await import('child_process');

      await new Promise<void>((resolve, reject) => {
        exec(`git clone --depth 1 "${cloneUrl}" "${targetDir}"`, { timeout: 60_000 }, (error) => {
          if (error) {
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

      // Ensure plugin.json manifest exists for skill discovery
      await this.ensurePluginManifest(plugin, targetDir);

      // Register via chat.pluginLocations so Agent Customization panel sees it
      await this.registerPluginLocation(targetDir);

      // Also update installed.json as a secondary record
      await this.addToInstalledJson(repo, targetDir);
    } catch (err) {
      throw err;
    }
  }

  /**
   * Ensure the plugin has a .github/plugin/plugin.json manifest.
   *
   * Code Studio discovers skills by reading this manifest's "skills" field.
   * If the cloned repo doesn't have one (e.g., Syncfusion repos that only
   * have a skills/ folder), we auto-generate it so the agent can find them.
   */
  private async ensurePluginManifest(plugin: PluginInfo, targetDir: string): Promise<void> {
    const manifestDir = `${targetDir}/.github/plugin`;
    const manifestPath = `${manifestDir}/plugin.json`;

    try {
      // Check if manifest already exists
      const manifestUri = vscode.Uri.file(manifestPath);
      try {
        await vscode.workspace.fs.stat(manifestUri);
        return; // Already exists — nothing to do
      } catch {
        // Doesn't exist — we'll create it
      }

      // Check if there's a skills/ directory to reference
      const skillsDir = `${targetDir}/skills`;
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(skillsDir));
      } catch {
        return; // No skills/ directory — nothing to generate
      }

      // Scan for skill folders to build the skills list
      const skillEntries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(skillsDir));
      const skillPaths = skillEntries
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => `./skills/${name}`);

      // Build the manifest
      const manifest = {
        name: plugin.id,
        description: plugin.description,
        version: plugin.version,
        author: { name: plugin.author },
        repository: plugin.repository,
        keywords: [...plugin.keywords],
        skills: skillPaths.length > 0 ? skillPaths : ['./skills/'],
      };

      // Create .github/plugin/ directory
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(manifestDir));

      // Write plugin.json
      await vscode.workspace.fs.writeFile(
        manifestUri,
        Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
      );
    } catch {
      // Non-critical — plugin still works, just might not auto-discover skills
    }
  }

  /**
   * Uninstall a plugin by removing it from all registration points.
   */
  async uninstallPlugin(plugin: PluginInfo): Promise<void> {
    const repo = plugin.installSource.repo;
    const homedir = process.env.HOME || process.env.USERPROFILE || '';
    const targetDir = `${homedir}/.sfcodestudio/agent-plugins/github.com/${repo}`;

    // Remove from chat.pluginLocations setting
    await this.unregisterPluginLocation(targetDir);

    // Remove from installed.json
    await this.removeFromInstalledJson(repo);

    // Remove the cloned directory
    try {
      const uri = vscode.Uri.file(targetDir);
      await vscode.workspace.fs.delete(uri, { recursive: true });
    } catch {
      // Directory might not exist — that's fine
    }
  }

  /**
   * Register a plugin path in the chat.pluginLocations setting.
   * This makes the plugin visible in Code Studio's Agent Customization panel.
   *
   * @see https://code.visualstudio.com/docs/agent-customization/agent-plugins#_use-local-plugins
   */
  private async registerPluginLocation(pluginPath: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('chat');
      const locations = config.get<Record<string, boolean>>('pluginLocations') || {};

      if (!(pluginPath in locations)) {
        locations[pluginPath] = true; // true = enabled
        await config.update('pluginLocations', locations, vscode.ConfigurationTarget.Global);
      }
    } catch {
      // Non-critical
    }
  }

  /**
   * Remove a plugin path from the chat.pluginLocations setting.
   */
  private async unregisterPluginLocation(pluginPath: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('chat');
      const locations = config.get<Record<string, boolean>>('pluginLocations') || {};

      if (pluginPath in locations) {
        delete locations[pluginPath];
        await config.update('pluginLocations', locations, vscode.ConfigurationTarget.Global);
      }
    } catch {
      // Non-critical
    }
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
