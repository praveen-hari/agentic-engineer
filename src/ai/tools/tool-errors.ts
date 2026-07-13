/**
 * Structured error responses for Language Model Tools.
 *
 * Instead of `throw new Error(...)` (which gives the agent an opaque
 * string), tools return a JSON response with machine-readable fields
 * so the agent can programmatically decide what to do.
 *
 * Error codes are stable identifiers the agent can switch on.
 * `suggestedAction` tells the agent exactly what to do next.
 * `retryable` prevents infinite retry loops.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §7 (Resilience)
 */

// ─── Error Codes ────────────────────────────────────────────────────────────

export type ToolErrorCode =
  | 'NO_ACTIVE_WORKFLOW'
  | 'WORKFLOW_NOT_ACTIVE'
  | 'WORKFLOW_ALREADY_EXISTS'
  | 'STAGE_BLOCKED'
  | 'VERSION_CONFLICT'
  | 'MISSING_ARTIFACT'
  | 'ARTIFACT_NOT_FOUND'
  | 'FILESYSTEM_ERROR'
  | 'NO_WORKSPACE'
  | 'INVALID_INPUT';

// ─── Error Response Type ────────────────────────────────────────────────────

export interface ToolErrorResponse {
  readonly success: false;
  /** Machine-readable error code — agent can switch on this. */
  readonly errorCode: ToolErrorCode;
  /** Human-readable error message. */
  readonly message: string;
  /** Can the agent fix this itself (true) or must the user intervene (false)? */
  readonly recoverable: boolean;
  /** Should the agent retry the exact same call? */
  readonly retryable: boolean;
  /** What the agent should do instead. */
  readonly suggestedAction: string;
  /** Extra context for specific error types. */
  readonly details?: Record<string, unknown>;
}

// ─── Builder ────────────────────────────────────────────────────────────────

/**
 * Build a structured error response as a LanguageModelToolResult.
 *
 * Usage:
 * ```ts
 * return toolError(vscodeModule, {
 *   errorCode: 'NO_ACTIVE_WORKFLOW',
 *   message: 'No active workflow exists.',
 *   recoverable: true,
 *   retryable: false,
 *   suggestedAction: 'Call engineering_start_workflow first.',
 * });
 * ```
 */
export function toolError(
  vscodeModule: typeof import('vscode'),
  error: Omit<ToolErrorResponse, 'success'>,
): InstanceType<typeof vscodeModule.LanguageModelToolResult> {
  const response: ToolErrorResponse = {
    success: false,
    ...error,
  };

  return new vscodeModule.LanguageModelToolResult([
    new vscodeModule.LanguageModelTextPart(JSON.stringify(response, null, 2)),
  ]);
}

// ─── Pre-built Error Factories ──────────────────────────────────────────────

export function noActiveWorkflowError(
  vscodeModule: typeof import('vscode'),
): InstanceType<typeof vscodeModule.LanguageModelToolResult> {
  return toolError(vscodeModule, {
    errorCode: 'NO_ACTIVE_WORKFLOW',
    message: 'No active workflow exists.',
    recoverable: true,
    retryable: false,
    suggestedAction:
      'Call engineering_start_workflow to create and start a workflow first.',
  });
}

export function workflowNotActiveError(
  vscodeModule: typeof import('vscode'),
  currentStatus: string,
): InstanceType<typeof vscodeModule.LanguageModelToolResult> {
  const actions: Record<string, string> = {
    paused: 'The workflow is paused. Ask the user to resume it from the Engineering Workspace panel.',
    completed: 'The workflow is already completed. Start a new workflow with engineering_start_workflow.',
    failed: 'The workflow has failed. Start a new workflow with engineering_start_workflow.',
    idle: 'The workflow has not been started yet. It should auto-start — this may be a bug.',
  };

  return toolError(vscodeModule, {
    errorCode: 'WORKFLOW_NOT_ACTIVE',
    message: `Workflow is "${currentStatus}", not "active". Cannot perform this operation.`,
    recoverable: currentStatus === 'paused',
    retryable: false,
    suggestedAction: actions[currentStatus] ?? `Workflow is in unexpected state "${currentStatus}".`,
    details: { currentStatus },
  });
}

export function filesystemError(
  vscodeModule: typeof import('vscode'),
  operation: string,
  originalError: string,
): InstanceType<typeof vscodeModule.LanguageModelToolResult> {
  return toolError(vscodeModule, {
    errorCode: 'FILESYSTEM_ERROR',
    message: `Filesystem operation failed: ${operation}`,
    recoverable: false,
    retryable: false,
    suggestedAction:
      'A filesystem error occurred. Ask the user to check file permissions and disk space.',
    details: { operation, originalError },
  });
}
