# Tech Stack — Engineering Workspace

## Language & Runtime

- **TypeScript** ^5.6.2 — strict mode, all strict flags enabled
- **Node.js** >=20.0.0 — target ES2022 for extension host
- **ES2020** — target for webview (browser context)

## Extension Host (Node/CJS)

- **VS Code Extension API** ^1.93.0 — `@types/vscode`
- **Module system:** Node16 (CJS output via esbuild)
- **Entry point:** `src/extension.ts` → `out/extension.js`

## Webview (Browser/ESM)

- **Preact** ^10.24.3 — lightweight React alternative
- **@preact/signals** ^1.3.1 — reactive state management
- **JSX:** `react-jsx` with `jsxImportSource: preact`
- **Module system:** ESNext/ESM via esbuild
- **Entry point:** `src/webview/index.tsx` → `out/webview.js` + `out/webview.css`

## AI / Chat Integration

- **@vscode/chat-extension-utils** ^0.0.0-alpha.5 — chat participant utilities
- **@vscode/prompt-tsx** ^0.4.0-alpha.1 — prompt templating
- **Language Model Tools** — 5 tools registered with `vscode.lm`
- **Chat Participant** — `@engineering` with slash commands

## Build Tooling

- **esbuild** ^0.27.0 — dual-bundle config (extension CJS + webview ESM)
  - `node esbuild.config.mjs` — one-shot build
  - `node esbuild.config.mjs --watch` — watch mode
  - `node esbuild.config.mjs --production` — minified, no sourcemaps
  - Also copies `@vscode/codicons` CSS + TTF to `out/codicons/` (since `node_modules/` is excluded from `.vsix` by `.vscodeignore`)
- **TypeScript** — two tsconfig files:
  - `tsconfig.json` — extension host (Node16, ES2022)
  - `tsconfig.webview.json` — webview (ESNext/Bundler, DOM libs, Preact JSX)

## Testing

- **Vitest** ^3.2.7 — test runner, node environment
- **@vitest/coverage-v8** ^3.2.7 — coverage with V8 provider
- **Coverage thresholds:** 80% lines, 80% functions, 75% branches, 80% statements
- **Coverage scope:** `src/core/**`, `src/services/**`, `src/ai/**`
- **Test location:** `src/test/` with subdirectories per phase and domain

## Linting & Formatting

- **ESLint** ^9.12.0 with `@typescript-eslint` ^8.8.0
- **Prettier** ^3.3.3

## Packaging

- **@vscode/vsce** ^3.1.0 — `npm run package` → `.vsix`

## Icons

- **@vscode/codicons** ^0.0.36 — VS Code icon font, assets (`codicon.css` + `codicon.ttf`) copied to `out/codicons/` during build

## CSS

- Custom CSS variables in `src/webview/styles/variables.css`
- Component-scoped CSS files: `base.css`, `layout.css`, `side-nav.css`, `components.css`
- No CSS framework (no Tailwind, no CSS modules)

## npm Scripts

| Script          | Command                                | Purpose          |
| --------------- | -------------------------------------- | ---------------- |
| `build`         | `node esbuild.config.mjs --production` | Production build |
| `watch`         | `node esbuild.config.mjs --watch`      | Dev watch mode   |
| `typecheck`     | `tsc --noEmit` (both tsconfigs)        | Type checking    |
| `test`          | `vitest run --passWithNoTests`         | Run tests        |
| `test:watch`    | `vitest`                               | Watch mode tests |
| `test:coverage` | `vitest run --coverage`                | Coverage report  |
| `lint`          | `eslint src --ext ts,tsx`              | Lint             |
| `format`        | `prettier --write`                     | Format           |
| `package`       | `vsce package --no-yarn`               | Build .vsix      |
