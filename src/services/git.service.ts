/**
 * Git service — detects branch and repo status (DD-005).
 *
 * Uses VS Code's built-in Git extension API when available.
 * Falls back to null when Git is not initialized.
 */
export class GitService {
  constructor(private readonly vscode: typeof import('vscode')) {}

  /**
   * Get the current Git branch name, or null if not in a Git repo.
   */
  async getCurrentBranch(): Promise<string | null> {
    try {
      const gitExtension = this.vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) return null;

      const gitApi = gitExtension.isActive ? gitExtension.exports?.getAPI?.(1) : undefined;
      if (!gitApi) return null;

      const repos = gitApi?.repositories;
      if (!repos || repos.length === 0) return null;

      const repo = repos[0];
      return repo?.state?.HEAD?.name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if the workspace is a Git repository.
   */
  async isGitRepo(): Promise<boolean> {
    const branch = await this.getCurrentBranch();
    return branch !== null;
  }
}
