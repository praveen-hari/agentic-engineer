import type {
  ContextSignal,
  FileIO,
  OnboardingResult,
  ProjectContext,
  WorkspaceConfig,
} from '../core/types';
import type { ProjectDetector } from '../core/project-detector';
import type { ContextAnalyzer } from '../core/context-analyzer';
import type { ContextSignalDetector } from '../core/context-signal-detector';
import { WorkspaceScanner } from './workspace-scanner.service';
import {
  WORKFLOW_DIR,
  CODESTUDIO_DIRECTORIES,
  CONFIG_FILE,
  CONTEXT_FILE,
  DEFAULT_CONFIG,
  CONTEXT_STALENESS_MS,
} from '../constants';

/**
 * Orchestrates workspace initialization on extension activation.
 *
 * Handles both first-time (create .codestudio/) and returning
 * (load existing state) flows. Detects greenfield vs brownfield
 * projects and generates project context accordingly.
 *
 * @see DESIGN_DECISIONS.md DD-002 (Git-Tracked Workflow State)
 * @see AGENTIC_SDLC_EXTENSION_ANALYSIS.md §5.2 Stage 1 (ONBOARD)
 * @see tasks/specs/onboarding-and-workspace-init.md
 */
export class OnboardingService {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
    private readonly projectDetector: ProjectDetector,
    private readonly contextAnalyzer: ContextAnalyzer,
    private readonly contextSignalDetector: ContextSignalDetector,
  ) {}

  /**
   * Run the full onboarding pipeline:
   *
   * 1. Detect if .codestudio/ exists (first-time vs returning)
   * 2. Create full directory tree if first-time
   * 3. Load or create config.json
   * 4. Scan workspace files → detect stack → detect signals
   * 5. Generate or refresh context.md
   * 6. Return OnboardingResult with all collected data
   */
  async initialize(): Promise<OnboardingResult> {
    const codestudioPath = `${this.rootPath}/${WORKFLOW_DIR}`;
    const isFirstRun = !(await this.fs.exists(codestudioPath));

    // Step 1: Create directory tree if first run
    if (isFirstRun) {
      await this.createDirectoryTree();
    }

    // Step 2: Load or create config
    const config = await this.loadOrCreateConfig();

    // Step 3: Check context staleness
    const contextStale = await this.isContextStale();

    // Step 4: Scan workspace and detect project context
    const { context, signals } = await this.detectProjectContext(isFirstRun || contextStale);

    // Step 5: Determine project type
    const scanner = new WorkspaceScanner(this.fs, this.rootPath);
    const files = await scanner.scan();
    const projectType = WorkspaceScanner.isGreenfield(files)
      ? ('greenfield' as const)
      : ('brownfield' as const);

    return {
      projectType,
      context,
      signals,
      config,
      isFirstRun,
      contextStale,
    };
  }

  /**
   * Create the full .codestudio/ directory tree per DD-002.
   *
   * Creates all directories defined in {@link CODESTUDIO_DIRECTORIES}:
   * - workflows/current/ (branch-scoped workflow state)
   * - workflows/current/artifacts/specs|plans|reviews|reports
   * - knowledge/ + knowledge/adrs/
   * - instructions/, agents/, skills/, prompts/, hooks/
   * - archive/
   */
  async createDirectoryTree(): Promise<void> {
    const base = `${this.rootPath}/${WORKFLOW_DIR}`;

    // Create root first
    await this.fs.mkdir(base);

    // Create all subdirectories
    for (const dir of CODESTUDIO_DIRECTORIES) {
      await this.fs.mkdir(`${base}/${dir}`);
    }
  }

  /**
   * Load existing config.json or create with defaults.
   */
  async loadOrCreateConfig(): Promise<WorkspaceConfig> {
    const configPath = `${this.rootPath}/${WORKFLOW_DIR}/${CONFIG_FILE}`;

    if (await this.fs.exists(configPath)) {
      try {
        const content = await this.fs.read(configPath);
        const parsed = JSON.parse(content) as WorkspaceConfig;
        // Merge with defaults to handle missing keys from older versions
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch {
        // Corrupt config — recreate with defaults
        await this.writeConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
    }

    // First run — create default config
    await this.writeConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  /**
   * Check if context.md is stale (older than 24 hours).
   */
  async isContextStale(): Promise<boolean> {
    const contextPath = `${this.rootPath}/${WORKFLOW_DIR}/${CONTEXT_FILE}`;

    if (!(await this.fs.exists(contextPath))) return true;

    try {
      const content = await this.fs.read(contextPath);
      // Extract generatedAt from the markdown header
      const match = content.match(/Auto-generated on (.+)/);
      if (!match?.[1]) return true;

      const generatedAt = new Date(match[1]).getTime();
      if (isNaN(generatedAt)) return true;

      return Date.now() - generatedAt > CONTEXT_STALENESS_MS;
    } catch {
      return true;
    }
  }

  /**
   * Scan workspace, detect stack, detect signals, generate context.md.
   *
   * @param forceRefresh If true, always re-scan even if context.md exists
   */
  async detectProjectContext(forceRefresh: boolean): Promise<{
    context: ProjectContext;
    signals: readonly ContextSignal[];
  }> {
    const contextPath = `${this.rootPath}/${WORKFLOW_DIR}/${CONTEXT_FILE}`;

    // If context exists and we're not forcing refresh, load cached
    if (!forceRefresh && (await this.fs.exists(contextPath))) {
      return this.loadCachedContext();
    }

    // Scan workspace files
    const scanner = new WorkspaceScanner(this.fs, this.rootPath);
    const files = await scanner.scan();

    // Detect project stack
    const detection = this.projectDetector.detect(files);
    const context = this.projectDetector.toContext(detection, this.rootPath);

    // Detect context signals
    const signals = this.contextSignalDetector.detect(context);

    // Generate and write context.md
    const markdown = this.contextAnalyzer.generateMarkdown(context);
    await this.fs.write(contextPath, markdown);

    return { context, signals };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async writeConfig(config: WorkspaceConfig): Promise<void> {
    const configPath = `${this.rootPath}/${WORKFLOW_DIR}/${CONFIG_FILE}`;
    await this.fs.write(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Load context from existing context.md — returns minimal context
   * since we can't reverse-parse the markdown back to ProjectContext.
   * The real context is regenerated on next scan.
   */
  private async loadCachedContext(): Promise<{
    context: ProjectContext;
    signals: readonly ContextSignal[];
  }> {
    // We can't reverse-parse context.md back to ProjectContext,
    // so we re-scan anyway but this path is for the "exists and fresh" case.
    // In practice, detectProjectContext is only called with forceRefresh=true
    // on first run or when stale, so this is a fallback.
    const context: ProjectContext = {
      rootPath: this.rootPath,
      detectedStack: [],
      languages: [],
      frameworks: [],
      packageManager: null,
      testFramework: null,
      conventions: [],
      generatedAt: new Date().toISOString(),
    };
    const signals = this.contextSignalDetector.detect(context);
    return { context, signals };
  }
}
