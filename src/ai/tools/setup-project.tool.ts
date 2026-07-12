import type * as vscode from 'vscode';
import type { FileIO } from '../../core/types';
import { CODESTUDIO_DIRECTORIES, WORKFLOW_DIR } from '../../constants';

/**
 * Input for the engineering_setup_project tool.
 */
export interface SetupProjectInput {
  readonly projectName?: string;
}

/**
 * Language Model Tool: engineering_setup_project
 *
 * Creates the .codestudio/ directory structure and config.json.
 * That's ALL it does — no scanning, no context generation.
 *
 * After this tool runs, the agent should:
 * 1. Create project context files (context.md, architecture.md,
 *    conventions.md, stack.md, boundaries.md)
 * 2. Create codestudio-instructions.md
 * 3. Call engineering_start_workflow to begin the SDLC
 */
export class SetupProjectTool implements vscode.LanguageModelTool<SetupProjectInput> {
  constructor(
    private readonly fs: FileIO,
    private readonly rootPath: string,
    private readonly onComplete: () => void,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<SetupProjectInput>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Initializing .codestudio/${options.input.projectName ? ` for ${options.input.projectName}` : ''}...`,
      confirmationMessages: {
        title: 'Initialize Engineering Workspace',
        message: new (await import('vscode')).MarkdownString(
          `Create the \`.codestudio/\` directory structure for this project?\n\nThis creates the directory tree and config.json with default settings.`,
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
      const base = `${this.rootPath}/${WORKFLOW_DIR}`;

      // Create root directory
      await this.fs.mkdir(base);

      // Create all subdirectories
      for (const dir of CODESTUDIO_DIRECTORIES) {
        await this.fs.mkdir(`${base}/${dir}`);
      }

      // Create config.json with defaults
      const config = {
        version: 1,
        processLevelDefault: 'auto',
        autoApproveLowRisk: false,
        reviewTimeoutMinutes: 5,
        autoRefreshContext: true,
      };
      await this.fs.write(`${base}/config.json`, JSON.stringify(config, null, 2));

      // Notify extension
      this.onComplete();

      return new vscodeModule.LanguageModelToolResult([
        new vscodeModule.LanguageModelTextPart(
          JSON.stringify(
            {
              success: true,
              created: [
                '.codestudio/',
                '.codestudio/config.json',
                ...CODESTUDIO_DIRECTORIES.map((d) => `.codestudio/${d}/`),
              ],
              nextSteps: [
                'Scan the workspace and create these project context files in .codestudio/:',
                '  - knowledge/context.md — Project overview, what this project is, who it is for',
                '  - knowledge/architecture.md — Architecture decisions, module boundaries, data flow',
                '  - knowledge/conventions.md — Coding conventions, naming rules, formatting, patterns',
                '  - knowledge/stack.md — Detailed tech stack: languages, frameworks, deps with versions',
                '  - knowledge/boundaries.md — Always do / Ask first / Never do rules',
                '  - codestudio-instructions.md — Combined agent instructions for this project',
                'Then call engineering_start_workflow with the objective, workType, complexity, and riskLevel.',
              ],
            },
            null,
            2,
          ),
        ),
      ]);
    } catch (err) {
      throw new Error(
        `Failed to create .codestudio/: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
