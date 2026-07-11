# Implementation Plan: Agent-Delegated Architecture

**Architecture:** `ARCHITECTURE.md` v2.0  
**Date:** 11 July 2026  
**Starting point:** 382 tests passing, all core engines built

---

## Dependency Graph

```
                ┌──────────────────┐
                │  P1-1: Prompt    │
                │  Templates       │
                └────────┬─────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
┌────────▼───────┐ ┌─────▼──────┐ ┌──────▼─────────┐
│ P1-2: Agent    │ │ P1-3:      │ │                │
│ Bridge         │ │ Artifact   │ │                │
│                │ │ Watcher    │ │                │
└────────┬───────┘ └─────┬──────┘ │                │
         │               │        │                │
         └───────┬───────┘        │                │
                 │                │                │
        ┌────────▼────────┐       │                │
        │ P2-1: Message   │       │                │
        │ Handler + Types │       │                │
        └────────┬────────┘       │                │
                 │                │                │
        ┌────────▼────────┐       │                │
        │ P2-2: Extension │◄──────┘                │
        │ Wiring          │                        │
        └────────┬────────┘                        │
                 │                                 │
        ┌────────▼────────┐                        │
        │ P2-3: Chat      │                        │
        │ Participant     │                        │
        └────────┬────────┘                        │
                 │                                 │
    ┌────────────┼────────────┐                    │
    │            │            │                    │
┌───▼────┐ ┌────▼───┐ ┌──────▼─────────┐          │
│ P3-1:  │ │ P3-2:  │ │ P4-1 to P4-4:  │          │
│ Tasks  │ │ Tasks  │ │ Remaining      │          │
│ View   │ │ View   │ │ Views          │          │
│ Buttons│ │ Artif. │ │                │          │
└────────┘ └────────┘ └────────────────┘          │
                                                   │
                              ┌─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ P5: Polish &      │
                    │ Integration Test  │
                    └───────────────────┘
```

---

## Phase 1: Foundation (Can Be Built in Parallel)

### P1-1: Prompt Templates

**File:** `src/core/prompt-templates.ts`  
**Test:** `src/test/core/prompt-templates.test.ts`  
**Dependencies:** None  
**Estimated tests:** 10+

**Description:** Pure TypeScript module that returns prompt strings for each SDLC stage. Each prompt includes:

- The objective
- Project context summary
- Stage-specific instructions (what to produce, where to save)
- File path conventions

**Prompts needed:**

- `getOnboardPrompt()` — not needed (auto-advance)
- `getDefinePrompt(objective, context, signals)` — generate spec
- `getPlanPrompt(objective, specPath)` — generate task plan from spec
- `getBuildInstructions(taskDescription)` — instructions for agent (not a prompt to send)
- `getVerifyPrompt(testCmd, buildCmd)` — run verification checks
- `getReviewPrompt(objective, changedFiles)` — 5-axis code review
- `getShipPrompt(objective)` — pre-launch checklist

**Key rule:** Every prompt tells the agent WHERE to save the output file:

```
Save the spec to: .codestudio/workflows/current/artifacts/specs/{slug}.md
```

**Acceptance:**

- [ ] All 6 prompt functions return non-empty strings
- [ ] Prompts include objective, context, and save path
- [ ] Prompts are deterministic (no LLM calls)
- [ ] 10+ unit tests

---

### P1-2: Agent Bridge Service

**File:** `src/services/agent-bridge.service.ts`  
**Test:** `src/test/services/agent-bridge.service.test.ts`  
**Dependencies:** None  
**Estimated tests:** 6+

**Description:** Sends prompts to the agent via VS Code's chat API. Two methods:

1. **Open chat with pre-filled prompt** — `vscode.commands.executeCommand('workbench.action.chat.open', { query })`
2. **Send via participant** — `@engineering generate spec for...`

**Interface:**

```typescript
class AgentBridge {
  sendToChat(prompt: string): Promise<void>;
  sendToParticipant(prompt: string): Promise<void>;
}
```

**Acceptance:**

- [ ] `sendToChat` calls `vscode.commands.executeCommand` with correct args
- [ ] `sendToParticipant` prefixes with `@engineering`
- [ ] Handles errors gracefully (command not available, etc.)
- [ ] 6+ unit tests with mocked vscode API

---

### P1-3: Artifact Watcher Service

**File:** `src/services/artifact-watcher.service.ts`  
**Test:** `src/test/services/artifact-watcher.service.test.ts`  
**Dependencies:** ArtifactManager (already built)  
**Estimated tests:** 10+

**Description:** Uses `vscode.workspace.createFileSystemWatcher` to watch for file changes in `.codestudio/workflows/current/artifacts/`. When a new `.md` file appears or changes:

1. Reads the file content
2. Determines artifact type from path (specs/ → spec, plans/ → plan, etc.)
3. Creates/updates Artifact record
4. Emits event so message handler can notify webview

**Interface:**

```typescript
class ArtifactWatcher {
  start(): vscode.Disposable;
  onArtifactDetected: vscode.Event<Artifact>;
}
```

**Acceptance:**

- [ ] Watches `**/*.md` in artifacts directory
- [ ] Correctly maps path → artifact type
- [ ] Emits event with Artifact data on file create/change
- [ ] Ignores non-.md files
- [ ] Handles watcher errors gracefully
- [ ] 10+ unit tests

---

## Phase 2: Wiring

### P2-1: Message Handler + Types Update

