import type * as vscode from 'vscode';
import type { FileIO, ProjectContext } from '../../core/types';
import type { ProjectDetector } from '../../core/project-detector';
import type { ContextAnalyzer } from '../../core/context-analyzer';
import type { ContextSignalDetector } from '../../core/context-signal-detector';
import { WorkspaceScanner } from '../../services/workspace-scanner.service';

/**
 * Input for the engineering_setup_project tool.
 */
export interface SetupProjectInput {
  readonly projectName?: string;
  readonly description?: string;
}

/**
 * Language Model Tool: engineering_setup_project
 *
 * Initializes .codestudio/ directory, scans workspace, generates
 * project context. Called by the agent during onboarding or when
 * the user says "set up this project".
 *
 * After this tool runs, the project is ready for SDLC workflows.
 */
export class SetupProjectTool implements vscode.LanguageModelTool<SetupProjectInput> {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
    private readonly projectDetector: ProjectDetector,
    private readonly contextAnalyzer: ContextAnalyzer,
    private readonly contextSignalDetector: ContextSignalDetector,
    private readonly onComplete: (context: ProjectContext) => void,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<SetupProjectInput>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Setting up project${options.input.projectName ? `: ${options.input.projectName}` : ''}...`,
      confirmationMessages: {
        title: 'Set Up Project',
        message: new (await import('vscode')).MarkdownString(
          `Initialize Engineering Workspace for this project?\n\nThis will create a \`.codestudio/\` directory with project context.`,
        ),
      },
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<SetupProjectInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');

    try {
      // 1. Create .codestudio/ directory
      await this.fs.mkdir(`${this.rootPath}/.codestudio`);

      // 2. Create config.json
      const config = {
        version: 1,
        processLevelDefault: 'auto',
        autoApproveLowRisk: false,
        reviewTimeoutMinutes: 5,
        historyHotThreshold: 5,
        historyWarmThreshold: 20,
        historyColdAgeDays: 180,
        autoRefreshContext: true,
      };
      await this.fs.write(
        `${this.rootPath}/.codestudio/config.json`,
        JSON.stringify(config, null, 2),
      );

      // 3. Scan workspace and detect context
      const scanner = new WorkspaceScanner(this.fs, this.rootPath);
      const files = await scanner.scan();
      const detection = this.projectDetector.detect(files);
      const context = this.projectDetector.toContext(detection, this.rootPath);
      const signals = this.contextSignalDetector.detect(context);

      // 4. Generate and save context.md
      const markdown = this.contextAnalyzer.generateMarkdown(context);
      await this.fs.write(`${this.rootPath}/.codestudio/context.md`, markdown);

      // 5. Notify extension (triggers UI update)
      this.onComplete(context);

      const projectType = WorkspaceScanner.isGreenfield(files) ? 'greenfield' : 'brownfield';

      return new vscodeModule.LanguageModelToolResult([
        new vscodeModule.LanguageModelTextPart(JSON.stringify({
          success: true,
          projectType,
          languages: context.languages,
          frameworks: context.frameworks,
          testFramework: context.testFramework,
          packageManager: context.packageManager,
          conventions: context.conventions,
          signals,
          message: `Project initialized. .codestudio/ created with context.md and config.json. Project type: ${projectType}. Now create a codestudio-instructions.md file in .codestudio/ with the project's coding conventions, then the user can start a work request via the Engineering Workspace sidebar.`,
        }, null, 2)),
      ]);
    } catch (err) {
      throw new Error(`Failed to set up project: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
}
