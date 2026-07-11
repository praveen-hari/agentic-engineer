import type { ProjectDetector } from '../../core/project-detector';
import type { ContextAnalyzer } from '../../core/context-analyzer';
import type { ProjectContext } from '../../core/types';

/**
 * Input for the get_project_context language model tool.
 */
export interface GetProjectContextInput {
  readonly refresh?: boolean;
}

/**
 * Result from the get_project_context tool.
 */
export interface GetProjectContextResult {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly testFramework: string | null;
  readonly packageManager: string | null;
  readonly conventions: readonly string[];
  readonly markdown: string;
}

/**
 * Language Model Tool: get_project_context (SPEC §5.1).
 *
 * Returns the auto-generated project context — detected stack,
 * conventions, and relevant context signals.
 */
export class GetProjectContextTool {
  constructor(
    private readonly projectDetector: ProjectDetector,
    private readonly contextAnalyzer: ContextAnalyzer,
  ) {}

  /**
   * Prepare the invocation.
   */
  prepareInvocation(input: GetProjectContextInput): {
    invocationMessage: string;
    confirmationTitle: string;
    confirmationMessage: string;
  } {
    return {
      invocationMessage: input.refresh ? 'Re-analyzing project...' : 'Fetching project context...',
      confirmationTitle: 'Get Project Context',
      confirmationMessage: input.refresh
        ? 'Force re-analysis of the workspace?'
        : 'Retrieve the analyzed project context?',
    };
  }

  /**
   * Execute the tool — returns the project context.
   *
   * @param files The workspace file list (from VS Code file system API)
   * @param rootPath The workspace root path
   */
  async invoke(
    files: Parameters<ProjectDetector['detect']>[0],
    rootPath: string,
  ): Promise<GetProjectContextResult> {
    const detection = this.projectDetector.detect(files);
    const context: ProjectContext = this.projectDetector.toContext(detection, rootPath);
    const markdown = this.contextAnalyzer.generateMarkdown(context);

    return {
      languages: context.languages,
      frameworks: context.frameworks,
      testFramework: context.testFramework,
      packageManager: context.packageManager,
      conventions: context.conventions,
      markdown,
    };
  }
}