**Files:** `src/core/types.ts`, `src/views/message-handler.ts`  
**Test:** Update `src/test/views/message-handler.test.ts`  
**Dependencies:** P1-1, P1-2  
**Estimated new tests:** 4+

**Description:** Add new message type `generateArtifact` to the protocol:

```typescript
// MessageToHost
| { readonly type: 'generateArtifact'; readonly stage: LifecycleStage }

// MessageToWebview
| { readonly type: 'generatingArtifact'; readonly stage: LifecycleStage }
| { readonly type: 'artifactDetected'; readonly artifact: Artifact }
```

Handler flow:

1. Webview sends `{ type: 'generateArtifact', stage: 'define' }`
2. Handler builds prompt via `PromptTemplates.getDefinePrompt(...)`
3. Handler sends prompt via `AgentBridge.sendToChat(prompt)`
4. Handler replies `{ type: 'generatingArtifact', stage: 'define' }`
5. (Later) ArtifactWatcher detects file → handler replies `{ type: 'artifactDetected', artifact }`

**Acceptance:**

- [ ] `generateArtifact` message triggers prompt building + agent bridge call
- [ ] `generatingArtifact` reply sent immediately (for loading state)
- [ ] `artifactDetected` reply sent when watcher fires
- [ ] 4+ new tests

---

### P2-2: Extension Wiring

**File:** `src/extension.ts`  
**Dependencies:** P1-2, P1-3  
**Estimated new tests:** 0 (integration)

**Description:**

1. Create `AgentBridge` instance
2. Create `ArtifactWatcher` instance, start watching
3. Wire watcher events → message handler → webview notifications
4. Auto-advance ONBOARD stage when workflow starts (if onboard is first stage and has no requirements)
5. Add watcher + bridge to `context.subscriptions` for cleanup

**Acceptance:**

- [ ] ArtifactWatcher starts on activation
- [ ] Watcher events reach the webview
- [ ] ONBOARD auto-advances to DEFINE
- [ ] All disposables cleaned up on deactivation

---

### P2-3: Chat Participant Update

**File:** `src/chat/chat-participant.ts`  
**Dependencies:** P1-2  
**Estimated new tests:** 4+

**Description:** Enhance the chat participant to:

1. Handle "generate spec/plan/review" requests
2. When the agent bridge sends a prompt via participant, the participant can process it
3. `/status` returns real workflow data (not stubs)
4. `/analyze` does real risk assessment

**Acceptance:**

- [ ] `/status` returns real workflow state from StateManager
- [ ] `/analyze` returns real risk assessment from RiskEngine
- [ ] Natural language "generate spec" triggers artifact generation flow
- [ ] 4+ new tests

---

## Phase 3: UI Updates

### P3-1: Tasks View — Generate Buttons

**File:** `src/webview/views/tasks-view.tsx`  
**Dependencies:** P2-1

**Description:** For each active stage that needs an artifact:

- Show "Generate Spec" / "Generate Plan" / "Generate Review" button
- On click: `bridge.send({ type: 'generateArtifact', stage: 'define' })`
- Show "Waiting for agent..." spinner when `generatingArtifact` received
- Show artifact preview when `artifactDetected` received
- Show "Approve" / "Reject" buttons for review

**Acceptance:**

- [ ] Active DEFINE stage shows "Generate Spec" button
- [ ] Active PLAN stage shows "Generate Plan" button
- [ ] Loading state shown while waiting for agent
- [ ] Artifact content shown when detected
- [ ] Approve/reject connected to approval flow

---

### P3-2: Tasks View — Real Artifacts Tab

**File:** `src/webview/views/tasks-view.tsx`  
**Dependencies:** P2-1

**Description:** Artifacts tab shows real artifacts from ArtifactManager instead of hardcoded placeholders. Each artifact shows:

- Title, type, stage, status
- "View" button to show content
- Approval status badge

**Acceptance:**

- [ ] Artifacts tab lists real artifacts from store
- [ ] Empty state when no artifacts
- [ ] Artifact content viewable

---

## Phase 4: Remaining Views

### P4-1: Knowledge View

- Show real `context.md` content
- Show conventions and boundaries from `.codestudio/knowledge/`
- Link to Capabilities view

### P4-2: Capabilities View

- Real recommendations from `CapabilityRecommender`
- Deep links to native Agent Customizations panel
- Syncfusion skill pack marketplace cards

### P4-3: History View

- Load archived workflows from `.codestudio/archive/`
- Three-tier display (hot/warm/cold)

### P4-4: Settings View

- Read/write `config.json`
- Process defaults, history management

---

## Phase 5: Polish

### P5-1: Chat Participant Real Handlers

### P5-2: Integration Testing — Full Flow

---

## Estimated Totals

| Phase           | New Files               | New Tests   | Effort |
| --------------- | ----------------------- | ----------- | ------ |
| P1 (Foundation) | 3 files + 3 test files  | ~26         | Small  |
| P2 (Wiring)     | 0 new, 3 modified       | ~8          | Small  |
| P3 (UI)         | 0 new, 1 modified       | 0 (visual)  | Medium |
| P4 (Views)      | 0 new, 4 modified       | 0 (visual)  | Medium |
| P5 (Polish)     | 0 new, 2 modified       | ~4          | Small  |
| **Total**       | **3 new + 10 modified** | **~38 new** |        |

**Current: 382 tests → Target: ~420 tests**
