# Boundaries — Engineering Workspace

## ✅ Always Do

- **Keep `src/core/` free of VS Code imports.** Core modules are pure TypeScript with zero VS Code dependencies. This enables unit testing without VS Code test harness.
- **Use `readonly` on all interface properties.** Every property in `src/core/types.ts` and all interfaces must be `readonly` (DD-015).
- **Return new objects from state transitions.** `WorkflowEngine` methods return new `WorkflowDefinition` objects — never mutate the input.
- **Use the `Result<T, E>` type for expected failures.** Don't throw exceptions for recoverable errors. Use `ok()` / `err()` helpers.
- **Route all artifact saves through `engineering_save_artifact` tool.** Never create artifact files directly — the `ArtifactWatcher` must detect them.
- **Use `FileIO` interface for filesystem access in core/services.** Inject `FileSystemService` (production) or in-memory mock (tests).
- **Add JSDoc with `@see` references** to design decisions on every exported class and function.
- **Use section headers** (`// ─── Section Name ───`) to organize code within files.
- **Centralize constants in `src/constants.ts`.** All `.codestudio/` path constants live there.
- **Centralize types in `src/core/types.ts`.** Shared vocabulary across all layers.
- **Write tests for new core/services code.** Coverage thresholds are enforced: 80% lines, 80% functions, 75% branches.
- **Use literal union types** (not enums) for all type-safe string constants.
- **Serialize concurrent state updates** via `StateManager.update()` — it uses a promise-chain mutex.

## 🟡 Ask First

- **Adding a new SDLC stage.** Stages are data-driven via `PipelineConfig` — but adding one affects all process levels, gates, and approvals. Requires updating `pipeline-config.ts` and all related tests.
- **Adding a new Language Model Tool.** Must be registered in both `package.json` (`contributes.languageModelTools`) and `src/extension.ts`. Coordinate the schema carefully.
- **Changing `WorkflowDefinition` shape.** This type is shared across extension host, webview, chat participant, and LM tools. Changes ripple everywhere.
- **Modifying `PipelineConfig` structure.** This is the single source of truth for the entire SDLC pipeline. Changes affect `WorkflowEngine`, `WorkflowGenerator`, `StageExecutor`, and `SkillEngine`.
- **Adding new webview message types.** Must add handler in `src/views/handlers/`, update `MessageToHost`/`MessageToWebview` union types, and handle in webview store.
- **Changing the `.codestudio/` directory structure.** Paths are defined in `src/constants.ts` and used across many modules.
- **Adding new dependencies.** The extension should stay lightweight. Preact was chosen over React for bundle size.

## 🚫 Never Do

- **Never import `vscode` in `src/core/`.** This breaks the pure-TypeScript guarantee and makes unit testing impossible without the VS Code test harness.
- **Never mutate `WorkflowDefinition` objects.** Always create new objects with spread syntax. The state machine is designed to be immutable.
- **Never create artifact files directly from the agent.** Always use the `engineering_save_artifact` tool so the `ArtifactWatcher` can detect changes and update the UI.
- **Never use enums.** Use literal union types (`type X = 'a' | 'b'`) throughout the codebase.
- **Never use `any` type.** `noImplicitAny` is enabled. Use `unknown` and narrow with type guards.
- **Never bypass `StateManager.update()` for workflow state changes.** Direct `save()` calls skip the mutex and version check, risking lost updates.
- **Never put business logic in webview message handlers.** Handlers in `src/views/handlers/` should delegate to core engines and services — they are thin routing functions.
- **Never add Node.js APIs to webview code.** The webview runs in a browser context (`platform: 'browser'` in esbuild). Use the bridge to communicate with the extension host.
- **Never hardcode `.codestudio/` paths.** Always use constants from `src/constants.ts`.
