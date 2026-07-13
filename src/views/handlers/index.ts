/**
 * Handler registry — aggregates all domain handler registrations.
 *
 * Each domain file exports a `HandlerRegistration` object mapping
 * message type strings to handler functions. This index merges them
 * into a single flat registry used by the message router.
 *
 * To add a new domain:
 * 1. Create `src/views/handlers/my-domain.handlers.ts`
 * 2. Export `myDomainHandlers: HandlerRegistration`
 * 3. Import and spread it here
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md §2.3
 */

import type { HandlerRegistration } from '../message-handler-types';
import { workflowHandlers } from './workflow.handlers';
import { artifactHandlers } from './artifact.handlers';
import { stageHandlers } from './stage.handlers';
import { approvalHandlers } from './approval.handlers';
import { onboardingHandlers } from './onboarding.handlers';
import { settingsHandlers } from './settings.handlers';
import { knowledgeHandlers } from './knowledge.handlers';
import { historyHandlers } from './history.handlers';
import { pluginHandlers } from './plugin.handlers';
import { agentHandlers } from './agent.handlers';

/**
 * All registered handlers — merged from domain modules.
 *
 * If two domains accidentally register the same message type,
 * the last one wins. The router integration test catches this.
 */
export const HANDLER_REGISTRY: Readonly<Record<string, HandlerRegistration[string]>> = {
  ...workflowHandlers,
  ...artifactHandlers,
  ...stageHandlers,
  ...approvalHandlers,
  ...onboardingHandlers,
  ...settingsHandlers,
  ...knowledgeHandlers,
  ...historyHandlers,
  ...pluginHandlers,
  ...agentHandlers,
  // 'navigate' is handled in-webview — no host handler needed.
  // Register a no-op so it passes validation but does nothing.
  navigate: async () => {},
};
