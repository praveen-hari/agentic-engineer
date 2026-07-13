# Architecture Plan: Message Handler Decomposition

> **Status:** Proposed  
> **Author:** Architecture Review  
> **Date:** 2026-07-13  
> **Scope:** `src/views/message-handler.ts` → domain-based handler modules  
> **Risk:** Low — pure refactor, no behavior change, all existing tests pass

---

## 1. Problem Statement

`message-handler.ts` is a **1,470-line monolith** containing:

- 1 giant `switch` statement routing **33 message types**
- 36 handler functions spanning **7 unrelated domains**
- Shared helpers, constants, and a mutable module-level cache (`lastProjectContext`)
- Every import in the codebase that touches webview messaging depends on this one file

**Consequences today:**

- Merge conflicts when two features touch different domains
- Cognitive load — finding the plugin handler means scrolling past 800 lines of workflow code
- No way to lazy-load or tree-shake unused domains
- Test files must mock the entire `MessageHandlerDeps` even when testing one domain

**Consequences at scale (50+ message types):**

- File becomes unmaintainable
- New contributors can't find where to add handlers
- Circular dependency risk as domains grow their own sub-dependencies

---

## 2. Target Architecture

### 2.1 Directory Structure

```
src/views/
├── message-router.ts              # Thin router — lookup table + dispatch
├── message-handler-types.ts       # Shared types: ReplyFn, MessageHandlerDeps, MessageHandler
├── handlers/
│   ├── index.ts                   # Re-exports all handler registrations
│   ├── workflow.handlers.ts       # Workflow lifecycle (start, advance, skip, pause, resume, cancel, delete)
│   ├── artifact.handlers.ts       # Artifact CRUD (request, content, open, notify, save)
│   ├── stage.handlers.ts          # Stage execution (actions, detail, execute, send-to-agent)
│   ├── approval.handlers.ts       # Approvals & gates (approve, reject, gate status)
│   ├── onboarding.handlers.ts     # Project setup (setup existing, setup new, onboarding status)
│   ├── settings.handlers.ts       # Config read/write (request, update)
│   ├── knowledge.handlers.ts      # Knowledge files (request, refresh, open)
│   ├── history.handlers.ts        # History & archive (request, detail)
│   ├── plugin.handlers.ts         # Plugin marketplace (request, install, uninstall, refresh)
│   └── agent.handlers.ts          # Agent control (cancel, status, context)
├── panel-provider.ts              # (unchanged)
└── helpers/
    └── context-parser.ts          # extractListValues, extractSingleValue, extractListFromLine
```

### 2.2 Core Abstraction: `MessageHandler`

```typescript
// message-handler-types.ts

import type { MessageToHost, MessageToWebview } from '../core/types';

/** Callback to send a response back to the webview. */
export type ReplyFn = (message: MessageToWebview) => void;

/** Dependencies injected into every handler. */
export interface MessageHandlerDeps {
  // ... (same as today — no change)
}

/**
 * A single message handler function.
 * Receives the full typed message, deps, and reply callback.
 */
export type MessageHandler<T extends MessageToHost = MessageToHost> = (
  msg: T,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
) => Promise<void>;

/**
 * A handler registration — maps message type strings to handler functions.
 * Each domain file exports one of these.
 */
export type HandlerRegistration = Readonly<Record<string, MessageHandler>>;
```

### 2.3 Router: `message-router.ts`

The router replaces the switch statement with a **lookup table**:

