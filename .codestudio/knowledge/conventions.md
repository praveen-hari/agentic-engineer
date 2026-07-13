# Coding Conventions — Engineering Workspace

## TypeScript Style

- **Strict mode:** All strict flags enabled (`strict`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`)
- **Readonly properties:** All interface properties use `readonly` (DD-015, SPEC §6)
- **Literal union types** over enums: `type ProcessLevel = 'light' | 'standard' | 'thorough' | 'guarded'`
- **Result type** for expected failures: `Result<T, E>` with `ok()` / `err()` helpers — not exceptions
- **Immutable state transitions:** Functions return new objects, never mutate inputs

## Naming Conventions

- **Files:** kebab-case with domain suffix: `file-system.service.ts`, `workflow.handlers.ts`, `setup-project.tool.ts`
- **Suffixes by layer:**
  - `.service.ts` — services layer
  - `.tool.ts` — AI/LM tools
  - `.handlers.ts` — webview message handlers
  - `.test.ts` — test files
- **Classes:** PascalCase — `WorkflowEngine`, `StateManager`, `FileSystemService`
- **Interfaces/Types:** PascalCase — `WorkflowDefinition`, `RiskAssessment`, `LifecycleStage`
- **Functions:** camelCase — `computeActiveSkills`, `generateStages`, `parseTodoMd`
- **Constants:** UPPER_SNAKE_CASE — `WORKFLOW_DIR`, `CURRENT_WORKFLOW_DIR`, `PROCESS_LEVEL_ORDER`
- **Test files:** Mirror source path: `src/core/workflow-engine.ts` → `src/test/core/workflow-engine.test.ts`

## File Organization

- **One class per file** (with supporting private helpers allowed)
- **Barrel exports** via `index.ts` in handler directories
- **Constants** centralized in `src/constants.ts` — all path constants for `.codestudio/` directory structure
- **Types** centralized in `src/core/types.ts` — shared vocabulary across all layers

## Architecture Patterns

- **Dependency injection via constructor:** Services and engines receive dependencies in constructors, not via global imports
- **FileIO interface:** Abstracts filesystem for testability — `FileSystemService` implements it for production, in-memory mocks for tests
- **Promise-chain mutex:** `StateManager.update()` serializes concurrent writes via chained promises
- **Per-path write queues:** `FileSystemService.append()` serializes appends per file path
- **Data-driven pipeline:** `PipelineConfig` is the single source of truth for stages, gates, approvals — adding behavior is a data edit
- **Handler registry pattern:** Webview message handlers register in a flat `HANDLER_REGISTRY` object, router dispatches by message type
- **Agent-delegated architecture:** Extension orchestrates; AI agent provides intelligence. Prompts go out via `AgentBridge`, results come back via `ArtifactWatcher`.

## Documentation

- **JSDoc on every exported class/function** with `@see` references to design decisions (e.g., `@see DESIGN_DECISIONS.md DD-015`)
- **Section headers** in source files using `// ─── Section Name ───` comment blocks
- **Module-level doc comment** at the top of each file explaining purpose and dependencies

## Testing Patterns

- **Vitest** with `describe` / `it` / `expect`
- **In-memory FileIO mock** for all filesystem tests (no real disk I/O)
- **Test phases:** Tests organized in `src/test/phase1/` through `phase7/` directories plus `hardening/`
- **Edge case files:** Separate `*-edge-cases.test.ts` files for boundary conditions
- **Coverage targets:** 80% lines, 80% functions, 75% branches, 80% statements

## Webview Conventions

- **Preact functional components** — `FunctionalComponent` type from Preact
- **Preact Signals** for state — single store in `store/workflow.store.ts`
- **Bridge pattern:** `bridge.ts` wraps `postMessage` / `onMessage` for type-safe host↔webview communication
- **CSS custom properties** in `variables.css` — no CSS framework
- **VS Code design language:** Uses `@vscode/codicons` and VS Code CSS variables for native look

## Error Handling

- **Result type** (`Result<T, E>`) for expected/recoverable failures
- **try/catch** only at boundaries (tool handlers, message router)
- **Graceful degradation:** AI tools have deterministic fallback when LLM is unavailable
- **Corrupt file recovery:** `StateManager.load()` returns `null` for corrupt JSON instead of throwing
