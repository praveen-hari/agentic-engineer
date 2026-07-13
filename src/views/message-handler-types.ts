/**
 * Shared types for the webview message handling system.
 *
 * These types define the contract between the message router and
 * domain-specific handler modules. Each handler file imports from
 * here — never from the router or other handler files.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md
 */

import type { StateManager } from '../core/state-manager';
import type { WorkflowEngine } from '../core/workflow-engine';
import type { WorkflowGenerator } from '../core/workflow-generator';
import type { StageExecutor } from '../core/stage-executor';
import type { PromptTemplates } from '../core/prompt-templates';
import type { NotificationService } from '../services/notification.service';
import type { WorkspaceService } from '../services/workspace.service';
import type { ArtifactManager } from '../services/artifact-manager.service';
import type { AgentBridge } from '../services/agent-bridge.service';
import type { HistoryManager } from '../services/history-manager.service';
import type { PluginRegistryService } from '../services/plugin-registry.service';
import type { MessageToHost, MessageToWebview } from '../core/types';

/**
 * Callback to send a response message back to the webview.
 */
export type ReplyFn = (message: MessageToWebview) => void;

/**
 * Dependencies for the webview message handler.
 *
 * Simplified: no RiskEngine, no ProjectDetector, no ContextAnalyzer,
 * no ContextSignalDetector, no SkillEngine, no GateRunner, no
 * CapabilityRecommender. The agent handles all intelligence via tools.
 */
export interface MessageHandlerDeps {
  readonly stateManager: StateManager;
  readonly workflowEngine: WorkflowEngine;
  readonly workflowGenerator: WorkflowGenerator;
  readonly stageExecutor: StageExecutor;
  readonly notificationService: NotificationService;
  readonly workspaceService: WorkspaceService;
  readonly fileSystem: import('../core/types').FileIO;
  readonly artifactManager: ArtifactManager;
  readonly promptTemplates: PromptTemplates;
  readonly agentBridge: AgentBridge;
  readonly historyManager: HistoryManager;
  /**
   * Reads the current approval mode from config.
   * Function (not static value) so it always reflects the latest setting.
   * Returns 'user' by default if config is missing or corrupt.
   */
  readonly readApprovalMode: () => Promise<'user' | 'agent'>;
  /**
   * Plugin registry service for marketplace operations.
   * Optional — if not provided, plugin messages are silently ignored.
   */
  readonly pluginRegistry?: PluginRegistryService;
}

/**
 * A single message handler function.
 *
 * Uniform signature: every handler receives the full typed message,
 * the dependency bag, and the reply callback. The handler extracts
 * the fields it needs from `msg` (TypeScript narrows via the
 * discriminated union).
 */
export type MessageHandler = (
  msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
) => Promise<void>;

/**
 * A handler registration — maps message type strings to handler functions.
 * Each domain file exports one of these.
 */
export type HandlerRegistration = Readonly<Record<string, MessageHandler>>;