```typescript
// message-router.ts

import type { MessageToHost } from '../core/types';
import type { MessageHandlerDeps, ReplyFn, HandlerRegistration } from './message-handler-types';
import { workflowHandlers } from './handlers/workflow.handlers';
import { artifactHandlers } from './handlers/artifact.handlers';
import { stageHandlers } from './handlers/stage.handlers';
import { approvalHandlers } from './handlers/approval.handlers';
import { onboardingHandlers } from './handlers/onboarding.handlers';
import { settingsHandlers } from './handlers/settings.handlers';
import { knowledgeHandlers } from './handlers/knowledge.handlers';
import { historyHandlers } from './handlers/history.handlers';
import { pluginHandlers } from './handlers/plugin.handlers';
import { agentHandlers } from './handlers/agent.handlers';

/**
 * All registered handlers — merged from domain modules.
 * If two domains register the same message type, the last one wins
 * (caught by the duplicate-key unit test).
 */
const HANDLER_REGISTRY: Readonly<Record<string, MessageHandler>> = {
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
};

/** All known message types — derived from the registry. */
const VALID_MESSAGE_TYPES = new Set(Object.keys(HANDLER_REGISTRY));

/**
 * Create the webview message dispatcher.
 * Drop-in replacement for the old `handleWebviewMessage()`.
 */
export function createMessageRouter(
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): (message: unknown) => Promise<void> {
  return async (message: unknown) => {
    if (!isValidMessage(message)) return;
    const msg = message as MessageToHost;

    try {
      const handler = HANDLER_REGISTRY[msg.type];
      if (handler) {
        await handler(msg, deps, reply);
      }
      // No else — unknown types are silently dropped (same as today)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      reply({ type: 'error', message: errorMessage });
    }
  };
}

function isValidMessage(message: unknown): message is MessageToHost {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  const msg = message as { type: unknown };
  return typeof msg.type === 'string' && VALID_MESSAGE_TYPES.has(msg.type);
}
```

### 2.4 Domain Handler Example: `workflow.handlers.ts`

```typescript
// handlers/workflow.handlers.ts

import type { HandlerRegistration, MessageHandlerDeps, ReplyFn } from '../message-handler-types';
import type { MessageToHost, RiskAssessment } from '../../core/types';

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
};

// --- Each handler is a named export for direct unit testing ---

export async function handleRequestState(
  _msg: MessageToHost,
  deps: MessageHandlerDeps,
  reply: ReplyFn,
): Promise<void> {
  const workflow = await deps.stateManager.load();
  reply({ type: 'state', workflow });
}

// ... rest of handlers (same logic, just moved here)
```

---

## 3. Domain Mapping — Where Each Handler Goes

| Domain File              | Message Types                                                                                                                                                | Line Count (est.) |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `workflow.handlers.ts`   | `requestState`, `requestContext`, `analyzeObjective`, `startWorkflow`, `advanceStage`, `pauseWorkflow`, `resumeWorkflow`, `cancelWorkflow`, `deleteWorkflow` | ~300              |
| `artifact.handlers.ts`   | `requestArtifacts`, `requestArtifactContent`, `openArtifact`, `notifyArtifactDetected`                                                                       | ~100              |
| `stage.handlers.ts`      | `requestStageActions`, `requestStageDetail`, `executeStage`, `sendToAgent`, `generateArtifact`                                                               | ~250              |
| `approval.handlers.ts`   | `approve`, `reject`, `requestGateStatus`, `skipStage`                                                                                                        | ~80               |
| `onboarding.handlers.ts` | `setupExistingProject`, `setupNewProject`, `requestOnboardingStatus`                                                                                         | ~200              |
| `settings.handlers.ts`   | `requestSettings`, `updateSettings`                                                                                                                          | ~80               |
| `knowledge.handlers.ts`  | `requestKnowledge`, `refreshKnowledge`, `openKnowledgeFile`                                                                                                  | ~100              |
| `history.handlers.ts`    | `requestHistory`, `requestHistoryDetail`                                                                                                                     | ~50               |
| `plugin.handlers.ts`     | `requestPlugins`, `installPlugin`, `uninstallPlugin`, `refreshPlugins`                                                                                       | ~150              |
| `agent.handlers.ts`      | `cancelAgent`                                                                                                                                                | ~30               |

**Total: ~1,340 lines across 10 files** (vs 1,470 in one file today).  
The line count is similar — the win is **isolation**, not compression.

---

## 4. Shared Helpers — `helpers/context-parser.ts`

These utility functions are used by multiple domains (workflow, knowledge, plugins):

```typescript
// helpers/context-parser.ts

/** Extract comma-separated values after the colon in a line. */
export function extractListValues(line: string): string[] { ... }

/** Extract a single value after the colon in a line. */
export function extractSingleValue(line: string): string | null { ... }

/** Extract comma/space-separated values from a markdown line. */
export function extractListFromLine(line: string): string[] { ... }
```

---

## 5. Shared Constants — Co-located with Domain

