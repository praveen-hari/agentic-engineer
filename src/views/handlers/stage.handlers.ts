/**
 * Stage execution handlers.
 *
 * Handles: requestStageActions, requestStageDetail, executeStage,
 * sendToAgent, generateArtifact.
 *
 * Also exports `requestStageDetail` for use by artifact.handlers
 * (notifyArtifactDetected needs to refresh stage detail).
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { LifecycleStage, MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { isApprovalForCurrentStage } from './approval.handlers';

export const stageHandlers: HandlerRegistration = {
  requestStageActions: handleRequestStageActions,
  requestStageDetail: handleRequestStageDetail,
  executeStage: handleExecuteStage,
  sendToAgent: handleSendToAgent,
  generateArtifact: handleGenerateArtifact,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestStageActions(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'stageActions', actions: null });
    return;
  }
  const action = deps.stageExecutor.getStageAction(wf);
  reply({ type: 'stageActions', actions: action });
}

async function handleRequestStageDetail(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  await requestStageDetail(deps, reply);
}

async function handleExecuteStage(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  try {
    // Step 1: Auto-approve ONLY current-stage approvals and gates.
    const approved = await deps.stateManager.update((wf) => {
      const currentStage = wf.state.currentStage;
      const stageApprovals = wf.approvals.filter(
        (a) => a.status === 'pending' && isApprovalForCurrentStage(a.artifact, currentStage),
      );
      const stageGates = wf.qualityGates.filter(
        (g) => g.status === 'pending' && g.stage === currentStage,
      );
      const hasPendingWork = stageApprovals.length > 0 || stageGates.length > 0;

      if (!hasPendingWork) return wf;

      const approvalIds = new Set(stageApprovals.map((a) => a.id));
      const now = new Date().toISOString();
      return {
        ...wf,
        approvals: wf.approvals.map((a) =>
          approvalIds.has(a.id) ? { ...a, status: 'approved' as const, approvedAt: now } : a,
        ),
        qualityGates: wf.qualityGates.map((g) => {
          if (g.status !== 'pending' || g.stage !== currentStage) return g;
          return {
            ...g,
            status: 'passed' as const,
            result: { passedAt: now, details: 'Approved by user' },
          };
        }),
      };
    });

    // Step 2: Check if stage can advance
    const artifacts = await deps.artifactManager.listAll();
    const result = deps.stageExecutor.evaluateStageCompletion(approved, artifacts);

    if (result.status === 'completed') {
      // Step 3: Advance to next stage (separate update for version safety)
      const advanced = await deps.stateManager.update((wf) => deps.workflowEngine.advanceStage(wf));

      // Step 4: Archive and clear if workflow is now completed
      if (advanced.state.status === 'completed') {
        await deps.historyManager.archiveWorkflow(advanced);
        await deps.stateManager.clear();

        // Step 5: Update knowledge files based on what changed.
        const completedStages = advanced.stages
          .filter((s) => s.status === 'completed')
          .map((s) => s.name)
          .join(' → ');
        const currentApprovalMode = await deps.readApprovalMode();
        const knowledgePrompt =
          currentApprovalMode === 'agent'
            ? `The workflow "${advanced.objective}" is complete (${completedStages}).

You just completed this entire workflow — you know exactly what changed. Now update the project knowledge files to reflect the current state of the codebase:

1. Read each knowledge file in \`.codestudio/knowledge/\`
2. Compare with what you know changed during this workflow
3. Update ONLY the sections that are now outdated:
   - \`knowledge/architecture.md\` — if you added modules, changed patterns, or modified data flow
   - \`knowledge/stack.md\` — if you added dependencies, changed versions, or added tools
   - \`knowledge/conventions.md\` — if you established new patterns or changed existing ones
   - \`knowledge/boundaries.md\` — if you discovered new "always do" or "never do" rules
   - \`codestudio-instructions.md\` — if knowledge file paths changed or new project rules emerged

Do NOT rewrite files from scratch — only update what this workflow changed. Preserve user-added notes.`
            : `The workflow "${advanced.objective}" is complete (${completedStages}).

You just completed this entire workflow — you know exactly what changed. Check if the project knowledge files need updating:

1. Read each file in \`.codestudio/knowledge/\`
2. List which files are now outdated based on what you changed
3. For each outdated file, show the user what you'd change and ask for approval before writing

Files to check: \`architecture.md\`, \`stack.md\`, \`conventions.md\`, \`boundaries.md\`, \`codestudio-instructions.md\``;
        void deps.agentBridge.sendToChat(knowledgePrompt);
      }

      reply({ type: 'state', workflow: advanced });
    } else {
      reply({ type: 'stageResult', result });
    }
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handleSendToAgent(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { stage } = msg as Extract<MessageToHost, { type: 'sendToAgent' }>;
  await sendStageToAgent(deps, reply, stage);
}

async function handleGenerateArtifact(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { stage } = msg as Extract<MessageToHost, { type: 'generateArtifact' }>;
  await sendStageToAgent(deps, reply, stage);
}

// ─── Shared Utilities ───────────────────────────────────────────────────────

/**
 * Return combined stage detail — action, completion status, instructions,
 * and artifacts — in a single message. Exported for use by
 * artifact.handlers (notifyArtifactDetected).
 */
export async function requestStageDetail(deps: MessageHandlerDeps, reply: ReplyFn): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({
      type: 'stageDetail',
      stage: null,
      action: null,
      completion: {
        stage: 'plan',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'No active workflow',
      },
      instructions: 'No active workflow. Start a workflow first.',
      artifacts: [],
    });
    return;
  }

  const action = deps.stageExecutor.getStageAction(wf);
  const artifacts = await deps.artifactManager.listAll();
  const completion = deps.stageExecutor.evaluateStageCompletion(wf, artifacts);
  const instructions = deps.stageExecutor.getStageInstructions(wf);

  reply({
    type: 'stageDetail',
    stage: wf.state.currentStage,
    action,
    completion,
    instructions,
    artifacts,
  });
}

/**
 * Send the stage prompt to the agent and notify the webview.
 */
async function sendStageToAgent(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
  stage: LifecycleStage,
): Promise<void> {
  const wf = await deps.stateManager.load();
  if (!wf) {
    reply({ type: 'error', message: 'No active workflow' });
    return;
  }

  let specPath: string | undefined;
  let planPath: string | undefined;
  if (stage === 'plan' || stage === 'build') {
    const artifacts = await deps.artifactManager.listAll();
    specPath = artifacts.find((a) => a.type === 'spec')?.path;
    planPath = artifacts.find((a) => a.type === 'plan')?.path;
  }

  const prompt = deps.promptTemplates.getPromptForStage(stage, {
    objective: wf.objective,
    context: null,
    signals: wf.detectedRisks,
    processLevel: wf.processLevel,
    specPath,
    planPath,
  });

  if (!prompt) {
    reply({
      type: 'error',
      message: `Stage "${stage}" does not need agent-generated artifacts`,
    });
    return;
  }

  reply({
    type: 'agentStatus',
    status: 'working',
    stage,
    message: `Generating artifacts for ${stage} stage...`,
  });

  await deps.agentBridge.sendToChat(prompt);
}
