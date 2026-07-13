/**
 * Artifact CRUD handlers.
 *
 * Handles: requestArtifacts, requestArtifactContent, openArtifact,
 * notifyArtifactDetected.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { WORKFLOW_DIR } from '../../constants';
import { requestStageDetail } from './stage.handlers';

export const artifactHandlers: HandlerRegistration = {
  requestArtifacts: handleRequestArtifacts,
  requestArtifactContent: handleRequestArtifactContent,
  openArtifact: handleOpenArtifact,
  notifyArtifactDetected: handleNotifyArtifactDetected,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestArtifacts(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const artifacts = await deps.artifactManager.listAll();
  reply({ type: 'artifacts', artifacts });
}

/**
 * Read an artifact's content from disk and return it to the webview.
 * Used for inline artifact preview in the stage accordion.
 */
async function handleRequestArtifactContent(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { artifactId } = msg as Extract<MessageToHost, { type: 'requestArtifactContent' }>;
  const artifacts = await deps.artifactManager.listAll();
  const artifact = artifacts.find((a) => a.id === artifactId);

  if (!artifact) {
    reply({ type: 'artifactContent', artifactId, content: null });
    return;
  }

  const content = await deps.artifactManager.read(artifact);
  reply({ type: 'artifactContent', artifactId, content });
}

/**
 * Open an artifact file in the VS Code editor for review.
 */
async function handleOpenArtifact(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { artifactId } = msg as Extract<MessageToHost, { type: 'openArtifact' }>;
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'error', message: 'No workspace open' });
    return;
  }

  const artifacts = await deps.artifactManager.listAll();
  const artifact = artifacts.find((a) => a.id === artifactId);

  if (!artifact) {
    reply({ type: 'error', message: `Artifact "${artifactId}" not found` });
    return;
  }

  const fullPath = `${root}/${WORKFLOW_DIR}/${artifact.path}`;
  await deps.workspaceService.openFileInEditor(fullPath);
}

/**
 * Called when the ArtifactWatcher detects a new or changed artifact.
 * Resets agent status to idle, forwards the artifact to the webview,
 * and sends a refreshed stageDetail so the UI updates immediately.
 */
async function handleNotifyArtifactDetected(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { artifact } = msg as Extract<MessageToHost, { type: 'notifyArtifactDetected' }>;

  // Guard: ignore artifact notifications when no workflow is active.
  const wf = await deps.stateManager.load();
  if (!wf) return;

  // 1. Forward the artifact to the webview
  reply({ type: 'artifactDetected', artifact });

  // 2. Reset agent status to idle
  reply({ type: 'agentStatus', status: 'idle' });

  // 3. Refresh stage detail so the UI shows the new artifact
  await requestStageDetail(deps, reply);
}