| Constant                | Current Location                            | New Location                                                   |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `VALID_MESSAGE_TYPES`   | `message-handler.ts`                        | `message-router.ts` (auto-derived from registry)               |
| `ALLOWED_SETTINGS_KEYS` | `message-handler.ts`                        | `handlers/settings.handlers.ts`                                |
| `KNOWLEDGE_FILES`       | `message-handler.ts`                        | `handlers/knowledge.handlers.ts`                               |
| `APPROVAL_STAGE_MAP`    | `message-handler.ts`                        | `handlers/approval.handlers.ts` (+ `stage.handlers.ts` import) |
| `lastProjectContext`    | `message-handler.ts` (module-level mutable) | `handlers/plugin.handlers.ts` (encapsulated)                   |

---

## 6. Migration Strategy — Zero-Downtime, 5 Steps

### Step 1: Create the infrastructure (no behavior change)

- Create `message-handler-types.ts` with `ReplyFn`, `MessageHandlerDeps`, `MessageHandler`, `HandlerRegistration`
- Create `message-router.ts` with `createMessageRouter()` that delegates to the old `handleWebviewMessage`
- Create `helpers/context-parser.ts` with extracted utility functions
- Create empty `handlers/` directory

**Tests:** All existing tests pass unchanged. Add one test: `createMessageRouter` dispatches correctly.

### Step 2: Extract one domain as proof-of-concept

- Move `settings.handlers.ts` (smallest domain, 2 handlers, no cross-domain deps)
- Register it in the router
- Remove those cases from the old switch

**Tests:** Existing settings tests pass. Add domain-specific test file `handlers/settings.handlers.test.ts`.

### Step 3: Extract remaining domains (one PR per domain)

Order by independence (fewest cross-domain dependencies first):

1. `history.handlers.ts` (2 handlers, reads only)
2. `knowledge.handlers.ts` (3 handlers, reads + agent bridge)
3. `agent.handlers.ts` (1 handler, vscode import only)
4. `approval.handlers.ts` (3 handlers, state manager only)
5. `artifact.handlers.ts` (4 handlers, artifact manager only)
6. `plugin.handlers.ts` (4 handlers, plugin registry only)
7. `onboarding.handlers.ts` (3 handlers, agent bridge + file system)
8. `stage.handlers.ts` (5 handlers, cross-cuts workflow + artifacts + agent)
9. `workflow.handlers.ts` (9 handlers, most complex, touches everything)

**Each PR:** Extract domain → update router → delete from old switch → run full test suite.

### Step 4: Delete the old `message-handler.ts`

Once all handlers are extracted:

- Delete `message-handler.ts`
- Rename `message-router.ts` → `message-handler.ts` (preserve the import path for `extension.ts`)
- Or update `extension.ts` to import from `message-router.ts`

### Step 5: Update `extension.ts` wiring

```typescript
// Before:
import { handleWebviewMessage } from './views/message-handler';
const messageHandler = handleWebviewMessage(deps, reply);

// After:
import { createMessageRouter } from './views/message-router';
const messageHandler = createMessageRouter(deps, reply);
```

One-line change. Same signature. Same behavior.

---

## 7. Testing Strategy

### 7.1 Per-Domain Unit Tests

Each domain handler file gets its own test file:

```
src/test/views/handlers/
├── workflow.handlers.test.ts
├── artifact.handlers.test.ts
├── stage.handlers.test.ts
├── approval.handlers.test.ts
├── onboarding.handlers.test.ts
├── settings.handlers.test.ts
├── knowledge.handlers.test.ts
├── history.handlers.test.ts
├── plugin.handlers.test.ts
└── agent.handlers.test.ts
```

Each test file only mocks the deps that domain actually uses:

```typescript
// settings.handlers.test.ts — only needs fileSystem + workspaceService
const deps = {
  fileSystem: createMockFileIO(),
  workspaceService: { getWorkspaceRoot: () => '/project' },
} as unknown as MessageHandlerDeps;
```

### 7.2 Router Integration Test

```typescript
// message-router.test.ts
describe('createMessageRouter', () => {
  it('dispatches known message types to the correct handler', ...);
  it('silently drops unknown message types', ...);
  it('catches handler errors and replies with error message', ...);
  it('has no duplicate handler registrations across domains', () => {
    // Verify no two domain files register the same message type
    const allKeys = [
      ...Object.keys(workflowHandlers),
      ...Object.keys(artifactHandlers),
      // ...
    ];
    const unique = new Set(allKeys);
    expect(allKeys.length).toBe(unique.size);
  });
});
```

