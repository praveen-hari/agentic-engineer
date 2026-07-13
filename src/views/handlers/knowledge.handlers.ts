/**
 * Knowledge file handlers.
 *
 * Handles: requestKnowledge, refreshKnowledge, openKnowledgeFile.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §3
 */

import type { MessageToHost } from '../../core/types';
import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import {
  WORKFLOW_DIR,
  ARCHITECTURE_FILE,
  CONVENTIONS_FILE,
  STACK_FILE,
  BOUNDARIES_FILE,
  INSTRUCTIONS_FILE,
} from '../../constants';

export const knowledgeHandlers: HandlerRegistration = {
  requestKnowledge: handleRequestKnowledge,
  refreshKnowledge: handleRefreshKnowledge,
  openKnowledgeFile: handleOpenKnowledgeFile,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** All knowledge files with their display info. */
const KNOWLEDGE_FILES = [
  { name: 'architecture.md', path: ARCHITECTURE_FILE, icon: '🏗️' },
  { name: 'conventions.md', path: CONVENTIONS_FILE, icon: '📐' },
  { name: 'stack.md', path: STACK_FILE, icon: '🔧' },
  { name: 'boundaries.md', path: BOUNDARIES_FILE, icon: '🚧' },
  { name: 'codestudio-instructions.md', path: INSTRUCTIONS_FILE, icon: '📋' },
] as const;

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRequestKnowledge(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) {
    reply({ type: 'knowledgeFiles', files: [] });
    return;
  }

  const base = `${root}/${WORKFLOW_DIR}`;
  const files = await Promise.all(
    KNOWLEDGE_FILES.map(async (kf) => {
      const fullPath = `${base}/${kf.path}`;
      let exists = false;
      let preview = '';
      let updatedAt: string | null = null;

      try {
        if (await deps.fileSystem.exists(fullPath)) {
          exists = true;
          const content = await deps.fileSystem.read(fullPath);
          const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
          preview = (lines[0] ?? '').trim().slice(0, 120);
          updatedAt = new Date().toISOString();
        }
      } catch {
        // File read error — treat as not existing
      }

      return {
        name: kf.name,
        path: kf.path,
        exists,
        preview,
        updatedAt,
      };
    }),
  );

  reply({ type: 'knowledgeFiles', files });
}

async function handleRefreshKnowledge(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const prompt = `Refresh the project knowledge files in .codestudio/knowledge/.

## Instructions
1. Scan the workspace thoroughly — read package.json, source files, config files, tests, README, etc.
2. Compare what you find with the existing knowledge files in .codestudio/knowledge/.
3. Update ONLY the files that have drifted from reality. Do NOT overwrite user-added notes.
4. For each file, read the existing content first, then update only what changed:
   - \`knowledge/architecture.md\` — Architecture, module boundaries, patterns, data flow
   - \`knowledge/conventions.md\` — Coding conventions, naming, formatting, patterns
   - \`knowledge/stack.md\` — Tech stack: languages, frameworks, deps with versions
   - \`knowledge/boundaries.md\` — Always do / Ask first / Never do rules
   - \`codestudio-instructions.md\` — Update knowledge file references if paths changed; add any new project-specific rules

**Important:** Base everything on the ACTUAL codebase. Read real files. Don't guess.
**Important:** codestudio-instructions.md should reference knowledge files by path, NOT duplicate their content.
After updating, summarize what changed.`;

  await deps.agentBridge.sendToChat(prompt);

  reply({
    type: 'agentStatus',
    status: 'working',
    message: 'Refreshing project knowledge...',
  });
}

async function handleOpenKnowledgeFile(
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  _reply: ReplyFn,
): Promise<void> {
  const { fileName } = msg as Extract<MessageToHost, { type: 'openKnowledgeFile' }>;
  const root = deps.workspaceService.getWorkspaceRoot();
  if (!root) return;

  const filePath = `${root}/${WORKFLOW_DIR}/${fileName}`;
  try {
    const vscodeModule = await import('vscode');
    const uri = vscodeModule.Uri.file(filePath);
    await vscodeModule.window.showTextDocument(uri);
  } catch {
    // File doesn't exist or can't be opened
  }
}
