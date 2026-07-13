/**
 * Parses todo.md files to extract task progress.
 *
 * The todo.md format is a standard markdown checklist:
 *   - [ ] 1. Task title (size)
 *   - [x] 2. Completed task title (size)
 *
 * This parser is intentionally simple — it counts `- [x]` and `- [ ]`
 * patterns. The agent creates the file, the extension reads it.
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 */

import type { TodoProgress, TodoTask, TodoTaskStatus } from './types';

/**
 * Parse a todo.md file content into structured TodoProgress.
 */
export function parseTodoMd(content: string): TodoProgress {
  const lines = content.split('\n');
  const tasks: TodoTask[] = [];

  for (const line of lines) {
    // Match: - [x] 1. Task title  OR  - [ ] 1. Task title
    const match = line.match(/^- \[([ x])\]\s*(\d+)\.\s*(.+)$/);
    if (match) {
      const status: TodoTaskStatus = match[1] === 'x' ? 'done' : 'pending';
      tasks.push({
        id: parseInt(match[2], 10),
        title: match[3].trim(),
        status,
      });
    }
  }

  const completed = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Current task = first non-done task
  const currentTask = tasks.find((t) => t.status !== 'done')?.id ?? null;

  return { tasks, completed, total, percentage, currentTask };
}

/**
 * Generate a human-readable summary of todo progress for prompts.
 * Used when resuming a Build stage to tell the agent what's done.
 */
export function generateTodoSummary(progress: TodoProgress): string {
  if (progress.total === 0) return 'No tasks found in todo.md.';

  const lines: string[] = [];
  lines.push(
    `**Progress: ${progress.completed}/${progress.total} tasks (${progress.percentage}%)**\n`,
  );

  // List completed tasks
  const doneTasks = progress.tasks.filter((t) => t.status === 'done');
  if (doneTasks.length > 0) {
    lines.push('**Completed:**');
    for (const t of doneTasks) {
      lines.push(`- ✅ ${t.id}. ${t.title}`);
    }
    lines.push('');
  }

  // Show next task
  const nextTask = progress.tasks.find((t) => t.status !== 'done');
  if (nextTask) {
    lines.push(`**Next task:** ${nextTask.id}. ${nextTask.title}`);
    lines.push('');
  }

  // List remaining tasks
  const pendingTasks = progress.tasks.filter((t) => t.status !== 'done');
  if (pendingTasks.length > 1) {
    lines.push('**Remaining:**');
    for (const t of pendingTasks) {
      lines.push(`- ${t.id}. ${t.title}`);
    }
  }

  return lines.join('\n');
}