### 7.3 Existing Tests

All existing test files (`message-handler.test.ts`, `message-handler-edge-cases.test.ts`, `message-handler-stage-detail.test.ts`, `reactivity-integration.test.ts`) continue to work because:

- They import `handleWebviewMessage` which still exists (or is re-exported)
- The function signature is identical
- The behavior is identical

---

## 8. Handler Signature Change

**Current** (inconsistent — each handler has a different signature):

```typescript
async function handleApprove(deps, reply, approvalId, comment?) { ... }
async function handleSkipStage(deps, reply, stageId) { ... }
async function handleRequestState(deps, reply) { ... }
```

**New** (uniform — every handler gets the full typed message):

```typescript
async function handleApprove(msg, deps, reply) {
  // msg is typed as { type: 'approve'; approvalId: string; comment?: string }
  const { approvalId, comment } = msg;
  ...
}
```

**Why:** Uniform signatures enable the lookup table pattern. The router doesn't need to know which fields each handler needs — it just passes the whole message. TypeScript narrows the type inside each handler via the discriminated union.

---

## 9. Future-Proofing: What This Enables

### 9.1 Middleware / Interceptors

```typescript
// Add logging, timing, or auth checks without touching handlers
function withLogging(handler: MessageHandler): MessageHandler {
  return async (msg, deps, reply) => {
    console.log(`[handler] ${msg.type}`);
    const start = Date.now();
    await handler(msg, deps, reply);
    console.log(`[handler] ${msg.type} took ${Date.now() - start}ms`);
  };
}
```

### 9.2 Per-Domain Dependency Injection

Instead of passing the full `MessageHandlerDeps` to every handler, domains can declare what they need:

```typescript
// Future: domain-specific deps (optional optimization)
export interface PluginHandlerDeps {
  readonly pluginRegistry: PluginRegistryService;
  readonly workspaceService: WorkspaceService;
  readonly fileSystem: FileIO;
}
```

### 9.3 Dynamic Handler Registration (Plugin System)

External plugins could register their own message handlers:

```typescript
// Future: plugins register handlers at runtime
router.register('myPlugin.customAction', myPluginHandler);
```

### 9.4 Handler-Level Feature Flags

```typescript
// Future: disable a domain without removing code
if (featureFlags.pluginsEnabled) {
  Object.assign(registry, pluginHandlers);
}
```

---

## 10. What Does NOT Change

| Aspect                                     | Status                                       |
| ------------------------------------------ | -------------------------------------------- |
| `MessageToHost` / `MessageToWebview` types | **Unchanged** — same discriminated unions    |
| `MessageHandlerDeps` interface             | **Unchanged** — same dependency bag          |
| `extension.ts` wiring                      | **1-line change** (import path)              |
| `panel-provider.ts`                        | **Unchanged**                                |
| Webview code (React)                       | **Unchanged** — sends same messages          |
| AI tools                                   | **Unchanged**                                |
| Core engine                                | **Unchanged**                                |
| All existing tests                         | **Pass unchanged** (re-export preserves API) |

---

## 11. Estimated Effort

| Step                                | Effort       | Risk                   |
| ----------------------------------- | ------------ | ---------------------- |
| Step 1: Infrastructure              | 1 hour       | None — additive only   |
| Step 2: Settings proof-of-concept   | 30 min       | None — smallest domain |
| Step 3: Extract 8 remaining domains | 3-4 hours    | Low — mechanical moves |
| Step 4: Delete old file             | 10 min       | None                   |
| Step 5: Update extension.ts         | 5 min        | None                   |
| New domain-specific tests           | 2 hours      | None                   |
| **Total**                           | **~7 hours** | **Low**                |

---

## 12. Decision

This is a **pure structural refactor** — no behavior changes, no new features, no API changes. The webview sends the same messages, the extension replies with the same responses. The only difference is that the code is organized by domain instead of piled into one file.

**Proceed when:** You're about to add a new domain (e.g., "templates", "team", "notifications") and the switch statement would cross 40+ cases. Or when two developers need to work on different domains simultaneously.

**Don't do it prematurely:** The current monolith works. This plan is here so you can execute it confidently when the time comes — not as busywork.
