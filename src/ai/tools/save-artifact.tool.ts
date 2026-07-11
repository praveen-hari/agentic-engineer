import type * as vscode from 'vscode';
import type { ArtifactType, LifecycleStage, Artifact } from '../../core/types';
import type { ArtifactManager } from '../../services/artifact-manager.service';

/**
 * Input for the engineering_save_artifact tool.
 */
export interface SaveArtifactInput {
  readonly type: ArtifactType;
  readonly title: string;
  readonly content: string;
  readonly stage: LifecycleStage;
}

/**
 * Language Model Tool: engineering_save_artifact
 *
 * Saves an artifact (spec, plan, review, report) to the correct
 * .codestudio/artifacts/ directory. Called by the agent after
 * generating a spec, plan, review, etc.
 *
 * The ArtifactWatcher will detect the new file and update the UI.
 */
export class SaveArtifactTool implements vscode.LanguageModelTool<SaveArtifactInput> {
  constructor(
    private readonly artifactManager: ArtifactManager,
    private readonly onArtifactSaved: (artifact: Artifact) => void,
  ) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<SaveArtifactInput>,
    _token: vscode.CancellationToken,
  ) {
    return {
      invocationMessage: `Saving ${options.input.type}: "${options.input.title}"`,
      confirmationMessages: {
        title: `Save ${options.input.type}`,
        message: new (await import('vscode')).MarkdownString(
          `Save this ${options.input.type} artifact?\n\n**${options.input.title}**\n\n\`\`\`markdown\n${options.input.content.slice(0, 200)}${options.input.content.length > 200 ? '...' : ''}\n\`\`\``,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SaveArtifactInput>,
    _token: vscode.CancellationToken,
  ) {
    const vscodeModule = await import('vscode');
    const { type, title, content, stage } = options.input;

    const artifact = await this.artifactManager.save(type, title, content, stage);

    // Notify extension
    this.onArtifactSaved(artifact);

    return new vscodeModule.LanguageModelToolResult([
      new vscodeModule.LanguageModelTextPart(JSON.stringify({
        success: true,
        artifactId: artifact.id,
        path: artifact.path,
        type: artifact.type,
        stage: artifact.stage,
        message: `Artifact saved to ${artifact.path}. The user can review and approve it in the Engineering Workspace sidebar.`,
        nextSteps: [
          'Wait for the user to review and approve the artifact in the sidebar.',
          'Once approved, call engineering_advance_stage to move to the next stage.',
        ],
      }, null, 2)),
    ]);
  }
}
