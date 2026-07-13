/**
 * Workflow lifecycle handlers.
 *
 * Handles: requestState, requestContext, analyzeObjective, startWorkflow,
 * advanceStage, pauseWorkflow, resumeWorkflow, cancelWorkflow, deleteWorkflow.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost, RiskAssessment } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import { extractListValues, extractSingleValue } from '../helpers/context-parser';
import { WORKFLOW_DIR, STACK_FILE, CONVENTIONS_FILE } from '../../constants';
import { cancelAgent } from './agent.handlers';

export const workflowHandlers: HandlerRegistration = {
  requestState: handleRequestState,
  requestContext: handleRequestContext,
  analyzeObjective: handleAnalyzeObjective,
  startWorkflow: handleStartWorkflow,
  advanceStage: handleAdvanceStage,
  pauseWorkflow: handlePauseWorkflow,
  resumeWorkflow: handleResumeWorkflow,
  cancelWorkflow: handleCancelWorkflow,
  deleteWorkflow: handleDeleteWorkflow,
  refreshWorkflow: handleRefreshWorkflow,
};

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestState(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const workflow = await deps.stateManager.load();
  reply({ type: 'state', workflow });
}

async function handleRequestContext(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'context', context: null });
    return;
  }

  // Read context from .codestudio/knowledge/stack.md if it exists (agent creates this)
  const stackPath = `${root}/${WORKFLOW_DIR}/${STACK_FILE}`;
  let languages: string[] = [];
  let frameworks: string[] = [];
  let testFramework: string | null = null;
  let packageManager: string | null = null;
  let detectedStack: string[] = [];

  try {
    if (await deps.fileSystem.exists(stackPath)) {
      const content = await deps.fileSystem.read(stackPath);
      // Parse simple key-value patterns from the markdown
      const lines = content.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('language') && line.includes(':')) {
          languages = extractListValues(line);
        } else if (lower.includes('framework') && line.includes(':')) {
          frameworks = extractListValues(line);
        } else if (lower.includes('test') && line.includes(':')) {
          testFramework = extractSingleValue(line);
        } else if (lower.includes('package manager') && line.includes(':')) {
          packageManager = extractSingleValue(line);
        }
      }
      detectedStack = [...languages, ...frameworks].filter(Boolean);
    }
  } catch {
    // stack.md not yet created by agent — return defaults
  }

  // Read conventions from .codestudio/conventions.md if it exists
  let conventions: string[] = [];
  try {
    const convPath = `${root}/${WORKFLOW_DIR}/${CONVENTIONS_FILE}`;
    if (await deps.fileSystem.exists(convPath)) {
      const content = await deps.fileSystem.read(convPath);
      // Extract bullet points as conventions
      conventions = content
        .split('\n')
        .filter((l) => l.trim().startsWith('- '))
        .map((l) => l.trim().replace(/^- /, ''))
        .slice(0, 20); // Cap at 20 to avoid flooding the UI
    }
  } catch {
    // conventions.md not yet created
  }

  reply({
    type: 'context',
    context: {
      rootPath: root,
      languages,
      frameworks,
      testFramework,
      packageManager,
      detectedStack,
      conventions,
      generatedAt: new Date().toISOString(),
    },
  });
}

async function handleAnalyzeObjective(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  const { objective } = msg as Extract<MessageToHost, { type: 'analyzeObjective' }>;
  // Fence user input to prevent prompt injection
  const fencedObjective = objective.replace(/```/g, '` ` `');
  const prompt = `The user wants to work on the following objective:

\`\`\`user-input
${fencedObjective}
\`\`\`

Call \`engineering_update_status\` to report progress as you work.

## Step 1: Evaluate clarity

First, assess whether the objective is clear enough to start work:
- Is it specific enough to understand what needs to be built or changed?
- Does it make sense in the context of this project?
- Are there obvious ambiguities that would lead to wrong implementation?

**If the objective is vague, unclear, or nonsensical:**
Ask the user 1-3 clarifying questions to understand what they actually want. Use the **interview-me** skill approach — ask one question at a time. Do NOT start the workflow until you understand the requirement.

**If the objective is clear enough to proceed:**
Go to Step 2.

## Step 2: Start the workflow

Call \`engineering_start_workflow\` tool with:
- objective: the clarified objective (use the user's original if it was already clear)
- workType: your assessment (feature/bugfix/refactor/infrastructure/documentation/security)
- complexity: your assessment (trivial/simple/moderate/complex/critical)
- riskLevel: your assessment (low/medium/high)
- processLevel: your assessment — choose based on the task:
  • **light** (3 stages: plan→build→verify) — typo fixes, docs, config changes, simple bug fixes
  • **standard** (5 stages: define→plan→build→verify→review) — normal features, bugs, refactors with spec + review
  • **thorough** (6 stages: define→plan→build→verify→review→ship) — complex features, architecture, security
  • **guarded** (6 stages + extra gates) — DB migrations, auth/payment, breaking changes
- contextSignals: what the project touches

Determine ALL fields yourself based on the objective and project context. Be realistic — don't over-assess simple tasks.`;

  await deps.agentBridge.sendToChat(prompt);
}

async function handleStartWorkflow(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const { objective, assessment } = msg as Extract<MessageToHost, { type: 'startWorkflow' }>;

  // 0. Handle existing workflow
  const existing = await deps.stateManager.load();
  if (existing) {
    if (existing.state.status === 'active' || existing.state.status === 'paused') {
      const verb = existing.state.status === 'paused' ? 'paused' : 'active';
      reply({
        type: 'error',
        message: `A workflow is already ${verb}. Cancel or complete it before starting a new one.`,
      });
      return;
    }
    if (existing.state.status === 'completed' || existing.state.status === 'failed') {
      await deps.historyManager.archiveWorkflow(existing);
      await deps.stateManager.clear();
    }
  }

  // 1. Generate workflow definition (stages, gates, skills, approvals)
  const wf = deps.workflowGenerator.generate(
    `wf-${Date.now()}`,
    objective,
    assessment as unknown as RiskAssessment,
  );

  // 2. Start the workflow — transitions from idle → active, activates first stage
  const started = await deps.workflowEngine.start(wf);

  // 3. Save workflow state atomically
  await deps.stateManager.save(started);

  // 4. Save objective to .codestudio/workflows/current/objective.md
  await deps.artifactManager.saveObjective(objective);

  reply({ type: 'state', workflow: started });
}

async function handleAdvanceStage(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.advanceStage(wf));
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'No active workflow' });
  }
}

async function handlePauseWorkflow(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.pause(wf));
    await cancelAgent(); // Stop the agent
    reply({ type: 'agentStatus', status: 'idle' }); // Reset agent status
    reply({ type: 'state', workflow: updated });
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : 'Cannot pause workflow' });
  }
}

async function handleResumeWorkflow(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  try {
    const updated = await deps.stateManager.update((wf) => deps.workflowEngine.resume(wf));
    reply({ type: 'state', workflow: updated });

    const stage = updated.state.currentStage;
    if (stage) {
      reply({
        type: 'agentStatus',
        status: 'working',
        message: `Resuming ${stage} stage...`,
      });

      // Build the full prompt for the current stage
      const artifacts = await deps.artifactManager.listAll();
      const specPath = artifacts.find((a) => a.type === 'spec')?.path;
      const planPath = artifacts.find((a) => a.type === 'plan')?.path;
      const prompt = deps.promptTemplates.getPromptForStage(stage, {
        objective: updated.objective,
        context: null,
        signals: updated.detectedRisks,
        processLevel: updated.processLevel,
        specPath,
        planPath,
      });

      await deps.agentBridge.sendToChat(
        prompt ?? `Continue working on the ${stage} stage for: ${updated.objective}`,
      );
    }
  } catch (err) {
    reply({
      type: 'error',
      message: err instanceof Error ? err.message : 'Cannot resume workflow',
    });
  }
}

async function handleCancelWorkflow(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const wf = await deps.stateManager.load();

  if (wf) {
    await deps.historyManager.archiveWorkflow(wf);
    await deps.stateManager.clear();
  }

  reply({ type: 'state', workflow: null });
}

async function handleDeleteWorkflow(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  await cancelAgent(); // Stop the agent

  // Clear state and artifacts WITHOUT archiving
  await deps.stateManager.clear();
  await deps.historyManager.clearCurrent();

  // Reset UI
  reply({ type: 'state', workflow: null });
}

/**
 * Refresh workflow state from disk and reset agent status.
 *
 * Used when the UI gets out of sync — e.g., the user stopped the agent
 * via the chat panel's Stop button (which doesn't notify the extension),
 * or after a Code Studio restart where the agent context was lost.
 *
 * Reloads workflow.json, resets agentStatus to idle, and refreshes
 * the stage detail so the UI reflects the true on-disk state.
 */
async function handleRefreshWorkflow(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  // 1. Reload workflow state from disk
  const workflow = await deps.stateManager.load();
  reply({ type: 'state', workflow });

  // 2. Reset agent status to idle — clears any stale "working" state
  reply({ type: 'agentStatus', status: 'idle' });

  // 3. Refresh stage detail if workflow exists
  if (workflow) {
    const action = deps.stageExecutor.getStageAction(workflow);
    const artifacts = await deps.artifactManager.listAll();
    const completion = deps.stageExecutor.evaluateStageCompletion(workflow, artifacts);
    const instructions = deps.stageExecutor.getStageInstructions(workflow);

    reply({
      type: 'stageDetail',
      stage: workflow.state.currentStage,
      action,
      completion,
      instructions,
      artifacts,
    });
  }
}
