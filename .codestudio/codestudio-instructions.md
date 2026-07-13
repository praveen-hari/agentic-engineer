# Engineering Workspace — Agent Instructions

## Project Knowledge

Read these files before making changes to understand the project:

- **Architecture:** `.codestudio/knowledge/architecture.md` — Module boundaries, data flow, layered architecture, key design decisions
- **Tech Stack:** `.codestudio/knowledge/stack.md` — Languages, frameworks, dependencies with versions, build tools, npm scripts
- **Conventions:** `.codestudio/knowledge/conventions.md` — Naming, formatting, file organization, testing patterns, documentation style
- **Boundaries:** `.codestudio/knowledge/boundaries.md` — Always do / Ask first / Never do rules

## Quick Reference

- **Build:** `npm run build` (esbuild production) or `npm run watch` (dev)
- **Test:** `npm test` (vitest) or `npm run test:coverage`
- **Typecheck:** `npm run typecheck` (checks both tsconfigs)
- **Lint:** `npm run lint`
- **Package:** `npm run package` (produces .vsix)

## Project-Specific Rules

1. **Dual tsconfig awareness:** This project has two TypeScript configurations — `tsconfig.json` for the extension host (Node16/CJS) and `tsconfig.webview.json` for the webview (ESNext/ESM/Preact). When editing files, know which context you're in.

2. **Dual bundle output:** esbuild produces two bundles — `out/extension.js` (CJS/Node) and `out/webview.js` + `out/webview.css` (ESM/browser). The webview bundle uses Preact JSX with `jsxImportSource: preact`. It also copies codicon assets (`codicon.css` + `codicon.ttf`) to `out/codicons/` since `node_modules/` is excluded from the `.vsix`.

3. **Message type safety:** The webview↔host communication uses typed messages (`MessageToHost` / `MessageToWebview` unions in `src/core/types.ts`). When adding new message types, update both the type union AND add a handler in `src/views/handlers/`.

4. **Test organization:** Tests are in `src/test/` organized by domain (`core/`, `services/`, `ai/`, `views/`, `webview/`) and by development phase (`phase1/` through `phase7/`, `hardening/`). New tests should go in the appropriate domain directory.

5. **12 bundled skills:** The extension bundles 12 engineering skills as SKILL.md files in `skills/`. The `SkillRegistry` in `src/core/skill-registry.ts` must match exactly what's in the `skills/` directory. The `SkillId` type in `types.ts` must also match.

6. **Pipeline config is king:** All SDLC behavior (stages, gates, approvals, skills per level) is defined in `src/core/pipeline-config.ts`. To change workflow behavior, edit the config data — don't add if/else logic in engines.
